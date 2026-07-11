import OpenAI from 'openai';
import { BlobServiceClient, BlobSASPermissions } from '@azure/storage-blob';
import { pool } from './server/src/db/pool.js';
import { propertyCases } from './src/data/cases.js';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'dealdisaster';
const ENVIRONMENT = process.env.ENVIRONMENT || 'prod';

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set');
  process.exit(1);
}

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.error('❌ AZURE_STORAGE_CONNECTION_STRING not set');
  process.exit(1);
}

const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
const dalleClient = new OpenAI({ apiKey: OPENAI_API_KEY });

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageToBlob(buffer: Buffer, folder: string, contentType = 'image/png'): Promise<string> {
  const filename = `${crypto.randomUUID()}.png`;
  const blobPath = `${ENVIRONMENT}/static-cases/${folder}/${filename}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType }
  });
  
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 10);
  
  const sasUrl = await blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse('r'),
    startsOn: new Date(),
    expiresOn: expiryDate
  });
  
  return sasUrl;
}

async function generateImage(prompt: string): Promise<string> {
  const imageResponse = await dalleClient.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  });
  
  if (!imageResponse.data || !imageResponse.data[0]?.url) {
    throw new Error('No image URL in response');
  }
  
  return imageResponse.data[0].url;
}

async function generatePropertyImages(caseData: any, caseId: string): Promise<string[]> {
  const location = `${caseData.city}, ${caseData.state}`;
  const propertyType = caseData.propertyType?.toLowerCase() || 'property';
  const propertyDesc = caseData.description || '';
  const occupancyStatus = caseData.occupancyStatus || caseData.occupancy_status;
  
  // Extract visual issues from red flags
  const visualIssues: string[] = [];
  const redFlags = caseData.redFlags || caseData.red_flags || [];
  redFlags.forEach((flag: any) => {
    const desc = (flag.description?.toLowerCase() || '');
    if (desc.includes('crack') || desc.includes('foundation') || desc.includes('settling')) {
      visualIssues.push('visible cracks in walls or foundation');
    }
    if (desc.includes('water') || desc.includes('stain') || desc.includes('leak') || desc.includes('mold')) {
      visualIssues.push('water damage or staining visible');
    }
    if (desc.includes('roof')) {
      visualIssues.push('roof showing wear or damage');
    }
    if (desc.includes('overgrown') || desc.includes('landscaping') || desc.includes('neglect')) {
      visualIssues.push('overgrown or neglected landscaping');
    }
    if (desc.includes('paint') || desc.includes('cosmetic') || desc.includes('dated')) {
      visualIssues.push('dated finishes or peeling paint');
    }
  });
  
  const visualContext = visualIssues.length > 0 
    ? `Property shows signs of: ${visualIssues.slice(0, 3).join(', ')}. ` 
    : '';
  
  const occupancyDetails = occupancyStatus === 'vacant' 
    ? 'Property is vacant and unfurnished, showing signs of being unoccupied. ' 
    : occupancyStatus === 'occupied'
    ? 'Property is currently occupied with furniture and lived-in appearance. '
    : 'Property appearance uncertain. ';
  
  // Use the photo descriptions from the scenario
  const photoDescriptions = caseData.photos || [];
  const imagePrompts = photoDescriptions.map((photoDesc: string) => {
    const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    
    return `Ultra-realistic real estate photography: ${cleanDesc}. ${propertyType} in ${location}, built in ${caseData.yearBuilt || caseData.year_built}. ${occupancyDetails}${visualContext}${propertyDesc} Professional MLS listing photo showing actual property condition, natural daylight, high resolution DSLR camera, sharp focus, realistic textures and materials, photorealistic architectural photography, true-to-life colors and lighting, authentic property flaws visible. No text, no watermarks, no illustrations - photorealistic only.`;
  });
  
  const imageUrls: string[] = [];
  
  for (let i = 0; i < imagePrompts.length; i++) {
    try {
      console.log(`    Generating image ${i + 1}/${imagePrompts.length}...`);
      const tempUrl = await generateImage(imagePrompts[i]);
      const imageBuffer = await downloadImage(tempUrl);
      const blobUrl = await uploadImageToBlob(imageBuffer, caseId, 'image/png');
      imageUrls.push(blobUrl);
      console.log(`    ✅ Image ${i + 1} uploaded`);
      
      // Add delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`    ❌ Failed to generate image ${i + 1}:`, error.message);
    }
  }
  
  return imageUrls;
}

async function regenerateCaseImages() {
  console.log(`\n🏠 Regenerating images for ${propertyCases.length} static cases...\n`);
  
  for (const propertyCase of propertyCases) {
    console.log(`📸 Processing ${propertyCase.id}: ${propertyCase.address}`);
    
    try {
      const imageUrls = await generatePropertyImages(propertyCase, propertyCase.id);
      console.log(`  ✅ Generated ${imageUrls.length} images for ${propertyCase.id}`);
      console.log(`  URLs:\n${imageUrls.map((url, i) => `    ${i + 1}. ${url}`).join('\n')}`);
      console.log('');
    } catch (error: any) {
      console.error(`  ❌ Failed to generate images for ${propertyCase.id}:`, error.message);
    }
  }
}

async function regenerateTodaysChallengeImages() {
  console.log('\n🌟 Regenerating images for today\'s daily challenge...\n');
  
  try {
    // Get today's challenge
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [today]
    );
    
    if (result.rows.length === 0) {
      console.log('ℹ️  No challenge found for today');
      return;
    }
    
    const challenge = result.rows[0];
    const propertyData = challenge.property_data;
    const challengeId = `daily-${challenge.id}`;
    
    console.log(`📸 Processing daily challenge for ${today}`);
    console.log(`   Address: ${propertyData.address}, ${propertyData.city}, ${propertyData.state}`);
    
    const imageUrls = await generatePropertyImages(propertyData, challengeId);
    
    // Update the database with new image URLs
    propertyData.photos = imageUrls;
    await pool.query(
      'UPDATE daily_challenges SET property_data = $1 WHERE id = $2',
      [JSON.stringify(propertyData), challenge.id]
    );
    
    console.log(`  ✅ Generated ${imageUrls.length} images for today's challenge`);
    console.log(`  ✅ Updated database with new URLs`);
    console.log(`  URLs:\n${imageUrls.map((url, i) => `    ${i + 1}. ${url}`).join('\n')}`);
    
  } catch (error: any) {
    console.error('  ❌ Failed to regenerate today\'s challenge images:', error.message);
  } finally {
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--cases-only')) {
    await regenerateCaseImages();
  } else if (args.includes('--daily-only')) {
    await regenerateTodaysChallengeImages();
  } else {
    // Do both
    await regenerateCaseImages();
    await regenerateTodaysChallengeImages();
  }
  
  console.log('\n✅ Image regeneration complete!');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
