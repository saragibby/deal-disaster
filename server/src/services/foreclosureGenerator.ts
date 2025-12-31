import OpenAI from 'openai';

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
    const propertyDesc = scenario.description || '';
    const funnyStory = scenario.funnyStory || '';
    const condition = scenario.estimatedRepairs > 50000 ? 'showing significant wear, dated features, and deferred maintenance' : 
                      scenario.estimatedRepairs > 30000 ? 'showing moderate wear and some dated features' : 
                      'in functional condition with minor cosmetic updates needed';
    
    // Occupancy-specific details for more realistic images
    const occupancyDetails = scenario.occupancyStatus === 'vacant' 
      ? 'Empty and unfurnished, showing clear signs of vacancy - no furniture, no personal items, no occupants. Windows may appear dark or have blinds closed.' 
      : scenario.occupancyStatus === 'occupied'
      ? 'Currently occupied with furniture and personal belongings visible'
      : 'Property condition unclear';

    const interiorOccupancy = scenario.occupancyStatus === 'vacant'
      ? 'Completely empty room with no furniture or belongings, bare walls, unfurnished'
      : 'Furnished room with typical residential furniture and decor';

    const imagePrompts = [
      `Realistic real estate photograph of the exterior of a ${scenario.propertyType.toLowerCase()} in ${location}. Built in ${scenario.yearBuilt}. ${occupancyDetails}. ${propertyDesc}. Natural daylight, street view perspective, professional real estate photography.`,
      
      `Interior photograph of the living room in a ${scenario.beds} bedroom, ${scenario.baths} bathroom ${scenario.propertyType.toLowerCase()}. ${interiorOccupancy}. ${condition}. ${funnyStory.includes('carpet') || funnyStory.includes('floor') ? 'Focus on flooring and overall room condition' : ''}. Realistic residential interior, real estate listing quality photo.`,
      
      `Interior photograph of the kitchen in a residential ${scenario.propertyType.toLowerCase()}. ${interiorOccupancy}. ${condition}. ${funnyStory.includes('kitchen') || funnyStory.includes('appliance') ? 'Show appliances and cabinetry condition clearly' : 'Standard kitchen layout with appliances visible'}. Natural lighting, real estate photography style.`,
      
      `Interior photograph of a bathroom in a ${scenario.yearBuilt} built home. ${interiorOccupancy}. ${condition}. ${funnyStory.includes('bathroom') || funnyStory.includes('plumb') || funnyStory.includes('fixture') ? 'Show fixtures and overall bathroom condition' : 'Standard bathroom fixtures'}. Real estate listing photograph.`
    ];

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
            imageUrls.push(imageResponse.data[0].url);
            console.log(`✅ Generated image ${i + 1}`);
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
  "photos": array of 4-6 emoji-based photo descriptions like "🏠 Front view", "🛁 Bathroom", "🍳 Kitchen",
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
4. Photos should be creative emoji descriptions
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
