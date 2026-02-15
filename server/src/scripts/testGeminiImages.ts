/**
 * Test script for Gemini image generation
 * Generates all 4 standard property photos for one sample foreclosure scenario
 * Uploads to Azure Blob Storage and outputs URLs for comparison
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Sample foreclosure scenario for testing
const sampleScenario = {
  city: 'Phoenix',
  state: 'Arizona',
  propertyType: 'Single Family Home',
  beds: 3,
  baths: 2,
  sqft: 1650,
  yearBuilt: 1985,
  estimatedRepairs: 45000,
  occupancyStatus: 'vacant' as const,
  description: 'Distressed property in need of significant repairs. Shows signs of water damage and deferred maintenance.',
  redFlags: [
    { description: 'Visible roof damage with missing shingles', severity: 'high' },
    { description: 'Water stains on ceiling indicating possible leak', severity: 'medium' },
    { description: 'Cracked foundation visible on exterior', severity: 'high' },
    { description: 'Outdated electrical panel from 1985', severity: 'medium' }
  ],
  hiddenIssues: [
    'HVAC system is 20+ years old and likely needs replacement',
    'Plumbing shows signs of corrosion',
    'Insulation appears inadequate'
  ]
};

async function testGeminiImages() {
  // Dynamically import services AFTER env vars are loaded
  const { ImageProviderFactory } = await import('../services/imageProviders/ImageProviderFactory.js');
  const { blobStorage } = await import('../services/blobStorage.js');
  const { buildStandardPhotoPrompt, STANDARD_PHOTO_TYPES } = await import('../utils/imagePromptBuilder.js');

  console.log('🧪 Testing Gemini Image Generation with Grounding\n');
  console.log('📋 Sample Scenario:');
  console.log(`   Location: ${sampleScenario.city}, ${sampleScenario.state}`);
  console.log(`   Property: ${sampleScenario.propertyType} (${sampleScenario.beds} bed / ${sampleScenario.baths} bath)`);
  console.log(`   Year Built: ${sampleScenario.yearBuilt}`);
  console.log(`   Estimated Repairs: $${sampleScenario.estimatedRepairs?.toLocaleString()}`);
  console.log(`   Red Flags: ${sampleScenario.redFlags?.length || 0}\n`);

  // Check if blob storage is configured
  if (!blobStorage.isConfigured()) {
    console.error('❌ Azure Blob Storage not configured. Cannot save test images.');
    console.error('   Set AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME');
    process.exit(1);
  }

  // Create provider (will use IMAGE_PROVIDER env var or default to 'gemini' for this test)
  const provider = ImageProviderFactory.createProvider('gemini');

  if (!provider.isConfigured()) {
    console.error(`❌ ${provider.getProviderName()} provider not properly configured.`);
    console.error('   For Gemini: Set GOOGLE_APPLICATION_CREDENTIALS, GCP_PROJECT_ID, and GCP_LOCATION');
    process.exit(1);
  }

  console.log(`✅ Using provider: ${provider.getProviderName()}\n`);

  // Generate test folder with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const testFolder = `test/gemini-${timestamp}`;

  const generatedImages: Array<{ type: string; url: string; timeMs: number }> = [];
  let totalCost = 0;

  // Generate all 4 standard photo types
  for (let i = 0; i < STANDARD_PHOTO_TYPES.length; i++) {
    const photoType = STANDARD_PHOTO_TYPES[i];
    console.log(`\n📸 [${i + 1}/4] Generating ${photoType} image...`);

    try {
      // Build prompt using existing prompt builder
      const prompt = buildStandardPhotoPrompt(photoType, sampleScenario);
      console.log(`   Prompt preview: ${prompt.substring(0, 150)}...`);

      // Generate image and measure time
      const startTime = Date.now();
      const imageBuffer = await provider.generateImage(prompt);
      const endTime = Date.now();
      const timeMs = endTime - startTime;

      console.log(`   ✅ Generated in ${timeMs}ms (${(timeMs / 1000).toFixed(1)}s)`);
      console.log(`   📦 Image size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

      // Upload to Azure Blob Storage
      console.log(`   ☁️  Uploading to Azure Blob Storage...`);
      const blobUrl = await blobStorage.uploadImage(imageBuffer, testFolder, 'image/png');
      console.log(`   ✅ Uploaded: ${blobUrl.substring(0, 100)}...`);

      generatedImages.push({
        type: photoType,
        url: blobUrl,
        timeMs
      });

      // Estimate cost (Gemini 2.0 Flash: ~$0.002 per image + ~$0.001 for grounding)
      const estimatedCost = 0.003;
      totalCost += estimatedCost;

    } catch (error) {
      console.error(`   ❌ Failed to generate ${photoType}:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  // Print summary
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ GEMINI IMAGE GENERATION TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`\nProvider: ${provider.getProviderName()}`);
  console.log(`Total Images: ${generatedImages.length}`);
  console.log(`Total Time: ${(generatedImages.reduce((sum, img) => sum + img.timeMs, 0) / 1000).toFixed(1)}s`);
  console.log(`Estimated Cost: ~$${totalCost.toFixed(4)}\n`);

  console.log('📸 Generated Images:\n');
  generatedImages.forEach((img, idx) => {
    console.log(`${idx + 1}. ${img.type.toUpperCase().replace(/_/g, ' ')}`);
    console.log(`   URL: ${img.url}`);
    console.log(`   Time: ${(img.timeMs / 1000).toFixed(1)}s\n`);
  });

  console.log('💡 Next Steps:');
  console.log('   1. Open the URLs above in your browser to view the images');
  console.log('   2. Evaluate realism and quality compared to DALL-E');
  console.log('   3. If satisfied, set IMAGE_PROVIDER=gemini in your environment');
  console.log('   4. Run the foreclosure generator to use Gemini for daily challenges\n');
}

// Run the test
testGeminiImages()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
