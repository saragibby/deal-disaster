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
  caseId: 'case-014',
  address: '1776 Freedom Drive',
  city: 'Nashville',
  state: 'TN',
  zip: '37201',
  propertyType: 'Single Family Home',
  beds: 3,
  baths: 2,
  sqft: 1750,
  yearBuilt: 1992,
  estimatedRepairs: 32000,
  occupancyStatus: 'vacant',
  propertyValue: 395000,
  auctionPrice: 195000,
  actualValue: 355000,
  isGoodDeal: true,
  description: 'Music City bungalow with vintage charm and a few surprises. Previous owner was a session musician who soundproofed the garage studio with questionable materials. The house features original hardwood floors (mostly level), a recently updated kitchen with subway tile, and a backyard that\'s perfect for BBQs if you ignore the leaning fence. Neighbors mention the house had "legendary jam sessions" that may have exceeded noise ordinances.',
  funnyStory: 'The seller left behind a fully functional recording studio in the garage, complete with egg cartons on the walls for "acoustic treatment."',
  redFlags: [
    {
      description: 'Foundation has minor settling - cracks in drywall, needs monitoring ($5k-$8k)',
      severity: 'medium'
    },
    {
      description: 'Garage conversion lacks proper permits - $6k to bring to code or remove',
      severity: 'medium'
    },
    {
      description: 'Plumbing is galvanized steel from 1992 - recommend replacement soon ($10k-$15k)',
      severity: 'medium'
    }
  ],
  hiddenIssues: [
    'Soundproofing materials in garage may contain asbestos - needs testing',
    'Backyard fence is on neighbor\'s property - boundary dispute possible'
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
    
    // Detect if property has multiple levels
    const descLower = (scenario.description || '').toLowerCase();
    const hasMultipleLevels = descLower.includes('stair') || descLower.includes('upstairs') || 
                              descLower.includes('two-story') || descLower.includes('two story') ||
                              descLower.includes('second floor') || descLower.includes('multi-level');
    const levelContext = hasMultipleLevels ? 'Two-story property with multiple levels. ' : '';
    
    // Use the SAME simple prompt format as the original realistic static cases
    const prompt = `Photorealistic real estate photograph, no people, no humans: ${cleanDesc}. ${propertyType} in ${location}. Built in ${scenario.yearBuilt}. ${levelContext}${occupancyDetails}Professional MLS listing photo, natural daylight, high-resolution camera. IMPORTANT: Show only the empty property - absolutely no people, no humans, no figures visible anywhere in the image.`;
    
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
        holder: 'Regions Bank',
        amount: 178000,
        priority: 1,
        notes: 'Will be wiped at foreclosure sale'
      },
      {
        type: 'Property Tax Lien',
        holder: 'Davidson County',
        amount: 4200,
        priority: 2,
        notes: 'Unpaid property taxes - survives foreclosure'
      }
    ],
    redFlags: [
      {
        id: 'rf-014-1',
        description: 'Foundation has minor settling - cracks in drywall, needs monitoring ($5k-$8k)',
        severity: 'medium',
        hiddenIn: 'Structural Engineer Report',
        discovered: false
      },
      {
        id: 'rf-014-2',
        description: 'Garage conversion lacks proper permits - $6k to bring to code or remove',
        severity: 'medium',
        hiddenIn: 'Building Permit Records',
        discovered: false
      },
      {
        id: 'rf-014-3',
        description: 'Plumbing is galvanized steel from 1992 - recommend replacement soon ($10k-$15k)',
        severity: 'medium',
        hiddenIn: 'Plumbing Inspection',
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
