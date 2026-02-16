import { pool } from '../db/pool.js';
import { blobStorage } from '../services/blobStorage.js';
import { ImageProviderFactory } from '../services/imageProviders/ImageProviderFactory.js';
import { IImageProvider } from '../services/imageProviders/IImageProvider.js';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

/**
 * Script to regenerate images for a specific daily challenge by date
 * Uses Gemini for image generation with standardized photo types
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

    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not set. Please configure it first.');
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

    const imageProvider = ImageProviderFactory.createProvider('gemini');
    
    if (!imageProvider.isConfigured()) {
      console.error('❌ Gemini image provider is not configured properly.');
      process.exit(1);
    }

    console.log('🖼️  Generating new images using Gemini...\n');

    const imageUrls = await generatePropertyImages(imageProvider, propertyData, dateString);

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

async function generatePropertyImages(imageProvider: IImageProvider, propertyData: any, challengeDate: string): Promise<string[]> {
  const scenario: PropertyScenario = propertyData;
  
  // Use standardized photo prompts
  console.log('📝 Using realistic photo style with Gemini (standardized prompts)');
  console.log('Photo types: exterior, kitchen, backyard, living room\n');

  const imagePrompts = generateStandardPhotoPrompts(scenario);
  const imageUrls: string[] = [];
  
  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      console.log(`Generating image ${i + 1}/${imagePrompts.length}...`);
      
      // Use the image provider to generate the image
      const imageBuffer = await imageProvider.generateImage(imagePrompts[i]);
      console.log(`Generated image ${i + 1} using ${imageProvider.getProviderName()}`);
      
      // Azure Blob Storage is required - no fallback to base64
      if (!blobStorage.isConfigured()) {
        throw new Error('Azure Blob Storage not configured. Cannot save images.');
      }
      
      const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
      imageUrls.push(blobUrl);
      console.log(`✓ Image ${i + 1} uploaded to Azure Blob Storage`);

      // Add delay to avoid rate limiting
      if (i < imagePrompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`✗ Failed to generate image ${i + 1}:`, error);
      
      // Try fallback to DALL-E if Gemini fails
      if (imageProvider.getProviderName().includes('Imagen')) {
        console.log(`🔄 Attempting fallback to DALL-E for image ${i + 1}...`);
        try {
          const dalleProvider = ImageProviderFactory.createProvider('dalle');
          if (dalleProvider.isConfigured()) {
            const imageBuffer = await dalleProvider.generateImage(imagePrompts[i]);
            console.log(`Generated image ${i + 1} using ${dalleProvider.getProviderName()} (fallback)`);
            
            if (!blobStorage.isConfigured()) {
              throw new Error('Azure Blob Storage not configured. Cannot save images.');
            }
            
            const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
            imageUrls.push(blobUrl);
            console.log(`✓ Image ${i + 1} uploaded to Azure Blob Storage (via DALL-E fallback)`);
            
            // Add delay after fallback too
            if (i < imagePrompts.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } else {
            console.log(`⚠️  DALL-E fallback not configured, skipping image ${i + 1}`);
          }
        } catch (fallbackError) {
          console.error(`DALL-E fallback also failed for image ${i + 1}:`, fallbackError);
        }
      }
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
