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
    description: '3 bed, 2 bath single-family home. Needs cosmetic updates. Great neighborhood with good schools.',
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
    description: '4 bed, 2.5 bath townhome in gated community. Recently renovated kitchen. Some landscaping needed.',
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
    description: '5 bed, 3 bath luxury condo. Mountain views. Minor cosmetic work needed. Great investment opportunity!',
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
    occupancyStatus: 'vacant',
    description: '3 bed, 2 bath starter home. Needs some TLC. Priced to sell! Great for first-time investors.',
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
    description: '4 bed, 3 bath pool home. Recently updated. Needs new pool equipment and landscaping. Premium location!',
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
      }
    ]
  }
];

export const getRandomCase = (excludeIds: string[] = []): PropertyCase => {
  const availableCases = propertyCases.filter(c => !excludeIds.includes(c.id));
  const randomIndex = Math.floor(Math.random() * availableCases.length);
  return JSON.parse(JSON.stringify(availableCases[randomIndex])); // Deep clone to reset discovered flags
};
