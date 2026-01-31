import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from server/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Now import modules that depend on environment variables
const { blobStorage } = await import('../services/blobStorage.js');

import OpenAI from 'openai';
import { 
  generateStandardPhotoPrompts,
  PropertyScenario 
} from '../utils/imagePromptBuilder.js';

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
  caseId: 'case-010',
  address: '456 Whisper Woods Drive',
  city: 'Austin',
  state: 'TX',
  zip: '78745',
  propertyType: 'Single Family Home',
  beds: 3,
  baths: 2,
  sqft: 1920,
  yearBuilt: 2001,
  estimatedRepairs: 28000,
  occupancyStatus: 'vacant',
  propertyValue: 385000,
  auctionPrice: 195000,
  actualValue: 320000,
  isGoodDeal: true,
  description: 'Former Airbnb rental that the owner "forgot" to report on taxes for five years. The hot tub out back has been described as "organic" by neighbors, and the guest reviews mentioned something about a "friendly" family of raccoons in the attic. Kitchen was updated in 2018 with granite counters and stainless appliances, though the fridge has been making jazz sounds since the power got shut off.',
  funnyStory: 'Previous owner tried to convert the garage into a "zen meditation studio" complete with a koi pond that leaked into the foundation.',
  redFlags: [
    {
      description: 'Unpermitted garage conversion with electrical work done by "a guy from Craigslist"',
      severity: 'high'
    },
    {
      description: 'Foundation moisture issues from failed koi pond installation',
      severity: 'medium'
    },
    {
      description: 'HOA special assessment pending for community fence replacement - $4,500',
      severity: 'medium'
    }
  ],
  hiddenIssues: [
    'Raccoon damage in attic insulation - needs full replacement',
    'Hot tub has been disconnected and may have electrical code violations'
  ]
};

async function generateCaseImages(scenario: PropertyScenario, caseId: string, dalleClient: OpenAI): Promise<string[]> {
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
        holder: 'Chase Bank',
        amount: 142000,
        priority: 1,
        notes: 'Will be wiped at foreclosure sale'
      },
      {
        type: 'HOA Lien',
        holder: 'Whisper Woods HOA',
        amount: 8500,
        priority: 2,
        notes: 'Unpaid dues plus special assessment'
      }
    ],
    redFlags: [
      {
        id: 'rf-010-1',
        description: 'Unpermitted garage conversion - city requires removal or $15k+ to bring to code',
        severity: 'high',
        hiddenIn: 'Building Permit Records',
        discovered: false
      },
      {
        id: 'rf-010-2', 
        description: 'Foundation moisture issues - inspector estimates $12k remediation',
        severity: 'medium',
        hiddenIn: 'Previous Inspection Report (2022)',
        discovered: false
      },
      {
        id: 'rf-010-3',
        description: 'HOA special assessment of $4,500 due within 60 days - not disclosed in sale docs',
        severity: 'medium',
        hiddenIn: 'HOA Meeting Minutes',
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
