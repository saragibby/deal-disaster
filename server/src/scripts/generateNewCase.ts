import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Script to generate a new static case for the regular game
 * Uses the updated standardized photo prompts for realistic images
 * Run with: npx tsx src/scripts/generateNewCase.ts
 */

// Define the new case data
const newCase: PropertyScenario & {
  caseId: string;
  address: string;
  zip: string;
  propertyValue: number;
  auctionPrice: number;
  actualValue: number;
  isGoodDeal: boolean;
  hoaFees?: number;
} = {
  caseId: 'case-015',
  address: '3030 Starter Home Street',
  city: 'Raleigh',
  state: 'NC',
  zip: '27601',
  propertyType: 'Townhouse',
  beds: 3,
  baths: 2.5,
  sqft: 1680,
  yearBuilt: 2010,
  estimatedRepairs: 18000,
  occupancyStatus: 'vacant',
  propertyValue: 310000,
  auctionPrice: 162000,
  actualValue: 285000,
  isGoodDeal: true,
  hoaFees: 180,
  description: 'Modern townhouse in growing Raleigh suburb with granite counters and stainless appliances. Previous owner was a young professional who moved for work and left behind IKEA furniture and motivational wall decals. The unit has an open floor plan perfect for hosting, if you can overlook the mystery stain on the master bedroom carpet. Community amenities include a pool and fitness center that may or may not be fully operational.',
  funnyStory: 'The HOA newsletter mentions ongoing "spirited discussions" about pet policies and parking spots.',
  redFlags: [
    {
      description: 'HVAC shared system - HOA responsible but budget shows deferred maintenance',
      severity: 'low'
    },
    {
      description: 'Water heater is 9 years old - near end of typical lifespan ($1.2k-$1.8k)',
      severity: 'low'
    },
    {
      description: 'HOA reserves underfunded by 30% - potential for special assessments',
      severity: 'medium'
    }
  ],
  hiddenIssues: [
    'Carpet in all bedrooms needs replacement - hardwood underneath',
    'Community pool closed last summer due to repairs - still ongoing'
  ]
};

async function generateCaseImages(scenario: PropertyScenario, caseId: string, dalleClient: OpenAI): Promise<string[]> {
  // Dynamic import of blobStorage to ensure .env is loaded first
  const { blobStorage } = await import('../services/blobStorage.js');
  
  const imageUrls: string[] = [];
  
  const location = `${scenario.city}, ${scenario.state}`;
  const propertyType = (scenario.propertyType || 'single family home').toLowerCase();
  
  const occupancyDetails = scenario.occupancyStatus === 'vacant' 
    ? 'Property is vacant and unfurnished.' 
    : scenario.occupancyStatus === 'occupied'
    ? 'Property is currently occupied with furniture.'
    : '';

  // Simple photo descriptions like the original realistic cases
  const photoDescriptions = [
    '🏠 Front exterior view',
    '🍳 Kitchen interior',
    '🌳 Backyard view',
    '🛋️ Living room interior'
  ];
  
  console.log(`\n📸 Generating 4 images for ${caseId} using DALL-E 2...`);
  console.log('Photo types: exterior, kitchen, backyard, living room\n');

  for (let i = 0; i < photoDescriptions.length; i++) {
    const photoDesc = photoDescriptions[i];
    // Remove emoji from description
    const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
    
    // Use the SAME simple prompt format as the original realistic static cases
    const prompt = `Realistic real estate photograph: ${cleanDesc}. ${propertyType} in ${location}. Built in ${scenario.yearBuilt}. ${occupancyDetails} ${scenario.description}. Professional real estate photography style, natural lighting, high quality.`;
    
    console.log(`  Image ${i + 1}/4: ${cleanDesc}`);
    
    try {
      // Use DALL-E 2 like the original - produces more realistic photos
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

      // Upload to Azure Blob Storage in static-cases folder
      const blobUrl = await blobStorage.uploadImage(imageBuffer, `static-cases/${caseId}`);
      imageUrls.push(blobUrl);
      
      console.log(`    ✅ Uploaded to Azure Blob Storage`);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`    ❌ Error generating image ${i + 1}:`, error);
      throw error;
    }
  }

  return imageUrls;
}

async function main() {
  console.log('🚀 Generating new static case for regular game...\n');

  // Initialize DALL-E client
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const dalleClient = new OpenAI({
    apiKey: openaiApiKey,
  });

  try {
    const imageUrls = await generateCaseImages(newCase, newCase.caseId, dalleClient);
    
    console.log('\n\n📋 ===== NEW CASE DATA =====\n');
    console.log('Add this to src/data/cases.ts:\n');
    
    console.log(`  {
    id: '${newCase.caseId}',
    address: '${newCase.address}',
    city: '${newCase.city}',
    state: '${newCase.state}',
    zip: '${newCase.zip}',
    propertyValue: ${newCase.propertyValue},
    auctionPrice: ${newCase.auctionPrice},
    repairEstimate: ${newCase.estimatedRepairs},
    actualValue: ${newCase.actualValue},
    isGoodDeal: ${newCase.isGoodDeal},
    occupancyStatus: '${newCase.occupancyStatus}',
    propertyType: '${newCase.propertyType}',
    beds: ${newCase.beds},
    baths: ${newCase.baths},
    sqft: ${newCase.sqft},
    yearBuilt: ${newCase.yearBuilt},
    description: '${newCase.description?.replace(/'/g, "\\'")}',
    photos: ['🏠 Exterior', '🍳 Kitchen', '🌳 Backyard', '🛋️ Interior'],
    photoUrls: [
      "${imageUrls[0]}",
      "${imageUrls[1]}",
      "${imageUrls[2]}",
      "${imageUrls[3]}"
    ],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'SunTrust Bank',
        amount: 148000,
        priority: 1,
        notes: 'Will be wiped at foreclosure sale'
      },
      {
        type: 'HOA Lien',
        holder: 'Piedmont Townhomes HOA',
        amount: 2400,
        priority: 2,
        notes: 'Unpaid HOA dues for 8 months'
      }
    ],
    redFlags: [
      {
        id: 'rf-015-1',
        description: 'HVAC shared system - HOA responsible but budget shows deferred maintenance',
        severity: 'low',
        hiddenIn: 'HOA Budget Report',
        discovered: false
      },
      {
        id: 'rf-015-2',
        description: 'Water heater is 9 years old - near end of typical lifespan ($1.2k-$1.8k)',
        severity: 'low',
        hiddenIn: 'Home Inspection',
        discovered: false
      },
      {
        id: 'rf-015-3',
        description: 'HOA reserves underfunded by 30% - potential for special assessments',
        severity: 'medium',
        hiddenIn: 'HOA Financial Statement',
        discovered: false
      }
    ]
  },`);

    console.log('\n✅ New case generated successfully!');
    console.log('\nImage URLs:');
    imageUrls.forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to generate case:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
