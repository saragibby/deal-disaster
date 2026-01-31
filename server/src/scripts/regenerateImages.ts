import { pool } from '../db/pool.js';
import { foreclosureGenerator } from '../services/foreclosureGenerator.js';
import OpenAI from 'openai';
import { blobStorage } from '../services/blobStorage.js';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

/**
 * Script to regenerate images for past daily challenges
 * Uses standardized photo types: exterior, kitchen, backyard, interior room
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
        // Format challenge_date to YYYY-MM-DD
        const challengeDateStr = new Date(challenge.challenge_date).toISOString().split('T')[0];
        const imageUrls = await generatePropertyImages(dalleClient, propertyData, challengeDateStr);

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

async function generatePropertyImages(dalleClient: OpenAI, propertyData: any, challengeDate: string): Promise<string[]> {
  const scenario: PropertyScenario = propertyData;
  
  // Always use standardized photo prompts for consistency
  console.log('  📝 Using standardized photo types: exterior, kitchen, backyard, interior room');
  const imagePrompts = generateStandardPhotoPrompts(scenario
  );

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
        const tempUrl = imageResponse.data[0].url;
        
        // Download the image
        try {
          const imageBuffer = await downloadImage(tempUrl);
          
          // Azure Blob Storage is required - no fallback to base64
          if (!blobStorage.isConfigured()) {
            throw new Error('Azure Blob Storage not configured. Cannot save images.');
          }
          
          const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
          imageUrls.push(blobUrl);
          console.log(`  ✓ Image ${i + 1} uploaded to blob storage`);
        } catch (downloadError) {
          console.error(`  Failed to download image ${i + 1}:`, downloadError);
        }
      }
    } catch (error) {
      console.error(`  ✗ Failed to generate image ${i + 1}:`, error);
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

// Run the script
regenerateImagesForPastChallenges();
