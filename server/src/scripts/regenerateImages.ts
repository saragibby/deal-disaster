import { pool } from '../db/pool.js';
import { foreclosureGenerator } from '../services/foreclosureGenerator.js';
import OpenAI from 'openai';

/**
 * Script to regenerate images for past daily challenges
 * Run with: npm run regenerate-images
 */

async function regenerateImagesForPastChallenges() {
  console.log('🔄 Starting image regeneration for past challenges...\n');

  try {
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY not set. Please configure it first.');
      process.exit(1);
    }

    // Get all daily challenges that have emoji placeholders
    const result = await pool.query(`
      SELECT id, challenge_date, property_data 
      FROM daily_challenges 
      ORDER BY challenge_date DESC
    `);

    console.log(`Found ${result.rows.length} challenges to check\n`);

    const dalleClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const challenge of result.rows) {
      const propertyData = challenge.property_data;
      const photos = propertyData.photos || [];

      // Check if photos are emoji placeholders (contain emoji characters)
      const hasEmojiPhotos = photos.some((photo: string) => /[\u{1F300}-\u{1F9FF}]/u.test(photo));

      if (!hasEmojiPhotos && photos.length > 0 && photos[0].startsWith('http')) {
        console.log(`⏭️  Challenge ${challenge.challenge_date}: Already has images, skipping`);
        skippedCount++;
        continue;
      }

      console.log(`🖼️  Generating images for challenge: ${challenge.challenge_date}`);

      try {
        const imageUrls = await generatePropertyImages(dalleClient, propertyData);

        if (imageUrls.length >= 2) {
          // Update the property_data with new photos
          propertyData.photos = imageUrls;

          await pool.query(
            'UPDATE daily_challenges SET property_data = $1 WHERE id = $2',
            [JSON.stringify(propertyData), challenge.id]
          );

          console.log(`✅ Updated challenge ${challenge.challenge_date} with ${imageUrls.length} images\n`);
          updatedCount++;
        } else {
          console.log(`⚠️  Failed to generate enough images for ${challenge.challenge_date}\n`);
          errorCount++;
        }

        // Add a delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Error processing challenge ${challenge.challenge_date}:`, error);
        errorCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📝 Total: ${result.rows.length}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
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
    
    `Interior photograph of the living room in a ${propertyData.beds || 3} bedroom, ${propertyData.baths || 2} bathroom ${propertyData.propertyType?.toLowerCase() || 'home'}. ${condition}. ${funnyStory.includes('carpet') || funnyStory.includes('floor') ? 'Focus on flooring and overall room condition' : ''}. ${propertyData.occupancyStatus === 'occupied' ? 'Property shows signs of current habitation' : 'Vacant property'}. ${propertyDesc}. Realistic residential interior, real estate listing quality photo that is reflective of the exterior of the home for specified condition and location.`,
    
    `Interior photograph of the kitchen in a residential ${propertyData.propertyType?.toLowerCase() || 'home'}. ${condition}. ${funnyStory.includes('kitchen') || funnyStory.includes('appliance') ? 'Show appliances and cabinetry condition clearly' : 'Standard kitchen layout with appliances visible'}. ${propertyData.occupancyStatus === 'occupied' ? 'Property shows signs of current habitation' : 'Vacant property'}. ${propertyDesc}. Natural lighting, real estate photography style that is reflective of the exterior of the home for specified condition and location.`,
    
    `Interior photograph of a bathroom in a ${propertyData.yearBuilt || 1980} built home. ${condition}. ${funnyStory.includes('bathroom') || funnyStory.includes('plumb') || funnyStory.includes('fixture') ? 'Show fixtures and overall bathroom condition' : 'Standard bathroom fixtures'}. ${propertyData.occupancyStatus === 'occupied' ? 'Property shows signs of current habitation' : 'Vacant property'}. ${propertyDesc}. Real estate listing photograph that is reflective of the exterior of the home for specified condition and location.`
  ];

  const imageUrls: string[] = [];

  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      console.log(`  Generating image ${i + 1}/${imagePrompts.length}...`);
      
      const imageResponse = await dalleClient.images.generate({
        model: 'dall-e-3',
        prompt: imagePrompts[i],
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });

      if (imageResponse.data && imageResponse.data[0]?.url) {
        imageUrls.push(imageResponse.data[0].url);
        console.log(`  ✓ Image ${i + 1} generated`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to generate image ${i + 1}:`, error);
    }
  }

  return imageUrls;
}

// Run the script
regenerateImagesForPastChallenges();
