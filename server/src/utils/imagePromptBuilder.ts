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
 * Generates consistent property characteristics based on scenario
 * This ensures all 4 photos appear to be from the same house
 * Takes into account location, era, and property type for realistic variation
 */
function getConsistentPropertyStyle(scenario: PropertyScenario): string {
  const yearBuilt = scenario.yearBuilt || 1985;
  const propertyType = (scenario.propertyType || 'single family home').toLowerCase();
  const city = scenario.city || '';
  const state = scenario.state || '';
  
  // Determine regional characteristics
  const region = getRegionalStyle(city, state);
  
  // Determine era-appropriate style
  let style = '';
  let exteriorMaterial = '';
  let colorScheme = '';
  let roofStyle = '';
  
  // Style based on year built and region
  if (yearBuilt < 1950) {
    style = region.preWar || 'craftsman';
    exteriorMaterial = region.historicMaterials || 'wood siding and brick';
    colorScheme = region.historicColors || 'white with dark green trim';
    roofStyle = 'steep-pitched gable roof with shingles';
  } else if (yearBuilt >= 1950 && yearBuilt < 1970) {
    style = region.postWar || 'mid-century ranch';
    exteriorMaterial = region.fifties || 'brick and aluminum siding';
    colorScheme = region.fiftiesColors || 'red brick with cream trim';
    roofStyle = 'low-pitched hip roof';
  } else if (yearBuilt >= 1970 && yearBuilt < 1990) {
    style = region.seventies || 'split-level';
    exteriorMaterial = region.seventiesMaterials || 'vinyl siding';
    colorScheme = region.seventiesColors || 'beige siding with brown trim';
    roofStyle = 'standard gable roof with asphalt shingles';
  } else if (yearBuilt >= 1990 && yearBuilt < 2005) {
    style = region.nineties || 'traditional two-story';
    exteriorMaterial = region.ninetiesMaterials || 'brick and vinyl combination';
    colorScheme = region.ninetiesColors || 'tan brick with white vinyl siding';
    roofStyle = 'complex hip and gable roof';
  } else {
    style = region.modern || 'contemporary';
    exteriorMaterial = region.modernMaterials || 'fiber cement siding and stone accents';
    colorScheme = region.modernColors || 'gray siding with white trim and stone veneer';
    roofStyle = 'modern gable roof with architectural shingles';
  }
  
  return `${style} ${propertyType} built in ${yearBuilt}. Exterior: ${exteriorMaterial}, ${colorScheme}. ${roofStyle}`;
}

/**
 * Returns regional architectural characteristics based on location
 */
