import { pool } from '../db/pool.js';
import { foreclosureGenerator } from '../services/foreclosureGenerator.js';
import { blobStorage } from '../services/blobStorage.js';
import { ImageProviderFactory } from '../services/imageProviders/ImageProviderFactory.js';
import { IImageProvider } from '../services/imageProviders/IImageProvider.js';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

/**
 * Script to regenerate images for past daily challenges
 * Uses Gemini for image generation with standardized photo types
 * Run with: npm run regenerate-images
 */

async function regenerateImagesForPastChallenges() {
  console.log('🔄 Starting image regeneration for past challenges...\n');

  try {
    // Check if Gemini API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not set. Please configure it first.');
      process.exit(1);
    }

    // Get all daily challenges that have emoji placeholders
    const result = await pool.query(`
      SELECT id, challenge_date, property_data 
      FROM daily_challenges 
      ORDER BY challenge_date DESC
    `);

    console.log(`Found ${result.rows.length} challenges to check\n`);

    const imageProvider = ImageProviderFactory.createProvider('gemini');
    
    if (!imageProvider.isConfigured()) {
      console.error('❌ Gemini image provider is not configured properly.');
      process.exit(1);
    }

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
        const imageUrls = await generatePropertyImages(imageProvider, propertyData, challengeDateStr);

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

async function generatePropertyImages(imageProvider: IImageProvider, propertyData: any, challengeDate: string): Promise<string[]> {
  const scenario: PropertyScenario = propertyData;
  
  // Always use standardized photo prompts for consistency
  console.log('  📝 Using standardized photo types: exterior, kitchen, backyard, interior room');
  const imagePrompts = generateStandardPhotoPrompts(scenario);

  const imageUrls: string[] = [];

  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      console.log(`  Generating image ${i + 1}/${imagePrompts.length}...`);
      
      // Use the image provider to generate the image
      const imageBuffer = await imageProvider.generateImage(imagePrompts[i]);
      console.log(`  Generated image ${i + 1} using ${imageProvider.getProviderName()}`);
      
      // Azure Blob Storage is required - no fallback to base64
      if (!blobStorage.isConfigured()) {
        throw new Error('Azure Blob Storage not configured. Cannot save images.');
      }
      
      const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
      imageUrls.push(blobUrl);
      console.log(`  ✓ Image ${i + 1} uploaded to blob storage`);
    } catch (error) {
      console.error(`  ✗ Failed to generate image ${i + 1}:`, error);
      
      // Try fallback to DALL-E if Gemini fails
      if (imageProvider.getProviderName().includes('Imagen')) {
        console.log(`  🔄 Attempting fallback to DALL-E for image ${i + 1}...`);
        try {
          const dalleProvider = ImageProviderFactory.createProvider('dalle');
          if (dalleProvider.isConfigured()) {
            const imageBuffer = await dalleProvider.generateImage(imagePrompts[i]);
            console.log(`  Generated image ${i + 1} using ${dalleProvider.getProviderName()} (fallback)`);
            
            if (!blobStorage.isConfigured()) {
              throw new Error('Azure Blob Storage not configured. Cannot save images.');
            }
            
            const blobUrl = await blobStorage.uploadImage(imageBuffer, challengeDate, 'image/png');
            imageUrls.push(blobUrl);
            console.log(`  ✓ Image ${i + 1} uploaded to blob storage (via DALL-E fallback)`);
          } else {
            console.log(`  ⚠️  DALL-E fallback not configured, skipping image ${i + 1}`);
          }
        } catch (fallbackError) {
          console.error(`  DALL-E fallback also failed for image ${i + 1}:`, fallbackError);
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

// Run the script
regenerateImagesForPastChallenges();
