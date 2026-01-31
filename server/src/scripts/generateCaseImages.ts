import OpenAI from 'openai';
import { blobStorage } from '../services/blobStorage.js';
import dotenv from 'dotenv';

dotenv.config();

interface CaseImageData {
  caseId: string;
  address: string;
  city: string;
  state: string;
  propertyType: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  occupancyStatus: string;
  description: string;
  photos: string[];
}

// All static cases with their photo descriptions
const staticCases: { [key: string]: CaseImageData } = {
  'case-011': {
    caseId: 'case-011',
    address: '555 Maple Ridge Lane',
    city: 'Portland',
    state: 'OR',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1950,
    yearBuilt: 1985,
    occupancyStatus: 'vacant',
    description: 'Previous owner was a software engineer who decided to "automate" everything - the garage door opens at random times, the smart thermostat is stuck in Celsius.',
    photos: ['🏡 Street view', '🏠 Interior', '🌲 Backyard', '🚪 Entry']
  }
  // Add more cases here as needed
};

async function generateImagesForCase(caseData: CaseImageData, dalleClient: OpenAI): Promise<string[]> {
  const imageUrls: string[] = [];
  
  const location = `${caseData.city}, ${caseData.state}`;
  const propertyType = caseData.propertyType.toLowerCase();
  
  const occupancyDetails = caseData.occupancyStatus === 'vacant' 
    ? 'Property is vacant and unfurnished.' 
    : caseData.occupancyStatus === 'occupied'
    ? 'Property is currently occupied with furniture.'
    : '';

  console.log(`\n📸 Generating images for ${caseData.caseId} (${caseData.address})...`);

  for (let i = 0; i < caseData.photos.length; i++) {
    const photoDesc = caseData.photos[i];
    // Remove emoji from description
    const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    
    const prompt = `Realistic real estate photograph: ${cleanDesc}. ${propertyType} in ${location}. Built in ${caseData.yearBuilt}. ${occupancyDetails} ${caseData.description}. Professional real estate photography style, natural lighting, high quality.`;
    
    console.log(`  Image ${i + 1}/${caseData.photos.length}: ${cleanDesc}`);
    
    try {
      const response = await dalleClient.images.generate({
        model: 'dall-e-2',
        prompt: prompt,
        n: 1,
        size: '512x512',
      });

      const imageUrl = response.data?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL in response');
      }

      // Download the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      // Upload to Azure Blob Storage in production folder
      const blobUrl = await blobStorage.uploadImage(imageBuffer, `static-cases/${caseData.caseId}`);
      imageUrls.push(blobUrl);
      
      console.log(`    ✅ Uploaded to: ${blobUrl}`);
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`    ❌ Error generating image ${i + 1}:`, error);
      throw error;
    }
  }

  return imageUrls;
}

async function main() {
  const caseId = process.argv[2];
  
  if (!caseId) {
    console.error('❌ Please provide a case ID as argument');
    console.error('Usage: npm run generate-case-images <case-id>');
    console.error('Example: npm run generate-case-images case-011');
    process.exit(1);
  }

  const caseData = staticCases[caseId];
  if (!caseData) {
    console.error(`❌ Case ID "${caseId}" not found in static cases`);
    console.error('Available cases:', Object.keys(staticCases).join(', '));
    process.exit(1);
  }

  console.log(`🚀 Generating images for ${caseId}...\n`);

  // Initialize DALL-E client
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const dalleClient = new OpenAI({
    apiKey: openaiApiKey,
  });

  try {
    const imageUrls = await generateImagesForCase(caseData, dalleClient);
    
    console.log('\n\n📋 ===== RESULTS =====\n');
    console.log(`✅ Successfully generated ${imageUrls.length} images for ${caseId}\n`);
    console.log('Copy the following URLs into cases.ts photoUrls array:\n');
    console.log('photoUrls: [');
    imageUrls.forEach((url, index) => {
      console.log(`  "${url}"${index < imageUrls.length - 1 ? ',' : ''}`);
    });
    console.log('],\n');
    
  } catch (error) {
    console.error(`❌ Failed to generate images for ${caseId}:`, error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