function getRegionalStyle(city: string, state: string): any {
  const lowerCity = city.toLowerCase();
  const lowerState = state.toLowerCase();
  
  // Southwest (Arizona, New Mexico, Nevada, Southern California)
  if (lowerState.includes('arizona') || lowerState.includes('new mexico') || 
      lowerCity.includes('phoenix') || lowerCity.includes('tucson') || lowerCity.includes('albuquerque')) {
    return {
      preWar: 'adobe-style or Spanish colonial',
      postWar: 'desert ranch',
      seventies: 'southwestern ranch',
      nineties: 'Spanish Mediterranean',
      modern: 'contemporary desert modern',
      historicMaterials: 'stucco and clay tile',
      fifties: 'stucco with decorative block',
      seventiesMaterials: 'stucco',
      ninetiesMaterials: 'stucco with stone accents',
      modernMaterials: 'smooth stucco with steel and glass',
      historicColors: 'terracotta stucco with clay tile roof',
      fiftiesColors: 'tan stucco with turquoise accents',
      seventiesColors: 'beige stucco with earth tones',
      ninetiesColors: 'sand-colored stucco with terracotta roof',
      modernColors: 'warm gray stucco with natural stone'
    };
  }
  
  // Florida
  if (lowerState.includes('florida') || lowerCity.includes('miami') || lowerCity.includes('tampa') || lowerCity.includes('orlando')) {
    return {
      preWar: 'Mediterranean Revival',
      postWar: 'Florida ranch',
      seventies: 'concrete block ranch',
      nineties: 'Mediterranean villa',
      modern: 'coastal contemporary',
      historicMaterials: 'stucco with barrel tile roof',
      fifties: 'concrete block with jalousie windows',
      seventiesMaterials: 'stucco over concrete block',
      ninetiesMaterials: 'stucco with clay tile roof',
      modernMaterials: 'stucco with impact-resistant glass',
      historicColors: 'white or pastel stucco with red tile roof',
      fiftiesColors: 'pastel pink or yellow stucco',
      seventiesColors: 'white or cream stucco',
      ninetiesColors: 'peach or coral stucco with terracotta roof',
      modernColors: 'white stucco with gray tile roof'
    };
  }
  
  // Texas
  if (lowerState.includes('texas') || lowerCity.includes('dallas') || lowerCity.includes('houston') || lowerCity.includes('austin') || lowerCity.includes('san antonio')) {
    return {
      preWar: 'Texas farmhouse',
      postWar: 'Texas ranch',
      seventies: 'brick ranch',
      nineties: 'brick traditional',
      modern: 'Texas modern farmhouse',
      historicMaterials: 'wood siding with metal roof',
      fifties: 'red brick with picture windows',
      seventiesMaterials: 'full brick exterior',
      ninetiesMaterials: 'brick with stone accents',
      modernMaterials: 'brick, board and batten, metal roof',
      historicColors: 'white wood siding with dark shutters',
      fiftiesColors: 'red brick throughout',
      seventiesColors: 'brown brick with white trim',
      ninetiesColors: 'tan brick with brown stone',
      modernColors: 'white brick with black metal roof'
    };
  }
  
  // Pacific Northwest (Washington, Oregon)
  if (lowerState.includes('washington') || lowerState.includes('oregon') || 
      lowerCity.includes('seattle') || lowerCity.includes('portland')) {
    return {
      preWar: 'craftsman bungalow',
      postWar: 'northwest ranch',
      seventies: 'cedar contemporary',
      nineties: 'northwest traditional',
      modern: 'northwest contemporary',
      historicMaterials: 'wood shingles and stone',
      fifties: 'wood siding with large windows',
      seventiesMaterials: 'cedar siding with exposed beams',
      ninetiesMaterials: 'hardiplank with stone',
      modernMaterials: 'fiber cement with metal accents',
      historicColors: 'natural wood or forest green with white trim',
      fiftiesColors: 'natural cedar with dark trim',
      seventiesColors: 'natural cedar with dark brown stain',
      ninetiesColors: 'sage green siding with white trim',
      modernColors: 'charcoal gray with natural wood accents'
    };
  }
  
  // Northeast (New York, Massachusetts, Pennsylvania, etc.)
  if (lowerState.includes('new york') || lowerState.includes('massachusetts') || lowerState.includes('pennsylvania') ||
      lowerState.includes('connecticut') || lowerCity.includes('boston') || lowerCity.includes('philadelphia')) {
    return {
      preWar: 'colonial or Victorian',
      postWar: 'cape cod',
      seventies: 'colonial revival',
      nineties: 'traditional colonial',
      modern: 'modern farmhouse',
      historicMaterials: 'clapboard siding with brick chimney',
      fifties: 'painted wood siding',
      seventiesMaterials: 'vinyl siding with shutters',
      ninetiesMaterials: 'vinyl siding with brick accents',
      modernMaterials: 'fiber cement with stone veneer',
      historicColors: 'white or cream with black shutters',
      fiftiesColors: 'white or yellow with dark shutters',
      seventiesColors: 'colonial blue or tan with white trim',
      ninetiesColors: 'beige vinyl with burgundy brick',
      modernColors: 'white with black windows and natural stone'
    };
  }
  
  // California (excluding Southern California which falls into Southwest)
  if (lowerState.includes('california') && !lowerCity.includes('san diego')) {
    return {
      preWar: 'California bungalow',
      postWar: 'California ranch',
      seventies: 'California contemporary',
      nineties: 'California stucco',
      modern: 'California modern',
      historicMaterials: 'stucco and wood shingles',
      fifties: 'stucco with redwood accents',
      seventiesMaterials: 'wood siding with brick',
      ninetiesMaterials: 'stucco with stone base',
      modernMaterials: 'smooth stucco with wood and glass',
      historicColors: 'light stucco with terracotta details',
      fiftiesColors: 'white stucco with natural redwood',
      seventiesColors: 'earth tone stucco',
      ninetiesColors: 'beige stucco with sandstone',
      modernColors: 'white with natural wood siding'
    };
  }
  
  // Midwest (Illinois, Ohio, Michigan, Indiana, Wisconsin, etc.)
  if (lowerState.includes('illinois') || lowerState.includes('ohio') || lowerState.includes('michigan') ||
      lowerState.includes('indiana') || lowerState.includes('wisconsin') || lowerCity.includes('chicago') || lowerCity.includes('detroit')) {
    return {
      preWar: 'prairie style or brick bungalow',
      postWar: 'brick ranch',
      seventies: 'split-level',
      nineties: 'traditional two-story',
      modern: 'midwest contemporary',
      historicMaterials: 'red brick with limestone',
      fifties: 'brick with aluminum windows',
      seventiesMaterials: 'brick and vinyl siding',
      ninetiesMaterials: 'brick with vinyl siding',
      modernMaterials: 'brick with hardie board',
      historicColors: 'red brick with white trim',
      fiftiesColors: 'red or tan brick',
      seventiesColors: 'brown brick with beige siding',
      ninetiesColors: 'red brick with cream siding',
      modernColors: 'charcoal brick with white trim'
    };
  }
  
  // South/Southeast (Georgia, Alabama, Tennessee, Carolinas, etc.)
  if (lowerState.includes('georgia') || lowerState.includes('alabama') || lowerState.includes('tennessee') ||
      lowerState.includes('carolina') || lowerCity.includes('atlanta') || lowerCity.includes('charlotte') || lowerCity.includes('nashville')) {
    return {
      preWar: 'Southern colonial',
      postWar: 'Southern ranch',
      seventies: 'brick ranch',
      nineties: 'Southern traditional',
      modern: 'modern farmhouse',
      historicMaterials: 'painted wood siding with columns',
      fifties: 'brick with carport',
      seventiesMaterials: 'full brick',
      ninetiesMaterials: 'brick with siding combination',
      modernMaterials: 'board and batten with stone',
      historicColors: 'white with black shutters',
      fiftiesColors: 'red brick',
      seventiesColors: 'brown or orange brick',
      ninetiesColors: 'tan brick with white siding',
      modernColors: 'white board and batten with natural stone'
    };
  }
  
  // Default / Generic
  return {
    preWar: 'traditional bungalow',
    postWar: 'ranch',
    seventies: 'split-level',
    nineties: 'traditional',
    modern: 'contemporary',
    historicMaterials: 'wood siding',
    fifties: 'brick and siding',
    seventiesMaterials: 'vinyl siding',
    ninetiesMaterials: 'brick and vinyl',
    modernMaterials: 'fiber cement and stone',
    historicColors: 'white with dark trim',
    fiftiesColors: 'brick with white trim',
    seventiesColors: 'tan with brown trim',
    ninetiesColors: 'beige with white trim',
    modernColors: 'gray with white trim'
  };
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
  const propertyStyle = getConsistentPropertyStyle(scenario);
  const condition = getConditionDescription(scenario.estimatedRepairs);
  const occupancy = scenario.occupancyStatus === 'occupied' ? 'lived-in with furniture' : 'vacant and empty';
  
  // Extract visual issues for context
  const visualIssues = extractVisualIssues(scenario);
  const issueContext = visualIssues.length > 0 ? visualIssues.join(', ') : '';

  // Base realistic photo requirements - emphasize it's a REAL photo with NO TEXT
  const photoRealism = 'Real photograph taken with smartphone camera. Actual MLS real estate listing photo. Raw unedited photo. NO TEXT, NO WATERMARKS, NO LOGOS, NO CAPTIONS, NO SIGNS, NO LABELS of any kind in the image. NOT a 3D render, NOT digital art, NOT an illustration, NOT a blueprint, NOT architectural visualization.';
  
  // Consistency reminder - all photos from same property
  const consistencyNote = 'IMPORTANT: This photo is from the same property as other listing photos - maintain consistent architectural style, materials, colors, and condition level.';

  let specificPrompt = '';

  switch (photoType) {
    case 'exterior_front':
      specificPrompt = `Front exterior photograph of a ${propertyStyle} located in ${city}, ${state}. Street view showing the front facade, driveway, front yard, and entrance. Property is in ${condition}. ${issueContext ? `Visible issues: ${issueContext}.` : ''} Daytime photo, natural lighting, slightly overcast sky. ${consistencyNote}`;
      break;
      
    case 'kitchen':
      specificPrompt = `Kitchen interior photograph inside a ${propertyStyle}. Showing cabinets, countertops, appliances, and flooring. Kitchen is ${occupancy} and in ${condition}. ${issueContext ? `Shows signs of: ${issueContext}.` : ''} Natural window lighting, typical residential kitchen. Interior should match the era and style of the property. ${consistencyNote}`;
      break;
      
    case 'backyard':
      specificPrompt = `Backyard photograph of a ${propertyStyle} located in ${city}, ${state}. View from back door or patio showing the yard, fence, and rear of house. Yard is in ${condition}. ${issueContext ? `Visible: ${issueContext}.` : ''} Daytime, natural lighting. Back of house should match the same architectural style and materials as the front. ${consistencyNote}`;
      break;
      
    case 'interior_room':
      // Randomly choose between living room, bedroom, or bathroom for variety
      const roomTypes = ['living room', 'master bedroom', 'bathroom'];
      const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
      specificPrompt = `${roomType.charAt(0).toUpperCase() + roomType.slice(1)} interior photograph inside a ${propertyStyle}. Room is ${occupancy} and in ${condition}. ${issueContext ? `Shows: ${issueContext}.` : ''} Natural lighting from windows, typical residential room. Interior finishes and style should match the property's era. ${consistencyNote}`;
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
  return `Real estate listing photograph: ${cleanDesc}. ${propertyType} in ${location}, built ${yearBuilt}. ${occupancyDetails}${visualContext}Property in ${condition}. Real photograph taken with smartphone. Actual MLS listing photo. NO TEXT, NO WATERMARKS, NO LOGOS, NO SIGNS in the image. NOT a 3D render, NOT digital art, NOT an illustration, NOT architectural visualization.`;
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
