import OpenAI from 'openai';
import { blobStorage } from './blobStorage.js';

interface ForeclosureScenario {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: string;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  auctionPrice: number;
  estimatedValue: number;
  estimatedRepairs: number;
  monthlyRent: number;
  actualValue: number;
  isGoodDeal: boolean;
  occupancyStatus: 'vacant' | 'occupied' | 'unknown';
  hoaFees?: number;
  description: string;
  funnyStory: string;
  photos: string[];
  liens: Array<{
    type: string;
    holder: string;
    amount: number;
    priority: number;
    notes?: string;
  }>;
  redFlags: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    impact: string;
  }>;
  hiddenIssues: string[];
  correctDecision: 'BUY' | 'INVESTIGATE' | 'WALK_AWAY';
  explanation: string;
}

export class ForeclosureScenarioGenerator {
  private client: OpenAI;
  private dalleClient: OpenAI | null = null;

  constructor() {
    // Initialize Azure OpenAI client for text generation
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI credentials not configured. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT');
    }

    // Remove any trailing slashes and /api/projects paths
    const cleanEndpoint = endpoint.replace(/\/api\/projects.*$/, '').replace(/\/$/, '');

    this.client = new OpenAI({
      apiKey,
      baseURL: `${cleanEndpoint}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });

    // Initialize standard OpenAI client for DALL-E image generation
    if (process.env.OPENAI_API_KEY) {
      this.dalleClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ DALL-E image generation enabled');
    } else {
      console.log('ℹ️  DALL-E image generation disabled (set OPENAI_API_KEY to enable)');
    }
  }

  async generateScenario(difficulty: 'easy' | 'medium' | 'hard' = 'medium', challengeDate?: string): Promise<ForeclosureScenario> {
    const prompt = this.buildPrompt(difficulty);

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5-nano',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in foreclosure auction analysis and real estate investing. Generate realistic foreclosure scenarios for educational purposes.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 16000
      });

      console.log('OpenAI Response:', JSON.stringify(response, null, 2));

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in response. Full response:', response);
        throw new Error('No response from OpenAI');
      }

      const scenario = JSON.parse(content) as ForeclosureScenario;
      const validatedScenario = this.validateAndNormalizeScenario(scenario);
      
      // Generate AI images for the property
      try {
        const imageUrls = await this.generatePropertyImages(validatedScenario, challengeDate);
        validatedScenario.photos = imageUrls;
      } catch (imageError) {
        console.error('Failed to generate images, using emoji placeholders:', imageError);
        // Keep the emoji placeholders if image generation fails
      }
      
      return validatedScenario;
    } catch (error) {
      console.error('Error generating foreclosure scenario:', error);
      throw new Error('Failed to generate foreclosure scenario');
    }
  }

  private async generatePropertyImages(scenario: ForeclosureScenario, challengeDate?: string): Promise<string[]> {
    // If no DALL-E client configured, return emoji placeholders
    if (!this.dalleClient) {
      console.log('Skipping image generation - no OpenAI API key configured');
      return scenario.photos;
    }

    // Extract key details for more realistic images
    const location = `${scenario.city}, ${scenario.state}`;
    const propertyType = scenario.propertyType.toLowerCase();
    const propertyDesc = scenario.description || '';
    const occupancyStatus = scenario.occupancyStatus;
    
    // Occupancy-specific details for more realistic images
    const occupancyDetails = occupancyStatus === 'vacant' 
      ? 'Property is vacant and unfurnished.' 
      : occupancyStatus === 'occupied'
      ? 'Property is currently occupied with furniture.'
      : '';

    // Use the photo descriptions from the scenario and enhance them with property context
    const imagePrompts = scenario.photos.map((photoDesc, index) => {
      // Remove any emoji from the description if present
      const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      
      return `Realistic real estate photograph: ${cleanDesc}. ${propertyType} in ${location}. Built in ${scenario.yearBuilt}. ${occupancyDetails} ${propertyDesc}. Professional real estate photography style, natural lighting, high quality.`;
    });

    const imageUrls: string[] = [];

    console.log(`Generating ${imagePrompts.length} property images for ${location}...`);

    try {
      for (let i = 0; i < imagePrompts.length; i++) {
        try {
          console.log(`Generating image ${i + 1}/${imagePrompts.length}...`);
          
          const imageResponse = await this.dalleClient.images.generate({
            model: 'dall-e-3',
            prompt: imagePrompts[i],
            n: 1,
            size: '1024x1024',
            quality: 'standard',
          });

          if (imageResponse.data && imageResponse.data[0]?.url) {
            const tempUrl = imageResponse.data[0].url;
            console.log(`Generated temporary URL for image ${i + 1}`);
            
            // Download the image
            const imageBuffer = await this.downloadImage(tempUrl);
            
            // Azure Blob Storage is required - no fallback to base64
            if (!blobStorage.isConfigured()) {
              throw new Error('Azure Blob Storage not configured. Cannot save images.');
            }
            
            const dateFolder = challengeDate || new Date().toISOString().split('T')[0];
            const blobUrl = await blobStorage.uploadImage(imageBuffer, dateFolder, 'image/png');
            imageUrls.push(blobUrl);
            console.log(`✅ Uploaded image ${i + 1} to Azure Blob Storage`);
          }
        } catch (error) {
          console.error(`Failed to generate image ${i + 1}:`, error);
          // Continue to next image
        }
      }

      // If we got at least 2 images, return them (otherwise fall back to emojis)
      if (imageUrls.length >= 2) {
        console.log(`✅ Successfully generated ${imageUrls.length} images`);
        return imageUrls;
      } else {
        console.log('Not enough images generated, using emoji placeholders');
      }
    } catch (error) {
      console.error('Image generation failed:', error);
    }

    // Fallback to emoji placeholders
    return scenario.photos;
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildPrompt(difficulty: string): string {
    return `Generate a realistic and ENTERTAINING foreclosure auction scenario as a JSON object. Make the story funny and engaging while providing subtle clues about the deal quality.

Required JSON structure:
{
  "address": "creative street address (can be humorous reference)",
  "city": "real US city name",
  "state": "two-letter state code",
  "zipCode": "5-digit zip code",
  "propertyType": "Single Family Home, Condo, Townhouse, or Multi-Family",
  "beds": number of bedrooms (1-5),
  "baths": number of bathrooms (1-4),
  "sqft": square footage (800-4000),
  "yearBuilt": year built (1950-2020),
  "auctionPrice": auction price in dollars,
  "estimatedValue": estimated market value in dollars,
  "estimatedRepairs": estimated repair costs in dollars,
  "monthlyRent": potential monthly rent in dollars,
  "actualValue": true value after all hidden costs/issues (can be lower than estimatedValue if bad deal),
  "isGoodDeal": boolean (true if profitable after ALL costs considered),
  "occupancyStatus": "vacant", "occupied", or "unknown",
  "hoaFees": optional monthly HOA fees (omit if not applicable),
  "description": "brief 1-2 sentence property description",
  "funnyStory": "3-5 sentences about the property itself. Be funny and humorous! Describe quirky features, strange design choices, unusual conditions, or odd characteristics of the house. Drop subtle clues about problems without mentioning the foreclosure or auction. Focus on what makes THIS property unique or problematic in an entertaining way. Weave in hints about the specific issues this property has.",
  "photos": array of 4 photo descriptions (NOT emojis). Each should be a detailed description for AI image generation like "Front exterior showing the colonial-style home with overgrown landscaping", "Living room with worn carpet and dated wallpaper", "Kitchen showing original 1970s appliances", "Bathroom with cracked tile and outdated fixtures",
  "liens": array of 2-4 liens with structure:
    {
      "type": "VARY THESE! Examples: First Mortgage, Second Mortgage, Tax Lien (federal/state/local), HOA Lien, Mechanics Lien (unpaid contractors), IRS Tax Lien, Child Support Lien, Judgment Lien (lawsuit), Code Enforcement Lien, Water/Sewer Lien, Special Assessment Lien, etc. Note: If using Child Support Liens, feel free to include multiple from different baby mamas for comedic effect!",
      "holder": "name of institution or entity (make it specific and story-relevant). For Child Support Liens, use humorous references like 'Baby Mama #1', 'Baby Mama #2', 'Baby Mama from Vegas', etc.",
      "amount": dollar amount,
      "priority": 1, 2, 3, etc.,
      "notes": "Add story details! e.g., 'From contractor who walked off job after dispute with owner', 'Unpaid since previous owner's divorce', 'Baby Mama #3 - the one with twins', 'Will be wiped at foreclosure', 'Survives foreclosure - you inherit this!'"
    },
  "redFlags": array of 2-4 red flags with structure - DIVERSIFY THESE SIGNIFICANTLY!
    {
      "type": "CHOOSE FROM DIVERSE OPTIONS: 
        - Structural: Foundation cracks, settling, structural damage, roof collapse, basement flooding, retaining wall failure
        - Environmental: Asbestos, lead paint, mold infestation, radon, buried oil tank, contaminated soil, former meth lab
        - Title: Clouds on title, easement disputes, boundary conflicts, heir claims, forged deeds, undisclosed co-owners
        - Legal: Zoning violations, unpaid permits, code violations, illegal additions, occupancy restrictions, deed restrictions
        - Occupancy: Squatters, hostile tenants, hoarder damage, unauthorized occupants, lease disputes
        - Mechanical: HVAC failure, plumbing disasters, electrical hazards, septic system failure, well contamination
        - External: Flood zone issues, sinkhole risk, landslide area, airport noise easement, cell tower lease complications
        - Financial: Survivable liens, special assessments, upcoming major repairs (roof/HVAC), condemned status
        - Miscellaneous: Fire damage, water damage, pest infestation (termites, bedbugs), vandalism, stripped property
        
        For ${difficulty} difficulty: Use ${difficulty === 'hard' ? '3-4 diverse, interconnected' : difficulty === 'medium' ? '2-3 varied' : '2 straightforward'} issues",
      "description": "Tell a mini-story about this issue! Not just 'foundation problems' but 'Previous owner's DIY basement expansion undermined the foundation, causing a 3-inch crack from floor to ceiling that neighbors say has been growing for two years'",
      "severity": "low", "medium", or "high",
      "impact": "Be specific with dollar amounts AND story consequences: 'Estimated $45,000 to remediate asbestos in walls and attic, plus 6-month delay for certified removal and EPA clearance'"
    },
  "hiddenIssues": array of 1-3 strings describing non-obvious issues with story details. Examples: "Neighbors report constant sewage backup - septic system likely failing", "City records show demolition order filed last year for unpermitted garage conversion", "Former owner was running an unlicensed daycare - potential liability issues",
  "correctDecision": "BUY", "INVESTIGATE", or "WALK_AWAY",
  "explanation": "detailed explanation of why this is the correct decision with calculations"
}

Difficulty level: ${difficulty}
- Easy: 1-2 obvious issues with clear warning signs in the story
- Medium: 2-3 varied issues requiring careful analysis, mix of obvious and subtle clues
- Hard: 3-4 diverse, interconnected issues that are subtly hinted at or create complex cascading problems

CRITICAL REQUIREMENTS:
1. DIVERSIFY ISSUES! Don't repeat the same red flags (foundation, tax liens) every time
2. Make issues STORY-DRIVEN - each problem should have character and detail
3. Connect issues to the funnyStory - property history should hint at the problems
4. Vary lien types dramatically - not just "First Mortgage + Tax Lien" every time
5. For harder difficulties, make issues interact (e.g., water damage + mold + code violations)
6. Include realistic liens (tax liens, IRS liens, mechanics liens survive foreclosure!)
7. Ensure math adds up: auctionPrice + estimatedRepairs + surviving liens + red flag costs = total cost vs actualValue
8. Photo descriptions should reflect the specific issues and story elements
9. Drop clues in the story without giving away the answer
10. Use realistic numbers for 2025 market conditions
11. Make each property feel unique with its own character and problems`;
  }

  private validateAndNormalizeScenario(scenario: ForeclosureScenario): ForeclosureScenario {
    // Ensure all required fields are present
    if (!scenario.address || !scenario.city || !scenario.state) {
      throw new Error('Invalid scenario: missing required fields');
    }

    if (!scenario.funnyStory || !scenario.description) {
      throw new Error('Invalid scenario: missing story or description');
    }

    // Normalize and validate numbers
    scenario.auctionPrice = Math.round(scenario.auctionPrice);
    scenario.estimatedValue = Math.round(scenario.estimatedValue);
    scenario.estimatedRepairs = Math.round(scenario.estimatedRepairs);
    scenario.monthlyRent = Math.round(scenario.monthlyRent);
    scenario.actualValue = Math.round(scenario.actualValue);
    if (scenario.hoaFees) {
      scenario.hoaFees = Math.round(scenario.hoaFees);
    }

    // Ensure arrays exist
    if (!Array.isArray(scenario.redFlags) || scenario.redFlags.length === 0) {
      throw new Error('Invalid scenario: red flags must be a non-empty array');
    }

    if (!Array.isArray(scenario.liens) || scenario.liens.length === 0) {
      throw new Error('Invalid scenario: liens must be a non-empty array');
    }

    if (!Array.isArray(scenario.photos) || scenario.photos.length === 0) {
      throw new Error('Invalid scenario: photos must be a non-empty array');
    }

    // Ensure decision is valid
    if (!['BUY', 'INVESTIGATE', 'WALK_AWAY'].includes(scenario.correctDecision)) {
      throw new Error('Invalid scenario: correctDecision must be BUY, INVESTIGATE, or WALK_AWAY');
    }

    // Ensure occupancy status is valid
    if (!['vacant', 'occupied', 'unknown'].includes(scenario.occupancyStatus)) {
      throw new Error('Invalid scenario: occupancyStatus must be vacant, occupied, or unknown');
    }

    return scenario;
  }
}

// Export singleton instance
export const foreclosureGenerator = new ForeclosureScenarioGenerator();
