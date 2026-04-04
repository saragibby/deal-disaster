/**
 * Mid-Term Rental (MTR) Estimation Service
 *
 * Algorithmic revenue estimator for furnished rentals of 30 days to
 * 12 months — targeting traveling nurses, corporate relocations,
 * insurance-claim displacement, military PCS, and digital nomads.
 *
 * All functions are stateless & pure — same pattern as
 * strEstimationService.ts.  Designed so a real data provider
 * (Furnished Finder, PadSplit, etc.) can replace the algorithmic
 * implementation while keeping the return types unchanged.
 *
 * ── Recommended API upgrades (in priority order) ──────────────────
 *
 *  1. Furnished Finder  (furnishedfinder.com)
 *     • Largest MTR platform — traveling nurse focused.
 *     • No public API yet; scrape listing data or partner.
 *
 *  2. PadSplit  (padsplit.com)
 *     • Room-rental MTR platform, strong in SE US.
 *     • Partner API available for qualified operators.
 *
 *  3. Zillow / RentCast  (existing providers)
 *     • Filter by "furnished" listings for premium calibration.
 * ──────────────────────────────────────────────────────────────────
 */

import type {
  PropertyData,
  RentalEstimate,
  MTREstimate,
  MTRDemandFactors,
  FurnishingCostBreakdown,
  FurnishingQuality,
  MTRSeasonalityMonth,
} from '@deal-platform/shared-types';

// ---------------------------------------------------------------------------
// Main estimator
// ---------------------------------------------------------------------------

/**
 * Estimate mid-term rental revenue from property characteristics and
 * the long-term rental estimate.
 *
 *   1.  Monthly rate = LTR rent × furnished premium
 *   2.  Occupancy baseline ~90 %, adjusted by property traits
 *   3.  Compute turnover frequency and costs
 *   4.  Deduct utilities, turnover, platform fees, management → net
 */
