/**
 * Rental Estimation Service
 *
 * Provides algorithmic rental estimates and blends them with API-sourced
 * comps when available.  All functions are stateless & pure — easy to test
 * and safe to call from any context (routes, scripts, game generators).
 */

import type { PropertyData, RentalComp, RentalEstimate } from '@deal-platform/shared-types';

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
): RentalEstimate {
  if (apiComps.length === 0) {
    return { ...algorithmicEstimate, confidence: 'low' };
  }

  const apiAvg = apiComps.reduce((sum, c) => sum + c.rent, 0) / apiComps.length;
  const apiWeight = apiComps.length >= 3 ? 0.70 : 0.50;
  const algoWeight = 1 - apiWeight;

  const blendedMid = Math.round(apiAvg * apiWeight + algorithmicEstimate.mid * algoWeight);
  const low = Math.round(blendedMid * 0.90);
  const high = Math.round(blendedMid * 1.10);

  return {
    low,
    mid: blendedMid,
    high,
    confidence: apiComps.length >= 3 ? 'high' : 'medium',
    comps: apiComps,
  };
}
