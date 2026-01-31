/**
 * Shared utility for building ultra-realistic image prompts for property photos
 * Used by both foreclosureGenerator.ts and regeneration scripts
 */

// Standard photo types for all scenarios - consistent across all challenges
export const STANDARD_PHOTO_TYPES = [
  'exterior_front',
  'kitchen', 
  'backyard',
  'interior_room'
] as const;

export type PhotoType = typeof STANDARD_PHOTO_TYPES[number];

export interface PropertyScenario {
  city?: string;
  state?: string;
  propertyType?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  estimatedRepairs?: number;
  description?: string;
  funnyStory?: string;
  occupancyStatus?: 'vacant' | 'occupied' | 'unknown';
  redFlags?: Array<{ description: string; severity: string }>;
  hiddenIssues?: string[];
  photos?: string[];
}

/**
 * Extracts visual issues from red flags and hidden issues to make photos more accurate
 */
export function extractVisualIssues(scenario: PropertyScenario): string[] {
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
    if (desc.includes('termite') || desc.includes('pest') || desc.includes('rodent')) {
      visualIssues.push('signs of pest damage');
    }
    if (desc.includes('hvac') || desc.includes('heating') || desc.includes('cooling')) {
      visualIssues.push('aging HVAC equipment visible');
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
    if (desc.includes('abandon') || desc.includes('neglect')) {
      visualIssues.push('signs of abandonment or neglect');
    }
  });

  // Remove duplicates and limit to top 3
  return [...new Set(visualIssues)].slice(0, 3);
}

/**
 * Gets the condition description based on estimated repairs
 */
function getConditionDescription(estimatedRepairs?: number): string {
  if (!estimatedRepairs) return 'average condition';
  if (estimatedRepairs > 75000) return 'poor condition with significant deferred maintenance, visible damage, dated fixtures';
  if (estimatedRepairs > 50000) return 'fair condition with noticeable wear, some dated features, needs updating';
  if (estimatedRepairs > 30000) return 'decent condition with minor cosmetic issues and some dated elements';
  return 'good condition with minor wear appropriate for age';
}

/**
 * Builds a realistic photo prompt for a specific photo type
 * Uses simple, direct language that produces more realistic results
 */
export function buildStandardPhotoPrompt(
  photoType: PhotoType,
  scenario: PropertyScenario
): string {
  const city = scenario.city || 'suburban area';
  const state = scenario.state || 'USA';
  const propertyType = (scenario.propertyType || 'single family home').toLowerCase();
  const yearBuilt = scenario.yearBuilt || 1985;
  const condition = getConditionDescription(scenario.estimatedRepairs);
  const occupancy = scenario.occupancyStatus === 'occupied' ? 'lived-in with furniture' : 'vacant and empty';
  
  // Extract visual issues for context
  const visualIssues = extractVisualIssues(scenario);
  const issueContext = visualIssues.length > 0 ? visualIssues.join(', ') : '';

  // Base realistic photo requirements - emphasize it's a REAL photo
  const photoRealism = 'Real photograph taken with smartphone camera. Actual MLS real estate listing photo. Raw unedited photo. NOT a 3D render, NOT digital art, NOT an illustration, NOT a blueprint, NOT architectural visualization.';

  let specificPrompt = '';

  switch (photoType) {
    case 'exterior_front':
      specificPrompt = `Front exterior photograph of a ${yearBuilt} ${propertyType} in ${city}, ${state}. Street view showing the front facade, driveway, front yard, and entrance. Property is in ${condition}. ${issueContext ? `Visible issues: ${issueContext}.` : ''} Daytime photo, natural lighting, slightly overcast sky.`;
      break;
      
    case 'kitchen':
      specificPrompt = `Kitchen interior photograph inside a ${yearBuilt} ${propertyType}. Showing cabinets, countertops, appliances, and flooring. Kitchen is ${occupancy} and in ${condition}. ${issueContext ? `Shows signs of: ${issueContext}.` : ''} Natural window lighting, typical residential kitchen.`;
      break;
      
    case 'backyard':
      specificPrompt = `Backyard photograph of a ${yearBuilt} ${propertyType} in ${city}, ${state}. View from back door or patio showing the yard, fence, and back of house. Yard is in ${condition}. ${issueContext ? `Visible: ${issueContext}.` : ''} Daytime, natural lighting.`;
      break;
      
    case 'interior_room':
      // Randomly choose between living room, bedroom, or bathroom for variety
      const roomTypes = ['living room', 'master bedroom', 'bathroom'];
      const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
      specificPrompt = `${roomType.charAt(0).toUpperCase() + roomType.slice(1)} interior photograph inside a ${yearBuilt} ${propertyType}. Room is ${occupancy} and in ${condition}. ${issueContext ? `Shows: ${issueContext}.` : ''} Natural lighting from windows, typical residential room.`;
      break;
  }

  return `${specificPrompt} ${photoRealism}`;
}