export function estimateMTR(
  property: PropertyData,
  rentalEstimate: RentalEstimate,
): MTREstimate {
  const { bedrooms, sqft, propertyType } = property;
  const ltrRent = rentalEstimate.mid;

  // --- 1. Furnished premium over LTR ------------------------------------
  //  Smaller units command higher premiums per-unit because furnishing
  //  cost is spread over fewer rooms but demand is strong (solo travelers).
  let premium: number;
  if (bedrooms <= 1)      premium = 1.45;
  else if (bedrooms <= 2) premium = 1.35;
  else if (bedrooms <= 3) premium = 1.25;
  else                    premium = 1.20;

  // Property-type adjustments
  const type = (propertyType || '').toLowerCase();
  if (type.includes('condo') || type.includes('townhouse')) {
    premium += 0.05;  // urban convenience premium
  } else if (type.includes('multi') || type.includes('duplex')) {
    premium -= 0.05;  // less desirable for MTR guests
  }

  // Sqft adjustment — larger homes can justify slightly higher premiums
  if (sqft > 2500) premium += 0.03;

  const monthlyRate = Math.round(ltrRent * premium);

  // --- 2. Occupancy rate -------------------------------------------------
  //  MTR occupancy is typically 85-95 %.  Higher than STR because stays
  //  are longer (less gap between tenants), but vacancies occur between
  //  tenant rotations.
  let occupancy = 0.90;

  // 2-3BR sweet spot for MTR demand (families, nurse pairs)
  if (bedrooms >= 2 && bedrooms <= 3) occupancy += 0.03;
  else if (bedrooms <= 1) occupancy += 0.01;  // studio/1BR still good
  else if (bedrooms >= 5) occupancy -= 0.05;  // harder to fill

  // Property-type adjustments
  if (type.includes('single') || type.includes('house')) {
    occupancy += 0.02;  // SFH preferred for families / insurance claims
  } else if (type.includes('condo') || type.includes('townhouse')) {
    occupancy += 0.01;
  }

  occupancy = Math.min(0.97, Math.max(0.70, occupancy));

  // --- 3. Average stay and turnovers -------------------------------------
  //  Blended across use cases:
  //    Traveling nurses: ~13 weeks (3.25 months)
  //    Corporate relo:   ~3–6 months
  //    Insurance claims: ~2–6 months
  //    Military PCS:     ~2–4 months
  //    Digital nomads:   ~1–3 months
  const avgStayMonths = bedrooms >= 3 ? 3.5 : bedrooms >= 2 ? 3.0 : 2.5;
  const occupiedMonths = 12 * occupancy;
  const turnoversPerYear = Math.round((occupiedMonths / avgStayMonths) * 10) / 10;

  // --- 4. Costs ----------------------------------------------------------
  // Cleaning + restocking per turnover
  const cleaningPerTurnover = bedrooms <= 1 ? 120 : bedrooms <= 3 ? 180 : 250;
  const restockingPerTurnover = bedrooms <= 1 ? 50 : bedrooms <= 3 ? 80 : 120;
  const costPerTurnover = cleaningPerTurnover + restockingPerTurnover;
  const annualTurnoverCosts = costPerTurnover * turnoversPerYear;
  const monthlyTurnoverCosts = Math.round(annualTurnoverCosts / 12);

  // Utilities (MTR tenants expect utilities included)
  let utilityCosts: number;
  if (bedrooms <= 1)      utilityCosts = 175;
  else if (bedrooms <= 2) utilityCosts = 225;
  else if (bedrooms <= 3) utilityCosts = 300;
  else                    utilityCosts = 400;

  // Platform fees — blended rate across platforms
  //  Furnished Finder: ~$100/listing flat (≈ 1% for a $1500/mo unit)
  //  Airbnb 30+ day: ~3% host fee
  //  Direct bookings: 0%
  //  Blended average: ~2%
  const monthlyPlatformFees = Math.round(monthlyRate * 0.02);

  // Management costs — 10% if property managed, 0% if self-managed
  //  Use 10% as conservative estimate (can be overridden)
  const managementCosts = Math.round(monthlyRate * 0.10);

  // Furnishing costs (standard quality by default)
  const furnishingCosts = estimateFurnishingCosts(bedrooms, 'standard');

  // --- 5. Revenue --------------------------------------------------------
  const grossMonthlyRevenue = Math.round(monthlyRate * occupancy);
  const netMonthlyRevenue = grossMonthlyRevenue
    - utilityCosts
    - monthlyTurnoverCosts
    - monthlyPlatformFees
    - managementCosts
    - furnishingCosts.amortizedMonthly;

  // Demand scoring
  const demandFactors = scoreMTRDemand(property);

  return {
    monthlyRate,
    furnishedPremium: Math.round(premium * 100) / 100,
    occupancyRate: Math.round(occupancy * 100) / 100,
    avgStayMonths,
    turnoversPerYear,
    grossMonthlyRevenue,
    utilityCosts,
    turnoverCosts: monthlyTurnoverCosts,
    platformFees: monthlyPlatformFees,
    managementCosts,
    netMonthlyRevenue: Math.round(netMonthlyRevenue),
    furnishingCosts,
    demandFactors,
    confidence: 'low',  // algorithmic only
    source: 'algorithm',
    seasonality: buildMTRSeasonality(monthlyRate, occupancy),
    revenueRange: {
      low: Math.round(grossMonthlyRevenue * 0.85),
      mid: grossMonthlyRevenue,
      high: Math.round(grossMonthlyRevenue * 1.15),
    },
  };
}

// ---------------------------------------------------------------------------
// Furnishing cost estimator
// ---------------------------------------------------------------------------

const FURNISHING_COSTS = {
  budget: {
    perBedroom: 1500,   // bed, frame, nightstand, basic dresser, linens
    commonArea: 3100,   // sofa, TV, coffee table, basic kitchen, tech
  },
  standard: {
    perBedroom: 2200,   // quality mattress, frame, nightstand, dresser, linens, décor
    commonArea: 4500,   // sofa, TV+stand, coffee table, dining set, full kitchen, tech, décor
  },
  premium: {
    perBedroom: 3200,   // premium mattress, quality furniture, luxury linens, artwork
    commonArea: 6500,   // designer sofa, large TV, full dining, premium kitchen, smart home
  },
} as const;

