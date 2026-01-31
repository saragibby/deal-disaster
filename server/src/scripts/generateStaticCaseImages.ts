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

// All 9 static cases with their photo descriptions
const staticCases: CaseImageData[] = [
  {
    caseId: 'case-001',
    address: '1428 Elm Street',
    city: 'Phoenix',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1850,
    yearBuilt: 1998,
    occupancyStatus: 'vacant',
    description: 'Previous owner was a "cryptocurrency entrepreneur" who apparently forgot to pay the IRS for three years while driving a Lambo.',
    photos: ['🏠 Front view', '🛁 Bathroom', '🍳 Kitchen', '🌳 Backyard']
  },
  {
    caseId: 'case-002',
    address: '742 Evergreen Terrace',
    city: 'Las Vegas',
    state: 'NV',
    propertyType: 'Townhouse',
    beds: 4,
    baths: 2.5,
    sqft: 2100,
    yearBuilt: 2005,
    occupancyStatus: 'vacant',
    description: 'Former owner flipped the kitchen themselves using YouTube tutorials - the subway tile work is "charmingly uneven".',
    photos: ['🏘️ Front', '🛋️ Living room', '🏊 Pool', '🚗 Garage']
  },
  {
    caseId: 'case-003',
    address: '221B Baker Street',
    city: 'Henderson',
    state: 'NV',
    propertyType: 'Condo',
    beds: 5,
    baths: 3,
    sqft: 2650,
    yearBuilt: 2012,
    occupancyStatus: 'occupied',
    description: 'Luxury high-rise condo with breathtaking views and some equally breathtaking "settling" cracks.',
    photos: ['🏙️ View', '💎 Master suite', '🍽️ Dining', '⛰️ Balcony']
  },
  {
    caseId: 'case-004',
    address: '4160 Government Way',
    city: 'Tucson',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1450,
    yearBuilt: 1985,
    occupancyStatus: 'vacant',
    description: 'Previous owner was an "enthusiastic" DIYer who turned the garage into a "game room" without bothering with pesky permits.',
    photos: ['🏚️ Exterior', '🔨 Interior', '🚪 Bedrooms', '🏡 Backyard']
  },
  {
    caseId: 'case-005',
    address: '1313 Mockingbird Lane',
    city: 'Scottsdale',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 3,
    sqft: 2850,
    yearBuilt: 2008,
    occupancyStatus: 'vacant',
    description: 'Gorgeous Scottsdale pool home in a "premium location" that just happens to be in a flood plain.',
    photos: ['🌟 Curb appeal', '🏊 Pool', '🏠 Great room', '🌵 Desert landscape']
  },
  {
    caseId: 'case-006',
    address: '777 Lucky Lane',
    city: 'Phoenix',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1850,
    yearBuilt: 1998,
    occupancyStatus: 'vacant',
    description: 'Charming home with a "distinct chemical aroma" that the listing agent describes as "industrial chic."',
    photos: ['🏚️ Front exterior', '🧪 Kitchen with stains', '🚪 Bedroom closets', '🌵 Desert backyard']
  },
  {
    caseId: 'case-007',
    address: '3456 Cactus Garden Circle',
    city: 'Tempe',
    state: 'AZ',
    propertyType: 'Townhouse',
    beds: 2,
    baths: 2.5,
    sqft: 1625,
    yearBuilt: 2015,
    occupancyStatus: 'vacant',
    description: 'Modern townhouse steps from ASU with water stain pattern on the master bedroom ceiling.',
    photos: ['🏘️ Townhouse exterior', '🛋️ Open living area', '🍳 Modern kitchen', '🌳 Community pool']
  },
  {
    caseId: 'case-008',
    address: '2121 Baby Mama Boulevard',
    city: 'Mesa',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 3,
    sqft: 2450,
    yearBuilt: 2005,
    occupancyStatus: 'unknown',
    description: 'Spacious family home with a backyard basketball court and an even more impressive collection of court documents.',
    photos: ['🏡 Large family home', '👶 Playroom setup', '🚗 Three-car garage', '🏀 Basketball court']
  },
  {
    caseId: 'case-009',
    address: '888 Sinkholes Street',
    city: 'Chandler',
    state: 'AZ',
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 2.5,
    sqft: 2750,
    yearBuilt: 2012,
    occupancyStatus: 'vacant',
    description: 'Stunning executive home with "character lines" (realtor-speak for cracks) running through the foundation.',
    photos: ['🏛️ Grand entrance', '🍽️ Gourmet kitchen', '🛁 Spa bathroom', '⛳ Golf course view']
  },
  {
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
];

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
    
    console.log(`  Image ${i + 1}/4: ${cleanDesc}`);
    
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
      // Use case ID as the folder name for organization
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
  console.log('🚀 Starting static case image generation...\n');

  // Initialize DALL-E client
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const dalleClient = new OpenAI({
    apiKey: openaiApiKey,
  });

  // Store all results
  const results: { [caseId: string]: string[] } = {};

  // Generate images for each case
  for (const caseData of staticCases) {
    try {
      const imageUrls = await generateImagesForCase(caseData, dalleClient);
      results[caseData.caseId] = imageUrls;
      console.log(`✅ Completed ${caseData.caseId}\n`);
    } catch (error) {
      console.error(`❌ Failed to generate images for ${caseData.caseId}:`, error);
      process.exit(1);
    }
  }

  // Print all results in a format ready to paste into cases.ts
  console.log('\n\n📋 ===== RESULTS =====\n');
  console.log('Copy the following URLs into cases.ts:\n');
  
  for (const [caseId, urls] of Object.entries(results)) {
    console.log(`${caseId}:`);
    console.log(`  photos: [`);
    urls.forEach((url, index) => {
      console.log(`    '${url}'${index < urls.length - 1 ? ',' : ''}`);
    });
    console.log(`  ],\n`);
  }

  console.log('\n✅ All images generated successfully!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
