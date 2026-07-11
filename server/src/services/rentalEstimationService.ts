/**
 * Rental Estimation Service
 *
 * Provides algorithmic rental estimates and blends them with API-sourced
 * comps when available.  All functions are stateless & pure — easy to test
 * and safe to call from any context (routes, scripts, game generators).
 */

import type { PropertyData, RentalComp, RentalEstimate, MarketStatistics, RentalMarketTrends } from '@deal-platform/shared-types';

const MIN_MONTHLY_RENT = 300;
const MAX_MONTHLY_RENT = 50_000;
const MAX_RENT_TO_PRICE_RATIO = 0.03;
type RentConfidence = RentalEstimate['confidence'];

export function isPlausibleMonthlyRent(rent: number, property?: PropertyData): boolean {
  if (!Number.isFinite(rent) || rent < MIN_MONTHLY_RENT || rent > MAX_MONTHLY_RENT) {
    return false;
  }

  if (property?.price && rent > property.price * MAX_RENT_TO_PRICE_RATIO) {
    return false;
  }

  return true;
}

export function filterPlausibleRentalComps(
  comps: RentalComp[],
  property?: PropertyData,
): RentalComp[] {
  return comps.filter((comp) => isPlausibleMonthlyRent(comp.rent, property));
}

function getMarketRentSampleSize(trends: RentalMarketTrends): number {
  const histogramCount = trends.rentHistogram?.reduce((sum, bucket) => sum + bucket.count, 0) || 0;
  return Math.max(trends.availableRentals || 0, histogramCount);
}