const USEFUL_LIFE_YEARS = 4;

/**
 * Estimate one-time furnishing costs and amortized monthly impact.
 */
export function estimateFurnishingCosts(
  bedrooms: number,
  quality: FurnishingQuality = 'standard',
): FurnishingCostBreakdown {
  const effectiveBedrooms = Math.max(1, bedrooms); // studio counts as 1
  const tier = FURNISHING_COSTS[quality];

  const perBedroomCost = tier.perBedroom * effectiveBedrooms;
  const commonAreaCost = tier.commonArea;
  const totalCost = perBedroomCost + commonAreaCost;
  const amortizedMonthly = Math.round(totalCost / (USEFUL_LIFE_YEARS * 12));

  return {
    perBedroomCost,
    commonAreaCost,
    totalCost,
    amortizedMonthly,
    usefulLifeYears: USEFUL_LIFE_YEARS,
    quality,
  };
}

// ---------------------------------------------------------------------------
// Demand scoring
// ---------------------------------------------------------------------------

/**
 * Score how suitable a property is for MTR based on its characteristics.
 *
 * Uses only property-level data (no geocoding API calls).  Proximity-based
 * scoring (hospitals, military bases, etc.) can be layered on in a future
 * iteration via the geocoding service.
 */
export function scoreMTRDemand(property: PropertyData): MTRDemandFactors {
  const { bedrooms, propertyType } = property;

  // Bedroom suitability: 2-3BR is the sweet spot for MTR
  let bedroomScore: number;
  if (bedrooms === 2)      bedroomScore = 95;
  else if (bedrooms === 3) bedroomScore = 90;
  else if (bedrooms === 1) bedroomScore = 75;
  else if (bedrooms === 4) bedroomScore = 65;
  else if (bedrooms >= 5)  bedroomScore = 45;
  else                     bedroomScore = 60; // studio

  // Property type suitability
  const type = (propertyType || '').toLowerCase();
  let propertyTypeScore: number;
  if (type.includes('single') || type.includes('house'))          propertyTypeScore = 90;
  else if (type.includes('townhouse') || type.includes('town_house')) propertyTypeScore = 85;
  else if (type.includes('condo'))                                propertyTypeScore = 75;
  else if (type.includes('apartment'))                            propertyTypeScore = 70;
  else if (type.includes('multi') || type.includes('duplex'))     propertyTypeScore = 55;
  else                                                            propertyTypeScore = 65;

  const overallScore = Math.round(bedroomScore * 0.5 + propertyTypeScore * 0.5);

  return {
    bedroomScore,
    propertyTypeScore,
    overallScore,
  };
}

// ---------------------------------------------------------------------------
// Seasonality
// ---------------------------------------------------------------------------

/**
 * Generate a 12-month MTR seasonality curve.
 *
 * MTR demand has a different pattern than STR:
 *   - Nurse contract cycles peak in Jan, Apr, Jul, Oct (13-week rotations)
 *   - Corporate relocations peak in summer (May–Aug)
 *   - Insurance claims spike after storm season (Aug–Nov)
 *   - Overall: less dramatic swings than STR (±10-15 % vs ±25-30 %)
 */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MTR_SEASONALITY_CURVE = [1.05, 0.92, 0.95, 1.04, 1.08, 1.10, 1.06, 1.02, 1.05, 1.00, 0.90, 0.88];

export function buildMTRSeasonality(
  monthlyRate: number,
  baseOccupancy: number,
): MTRSeasonalityMonth[] {
  return MONTH_NAMES.map((month, i) => {
    const factor = MTR_SEASONALITY_CURVE[i];
    const adjOccupancy = Math.min(0.98, Math.max(0.65, baseOccupancy * factor));
    return {
      month,
      revenue: Math.round(monthlyRate * adjOccupancy),
      occupancy: Math.round(adjOccupancy * 100) / 100,
    };
  });
}
