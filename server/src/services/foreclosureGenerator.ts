import OpenAI from 'openai';
import { blobStorage } from './blobStorage.js';
import { ImageProviderFactory } from './imageProviders/ImageProviderFactory.js';
import { IImageProvider } from './imageProviders/IImageProvider.js';
import { findLienArchetype, formatLienCatalogForPrompt, formatIssueCatalogForPrompt } from '@deal-platform/shared-types';

interface ForeclosureScenario {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: string;
  auctionType: string;
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
  occupant?: 'vacant' | 'owner' | 'tenant' | 'squatter';
  occupancyCost?: number;
  redemptionPeriodDays?: number;
  redemptionCost?: number;
  hoaFees?: number;
  description: string;
  funnyStory: string;
  photos: string[];
  liens: Array<{
    type: string;
    holder: string;
    amount: number;
    priority: number;
    survivesForeclosure?: boolean;
    category?: string;
    educationalNote?: string;
    notes?: string;
  }>;
  redFlags: Array<{
    type: string;
    description: string;
    severity: 'red-herring' | 'low' | 'medium' | 'high' | 'severe';
    impact: string;
    costLow?: number;
    costHigh?: number;
    question: string;
    choices: string[];
    correctChoice: number;
    answerExplanation: string;
  }>;
  hiddenIssues: string[];
  correctDecision: 'BUY' | 'WALK_AWAY';
  explanation: string;
  // Deliberate case shape, derived from the final economics in the validation
  // gate so it always reflects the real numbers (see deriveArchetype below).
  archetype?: CaseArchetype;
}

/** The three deliberate case shapes the generator can target. */
type CaseArchetype = 'clear-buy' | 'clear-trap' | 'misdirection';

export class ForeclosureScenarioGenerator {
  private client: OpenAI;
  private imageProvider: IImageProvider | null = null;
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

    // Initialize image provider (DALL-E or Gemini based on IMAGE_PROVIDER env var)
    try {
      this.imageProvider = ImageProviderFactory.createProvider();
      if (this.imageProvider.isConfigured()) {
        console.log(`✅ Image generation enabled using ${this.imageProvider.getProviderName()}`);
      } else {
        console.log(`ℹ️  Image generation disabled (${this.imageProvider.getProviderName()} not configured)`);
        this.imageProvider = null;
      }
    } catch (error) {
      console.log('ℹ️  Image generation disabled (provider initialization failed)');
      this.imageProvider = null;
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

  async generateScenario(
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    archetype?: CaseArchetype,
    challengeDate?: string
  ): Promise<ForeclosureScenario> {
    const prompt = this.buildPrompt(difficulty, archetype);
    const MAX_ATTEMPTS = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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

        const content = response.choices[0]?.message?.content;
        if (!content) {
          console.error('No content in response. Full response:', response);
          throw new Error('No response from OpenAI');
        }

        const scenario = JSON.parse(content) as ForeclosureScenario;
        // Throws (and triggers a regeneration attempt) if the scenario's numbers
        // or declared deal quality are inconsistent.
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
        lastError = error;
        console.error(`Error generating foreclosure scenario (attempt ${attempt}/${MAX_ATTEMPTS}):`, error);
      }
    }