function getMarketRentConfidence(trends: RentalMarketTrends): RentConfidence {
  const sampleSize = getMarketRentSampleSize(trends);
  if (sampleSize >= 5) return 'high';
  if (sampleSize >= 3) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Algorithmic estimation
// ---------------------------------------------------------------------------

/**
 * Estimate monthly rent from property characteristics using a layered
 * heuristic:
 *
 *   1.  Base rent = price × rent-to-price ratio (varies by price tier)
 *   2.  Adjusted by bedroom count, square footage, age, and property type
 *   3.  Returns low / mid / high range (±10 %)
 */
export function estimateRent(property: PropertyData): RentalEstimate {
  const { price, bedrooms, sqft, yearBuilt, propertyType } = property;

  // --- 1. Base rent from price tier ----------------------------------------
  //  Lower-priced properties tend to have higher rent-to-price ratios.
  let rentRatio: number;
  if (price <= 100_000)      rentRatio = 0.011;   // 1.1 %
  else if (price <= 200_000) rentRatio = 0.009;   // 0.9 %
  else if (price <= 350_000) rentRatio = 0.008;   // 0.8 %
  else if (price <= 500_000) rentRatio = 0.007;   // 0.7 %
  else if (price <= 750_000) rentRatio = 0.006;   // 0.6 %
  else                       rentRatio = 0.005;   // 0.5 %

  let baseRent = price * rentRatio;

  // --- 2. Adjustments -------------------------------------------------------
  // Bedroom multiplier
  if (bedrooms >= 5)      baseRent *= 1.20;
  else if (bedrooms >= 4) baseRent *= 1.12;
  else if (bedrooms >= 3) baseRent *= 1.05;
  else if (bedrooms <= 1) baseRent *= 0.85;

  // Square footage
  if (sqft > 3000)       baseRent *= 1.12;
  else if (sqft > 2000)  baseRent *= 1.06;
  else if (sqft < 800)   baseRent *= 0.90;

  // Building age
  const age = new Date().getFullYear() - (yearBuilt || 2000);
  if (age <= 5)       baseRent *= 1.08;
  else if (age <= 15) baseRent *= 1.03;
  else if (age > 50)  baseRent *= 0.92;

  // Property type
  const type = (propertyType || '').toLowerCase();
  if (type.includes('multi') || type.includes('duplex') || type.includes('triplex')) {
    baseRent *= 1.15;  // multi-family premium
  } else if (type.includes('condo') || type.includes('townhouse')) {
    baseRent *= 0.95;
  }

  // --- 3. Range -------------------------------------------------------------
  const mid = Math.round(baseRent);
  const low = Math.round(mid * 0.90);
  const high = Math.round(mid * 1.10);

  return { low, mid, high, confidence: 'medium' };
}

// ---------------------------------------------------------------------------
// Blending API comps + algorithmic estimate
// ---------------------------------------------------------------------------

/**
 * Combine API-sourced rental comps with our algorithmic estimate.
 *
 *  - If we have ≥ 3 API comps, the API average is weighted 70 / 30 with
 *    the algorithm.
 *  - If we have 1-2 API comps, 50 / 50.
 *  - If no API comps, pure algorithm.
 */
export function combineEstimates(
  apiComps: RentalComp[],
  algorithmicEstimate: RentalEstimate,
  property?: PropertyData,
): RentalEstimate {
  const plausibleComps = property ? filterPlausibleRentalComps(apiComps, property) : apiComps;

  if (plausibleComps.length === 0) {
    return { ...algorithmicEstimate, confidence: 'low' };
  }

  const apiAvg = plausibleComps.reduce((sum, c) => sum + c.rent, 0) / plausibleComps.length;
  const apiWeight = plausibleComps.length >= 3 ? 0.70 : 0.50;
  const algoWeight = 1 - apiWeight;

  const blendedMid = Math.round(apiAvg * apiWeight + algorithmicEstimate.mid * algoWeight);
  const low = Math.round(blendedMid * 0.90);
  const high = Math.round(blendedMid * 1.10);

  return {
    low,
    mid: blendedMid,
    high,
    confidence: plausibleComps.length >= 3 ? 'high' : 'medium',
    comps: plausibleComps,
  };
}

// ---------------------------------------------------------------------------
// Zillow area-market calibration
// ---------------------------------------------------------------------------

/**
 * Anchor a rent estimate to Zillow's area rental-market median.
 *
 * When Zillow reports a median rent for the area, we treat it as a real
 * market signal: the estimate is blended toward the median (while keeping the
 * property-specific adjustments from the algorithm). Confidence reflects the
 * amount of market sample data behind the median. Returns the estimate
 * unchanged when no Zillow median is available.
 */
export function applyZillowMarketRent(
  estimate: RentalEstimate,
  trends: RentalMarketTrends | undefined | null,
): RentalEstimate {
  const median = trends?.medianRent;
  if (!median || median <= 0) return estimate;

  // Lean on the Zillow market median (real data) while preserving the
  // property-specific signal (beds / sqft / age) from the algorithm.
  const ZILLOW_WEIGHT = 0.65;
  const blendedMid = Math.round(median * ZILLOW_WEIGHT + estimate.mid * (1 - ZILLOW_WEIGHT));

  return {
    low: Math.round(blendedMid * 0.9),
    mid: blendedMid,
    high: Math.round(blendedMid * 1.1),
    confidence: getMarketRentConfidence(trends),
    comps: estimate.comps,
  };
}

// ---------------------------------------------------------------------------
// Location-aware calibration for comparable properties
// ---------------------------------------------------------------------------

interface CalibrationContext {
  /** Market statistics for the subject property's ZIP (from RentCast). */
  marketStats?: MarketStatistics | null;
  /** Subject property's blended rental estimate (API-backed when available). */
  subjectRentalEstimate?: RentalEstimate;
  /** Subject property data (used for rent-per-sqft anchoring). */
  subjectProperty?: PropertyData;
}

/**
 * Calibrate an algorithmic rent estimate for a comparable property using
 * the subject property's market data and blended rent as anchors.
 *
 * Two calibration layers (blended together):
 *
 *  1. **Market-stats calibration** — if we have the area's median rent from
 *     RentCast market stats AND the algorithmic estimate for the subject,
 *     compute a local correction factor and apply it to the comp's estimate.
 *
 *  2. **Subject-anchored calibration** — use the subject's API-backed
 *     rent-per-sqft to produce a second estimate for the comp, then blend
 *     it 50/50 with the adjusted algorithmic estimate.
 *
 * Returns an adjusted `RentalEstimate` with updated confidence.
 */
export function calibrateEstimate(
  compEstimate: RentalEstimate,
  compSqft: number,
  ctx: CalibrationContext,
): RentalEstimate {
  let calibratedMid = compEstimate.mid;
  let hasCalibration = false;

  // --- Layer 1: market-stats correction factor ---
  // Compare subject's algorithmic estimate to area median rent.
  // If the area median rent is e.g. 30% higher than the algo estimate for the
  // subject, the algo is under-predicting for this market → scale up comps too.
  if (ctx.marketStats?.medianRent && ctx.subjectProperty) {
    const subjectAlgorithmic = estimateRent(ctx.subjectProperty);
    if (subjectAlgorithmic.mid > 0) {
      const correctionFactor = ctx.marketStats.medianRent / subjectAlgorithmic.mid;
      // Clamp the correction to avoid extreme swings (0.5× – 2.0×)
      const clampedFactor = Math.max(0.5, Math.min(2.0, correctionFactor));
      calibratedMid = Math.round(calibratedMid * clampedFactor);
      hasCalibration = true;
    }
  }

  // --- Layer 2: subject-anchored rent-per-sqft ---
  // If the subject has an API-backed rent estimate, derive rent/sqft and
  // project it onto the comp's sqft, then blend 50/50 with the above.
  if (ctx.subjectRentalEstimate && ctx.subjectProperty && compSqft > 0) {
    const subjectSqft = ctx.subjectProperty.sqft;
    if (subjectSqft > 0 && ctx.subjectRentalEstimate.mid > 0) {
      const subjectRentPerSqft = ctx.subjectRentalEstimate.mid / subjectSqft;
      const anchoredEstimate = Math.round(subjectRentPerSqft * compSqft);
      calibratedMid = Math.round((calibratedMid + anchoredEstimate) / 2);
      hasCalibration = true;
    }
  }

  if (!hasCalibration) {
    return { ...compEstimate, confidence: 'low' };
  }

  return {
    low: Math.round(calibratedMid * 0.90),
    mid: calibratedMid,
    high: Math.round(calibratedMid * 1.10),
    confidence: 'medium',
  };
}
