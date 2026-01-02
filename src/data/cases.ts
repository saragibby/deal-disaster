import { PropertyCase } from '../types';

export const propertyCases: PropertyCase[] = [
  {
    id: 'case-001',
    address: '1428 Elm Street',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85001',
    propertyValue: 350000,
    auctionPrice: 180000,
    repairEstimate: 45000,
    actualValue: 200000, // IRS lien will eat profit
    isGoodDeal: false,
    occupancyStatus: 'vacant',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1850,
    yearBuilt: 1998,
    description: 'Previous owner was a "cryptocurrency entrepreneur" who apparently forgot to pay the IRS for three years while driving a Lambo. House has outdated fixtures and that distinct smell of financial panic. Neighbors say black SUVs with government plates visited frequently in 2023. Kitchen cabinets are builder-grade from 1998, but hey, at least the granite counters are real! Mail slot is suspiciously stuffed with certified letters.',
    photos: ['🏠 Front view', '🛁 Bathroom', '🍳 Kitchen', '🌳 Backyard'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Bank of America',
        amount: 165000,
        priority: 1,
        notes: 'Will be wiped at foreclosure sale'
      },
      {
        type: 'Second Mortgage',
        holder: 'Wells Fargo HELOC',
        amount: 25000,
        priority: 2,
        notes: 'Also wiped at sale'
      },
      {
        type: 'Federal Tax Lien',
        holder: 'IRS - Revenue Officer J. Smith',
        amount: 78000,
        priority: 3,
        notes: 'Filed 2 years ago for unpaid taxes'
      }
    ],
    redFlags: [
      {
        id: 'rf-001-1',
        description: 'IRS tax lien survives foreclosure! You\'ll inherit $78k debt that attaches to the property.',
        severity: 'high',
        hiddenIn: 'Title Report - Page 7',
        discovered: false
      },
      {
        id: 'rf-001-2',
        description: 'Property tax lien filed by Maricopa County - $12,500 in unpaid property taxes going back 4 years',
        severity: 'high',
        hiddenIn: 'County Records Search',
        discovered: false
      },
      {
        id: 'rf-001-3',
        description: 'Judgment lien from 2019 civil lawsuit - $35,000 creditor claim still active',
        severity: 'high',
        hiddenIn: 'Lien Search Report - Page 3',
        discovered: false
      }
    ]
  },
  {
    id: 'case-002',
    address: '742 Evergreen Terrace',
    city: 'Las Vegas',
    state: 'NV',
    zip: '89101',
    propertyValue: 280000,
    auctionPrice: 140000,
    repairEstimate: 35000,
    actualValue: 245000,
    isGoodDeal: true,
    occupancyStatus: 'vacant',
    hoaFees: 150,
    propertyType: 'Townhouse',
    beds: 4,
    baths: 2.5,
    sqft: 2100,
    yearBuilt: 2005,
    description: 'Former owner flipped the kitchen themselves using YouTube tutorials - the subway tile work is "charmingly uneven" and one cabinet door hangs at a jaunty angle. HOA president left three passive-aggressive notes on the door about the dead palm trees out front. Community pool is nice though! Just ignore the 47-page HOA rulebook and the rumors about upcoming "infrastructure improvements." The renovated kitchen features appliances from three different brands because apparently coordination is overrated.',
    photos: ['🏘️ Front', '🛋️ Living room', '🏊 Pool', '🚗 Garage'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Chase Bank',
        amount: 235000,
        priority: 1,
        notes: 'Foreclosing lien - will be paid off'
      },
      {
        type: 'HOA Assessment',
        holder: 'Evergreen HOA',
        amount: 1200,
        priority: 2,
        notes: 'Past due fees'
      }
    ],
    redFlags: [
      {
        id: 'rf-002-1',
        description: 'Minor HOA fees - normal and manageable. Property is actually a solid deal!',
        severity: 'low',
        hiddenIn: 'HOA Documents',
        discovered: false
      },
      {
        id: 'rf-002-2',
        description: 'HOA reserves are only 35% funded - future special assessments likely ($2,000-3,000 per unit)',
        severity: 'medium',
        hiddenIn: 'HOA Financial Statements - Reserve Study',
        discovered: false
      },
      {
        id: 'rf-002-3',
        description: 'Gated community will install new security gates next year - special assessment estimated at $1,500-2,000',
        severity: 'low',
        hiddenIn: 'HOA Meeting Minutes',
        discovered: false
      },
      {
        id: 'rf-002-4',
        description: 'Homeowner association lost lawsuit with contractor - $85k judgment could be passed to residents',
        severity: 'medium',
        hiddenIn: 'HOA Legal Documents',
        discovered: false
      }
    ]
  },
  {
    id: 'case-003',
    address: '221B Baker Street',
    city: 'Henderson',
    state: 'NV',
    zip: '89002',
    propertyValue: 425000,
    auctionPrice: 210000,
    repairEstimate: 28000,
    actualValue: 150000, // Superpriority HOA lien disaster
    isGoodDeal: false,
    occupancyStatus: 'occupied',
    hoaFees: 425,
    propertyType: 'Condo',
    beds: 5,
    baths: 3,
    sqft: 2650,
    yearBuilt: 2012,
    description: 'Luxury high-rise condo with breathtaking views and some equally breathtaking "settling" cracks that the listing agent insists are "totally normal for a 13-year-old building." Previous owner installed a wine room because nothing says "sound investment" like custom shelving in a building with visible structural issues. The master suite features floor-to-ceiling windows perfect for watching your equity drain away. Marble floors throughout have a fun slight slope toward the northeast corner - makes for interesting dinner parties when wine glasses slowly migrate across the table!',
    photos: ['🏙️ View', '💎 Master suite', '🍽️ Dining', '⛰️ Balcony'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Nevada First Bank',
        amount: 380000,
        priority: 1,
        notes: 'Foreclosing lien'
      },
      {
        type: 'HOA Superpriority Lien',
        holder: 'Baker Street Condos HOA',
        amount: 47500,
        priority: 0,
        notes: 'Last 9 months of unpaid fees + assessments. Nevada law gives superpriority status.'
      },
      {
        type: 'HOA Regular Lien',
        holder: 'Baker Street Condos HOA',
        amount: 18000,
        priority: 2,
        notes: 'Additional past-due amounts'
      }
    ],
    redFlags: [
      {
        id: 'rf-003-1',
        description: 'HOA Superpriority Lien in Nevada! First $47.5k survives foreclosure. You inherit this debt on top of your purchase price.',
        severity: 'high',
        hiddenIn: 'HOA Lien - Fine Print',
        discovered: false
      },
      {
        id: 'rf-003-2',
        description: 'Property is occupied - expect 3-6 month eviction delay and legal costs of $5k-$15k',
        severity: 'medium',
        hiddenIn: 'Occupancy Status',
        discovered: false
      },
      {
        id: 'rf-003-3',
        description: 'Building envelope study reveals foundation settling issues - structural repair estimates $40k-60k',
        severity: 'high',
        hiddenIn: 'HOA Building Report',
        discovered: false
      },
      {
        id: 'rf-003-4',
        description: 'Water intrusion complaints from neighbors - mold remediation may be required before occupancy',
        severity: 'medium',
        hiddenIn: 'HOA Complaint Records',
        discovered: false
      }
    ]
  },
  {
    id: 'case-004',
    address: '4160 Government Way',
    city: 'Tucson',
    state: 'AZ',
    zip: '85701',
    propertyValue: 195000,
    auctionPrice: 95000,
    repairEstimate: 22000,
    actualValue: 165000, // Code enforcement nightmare
    isGoodDeal: false,
    occupancyStatus: 'vacant',    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1450,
    yearBuilt: 1985,
    description: 'Previous owner was an "enthusiastic" DIYer who turned the garage into a "game room" without bothering with pesky permits. The addition has electrical outlets that spark like a Tesla coil and a ceiling that sags like a hammock. City code enforcement has a thick file with this address tab at the top. The backyard shed is actually a unpermitted casita that neighbors definitely reported. On the plus side, the original 1985 kitchen is "retro chic" if you squint and have low standards!',
    photos: ['🏚️ Exterior', '🔨 Interior', '🚪 Bedrooms', '🏡 Backyard'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Tucson Community Bank',
        amount: 175000,
        priority: 1,
        notes: 'Foreclosing'
      },
      {
        type: 'Code Enforcement Lien',
        holder: 'City of Tucson',
        amount: 35000,
        priority: 2,
        notes: 'Unpermitted additions, safety violations. NOT disclosed in initial docs.'
      }
    ],
    redFlags: [
      {
        id: 'rf-004-1',
        description: '$35k code enforcement lien for unpermitted work! Must bring property to code before you can rent or sell.',
        severity: 'high',
        hiddenIn: 'Municipal Records (not in title report)',
        discovered: false
      },
      {
        id: 'rf-004-2',
        description: 'Repair estimate seems low at $22k - unpermitted additions suggest much more work needed',
        severity: 'medium',
        hiddenIn: 'Repair Estimate vs Photos',
        discovered: false
      },
      {
        id: 'rf-004-3',
        description: 'Contractor lien from 2022 - $18,500 for unpaid labor on those unpermitted additions',
        severity: 'high',
        hiddenIn: 'Lien Search',
        discovered: false
      },
      {
        id: 'rf-004-4',
        description: 'Property is in utility easement corridor - City has rights to access for maintenance and repairs',
        severity: 'medium',
        hiddenIn: 'Title Easement Section',
        discovered: false
      },
      {
        id: 'rf-004-5',
        description: 'Septic system failed inspection - must be replaced before occupancy ($12k-18k installation)',
        severity: 'high',
        hiddenIn: 'Environmental Report',
        discovered: false
      }
    ]
  },
  {
    id: 'case-005',
    address: '1313 Mockingbird Lane',
    city: 'Scottsdale',
    state: 'AZ',
    zip: '85251',
    propertyValue: 520000,
    auctionPrice: 285000,
    repairEstimate: 55000,
    actualValue: 465000,
    isGoodDeal: true,
    occupancyStatus: 'vacant',
    hoaFees: 95,
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 3,
    sqft: 2850,
    yearBuilt: 2008,
    description: 'Gorgeous Scottsdale pool home in a "premium location" that just happens to be in a flood plain - but it only floods every 500 years, so no biggie! Pool pump sounds like a dying vacuum cleaner and the landscaping looks like a tumbleweed convention. Recent updates include fresh paint over some mysterious water stains. The city is planning to rezone the empty lot next door for "mixed-use development" which is realtor-speak for "say goodbye to your peaceful mornings." Desert landscaping features authentic Arizona xeriscaping (translation: dead plants and rocks).',
    photos: ['🌟 Curb appeal', '🏊 Pool', '🏠 Great room', '🌵 Desert landscape'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Scottsdale Savings',
        amount: 445000,
        priority: 1,
        notes: 'Foreclosing lien'
      },
      {
        type: 'Mechanics Lien',
        holder: 'ABC Roofing',
        amount: 8500,
        priority: 2,
        notes: 'For roof work completed 6 months ago'
      }
    ],
    redFlags: [
      {
        id: 'rf-005-1',
        description: 'Mechanics lien is recent and legitimate - but small enough to not kill the deal. Factor it in.',
        severity: 'low',
        hiddenIn: 'Lien Stack - Bottom',
        discovered: false
      },
      {
        id: 'rf-005-2',
        description: 'Property is in a 500-year flood plain - flood insurance required (cost $3,500-5,000/year)',
        severity: 'medium',
        hiddenIn: 'FEMA Flood Maps',
        discovered: false
      },
      {
        id: 'rf-005-3',
        description: 'Zoning change proposed for adjacent property - will become mixed-use commercial area',
        severity: 'medium',
        hiddenIn: 'City Planning Documents',
        discovered: false
      },
      {
        id: 'rf-005-4',
        description: 'Utility company easement allows future pipeline installation - minor impact but limits landscaping',
        severity: 'low',
        hiddenIn: 'Title Easements',
        discovered: false
      }
    ]
  },
  {
    id: 'case-006',
    address: '777 Lucky Lane',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85014',
    propertyValue: 385000,
    auctionPrice: 195000,
    repairEstimate: 45000,
    actualValue: 215000, // Meth lab contamination not disclosed
    isGoodDeal: false,
    occupancyStatus: 'vacant',
    propertyType: 'Single Family Home',
    beds: 3,
    baths: 2,
    sqft: 1850,
    yearBuilt: 1998,
    description: 'Charming home with a "distinct chemical aroma" that the listing agent describes as "industrial chic." Windows feature decorative yellow-brown staining that creates unique light patterns - very artistic! Previous owner left in a hurry, forgetting to take all their cooking equipment in the garage (and by cooking, we mean the kind that involves pseudoephedrine). HVAC guy refused to enter the property without a respirator, but he was probably just being dramatic. All appliances convey, including some interesting modifications to the kitchen ventilation you won\'t find at Home Depot!',
    photos: ['🏚️ Front exterior', '🧪 Kitchen with stains', '🚪 Bedroom closets', '🌵 Desert backyard'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Phoenix National Bank',
        amount: 312000,
        priority: 1,
        notes: 'Foreclosing lien - will be wiped at auction'
      },
      {
        type: 'IRS Tax Lien',
        holder: 'Internal Revenue Service',
        amount: 47500,
        priority: 2,
        notes: 'Federal tax lien - SURVIVES foreclosure! Previous owner skipped town owing Uncle Sam.'
      },
      {
        type: 'Mechanics Lien',
        holder: 'Desert HVAC Services',
        amount: 8200,
        priority: 3,
        notes: 'For AC replacement that never got paid. Contractor says owner was "acting paranoid and rushed them."'
      }
    ],
    redFlags: [
      {
        id: 'rf-006-1',
        description: 'Strong chemical odor throughout property. Neighbors report previous owner was "cooking something" in the garage late at night.',
        severity: 'high',
        hiddenIn: 'Environmental Report',
        discovered: false
      },
      {
        id: 'rf-006-2',
        description: 'Windows have yellow/brown staining on interior surfaces. HVAC contractor noted "odd ventilation setup" in garage.',
        severity: 'high',
        hiddenIn: 'Property Inspection Notes',
        discovered: false
      },
      {
        id: 'rf-006-3',
        description: 'Police records show DEA raid at property 8 months ago. Property flagged as potential meth lab - requires $50k+ specialized cleanup.',
        severity: 'high',
        hiddenIn: 'Police Records',
        discovered: false
      },
      {
        id: 'rf-006-4',
        description: 'IRS tax lien for $47,500 SURVIVES foreclosure - you inherit this debt if you buy the property.',
        severity: 'high',
        hiddenIn: 'Title Search - Federal Liens',
        discovered: false
      }
    ]
  },
  {
    id: 'case-007',
    address: '3456 Cactus Garden Circle',
    city: 'Tempe',
    state: 'AZ',
    zip: '85282',
    propertyValue: 295000,
    auctionPrice: 165000,
    repairEstimate: 18000,
    actualValue: 272000,
    isGoodDeal: true,
    occupancyStatus: 'vacant',
    hoaFees: 125,
    propertyType: 'Townhouse',
    beds: 2,
    baths: 2.5,
    sqft: 1625,
    yearBuilt: 2015,
    description: 'Modern townhouse steps from ASU - perfect for the college rental market! Features an organic water stain pattern on the master bedroom ceiling that resembles the continent of Africa (upstairs neighbor\'s plumbing "incident" from March). Previous owner rented to ASU students who treated it like a combination frat house/mosh pit - HOA has a NOVEL-length file of noise violations. Community pool is amazing though, and the HOA board meetings are more entertaining than reality TV, especially when they discuss the "roof situation" and mandatory special assessments!',
    photos: ['🏘️ Townhouse exterior', '🛋️ Open living area', '🍳 Modern kitchen', '🌳 Community pool'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Wells Fargo',
        amount: 245000,
        priority: 1,
        notes: 'Foreclosing lien - wiped at auction'
      },
      {
        type: 'HOA Lien',
        holder: 'Cactus Garden HOA',
        amount: 3200,
        priority: 2,
        notes: 'Unpaid HOA fees for 8 months. HOA threatening to file but lien not yet recorded.'
      }
    ],
    redFlags: [
      {
        id: 'rf-007-1',
        description: 'Water staining on master bedroom ceiling. Upstairs neighbor had pipe burst 3 months ago - repair quality unknown.',
        severity: 'medium',
        hiddenIn: 'HOA Incident Reports',
        discovered: false
      },
      {
        id: 'rf-007-2',
        description: 'HOA considering special assessment of $8,500 per unit for roof replacement project starting this summer.',
        severity: 'medium',
        hiddenIn: 'HOA Board Minutes',
        discovered: false
      },
      {
        id: 'rf-007-3',
        description: 'Previous owner rented to college students who hosted parties. HOA has filed noise complaints and violation notices.',
        severity: 'low',
        hiddenIn: 'HOA Violation Records',
        discovered: false
      }
    ]
  },
  {
    id: 'case-008',
    address: '2121 Baby Mama Boulevard',
    city: 'Mesa',
    state: 'AZ',
    zip: '85201',
    propertyValue: 425000,
    auctionPrice: 225000,
    repairEstimate: 28000,
    actualValue: 145000, // Multiple child support liens that survive!
    isGoodDeal: false,
    occupancyStatus: 'unknown',
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 3,
    sqft: 2450,
    yearBuilt: 2005,
    description: 'Spacious family home with a backyard basketball court and an even more impressive collection of court documents! Previous owner "relocated suddenly" according to the listing, leaving behind children\'s toys, three different baby car seats, and a whole lot of legal baggage. The playroom still has nameplates for Tiffany Jr., Jessica Jr., and the Vegas Twins. Listing agent won\'t make eye contact when you ask about liens. Home features a three-car garage perfect for hiding from process servers! Comes with an extensive filing cabinet of child support paperwork that\'s actually more organized than anything else in the house.',
    photos: ['🏡 Large family home', '👶 Playroom setup', '🚗 Three-car garage', '🏀 Basketball court'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Chase Bank',
        amount: 385000,
        priority: 1,
        notes: 'Foreclosing lien - wiped at sale'
      },
      {
        type: 'Child Support Lien',
        holder: 'Baby Mama #1 (Tiffany)',
        amount: 48500,
        priority: 2,
        notes: 'SURVIVES foreclosure! Back child support for twins. Court order attached to property title.'
      },
      {
        type: 'Child Support Lien',
        holder: 'Baby Mama #2 (Jessica)',
        amount: 32000,
        priority: 3,
        notes: 'SURVIVES foreclosure! Unpaid support dating back 4 years. State filed lien.'
      },
      {
        type: 'Child Support Lien',
        holder: 'Baby Mama #3 (Crystal from Vegas)',
        amount: 67500,
        priority: 4,
        notes: 'SURVIVES foreclosure! Nevada child support lien transferred to Arizona. Owner fled state.'
      },
      {
        type: 'Judgment Lien',
        holder: 'Family Court Services',
        amount: 15200,
        priority: 5,
        notes: 'Legal fees from multiple paternity cases. Attorney pursuing collection.'
      }
    ],
    redFlags: [
      {
        id: 'rf-008-1',
        description: 'Property has $163,200 in child support liens from three different baby mamas - ALL SURVIVE FORECLOSURE. You inherit these!',
        severity: 'high',
        hiddenIn: 'Title Search - Judgment Liens',
        discovered: false
      },
      {
        id: 'rf-008-2',
        description: 'Additional $15,200 judgment lien for family court legal fees also survives. Total inherited debt: $178,400!',
        severity: 'high',
        hiddenIn: 'County Records',
        discovered: false
      },
      {
        id: 'rf-008-3',
        description: 'Occupancy status unknown - listing photos show children\'s toys and furniture. May have tenants or squatters.',
        severity: 'medium',
        hiddenIn: 'Drive-By Inspection',
        discovered: false
      },
      {
        id: 'rf-008-4',
        description: 'Court records show ongoing custody battles. Property may be subject to additional claims or legal complications.',
        severity: 'medium',
        hiddenIn: 'Court Records',
        discovered: false
      }
    ]
  },
  {
    id: 'case-009',
    address: '888 Sinkholes Street',
    city: 'Chandler',
    state: 'AZ',
    zip: '85224',
    propertyValue: 465000,
    auctionPrice: 285000,
    repairEstimate: 35000,
    actualValue: 425000,
    isGoodDeal: true,
    occupancyStatus: 'vacant',
    hoaFees: 85,
    propertyType: 'Single Family Home',
    beds: 4,
    baths: 2.5,
    sqft: 2750,
    yearBuilt: 2012,
    description: 'Stunning executive home with "character lines" (realtor-speak for cracks) running through the foundation and drywall that the inspector says are "probably just normal settling." Built on land that geologists describe with words like "interesting" and "subsidence potential." Pool deck has developed a fun tilt that makes pool parties more exciting - it\'s like a lazy river! The gourmet kitchen features granite counters that are slowly becoming unlevel, adding a rustic authenticity to your cooking experience. Golf course views are spectacular, assuming the greens don\'t sink into the earth first!',
    photos: ['🏛️ Grand entrance', '🍽️ Gourmet kitchen', '🛁 Spa bathroom', '⛳ Golf course view'],
    liens: [
      {
        type: 'First Mortgage',
        holder: 'Bank of America',
        amount: 425000,
        priority: 1,
        notes: 'Foreclosing lien'
      },
      {
        type: 'Second Mortgage',
        holder: 'Desert Credit Union',
        amount: 35000,
        priority: 2,
        notes: 'HELOC taken out for pool installation. Will be wiped at foreclosure.'
      }
    ],
    redFlags: [
      {
        id: 'rf-009-1',
        description: 'Minor settling cracks visible in foundation and drywall. Geologist report shows property is in low-risk subsidence zone.',
        severity: 'low',
        hiddenIn: 'Geological Survey',
        discovered: false
      },
      {
        id: 'rf-009-2',
        description: 'Pool pump needs replacement ($4,500) and pool deck has lifting pavers from tree roots ($3,200 repair).',
        severity: 'low',
        hiddenIn: 'Pool Inspection',
        discovered: false
      },
      {
        id: 'rf-009-3',
        description: 'HOA is solvent and well-managed but planning community wall repairs - potential $2,800 special assessment next year.',
        severity: 'low',
        hiddenIn: 'HOA Financial Statements',
        discovered: false
      }
    ]
  }
];

export const getRandomCase = (excludeIds: string[] = []): PropertyCase => {
  const availableCases = propertyCases.filter(c => !excludeIds.includes(c.id));
  const randomIndex = Math.floor(Math.random() * availableCases.length);
  return JSON.parse(JSON.stringify(availableCases[randomIndex])); // Deep clone to reset discovered flags
};
