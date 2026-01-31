import { pool } from '../db/pool.js';
import OpenAI from 'openai';
import { blobStorage } from '../services/blobStorage.js';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

/**
 * Script to regenerate images for a specific daily challenge by date
 * Uses standardized photo types: exterior, kitchen, backyard, interior room
 * Run with: npm run regenerate-images-date YYYY-MM-DD
 * Example: npm run regenerate-images-date 2025-12-30
 */

async function regenerateImagesForDate(dateString: string) {
  console.log(`🔄 Regenerating images for challenge: ${dateString}\n`);

  try {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      console.error('❌ Invalid date format. Use YYYY-MM-DD (e.g., 2025-12-30)');
      process.exit(1);
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not set. Please configure it first.');
      process.exit(1);
    }

    // Get the specific daily challenge
    const result = await pool.query(
      'SELECT id, challenge_date, property_data FROM daily_challenges WHERE challenge_date = $1',
      [dateString]
    );

    if (result.rows.length === 0) {
      console.error(`❌ No challenge found for date: ${dateString}`);
      process.exit(1);
    }

    const challenge = result.rows[0];
    const propertyData = challenge.property_data;

    console.log(`Found challenge: ${challenge.challenge_date}`);
    console.log(`Property: ${propertyData.address}, ${propertyData.city}, ${propertyData.state}\n`);

    const dalleClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log('🖼️  Generating new images...\n');

    const imageUrls = await generatePropertyImages(dalleClient, propertyData, dateString);

    if (imageUrls.length >= 2) {
      // Update the property_data with new photos
      propertyData.photos = imageUrls;

      await pool.query(
        'UPDATE daily_challenges SET property_data = $1 WHERE id = $2',
        [JSON.stringify(propertyData), challenge.id]
      );

      console.log(`\n✅ Successfully updated challenge with ${imageUrls.length} new images`);
      console.log('\nNew image URLs:');
      imageUrls.forEach((url, idx) => {
        console.log(`  ${idx + 1}. ${url}`);
      });
    } else {
      console.log('\n❌ Failed to generate enough images. Need at least 2 images.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function generatePropertyImages(dalleClient: OpenAI, propertyData: any, challengeDate: string): Promise<string[]> {
  const scenario: PropertyScenario = propertyData;
  
  // Use simple photo descriptions like the static cases
  const photoDescriptions = [
    'Front exterior view',
    'Kitchen interior',
    'Backyard view',
    'Living room interior'
  ];
  
  console.log('📝 Using realistic photo style with DALL-E 2 (same as static cases)');
  console.log('Photo types: exterior, kitchen, backyard, living room\n');

  const imageUrls: string[] = [];
  
  const location = `${scenario.city}, ${scenario.state}`;
  const propertyType = (scenario.propertyType || 'single family home').toLowerCase();
  
  const occupancyDetails = scenario.occupancyStatus === 'vacant' 
    ? 'Property is vacant and unfurnished.' 
    : scenario.occupancyStatus === 'occupied'
    ? 'Property is currently occupied with furniture.'
    : '';

  for (let i = 0; i < photoDescriptions.length; i++) {
    try {
      const cleanDesc = photoDescriptions[i];
      
      // Detect if property has multiple levels
      const descLower = (scenario.description || '').toLowerCase();
      const hasMultipleLevels = descLower.includes('stair') || descLower.includes('upstairs') || 
                                descLower.includes('two-story') || descLower.includes('two story') ||
                                descLower.includes('second floor') || descLower.includes('multi-level');
      const levelContext = hasMultipleLevels ? 'Two-story property with multiple levels. ' : '';
      
      // Use the SAME simple prompt format as the original realistic static cases
      const prompt = `Photorealistic real estate photograph, no people, no humans: ${cleanDesc}. ${propertyType} in ${location}. Built in ${scenario.yearBuilt}. ${levelContext}${occupancyDetails}Professional MLS listing photo, natural daylight, high-resolution camera. IMPORTANT: Show only the empty property - absolutely no people, no humans, no figures visible anywhere in the image.`;
      
      console.log(`Generating image ${i + 1}/${photoDescriptions.length}: ${cleanDesc}...`);
      
      // Use DALL-E 2 like the static cases - produces more realistic photos
      const imageResponse = await dalleClient.images.generate({
        model: 'dall-e-2',
        prompt: prompt,
        n: 1,
        size: '512x512',
      });

      if (imageResponse.data && imageResponse.data[0]?.url) {
        const tempUrl = imageResponse.data[0].url;
        
        // Download the image
        const imageBuffer = await downloadImage(tempUrl);
        
        // Azure Blob Storage is required - no fallback to base64
        if (!blobStorage.isConfigured()) {
          throw new Error('Azure Blob Storage not configured. Cannot save images.');
        }
        
        const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
        imageUrls.push(blobUrl);
        console.log(`✓ Image ${i + 1} uploaded to Azure Blob Storage`);
      }

      // Add delay to avoid rate limiting
      if (i < photoDescriptions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`✗ Failed to generate image ${i + 1}:`, error);
    }
  }

  return imageUrls;
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Get date from command line arguments
const dateArg = process.argv[2];

if (!dateArg) {
  console.error('❌ Please provide a date argument');
  console.error('Usage: npm run regenerate-images-date YYYY-MM-DD');
  console.error('Example: npm run regenerate-images-date 2025-12-30');
  process.exit(1);
}

// Run the script
regenerateImagesForDate(dateArg);