    console.error('Failed to generate a valid foreclosure scenario after retries:', lastError);
    throw new Error('Failed to generate foreclosure scenario');
  }

  private async generatePropertyImages(scenario: ForeclosureScenario, challengeDate?: string): Promise<string[]> {
    // If no image provider configured, return emoji placeholders
    if (!this.imageProvider) {
      console.log('Skipping image generation - no image provider configured');
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

    // Determine overall property condition based on issues found
    let conditionContext = '';
    if (visualIssues.length === 0) {
      conditionContext = 'Property appears well-maintained and in good condition. ';
    } else if (visualIssues.length <= 2) {
      conditionContext = `Property shows minor signs of: ${visualIssues.join(', ')}. `;
    } else {
      conditionContext = `Property shows signs of: ${visualIssues.slice(0, 3).join(', ')}. `;
    }
    
    // Detect if property has multiple levels based on description
    const descLower = (propertyDesc + ' ' + funnyStory).toLowerCase();
    const hasMultipleLevels = descLower.includes('stair') || descLower.includes('upstairs') || 
                              descLower.includes('two-story') || descLower.includes('two story') ||
                              descLower.includes('second floor') || descLower.includes('multi-level');
    const levelContext = hasMultipleLevels ? 'Two-story property with multiple levels. ' : '';
    
    // Occupancy-specific details for more realistic images
    const occupancyDetails = occupancyStatus === 'vacant' 
      ? 'Property is vacant and unfurnished. ' 
      : occupancyStatus === 'occupied'
      ? 'Property is currently occupied with furniture and lived-in appearance. '
      : '';

    // Use the photo descriptions from the scenario and enhance them with property context
    const imagePrompts = scenario.photos.map((photoDesc, index) => {
      // Remove any emoji from the description if present
      const cleanDesc = photoDesc.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      
      return `Photorealistic real estate photograph, no people, no humans: ${cleanDesc}. ${scenario.beds}-bedroom, ${scenario.baths}-bathroom ${propertyType} of about ${scenario.sqft.toLocaleString()} square feet in ${location}, built in ${scenario.yearBuilt}. ${levelContext}${occupancyDetails}${conditionContext}Professional MLS listing photo, natural daylight, high-resolution camera. The home's size, room proportions and architectural style should match a ${scenario.sqft.toLocaleString()} sq ft ${propertyType}. IMPORTANT: Show only the empty property - absolutely no people, no humans, no figures visible anywhere in the image.`;
    });

    const imageUrls: string[] = [];

    console.log(`Generating ${imagePrompts.length} property images for ${location}...`);

    try {
      for (let i = 0; i < imagePrompts.length; i++) {
        try {
          console.log(`Generating image ${i + 1}/${imagePrompts.length}...`);
          
          // Use the image provider to generate the image
          const imageBuffer = await this.imageProvider.generateImage(imagePrompts[i]);
          console.log(`Generated image ${i + 1} using ${this.imageProvider.getProviderName()}`);
          
          // Azure Blob Storage is required - no fallback to base64
          if (!blobStorage.isConfigured()) {
            throw new Error('Azure Blob Storage not configured. Cannot save images.');
          }
          
          const dateFolder = challengeDate || new Date().toISOString().split('T')[0];
          const blobUrl = await blobStorage.uploadImage(imageBuffer, dateFolder, 'image/png');
          imageUrls.push(blobUrl);
          console.log(`✅ Uploaded image ${i + 1} to Azure Blob Storage`);
        } catch (error) {
          console.error(`Failed to generate image ${i + 1}:`, error);
          
          // Try fallback to DALL-E if Gemini fails
          if (this.imageProvider.getProviderName().includes('Imagen')) {
            console.log(`🔄 Attempting fallback to DALL-E for image ${i + 1}...`);
            try {
              const dalleProvider = ImageProviderFactory.createProvider('dalle');
              if (dalleProvider.isConfigured()) {
                const imageBuffer = await dalleProvider.generateImage(imagePrompts[i]);
                console.log(`Generated image ${i + 1} using ${dalleProvider.getProviderName()} (fallback)`);
                
                if (!blobStorage.isConfigured()) {
                  throw new Error('Azure Blob Storage not configured. Cannot save images.');
                }
                
                const dateFolder = challengeDate || new Date().toISOString().split('T')[0];
                const blobUrl = await blobStorage.uploadImage(imageBuffer, dateFolder, 'image/png');
                imageUrls.push(blobUrl);
                console.log(`✅ Uploaded image ${i + 1} to Azure Blob Storage (via DALL-E fallback)`);
              } else {
                console.log(`⚠️  DALL-E fallback not configured, skipping image ${i + 1}`);
              }
            } catch (fallbackError) {
              console.error(`DALL-E fallback also failed for image ${i + 1}:`, fallbackError);
            }
          }
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

  private buildPrompt(difficulty: string, archetype?: CaseArchetype): string {
    const lienGuidance = this.getLienGuidanceForDifficulty(difficulty);
    const excludedLocations = this.getExcludedLocationsText();
    const propertyCondition = this.getPropertyConditionGuidance();
    const issueCatalog = formatIssueCatalogForPrompt();
    const archetypeGuidance = this.getArchetypeGuidance(archetype);

    return `Generate a realistic and ENTERTAINING foreclosure auction scenario as a JSON object. Make the story funny and engaging while providing subtle clues about the deal quality.${excludedLocations}

CASE SHAPE (this is the most important constraint — the whole scenario must serve it): ${archetypeGuidance}

PROPERTY CONDITION VARIETY: ${propertyCondition}

ISSUE LIBRARY (draw from this catalog for variety; use realistic costs and the matching source document for each issue's question/discovery):
${issueCatalog}

Required JSON structure:
{
  "address": "creative street address (can be humorous reference)",
  "city": "real US city name - MUST BE DIFFERENT from recently used locations",
  "state": "two-letter state code - MUST BE DIFFERENT from recently used locations",
  "zipCode": "5-digit zip code",
  "propertyType": "VARY THIS across scenarios. Choose ONE that fits the story from: Single Family Home, Condo, Townhouse, Multi-Family, Duplex, Manufactured/Mobile Home, Bungalow, Ranch, Cottage, Cabin, or Loft",
  "auctionType": "the listing category for this property - VARY THIS across scenarios for realism. Choose ONE that best fits the situation from EXACTLY these values: 'Bank Owned', '2nd Chance Foreclosure', 'Short Sale', 'Foreclosure Homes', 'Non-Bank Owned'. Do not always pick the same one.",
  "beds": number of bedrooms — realistic for the propertyType and value. Condo / Loft / Cottage / Cabin / Bungalow: 1-3; Townhouse / Duplex / Ranch: 2-4; Single Family Home: 3-5; Multi-Family: 4-8 total. Higher-value homes in the same area generally have more beds.,
  "baths": number of bathrooms in 0.5 steps — typically between beds-1 and beds+0.5 (never more than beds+1). A 3-bed home is usually 1.5-3 baths.,
  "sqft": square footage — MUST be consistent with beds, propertyType and value: roughly 350-700 sqft per bedroom. Condos, Cabins, Cottages and Manufactured/Mobile homes stay compact (rarely above ~1,800-2,000 sqft); Single-Family and Multi-Family run larger. Keep price-per-sqft believable for the city/state market (estimatedValue ÷ sqft should land roughly $120-$600 per sqft depending on the metro).,
  "yearBuilt": year built (1900-2024) — plausible for the propertyType and story. Lofts are often converted older buildings (1900-1960); new subdivisions are 2000+. If red flags mention asbestos, lead paint, knob-and-tube wiring or dated systems, lean older.,
  "auctionPrice": auction price in dollars,
  "estimatedValue": estimated market value in dollars,
  "estimatedRepairs": estimated repair costs in dollars (use the midpoint of the range),
  "estimatedRepairsMin": minimum repair cost estimate in dollars (realistic low-end estimate),
  "estimatedRepairsMax": maximum repair cost estimate in dollars (realistic high-end estimate with unforeseen issues),
  "monthlyRent": potential monthly rent in dollars,
  "actualValue": MUST equal estimatedValue. The market value is the single resale anchor; do NOT lower it for a bad deal. A bad deal must lose money through explicit, inspectable costs (surviving liens, repairs, red-flag issue costs, occupancyCost, redemptionCost) — never through a secret lower resale value.,
  "isGoodDeal": boolean (true if profitable after ALL costs considered),
  "occupancyStatus": "vacant", "occupied", or "unknown",
  "occupant": "who is in the property: 'vacant', 'owner' (former owner still living there), 'tenant' (has a lease), or 'squatter'. Pick a NON-vacant occupant for some cases so eviction risk is in play.",
  "occupancyCost": "if NOT vacant, the realistic eviction / cash-for-keys / holding cost in dollars (owner-occupant ~$8-15K and hardest to remove, tenant ~$3-12K, squatter ~$6-20K). Use 0 for vacant. This is added to total costs.",
  "redemptionPeriodDays": "statutory redemption window in days if this state/sale grants the former owner a right to reclaim (e.g. 180, 365); use 0 when there is no redemption right. Use this sparingly for medium/hard cases.",
  "redemptionCost": "if redemptionPeriodDays > 0, the carrying cost in dollars (taxes + insurance + interest) of holding the property until the window closes since you cannot resell yet (~$4-18K). Use 0 when there is no redemption right.",
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
      "costLow": 2000,
      "costHigh": 4000,
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
    ... generate ${difficulty === 'hard' ? '3-4 diverse, interconnected issues + 1-2 red herrings' : difficulty === 'medium' ? '2-3 varied issues + 1 red herring' : '2 straightforward issues + 0-1 red herring'} with this SAME structure.
    ALSO: every scenario MUST include at least ONE no-impact red-herring (severity 'red-herring', costLow/costHigh 0), and for roughly HALF of scenarios include exactly ONE "money-saver" item — a transferable home warranty, an assumable seller credit, a paid-off / forgiven balance, or a tax abatement — modeled as a NEGATIVE cost (e.g. costLow:-3500, costHigh:-2500) so it LOWERS the buyer's total investment. A money-saver uses a normal severity ('low' or 'medium'), NEVER 'red-herring', and its impact text should describe the savings (e.g. 'Transferable 2-year warranty saves ~$2,500-$3,500 in near-term repairs').
  ],
  
  EACH RED FLAG MUST HAVE ALL THESE FIELDS:
    {
      "type": "One of these categories (choose diverse options across flags): 
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
        - Easy: 2 issues + 1 red herring (+ optionally 1 money-saver)
        - Medium: 2-3 issues + 1 red herring (+ sometimes 1 money-saver)
        - Hard: 3-4 issues + 1-2 red herrings (+ sometimes 1 money-saver)
        
        OUTPUT FORMAT: Just the category name (e.g., 'Structural', 'Environmental', 'Title')",
      "description": "Tell a mini-story about this issue! Not just 'foundation problems' but 'Previous owner's DIY basement expansion undermined the foundation, causing a 3-inch crack from floor to ceiling that neighbors say has been growing for two years'",
      "severity": "MUST be exactly one of: 'red-herring', 'low', 'medium', 'high', or 'severe'. Choose based on cost and impact:
        
        - red-herring: $0-$500 cost, looks concerning but minimal/no real impact. Examples: 'Seller left furniture in garage', 'Previous owner painted bathroom bright orange', 'Missing doorknob in laundry room', 'Outdated light fixtures throughout', 'Overgrown landscaping needs trimming'. These should appear in beginner-friendly document types to teach pattern recognition.
        
        - low: $500-$5,000 (minor repairs, cosmetic issues, simple paperwork, small liens). Examples: Peeling paint, old carpet replacement, minor plumbing fixes, small unpaid bills.
        
        - medium: $5,000-$25,000 (structural repairs, permit issues, standard liens, code violations). Examples: Roof replacement, HVAC repair, unpermitted deck, mechanics lien.
        
        - high: $25,000-$75,000 (major issues requiring significant work). Examples: Foundation repair, major title clouds, asbestos remediation, large survivable liens.
        
        - severe: Over $75,000 or deal-breaking complexity (hazmat, condemned status, major structural failure, complex legal liability). Examples: Major foundation failure, former meth lab, building condemned, multiple cascading issues.
        
        CRITICAL: VARY severity levels! Example mix for 3 flags: 'red-herring, low, medium' OR 'low, medium, high' OR 'low, high, severe' - NOT all the same level!",
      "impact": "EXACT dollar amount with repair details (no prefixes, no labels - just the information):
        - Red-herring: '$0 impact' or '$200 for minor cosmetic fix' + note about why it seems worse than it is
        - Low: '$500-$5,000 for [specific repair]'
        - Medium: '$5,000-$25,000 for [specific work]' + timeline
        - High: '$25,000-$75,000 for [major remediation]' + delays/complications
        - Severe: '$75,000+ for [critical issue]' + potential deal-breaker consequences
        
        EXAMPLE OUTPUTS (copy this format exactly):
        - '$2,000-$4,000 for title attorney to draft and record easement agreement'
        - '$15,000-$25,000 for asbestos abatement including testing and professional removal'
        - '$0-$500 impact - cosmetic issue that looks worse than it is'
        
        CRITICAL: Use DIFFERENT dollar ranges than what appears in your answer choices below! If choice B says '$12k-$20k', the impact should say something like '$10,000-$25,000' or '$8,000-$15,000' to avoid giving away the answer.
        
        DO NOT include words like 'Hint', 'Impact', 'Estimated', etc. - just the dollar amount and explanation.",
      "costLow": REQUIRED numeric low-end remediation cost in dollars matching the impact range (e.g. 2000). Use 0 for a red-herring. Use a NEGATIVE number for a money-saver credit/warranty/abatement (e.g. -3500). DO NOT count costs that are already represented as a survivable lien below (set 0 to avoid double-counting).,
      "costHigh": REQUIRED numeric high-end remediation cost in dollars matching the impact range (e.g. 4000). Use 0 for a red-herring. Use a NEGATIVE number for a money-saver (e.g. -2500, where costHigh is the smaller saving).,
      "question": "Create a multiple choice question testing understanding of THIS specific issue. Examples:
        - For liens: 'This IRS tax lien will...' or 'The mechanics lien from ABC Roofing means...'
        - For structural: 'The foundation crack repair will likely cost...' or 'This structural issue affects the property value by...'
        - For legal: 'The unpermitted addition means you must...' or 'This zoning violation requires...'
        - For environmental: 'Asbestos remediation in this property will...' or 'The former meth lab designation means...'",
      "choices": ["Array of 3-4 answer options with SPECIFIC dollar amounts. Make them plausible but only ONE correct. Examples:",
        "Option A: Gets wiped out at foreclosure sale (no cost to you)",
        "Option B: Survives foreclosure - add $XX,XXX to your costs",
        "Option C: Can be negotiated down to 50% before closing",
        "Option D: Becomes the seller's responsibility after sale"],
      "correctChoice": 0-based index of the correct answer (0 for first choice, 1 for second, etc.),
      "answerExplanation": "1-2 sentence explanation of WHY the correct answer is right. Educate the user! Examples: 'IRS tax liens have super-priority status and survive foreclosure sales, meaning you inherit the full $60K debt regardless of purchase price. This is why reviewing title reports is critical.' OR 'Foundation cracks of this severity typically require underpinning and waterproofing, which costs $100-150 per linear foot. With a 40-foot crack, expect $4K-6K minimum for proper repair.'"
    },
  "hiddenIssues": array of 1-3 strings describing non-obvious issues with story details. Examples: "Neighbors report constant sewage backup - septic system likely failing", "City records show demolition order filed last year for unpermitted garage conversion", "Former owner was running an unlicensed daycare - potential liability issues",
  "correctDecision": "BUY" or "WALK_AWAY",
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
10. Ensure math adds up: auctionPrice + estimatedRepairs + surviving liens + red flag costs + occupancyCost + redemptionCost + closing = total cost, compared against estimatedValue (the resale anchor). A bad deal is one whose total cost exceeds estimatedValue.
11. Photo descriptions MUST match the property condition - pristine homes get pristine photos!
12. Drop clues in the story without giving away the answer
13. Use realistic numbers for 2025 market conditions
14. Make each property feel unique with its own character and problems
15. Remember: A well-maintained property can still be a terrible deal due to liens, title issues, or market factors!
16. SENIOR vs JUNIOR: junior liens (2nd mortgage, HELOC, most judgments) are WIPED at sale, while super-priority liens (property/IRS tax, HOA super-lien, mechanics, code enforcement, environmental, child support) SURVIVE and the buyer inherits them. Set survivesForeclosure accordingly and teach this nuance in at least one quiz.
17. OCCUPANCY & REDEMPTION are real costs: if the property is occupied include a believable occupancyCost; if a redemption right applies include redemptionPeriodDays and redemptionCost. Both must be reflected in isGoodDeal.
18. REALISTIC DIMENSIONS: beds, baths, sqft and yearBuilt must be internally consistent and believable for the propertyType, the city/state market, and the estimatedValue (see the field notes above). No 5-bedroom condos, no 4,000 sqft cabins, no 600 sqft homes worth $600k — sanity-check beds ↔ baths ↔ sqft ↔ value before returning.`;
  }

  /**
   * Bias the generator toward one of the three deliberate case shapes. The
   * final stored archetype is re-derived from the economics in the validation
   * gate, so this only steers generation — it can never mislabel a case.
   */
  private getArchetypeGuidance(archetype?: CaseArchetype): string {
    switch (archetype) {
      case 'clear-buy':
        return 'CLEAR BUY — a genuinely profitable deal that is clean and obvious. After ALL costs (auction + repairs + surviving liens + occupancy + redemption + closing) the market value still clears a healthy profit. Keep the picture low-noise: no red herrings, few or no surviving (super-priority) liens, no scary-but-cheap distractions, ideally vacant. isGoodDeal=true, correctDecision="BUY". The lesson is rewarding confident action on a sound deal.';
      case 'clear-trap':
        return 'CLEAR TRAP — the listing spread (estimatedValue − auctionPrice − repairs) looks attractive, but surviving liens and/or severe hidden issues push total cost ABOVE the market value, so it LOSES money. isGoodDeal=false, correctDecision="WALK_AWAY". The danger must be real (super-priority liens that survive, a severe structural/environmental issue, a long redemption window), not cosmetic. The lesson is that a pretty spread can be a trap.';
      case 'misdirection':
        return 'MISDIRECTION — a genuinely PROFITABLE deal (isGoodDeal=true, correctDecision="BUY") that is buried under alarming-but-survivable noise so it LOOKS like a trap. Include at least 1-2 red herrings, junior liens that get WIPED at the sale (survivesForeclosure=false), and/or a non-vacant occupant, while keeping the surviving (super-priority) liens and real remediation costs modest so the deal still clears a clear profit. The lesson is: do not pattern-match scary documents — do the math.';
      default:
        return 'Pick whichever of the three shapes best fits an entertaining story: a CLEAR BUY (clean, profitable, obvious), a CLEAR TRAP (attractive spread but surviving liens / severe issues make it a loss), or a MISDIRECTION (truly profitable but smothered in scary-but-survivable noise). Make the economics internally consistent.';
    }
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
    // Lien type lists are derived from the shared catalog so adding an
    // archetype there automatically enriches generation. Each line states the
    // survival rule, realistic range, and an example holder.
    const easyCats: import('@deal-platform/shared-types').LienCategory[] = [
      'mortgage', 'property-tax', 'hoa', 'municipal-utility',
    ];
    const mediumCats: import('@deal-platform/shared-types').LienCategory[] = [
      'mortgage', 'junior-mortgage', 'property-tax', 'state-tax', 'federal-tax',
      'hoa', 'mechanics', 'judgment', 'code-enforcement', 'special-assessment',
    ];
    const hardCats: import('@deal-platform/shared-types').LienCategory[] = [
      'mortgage', 'junior-mortgage', 'property-tax', 'federal-tax', 'state-tax',
      'hoa', 'hoa-super-priority', 'mechanics', 'judgment', 'child-support',
      'code-enforcement', 'municipal-utility', 'special-assessment',
      'environmental', 'lis-pendens',
    ];

    const lienObjectShape = `Each lien object MUST have: "type" (catalog label), "category" (catalog category key), "holder" (specific, story-relevant name), "amount" (dollars), "priority" (1 = most senior), "survivesForeclosure" (REQUIRED boolean matching the catalog rule), and "notes" (story context). DO NOT double-count a surviving lien's dollars as a red-flag cost.`;

    switch (difficulty) {
      case 'easy':
        return `array of 2-3 liens with a simple structure. Choose types from this catalog:\n${formatLienCatalogForPrompt(easyCats)}\n${lienObjectShape}`;

      case 'hard':
        return `array of 4-6 liens with COMPLEX, DIVERSE structure. Use MAXIMUM variety from this catalog and include at LEAST 4 different categories, with 2-3 liens that SURVIVE foreclosure. Where it fits the story, use an HOA super-priority lien that leaps ahead of a first mortgage:\n${formatLienCatalogForPrompt(hardCats)}\n${lienObjectShape}`;

      case 'medium':
      default:
        return `array of 3-4 liens with moderate complexity. Mix surviving and wiped liens from this catalog:\n${formatLienCatalogForPrompt(mediumCats)}\n${lienObjectShape}`;
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
    // Single resale anchor: the market value. We deliberately force actualValue
    // to equal estimatedValue so a bad deal can only lose money through explicit
    // costs (liens/repairs/issues/occupancy/redemption), never a hidden lower
    // resale value. The `actualValue` field is retained only for back-compat.
    scenario.actualValue = scenario.estimatedValue;
    if (scenario.hoaFees) {
      scenario.hoaFees = Math.round(scenario.hoaFees);
    }

    // Repairs on a foreclosure can only be guessed from the outside, so we
    // present a range. Normalize the AI's min/max to clean $500 increments and
    // guarantee they bracket the point estimate (min <= estimate <= max). If
    // the model omitted or gave a degenerate range, derive an asymmetric band
    // around the estimate (surprises skew higher).
    const roundTo500 = (n: number) => Math.round(n / 500) * 500;
    let repairsMin = scenario.estimatedRepairsMin;
    let repairsMax = scenario.estimatedRepairsMax;
    const validBand =
      typeof repairsMin === 'number' && Number.isFinite(repairsMin) && repairsMin > 0 &&
      typeof repairsMax === 'number' && Number.isFinite(repairsMax) && repairsMax > repairsMin;
    if (!validBand) {
      repairsMin = scenario.estimatedRepairs * 0.85;
      repairsMax = scenario.estimatedRepairs * 1.3;
    }
    repairsMin = Math.min(roundTo500(repairsMin), scenario.estimatedRepairs);
    repairsMax = Math.max(roundTo500(repairsMax), scenario.estimatedRepairs);
    scenario.estimatedRepairsMin = repairsMin;
    scenario.estimatedRepairsMax = repairsMax;

    // Validate property facts are real, in-range integers (prevents the
    // "0 beds / 0 sqft / year 0" cards that slipped through before).
    const intInRange = (value: unknown, min: number, max: number): boolean =>
      typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

    if (!intInRange(scenario.beds, 1, 10)) {
      throw new Error(`Invalid scenario: beds must be an integer 1-10 (got ${scenario.beds})`);
    }
    // Baths may be in half steps (e.g. 2.5) like real listings.
    const halfStepInRange = (value: unknown, min: number, max: number): boolean =>
      typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && Number.isInteger(value * 2);
    if (!halfStepInRange(scenario.baths, 1, 10)) {
      throw new Error(`Invalid scenario: baths must be in 0.5 steps 1-10 (got ${scenario.baths})`);
    }
    if (!intInRange(scenario.sqft, 300, 20000)) {
      throw new Error(`Invalid scenario: sqft must be an integer 300-20000 (got ${scenario.sqft})`);
    }
    const currentYear = new Date().getFullYear();
    if (!intInRange(scenario.yearBuilt, 1800, currentYear + 1)) {
      throw new Error(`Invalid scenario: yearBuilt must be an integer 1800-${currentYear + 1} (got ${scenario.yearBuilt})`);
    }

    // Coherence safety net: the prompt is the primary driver of realistic
    // dimensions, but nudge any off-model values back into a believable shape so
    // a "5-bed / 2,650 sqft condo" can never slip through. We clamp rather than
    // reject to avoid wasting a generation.
    const typeKey = (scenario.propertyType || '').toLowerCase();
    const isCompactType =
      typeKey === 'condo' || typeKey === 'loft' || typeKey === 'cabin' ||
      typeKey === 'cottage' || typeKey.includes('mobile') || typeKey.includes('manufactured');
    // Compact property types rarely have 4+ bedrooms.
    if (isCompactType && scenario.beds > 3) {
      scenario.beds = 3;
    }
    // Baths rarely exceed beds + 1 in real listings.
    if (scenario.baths > scenario.beds + 1) {
      scenario.baths = scenario.beds + 1;
    }
    // Square footage should track bedroom count (~350-750 sqft per bed), with a
    // tighter ceiling for compact property types.
    const minSqft = scenario.beds * 350;
    const maxSqft = Math.min(scenario.beds * 750, isCompactType ? 2000 : Number.POSITIVE_INFINITY);
    scenario.sqft = Math.round(Math.min(Math.max(scenario.sqft, minSqft), maxSqft) / 10) * 10;

    // Core financials must be positive, finite numbers.
    const positiveNumber = (value: unknown): boolean =>
      typeof value === 'number' && Number.isFinite(value) && value > 0;
    for (const field of ['auctionPrice', 'estimatedValue', 'estimatedRepairs', 'actualValue'] as const) {
      if (!positiveNumber(scenario[field])) {
        throw new Error(`Invalid scenario: ${field} must be a positive number (got ${scenario[field]})`);
      }
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

    // Validate/normalize each lien: amount must be numeric, and enrich from the
    // shared lien catalog (category, educational note, default survival rule).
    for (const lien of scenario.liens) {
      if (typeof lien.amount !== 'number' || !Number.isFinite(lien.amount) || lien.amount < 0) {
        throw new Error(`Invalid scenario: lien "${lien.type}" has a non-numeric amount (${lien.amount})`);
      }
      lien.amount = Math.round(lien.amount);
      const archetype = findLienArchetype(lien.category ?? lien.type);
      if (archetype) {
        if (!lien.category) lien.category = archetype.category;
        if (!lien.educationalNote) lien.educationalNote = archetype.educationalNote;
        if (typeof lien.survivesForeclosure !== 'boolean') {
          lien.survivesForeclosure = archetype.survivesForeclosure;
        }
      }
      if (typeof lien.survivesForeclosure !== 'boolean') {
        lien.survivesForeclosure = this.lienSurvives(lien.type, lien.notes);
      }
    }

    // Validate/normalize each red flag's remediation cost. Costs are normally
    // positive (money you spend), but a money-saver (transferable warranty,
    // assumable credit, paid-off balance, tax abatement) is modeled as a
    // NEGATIVE cost that lowers total investment, so negatives are allowed
    // within a sane floor.
    const MAX_SAVING = 200000; // largest credit we'll accept, in dollars
    for (const flag of scenario.redFlags) {
      if (
        flag.costLow !== undefined &&
        (typeof flag.costLow !== 'number' || !Number.isFinite(flag.costLow) || flag.costLow < -MAX_SAVING)
      ) {
        throw new Error(`Invalid scenario: red flag "${flag.type}" has an invalid costLow (${flag.costLow})`);
      }
      if (
        flag.costHigh !== undefined &&
        (typeof flag.costHigh !== 'number' || !Number.isFinite(flag.costHigh) || flag.costHigh < -MAX_SAVING)
      ) {
        throw new Error(`Invalid scenario: red flag "${flag.type}" has an invalid costHigh (${flag.costHigh})`);
      }
      // A red-herring is purely no-impact; it must never carry a money-saver
      // value (that would be silently dropped by the red-herring cost filter).
      if (flag.severity === 'red-herring' && ((flag.costLow ?? 0) < 0 || (flag.costHigh ?? 0) < 0)) {
        throw new Error(`Invalid scenario: red-herring "${flag.type}" cannot carry a negative (money-saving) cost`);
      }
    }

    // correctDecision is normalized to BUY / WALK_AWAY from the economics in
    // the financial-consistency gate below, so no early check is needed here.

    // Ensure occupancy status is valid
    if (!['vacant', 'occupied', 'unknown'].includes(scenario.occupancyStatus)) {
      throw new Error('Invalid scenario: occupancyStatus must be vacant, occupied, or unknown');
    }

    // Normalize occupancy: derive a richer occupant from the legacy status when
    // omitted, keep the two in sync, and make sure a non-vacant property carries
    // an eviction/holding cost so it actually hits the scored P&L.
    if (!scenario.occupant) {
      scenario.occupant =
        scenario.occupancyStatus === 'occupied' ? 'owner'
        : scenario.occupancyStatus === 'vacant' ? 'vacant'
        : undefined; // 'unknown' stays unmodeled
    }
    if (scenario.occupant === 'vacant') {
      scenario.occupancyStatus = 'vacant';
      scenario.occupancyCost = 0;
    } else if (scenario.occupant) {
      scenario.occupancyStatus = 'occupied';
      if (!(typeof scenario.occupancyCost === 'number' && Number.isFinite(scenario.occupancyCost) && scenario.occupancyCost >= 0)) {
        const defaults: Record<string, number> = { owner: 10000, tenant: 7000, squatter: 13000 };
        scenario.occupancyCost = defaults[scenario.occupant] ?? 10000;
      }
      scenario.occupancyCost = Math.round(scenario.occupancyCost);
    }

    // Normalize redemption: a positive statutory window implies a carrying cost.
    if (typeof scenario.redemptionPeriodDays === 'number' && scenario.redemptionPeriodDays > 0) {
      scenario.redemptionPeriodDays = Math.round(scenario.redemptionPeriodDays);
      if (!(typeof scenario.redemptionCost === 'number' && Number.isFinite(scenario.redemptionCost) && scenario.redemptionCost >= 0)) {
        scenario.redemptionCost = 9000; // catalog midpoint carrying cost
      }
      scenario.redemptionCost = Math.round(scenario.redemptionCost);
    } else {
      scenario.redemptionPeriodDays = 0;
      scenario.redemptionCost = 0;
    }

    // Constrain the listing category to the supported set; default if the
    // model omitted it or returned an unexpected value (varies per scenario).
    const allowedAuctionTypes = ['Bank Owned', '2nd Chance Foreclosure', 'Short Sale', 'Foreclosure Homes', 'Non-Bank Owned'];
    if (!scenario.auctionType || !allowedAuctionTypes.includes(scenario.auctionType)) {
      scenario.auctionType = '2nd Chance Foreclosure';
    }

    // FINANCIAL-CONSISTENCY GATE: compute the deal the same way the frontend
    // does and reject scenarios whose declared isGoodDeal / correctDecision
    // contradict the actual numbers. This is what stops "you'll profit" banners
    // appearing on cases flagged as bad deals.
    const deal = this.computeScenarioDeal(scenario);
    const profitable = deal.netProfit > 0;
    if (scenario.isGoodDeal !== profitable) {
      throw new Error(
        `Inconsistent scenario: isGoodDeal=${scenario.isGoodDeal} but computed net profit is $${deal.netProfit.toLocaleString()} (resale $${scenario.estimatedValue.toLocaleString()} - total cost $${deal.totalInvestment.toLocaleString()})`
      );
    }
    // With only BUY / WALK_AWAY as terminal options, the correct call is fully
    // determined by profitability. Derive it so it can never contradict the math.
    scenario.correctDecision = profitable ? 'BUY' : 'WALK_AWAY';

    // Re-derive the case shape from the final economics so the stored archetype
    // always reflects the real numbers (the prompt only *biases* generation):
    //  - a loss is a clear-trap;
    //  - a profitable deal drowning in scary-but-survivable noise is a
    //    misdirection; an otherwise clean profitable deal is a clear-buy.
    scenario.archetype = !profitable
      ? 'clear-trap'
      : this.alarmScore(scenario) >= 3
        ? 'misdirection'
        : 'clear-buy';

    return scenario;
  }

  /**
   * Server-side mirror of the frontend dealFinancials.computeDeal().
   * KEEP IN SYNC with apps/deal-or-disaster/src/utils/dealFinancials.ts.
   */
  private readonly CLOSING_RATE = 0.025;

  /**
   * Mirror of the frontend alarmScore() in apps/.../utils/archetypes.ts: how
   * much scary-but-survivable noise a case carries. Used to distinguish a
   * clean clear-buy from a noisy misdirection. KEEP IN SYNC with the client.
   */
  private alarmScore(scenario: ForeclosureScenario): number {
    const redHerrings = scenario.redFlags.filter((f) => f.severity === 'red-herring').length;

    const wipedLiens = scenario.liens.filter((l) =>
      typeof l.survivesForeclosure === 'boolean'
        ? !l.survivesForeclosure
        : !this.lienSurvives(l.type, l.notes)
    ).length;

    const scaryButCheap = scenario.redFlags.filter((f) => {
      if (f.severity !== 'high' && f.severity !== 'severe') return false;
      const low = f.costLow ?? f.costHigh ?? 0;
      const high = f.costHigh ?? f.costLow ?? 0;
      return (low + high) / 2 < 8000;
    }).length;

    const occupied =
      (scenario.occupant != null && scenario.occupant !== 'vacant') ||
      scenario.occupancyStatus === 'occupied';

    return redHerrings + wipedLiens + scaryButCheap + (occupied ? 1 : 0);
  }

  private lienSurvives(type: string, notes?: string): boolean {
    const text = `${type} ${notes ?? ''}`.toLowerCase();
    // Wiped liens take precedence (a "first mortgage" must not match /irs/ etc.).
    if (/\bmortgage\b/.test(text) || /\bheloc\b/.test(text)) {
      return false;
    }
    const survivingPatterns = [
      /federal tax/, /\birs\b/, /property[\s-]?tax/, /county tax/, /tax lien/,
      /code[\s-]?enforcement/, /municipal/, /superpriority|super[\s-]?priority/,
      /mechanic/, /contractor/, /child[\s-]?support/,
    ];
    return survivingPatterns.some((re) => re.test(text));
  }

  private computeScenarioDeal(scenario: ForeclosureScenario): {
    netProfit: number;
    roi: number;
    totalInvestment: number;
  } {
    const closingCosts = scenario.auctionPrice * this.CLOSING_RATE;
    const survivingLiens = scenario.liens
      .filter((lien) => (typeof lien.survivesForeclosure === 'boolean' ? lien.survivesForeclosure : this.lienSurvives(lien.type, lien.notes)))
      .reduce((sum, lien) => sum + lien.amount, 0);
    const issueCosts = scenario.redFlags
      .filter((flag) => flag.severity !== 'red-herring')
      .reduce((sum, flag) => {
        if (flag.costLow === undefined && flag.costHigh === undefined) return sum;
        const low = flag.costLow ?? flag.costHigh ?? 0;
        const high = flag.costHigh ?? flag.costLow ?? 0;
        return sum + Math.round((low + high) / 2);
      }, 0);
    const occupancyCost = scenario.occupancyCost ?? 0;
    const redemptionCost = scenario.redemptionCost ?? 0;
    const totalInvestment = scenario.auctionPrice + scenario.estimatedRepairs + issueCosts + survivingLiens + occupancyCost + redemptionCost + closingCosts;
    // Resale anchor is the market value (single number). actualValue is forced
    // equal to estimatedValue in validateAndNormalizeScenario.
    const netProfit = scenario.estimatedValue - totalInvestment;
    const roi = totalInvestment > 0 ? netProfit / totalInvestment : 0;
    return { netProfit: Math.round(netProfit), roi, totalInvestment: Math.round(totalInvestment) };
  }
}

// Export singleton instance
export const foreclosureGenerator = new ForeclosureScenarioGenerator();
