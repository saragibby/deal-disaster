import { pool } from '../db/pool.js';
import OpenAI from 'openai';

/**
 * Script to regenerate images for a specific daily challenge by date
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

    const imageUrls = await generatePropertyImages(dalleClient, propertyData);

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

async function generatePropertyImages(dalleClient: OpenAI, propertyData: any): Promise<string[]> {
  const location = `${propertyData.city || 'suburban area'}, ${propertyData.state || 'USA'}`;
  const propertyDesc = propertyData.description || '';
  const funnyStory = propertyData.funnyStory || '';
  const condition = propertyData.estimatedRepairs > 50000 ? 'showing significant wear, dated features, and deferred maintenance' : 
                    propertyData.estimatedRepairs > 30000 ? 'showing moderate wear and some dated features' : 
                    'in functional condition with minor cosmetic updates needed';

  const imagePrompts = [
    `Realistic real estate photograph of the exterior of a ${propertyData.propertyType?.toLowerCase() || 'single family home'} in ${location}. Built in ${propertyData.yearBuilt || 1980}. ${propertyData.occupancyStatus === 'occupied' ? 'Property shows signs of current habitation' : 'Vacant property'}. ${propertyDesc}. Natural daylight, street view perspective, professional real estate photography.`,
    
    `Interior photograph of the living room in a ${propertyData.beds || 3} bedroom, ${propertyData.baths || 2} bathroom ${propertyData.propertyType?.toLowerCase() || 'home'}. ${condition}. ${funnyStory.includes('carpet') || funnyStory.includes('floor') ? 'Focus on flooring and overall room condition' : ''}. Realistic residential interior, real estate listing quality photo.`,
    
    `Interior photograph of the kitchen in a residential ${propertyData.propertyType?.toLowerCase() || 'home'}. ${condition}. ${funnyStory.includes('kitchen') || funnyStory.includes('appliance') ? 'Show appliances and cabinetry condition clearly' : 'Standard kitchen layout with appliances visible'}. Natural lighting, real estate photography style.`,
    
    `Interior photograph of a bathroom in a ${propertyData.yearBuilt || 1980} built home. ${condition}. ${funnyStory.includes('bathroom') || funnyStory.includes('plumb') || funnyStory.includes('fixture') ? 'Show fixtures and overall bathroom condition' : 'Standard bathroom fixtures'}. Real estate listing photograph.`
  ];

  const imageUrls: string[] = [];

  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      console.log(`Generating image ${i + 1}/${imagePrompts.length}...`);
      
      const imageResponse = await dalleClient.images.generate({
        model: 'dall-e-3',
        prompt: imagePrompts[i],
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });

      if (imageResponse.data && imageResponse.data[0]?.url) {
        imageUrls.push(imageResponse.data[0].url);
        console.log(`✓ Image ${i + 1} generated successfully`);
      }

      // Add delay to avoid rate limiting
      if (i < imagePrompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`✗ Failed to generate image ${i + 1}:`, error);
    }
  }

  return imageUrls;
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
