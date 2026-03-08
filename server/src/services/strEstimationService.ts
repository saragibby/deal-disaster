/**
 * Short-Term Rental (STR) Estimation Service
 *
 * Algorithmic Airbnb/VRBO revenue estimator.  Designed with a clean
 * STREstimate interface so a real data provider (AirDNA, Mashvisor,
 * AllTheRooms) can be swapped in later by replacing the implementation
 * of `estimateSTR` while keeping the return type unchanged.
 *
 * ── Recommended API upgrades (in priority order) ──────────────────
 *
 *  1. AirDNA  (airdna.co)
 *     • Best-in-class STR analytics — nightly rates, occupancy,
 *       revenue, seasonality, competitor set.
 *     • MarketMinder API: GET /api/v1/market/property_stats
 *     • ~$20–40 /mo for API access (Rentalizer plan).
 *
 *  2. Mashvisor  (mashvisor.com)
 *     • Airbnb + traditional rental estimates side-by-side.
 *     • GET /api/v2/property/{zpid}/investment  returns both LTR & STR.
 *     • Free tier available; paid plans from $50 /mo.
 *
 *  3. AllTheRooms Analytics  (alltherooms.com)
 *     • Broad global coverage, competitive pricing.
 *     • Postman-style REST — /v1/analytics/listing
 *     • Enterprise pricing; good for bulk/portfolio use.
 *
 *  To integrate any of the above, add a provider function that calls the
 *  API and maps the response to the STREstimate interface, then update
 *  `estimateSTR` to prefer the API result and fall back to the
 *  algorithmic estimate when the key is missing or the call fails.
 * ──────────────────────────────────────────────────────────────────
 */

import type { PropertyData, RentalEstimate, STREstimate } from '@deal-platform/shared-types';

// ---------------------------------------------------------------------------
// Algorithmic STR estimation
// ---------------------------------------------------------------------------

/**
 * Estimate short-term rental revenue from property characteristics and
 * the long-term rental estimate.
 *
 *   1.  Nightly rate = monthly rent × STR premium ÷ 30
 *   2.  Occupancy baseline ~65 %, adjusted by bedrooms & property type
 *   3.  Gross monthly = nightly × 30 × occupancy
 *   4.  Deduct cleaning costs + platform fees → net monthly
 */
export function estimateSTR(
  property: PropertyData,
  rentalEstimate: RentalEstimate,
): STREstimate {
  const { bedrooms, sqft, propertyType } = property;
  const monthlyRent = rentalEstimate.mid;

  // --- 1. Nightly rate from STR premium over long-term rent ---------------
  //  Smaller units command a higher per-night premium because they appeal
  //  to couples / solo travelers who book more frequently.
  let strPremium: number;
  if (bedrooms <= 1)      strPremium = 2.4;
  else if (bedrooms <= 2) strPremium = 2.1;
  else if (bedrooms <= 3) strPremium = 1.8;
  else if (bedrooms <= 4) strPremium = 1.6;
  else                    strPremium = 1.45;

  // Luxury sqft bump
  if (sqft > 3000) strPremium += 0.15;

  // Property-type adjustments
  const type = (propertyType || '').toLowerCase();
  if (type.includes('condo') || type.includes('townhouse')) {
    strPremium += 0.1; // urban / walkable premium
  } else if (type.includes('multi') || type.includes('duplex')) {
    strPremium -= 0.15; // less desirable for STR guests
  }

  const nightlyRate = Math.round((monthlyRent * strPremium) / 30);

  // --- 2. Occupancy rate ---------------------------------------------------
  //  National Airbnb average ≈ 48-56 % (AirDNA 2024).  Whole-home listings
  //  in desirable markets average 55-70 %.  We use 60 % as a conservative
  //  baseline and adjust.
  let occupancy = 0.60;

  if (bedrooms <= 1)      occupancy += 0.06;  // studios/1BR book fastest
  else if (bedrooms <= 2) occupancy += 0.03;
  else if (bedrooms >= 5) occupancy -= 0.06;  // large homes harder to fill

  if (type.includes('condo') || type.includes('townhouse')) {
    occupancy += 0.04; // urban / walkable
  }

  // Clamp to reasonable bounds
  occupancy = Math.min(0.85, Math.max(0.40, occupancy));

  // --- 3. Gross monthly revenue -------------------------------------------
  const grossMonthlyRevenue = Math.round(nightlyRate * 30 * occupancy);

  // --- 4. Costs & fees ----------------------------------------------------
  //  Cleaning: per-turnover cost × estimated turnovers/month
  //  Average stay ≈ 3.5 nights  ⇒  turnovers ≈ (30 × occupancy) / 3.5
  const cleaningPerTurn = bedrooms <= 1 ? 75 : bedrooms <= 3 ? 120 : 175;
  const turnoversPerMonth = Math.round((30 * occupancy) / 3.5);
  const cleaningCosts = cleaningPerTurn * turnoversPerMonth;

  // Platform fees: Airbnb charges hosts ~3 % (split-fee model)
  const platformFees = Math.round(grossMonthlyRevenue * 0.03);

  const netMonthlyRevenue = grossMonthlyRevenue - cleaningCosts - platformFees;

  return {
    nightlyRate,
    occupancyRate: Math.round(occupancy * 100) / 100,
    grossMonthlyRevenue,
    cleaningCosts,
    platformFees,
    netMonthlyRevenue,
    confidence: 'low',  // algorithmic only — upgrade to 'medium'/'high' with API data
    source: 'algorithm',
  };
}
