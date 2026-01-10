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
  estimatedRepairsMin: number;
  estimatedRepairsMax: number;
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
    severity: 'red-herring' | 'low' | 'medium' | 'high' | 'severe';
    impact: string;
    question: string;
    choices: string[];
    correctChoice: number;
    answerExplanation: string;
  }>;
  hiddenIssues: string[];
  correctDecision: 'BUY' | 'INVESTIGATE' | 'WALK_AWAY';
  explanation: string;
}

export class ForeclosureScenarioGenerator {
  private client: OpenAI;
  private dalleClient: OpenAI | null = null;
  private recentLocations: Array<{ city: string; state: string }> = [];
  private readonly MAX_RECENT_LOCATIONS = 10;

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

  private addRecentLocation(city: string, state: string): void {
    this.recentLocations.push({ city, state });
    if (this.recentLocations.length > this.MAX_RECENT_LOCATIONS) {
      this.recentLocations.shift();
    }
  }

  private getExcludedLocationsText(): string {
    if (this.recentLocations.length === 0) {
      return '';
    }
    const excluded = this.recentLocations.map(loc => `${loc.city}, ${loc.state}`).join('; ');
    return `\n\nIMPORTANT: DO NOT use these recently used locations: ${excluded}. Choose a DIFFERENT city and state to ensure variety.`;
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
      
      // Track this location to avoid repetition
      this.addRecentLocation(validatedScenario.city, validatedScenario.state);
      
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
    const funnyStory = scenario.funnyStory || '';
    const occupancyStatus = scenario.occupancyStatus;
    
    // Extract key visual issues from red flags and hidden issues to make photos more accurate
    const visualIssues: string[] = [];
    scenario.redFlags?.forEach(flag => {
      const desc = flag.description.toLowerCase();
      if (desc.includes('crack') || desc.includes('foundation') || desc.includes('settling')) {
        visualIssues.push('visible cracks in walls or foundation');
      }
      if (desc.includes('water') || desc.includes('stain') || desc.includes('leak') || desc.includes('mold')) {
        visualIssues.push('water damage or staining visible');
      }
      if (desc.includes('roof')) {
        visualIssues.push('roof showing wear or damage');
      }
      if (desc.includes('electrical') || desc.includes('wiring')) {
        visualIssues.push('dated or problematic electrical');
      }
      if (desc.includes('overgrown') || desc.includes('landscaping') || desc.includes('neglect')) {
        visualIssues.push('overgrown or neglected landscaping');
      }
      if (desc.includes('paint') || desc.includes('cosmetic') || desc.includes('dated')) {
        visualIssues.push('dated finishes or peeling paint');
      }
    });

    scenario.hiddenIssues?.forEach(issue => {
      const desc = issue.toLowerCase();
      if (desc.includes('hoard') || desc.includes('clutter')) {
        visualIssues.push('cluttered or hoarding conditions');
      }
      if (desc.includes('damage') || desc.includes('vandal')) {
        visualIssues.push('visible property damage');
      }
    });

    const visualContext = visualIssues.length > 0 
      ? `Property shows signs of: ${visualIssues.slice(0, 3).join(', ')}. ` 
      : '';
    
    // Occupancy-specific details for more realistic images
    const occupancyDetails = occupancyStatus === 'vacant' 
      ? 'Property is vacant and unfurnished, showing signs of being unoccupied. ' 
      : occupancyStatus === 'occupied'
      ? 'Property is currently occupied with furniture and lived-in appearance. '
      : 'Property appearance uncertain. ';

    // Use the photo descriptions from the scenario and enhance them with property context
    const imagePrompts = scenario.photos.map((photoDesc, index) => {
      // Remove any emoji from the description if present
      const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      
      return `Ultra-realistic real estate photography: ${cleanDesc}. ${propertyType} in ${location}, built in ${scenario.yearBuilt}. ${occupancyDetails}${visualContext}${propertyDesc} ${funnyStory} Professional MLS listing photo showing actual property condition, natural daylight, high resolution DSLR camera, sharp focus, realistic textures and materials, photorealistic architectural photography, true-to-life colors and lighting, authentic property flaws visible. No text, no watermarks, no illustrations - photorealistic only.`;
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
    const lienGuidance = this.getLienGuidanceForDifficulty(difficulty);
    const excludedLocations = this.getExcludedLocationsText();
    const propertyCondition = this.getPropertyConditionGuidance();
    
    return `Generate a realistic and ENTERTAINING foreclosure auction scenario as a JSON object. Make the story funny and engaging while providing subtle clues about the deal quality.${excludedLocations}

PROPERTY CONDITION VARIETY: ${propertyCondition}

Required JSON structure:
{
  "address": "creative street address (can be humorous reference)",
  "city": "real US city name - MUST BE DIFFERENT from recently used locations",
  "state": "two-letter state code - MUST BE DIFFERENT from recently used locations",
  "zipCode": "5-digit zip code",
  "propertyType": "Single Family Home, Condo, Townhouse, or Multi-Family",
  "beds": number of bedrooms (1-5),
  "baths": number of bathrooms (1-4),
  "sqft": square footage (800-4000),
  "yearBuilt": year built (1950-2020),
  "auctionPrice": auction price in dollars,
  "estimatedValue": estimated market value in dollars,
  "estimatedRepairs": estimated repair costs in dollars (use the midpoint of the range),
  "estimatedRepairsMin": minimum repair cost estimate in dollars (realistic low-end estimate),
  "estimatedRepairsMax": maximum repair cost estimate in dollars (realistic high-end estimate with unforeseen issues),
  "monthlyRent": potential monthly rent in dollars,
  "actualValue": true value after all hidden costs/issues (can be lower than estimatedValue if bad deal),
  "isGoodDeal": boolean (true if profitable after ALL costs considered),
  "occupancyStatus": "vacant", "occupied", or "unknown",
  "hoaFees": optional monthly HOA fees (omit if not applicable),
  "description": "brief 1-2 sentence property description that reflects the ACTUAL condition",
  "funnyStory": "3-5 sentences about the property itself. Be funny and humorous! Describe quirky features, strange design choices, unusual conditions, or odd characteristics of the house. MATCH THE PROPERTY CONDITION - if it's well-maintained, describe neat quirks; if it's rundown, describe neglect. Drop subtle clues about problems without mentioning the foreclosure or auction. Focus on what makes THIS property unique or problematic in an entertaining way. Weave in hints about the specific issues this property has.",
  "photos": array of 4 photo descriptions (NOT emojis) that MATCH the property condition. Examples:
    - Well-maintained: "Front exterior showing immaculately maintained craftsman with fresh paint and professional landscaping", "Modern updated kitchen with granite counters and stainless appliances", "Spacious master bedroom with hardwood floors and crown molding", "Renovated bathroom with subway tile and modern fixtures"
    - Dated but decent: "Front exterior showing well-kept ranch with original 1980s siding", "Living room with clean but dated carpet and popcorn ceiling", "Functional kitchen with laminate counters and older appliances", "Bathroom with original tile in good condition"
    - Rundown: "Front exterior showing neglected property with peeling paint and overgrown yard", "Living room with stained carpet and water damage on walls", "Kitchen with broken cabinets and non-functional appliances", "Bathroom with cracked tile and outdated plumbing fixtures",
  "liens": ${lienGuidance},
  "redFlags": [
    COMPLETE EXAMPLE (follow this EXACT structure for EACH red flag):
    {
      "type": "Title",
      "description": "Unrecorded easement dispute with neighbor over shared driveway access that was never properly documented in county records.",
      "severity": "low",
      "impact": "$2,000-$4,000 for title attorney to draft and record easement agreement with neighbor signatures.",
      "question": "This unrecorded easement issue means...",
      "choices": [
        "Option A: You can ignore it and proceed to sale",
        "Option B: You must resolve it with attorney help costing $2,000-$4,000",
        "Option C: The title company will handle it for free",
        "Option D: It automatically resolves at foreclosure"
      ],
      "correctChoice": 1,
      "answerExplanation": "Unrecorded easements create title clouds that must be cleared before selling. A title attorney will need to draft proper documentation and get all parties to sign, typically costing $2K-$4K. This is a common oversight in older properties."
    },
    ... generate ${difficulty === 'hard' ? '3-4 diverse, interconnected issues + 1-2 red herrings' : difficulty === 'medium' ? '2-3 varied issues + 1 red herring' : '2 straightforward issues + 0-1 red herring'} with this SAME structure
  ],
  
  EACH RED FLAG MUST HAVE ALL THESE FIELDS:
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
        
        For ${difficulty} difficulty: 
        - Easy: 2 issues + 0-1 red herring
        - Medium: 2-3 issues + 1 red herring  
        - Hard: 3-4 issues + 1-2 red herrings",
      "description": "Tell a mini-story about this issue! Not just 'foundation problems' but 'Previous owner's DIY basement expansion undermined the foundation, causing a 3-inch crack from floor to ceiling that neighbors say has been growing for two years'",
      "severity": "MUST be exactly one of: 'red-herring', 'low', 'medium', 'high', or 'severe'. Choose based on cost and impact:
        
        - red-herring: $0-$500 cost, looks concerning but minimal/no real impact. Examples: 'Seller left furniture in garage', 'Previous owner painted bathroom bright orange', 'Missing doorknob in laundry room', 'Outdated light fixtures throughout', 'Overgrown landscaping needs trimming'. These should appear in beginner-friendly document types to teach pattern recognition.
        
        - low: $500-$5,000 (minor repairs, cosmetic issues, simple paperwork, small liens). Examples: Peeling paint, old carpet replacement, minor plumbing fixes, small unpaid bills.
        
        - medium: $5,000-$25,000 (structural repairs, permit issues, standard liens, code violations). Examples: Roof replacement, HVAC repair, unpermitted deck, mechanics lien.
        
        - high: $25,000-$75,000 (major issues requiring significant work). Examples: Foundation repair, major title clouds, asbestos remediation, large survivable liens.
        
        - severe: Over $75,000 or deal-breaking complexity (hazmat, condemned status, major structural failure, complex legal liability). Examples: Major foundation failure, former meth lab, building condemned, multiple cascading issues.
        
        CRITICAL: VARY severity levels! Example mix for 3 flags: 'red-herring, low, medium' OR 'low, medium, high' OR 'low, high, severe' - NOT all the same level!",
      "impact": "Be specific with dollar amounts that EXACTLY match the severity level AND story consequences:
        - Red-herring: '$0 impact' or '$200 for minor cosmetic fix' + note about why it seems worse than it is
        - Low: '$500-$5,000 for [specific repair]'
        - Medium: '$5,000-$25,000 for [specific work]' + timeline
        - High: '$25,000-$75,000 for [major remediation]' + delays/complications
        - Severe: '$75,000+ for [critical issue]' + potential deal-breaker consequences",
      "question": "Create a multiple choice question testing understanding of THIS specific issue. Examples:
        - For liens: 'This IRS tax lien will...' or 'The mechanics lien from ABC Roofing means...'
        - For structural: 'The foundation crack repair will likely cost...' or 'This structural issue affects the property value by...'
        - For legal: 'The unpermitted addition means you must...' or 'This zoning violation requires...'
        - For environmental: 'Asbestos remediation in this property will...' or 'The former meth lab designation means...'",
      "choices": ["Array of 3-4 answer options. Make them plausible but only ONE correct. Examples:",
        "Option A: Gets wiped out at foreclosure sale (no cost to you)",
        "Option B: Survives foreclosure - add $XX,XXX to your costs",
        "Option C: Can be negotiated down to 50% before closing",
        "Option D: Becomes the seller's responsibility after sale"],
      "correctChoice": 0-based index of the correct answer (0 for first choice, 1 for second, etc.),
      "answerExplanation": "1-2 sentence explanation of WHY the correct answer is right. Educate the user! Examples: 'IRS tax liens have super-priority status and survive foreclosure sales, meaning you inherit the full $60K debt regardless of purchase price. This is why reviewing title reports is critical.' OR 'Foundation cracks of this severity typically require underpinning and waterproofing, which costs $100-150 per linear foot. With a 40-foot crack, expect $4K-6K minimum for proper repair.'"
    },
  "hiddenIssues": array of 1-3 strings describing non-obvious issues with story details. Examples: "Neighbors report constant sewage backup - septic system likely failing", "City records show demolition order filed last year for unpermitted garage conversion", "Former owner was running an unlicensed daycare - potential liability issues",
  "correctDecision": "BUY", "INVESTIGATE", or "WALK_AWAY",
  "explanation": "detailed explanation of why this is the correct decision with calculations"
}

Difficulty level: ${difficulty}
- Easy: 1-2 obvious issues with clear warning signs in the story, simple lien structure
- Medium: 2-3 varied issues requiring careful analysis, mix of obvious and subtle clues, moderate lien complexity
- Hard: 3-4 diverse, interconnected issues that are subtly hinted at or create complex cascading problems, complex multi-lien situations

CRITICAL REQUIREMENTS:
1. LOCATION DIVERSITY IS MANDATORY! Use different cities and states to ensure variety across challenges
2. PROPERTY CONDITION VARIETY IS ESSENTIAL! Not all foreclosures are rundown - match the specified condition type
3. DIVERSIFY LIEN TYPES! Scale complexity with difficulty - harder levels need more diverse and complex liens
4. DIVERSIFY ISSUES! Don't repeat the same red flags (foundation, tax liens) every time
5. Make issues STORY-DRIVEN - each problem should have character and detail
6. Connect issues to the funnyStory - property history should hint at the problems
7. For well-maintained properties, issues should be HIDDEN (title problems, liens, zoning issues, not cosmetic damage)
8. For harder difficulties, make issues interact (e.g., water damage + mold + code violations)
9. Include realistic liens (tax liens, IRS liens, mechanics liens survive foreclosure!)
10. Ensure math adds up: auctionPrice + estimatedRepairs + surviving liens + red flag costs = total cost vs actualValue
11. Photo descriptions MUST match the property condition - pristine homes get pristine photos!
12. Drop clues in the story without giving away the answer
13. Use realistic numbers for 2025 market conditions
14. Make each property feel unique with its own character and problems
15. Remember: A well-maintained property can still be a terrible deal due to liens, title issues, or market factors!`;
  }

  private getPropertyConditionGuidance(): string {
    const conditions = [
      'Create a WELL-MAINTAINED, UPDATED property that looks great but has hidden issues (title problems, survivable liens, zoning violations, or legal issues). Keep cosmetic repairs minimal ($5-15K). The danger is NOT visible!',
      'Create a property in GOOD STRUCTURAL CONDITION but cosmetically dated (think 1980s-1990s time capsule). Needs $20-35K in cosmetic updates but no major repairs. Issues might be liens, title clouds, or tenant problems.',
      'Create a MOVE-IN READY property with recent updates that is actually overpriced at auction or has severe lien issues that make it unprofitable despite good condition. Repairs under $10K.',
      'Create a NEGLECTED but structurally sound property needing $30-50K in cosmetic work (paint, flooring, appliances, landscaping) but with good bones. Issues are visible and obvious.',
      'Create a property with DEFERRED MAINTENANCE showing $40-70K in needed repairs (roof, HVAC, kitchen/bath updates, exterior work). Problems are evident to trained eyes.',
      'Create a DISTRESSED property with major issues (foundation, water damage, systems failures) needing $60K+ in repairs. This is the classic "disaster" foreclosure.'
    ];
    
    const randomIndex = Math.floor(Math.random() * conditions.length);
    return conditions[randomIndex];
  }

  private getLienGuidanceForDifficulty(difficulty: string): string {
    switch (difficulty) {
      case 'easy':
        return `array of 2-3 liens with simple structure. Include basic liens like:
    {
      "type": "Choose from: First Mortgage, Property Tax Lien, HOA Lien, Utility Lien",
      "holder": "name of institution or entity (make it specific)",
      "amount": dollar amount (keep moderate),
      "priority": 1, 2, 3, etc.,
      "notes": "Add story details! e.g., 'Will be wiped at foreclosure', 'Survives foreclosure - you inherit this!'"
    }`;
      
      case 'medium':
        return `array of 3-4 liens with moderate complexity. Mix different types:
    {
      "type": "VARY THESE! Choose from: First Mortgage, Second Mortgage, Property Tax Lien, State Tax Lien, Federal Tax Lien, HOA Lien, Mechanics Lien (unpaid contractors), Water/Sewer Lien, Code Enforcement Lien, Judgment Lien (from lawsuit), Special Assessment Lien",
      "holder": "name of institution or entity (make it specific and story-relevant). For Mechanics Liens use contractor names like 'ABC Roofing', 'Joe's Plumbing', etc.",
      "amount": dollar amount (vary significantly - some small, some large),
      "priority": 1, 2, 3, etc.,
      "notes": "Add story details! e.g., 'From contractor who walked off job after dispute', 'Unpaid since previous owner's divorce', 'Will be wiped at foreclosure', 'Survives foreclosure - you inherit this!', 'Has been in collections for 3 years'"
    }`;
      
      case 'hard':
        return `array of 4-6 liens with COMPLEX and DIVERSE structure. Create a challenging lien scenario:
    {
      "type": "MAXIMUM VARIETY REQUIRED! Mix multiple types: First Mortgage, Second Mortgage, HELOC, IRS Tax Lien, State Tax Lien, Local Property Tax Lien, HOA Lien with super-priority status, Mechanics Lien (multiple contractors), Child Support Lien (can use multiple for comedy: 'Baby Mama #1', 'Baby Mama #2', 'Baby Mama from Vegas'), Judgment Lien (multiple lawsuits), Code Enforcement Lien, Environmental Lien, Water/Sewer Lien, Special Assessment Lien, Lis Pendens (pending litigation). Include at LEAST 4 different lien categories!",
      "holder": "SPECIFIC names that tell a story: 'IRS - Western Region Collections', 'Baby Mama #2 - the one with twins', 'Defunct contractor - Good Times Remodeling LLC', 'City of [City] - Code Enforcement Division', 'County Water Authority', '[State] Dept of Revenue', etc.",
      "amount": dollar amount (create dramatic variety - mix $500 utility liens with $85,000 IRS liens),
      "priority": 1, 2, 3, etc. (be strategic - some liens survive foreclosure regardless of priority!),
      "notes": "DETAILED story context! Examples: 'IRS lien for $85K from 2019-2021 unreported rental income - SURVIVES FORECLOSURE!', 'Super-priority HOA lien for last 6 months dues - takes precedence over first mortgage!', 'Mechanics lien from contractor who installed faulty foundation repair - still in litigation', 'Baby Mama #3 - filed child support lien last month, will pursue regardless of sale', 'Code enforcement lien for $15K in unpaid fines - property was illegal Airbnb', 'Second mortgage was cross-collateralized with another property owner still owns'"
    }. For hard difficulty, include at least 2-3 liens that SURVIVE foreclosure to create real complexity!`;
      
      default:
        return this.getLienGuidanceForDifficulty('medium');
    }
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