/**
 * Generates the standard set of 4 photo prompts for a property
 */
export function generateStandardPhotoPrompts(scenario: PropertyScenario): string[] {
  return STANDARD_PHOTO_TYPES.map(photoType => 
    buildStandardPhotoPrompt(photoType, scenario)
  );
}

/**
 * Builds an ultra-realistic image prompt for a property photo (legacy support)
 */
export function buildRealisticImagePrompt(
  photoDescription: string,
  scenario: PropertyScenario
): string {
  const location = `${scenario.city || 'suburban area'}, ${scenario.state || 'USA'}`;
  const propertyType = (scenario.propertyType || 'single family home').toLowerCase();
  const yearBuilt = scenario.yearBuilt || 1980;
  const condition = getConditionDescription(scenario.estimatedRepairs);
  const occupancyStatus = scenario.occupancyStatus || 'unknown';

  // Extract visual issues
  const visualIssues = extractVisualIssues(scenario);
  const visualContext = visualIssues.length > 0 
    ? `Property shows: ${visualIssues.join(', ')}. ` 
    : '';

  // Occupancy-specific details
  const occupancyDetails = occupancyStatus === 'vacant' 
    ? 'Property is vacant and unfurnished. ' 
    : occupancyStatus === 'occupied'
    ? 'Property is occupied with furniture. '
    : '';

  // Remove any emoji from the description
  const cleanDesc = photoDescription.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();

  // Simplified, more direct prompt for realistic photos
  return `Real estate listing photograph: ${cleanDesc}. ${propertyType} in ${location}, built ${yearBuilt}. ${occupancyDetails}${visualContext}Property in ${condition}. Real photograph taken with smartphone. Actual MLS listing photo. NOT a 3D render, NOT digital art, NOT an illustration, NOT architectural visualization.`;
}

/**
 * Generates fallback photo descriptions if scenario doesn't have them
 * @deprecated Use generateStandardPhotoPrompts instead
 */
export function generateFallbackPhotoDescriptions(scenario: PropertyScenario): string[] {
  // Now just returns the standard photo types as simple descriptions
  // The actual prompts are built by buildStandardPhotoPrompt
  return [
    'Front exterior view',
    'Kitchen interior',
    'Backyard view', 
    'Interior room'
  ];
}

/**
 * Checks if photos array contains actual descriptions vs URLs or emojis
 */
export function hasValidPhotoDescriptions(photos: string[] | undefined): boolean {
  if (!photos || photos.length === 0) return false;
  
  // Check if first photo is a URL (starts with http) or emoji
  const firstPhoto = photos[0];
  if (firstPhoto.startsWith('http')) return false;
  if (/^[\u{1F300}-\u{1F9FF}]/u.test(firstPhoto)) return false;
  
  // Check if it looks like a description (has multiple words)
  return firstPhoto.split(' ').length >= 3;
}
