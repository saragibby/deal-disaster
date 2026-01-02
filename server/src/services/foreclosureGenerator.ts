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

  async generateScenario(difficulty: 'easy' | 'medium' | 'hard' = 'medium'): Promise<ForeclosureScenario> {
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
        const imageUrls = await this.generatePropertyImages(validatedScenario);
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

  private async generatePropertyImages(scenario: ForeclosureScenario): Promise<string[]> {
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
            try {
              const imageBuffer = await this.downloadImage(tempUrl);
              
              // Try to upload to Azure Blob Storage
              if (blobStorage.isConfigured()) {
                try {
                  const blobUrl = await blobStorage.uploadImage(imageBuffer, 'image/png');
                  imageUrls.push(blobUrl);
                  console.log(`✅ Uploaded image ${i + 1} to Azure Blob Storage`);
                } catch (uploadError) {
                  console.error(`Failed to upload to blob storage, falling back to base64:`, uploadError);
                  const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                  imageUrls.push(base64Image);
                  console.log(`✅ Converted image ${i + 1} to base64 (fallback)`);
                }
              } else {
                // No blob storage configured, use base64
                const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;
                imageUrls.push(base64Image);
                console.log(`✅ Converted image ${i + 1} to base64 (no blob storage)`);
              }
            } catch (downloadError) {
              console.error(`Failed to download image ${i + 1}:`, downloadError);
              imageUrls.push(tempUrl);
            }
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
  "funnyStory": "3-5 sentences about the property itself. Be funny and humorous! Describe quirky features, strange design choices, unusual conditions, or odd characteristics of the house. Drop subtle clues about problems without mentioning the foreclosure or auction. Focus on what makes THIS property unique or problematic in an entertaining way.",
  "photos": array of 4 photo descriptions (NOT emojis). Each should be a detailed description for AI image generation like "Front exterior showing the colonial-style home with overgrown landscaping", "Living room with worn carpet and dated wallpaper", "Kitchen showing original 1970s appliances", "Bathroom with cracked tile and outdated fixtures",
  "liens": array of 2-4 liens with structure:
    {
      "type": "First Mortgage, Second Mortgage, Tax Lien, HOA Lien, Judgment Lien, etc.",
      "holder": "name of institution or entity",
      "amount": dollar amount,
      "priority": 1, 2, 3, etc.,
      "notes": "optional notes about the lien (e.g., 'Will be wiped at foreclosure', 'Survives foreclosure!')"
    },
  "redFlags": array of 2-4 red flags with structure:
    {
      "type": "Title Issues, Foundation Problems, Environmental, Tax Liens, etc.",
      "description": "what the red flag reveals and its impact",
      "severity": "low", "medium", or "high",
      "impact": "financial impact explanation with dollar amounts"
    },
  "hiddenIssues": array of 1-3 strings describing non-obvious issues,
  "correctDecision": "BUY", "INVESTIGATE", or "WALK_AWAY",
  "explanation": "detailed explanation of why this is the correct decision with calculations"
}

Difficulty level: ${difficulty}
- Easy: Obvious good or bad deal with clear warning signs in the story
- Medium: Mixed signals, requires careful analysis
- Hard: Subtle issues hidden in seemingly good deals or hidden gems in rough situations

IMPORTANT:
1. Make the funnyStory genuinely entertaining with personality
2. Include realistic liens (tax liens survive foreclosure!)
3. Ensure math adds up: auctionPrice + estimatedRepairs + liens you inherit = total cost vs actualValue
4. Photo descriptions should be detailed and realistic for AI image generation, matching the property type, condition, and story
5. Drop clues in the story without giving away the answer
6. Use realistic numbers for 2025 market conditions`;
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
