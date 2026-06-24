/**
 * expenseDefaultsService
 * ----------------------
 * Location- and property-aware defaults for carrying costs that we don't get
 * directly from a listing. Used to replace the old flat $2,500 property-tax /
 * $1,500 insurance assumptions with values that scale with the home's price and
 * its state, so the cash-flow and verdict are meaningfully more accurate when no
 * real figure is available.
 *
 * Pure functions, no I/O — safe to call from routes, scripts, or generators.
 */

/** National fallback effective property-tax rate (annual % of home value). */
const NATIONAL_PROPERTY_TAX_RATE = 0.011;

/**
 * Effective annual property-tax rate by state (median tax / median home value,
 * approximate, Tax Foundation / ATTOM). Expressed as a decimal fraction.
 */
const STATE_PROPERTY_TAX_RATES: Record<string, number> = {
  AL: 0.0041, AK: 0.0119, AZ: 0.0063, AR: 0.0062, CA: 0.0075,
  CO: 0.0055, CT: 0.0215, DE: 0.0058, DC: 0.0057, FL: 0.0091,
  GA: 0.0092, HI: 0.0032, ID: 0.0069, IL: 0.0223, IN: 0.0084,
  IA: 0.0157, KS: 0.0143, KY: 0.0085, LA: 0.0056, ME: 0.0124,
  MD: 0.0107, MA: 0.0120, MI: 0.0148, MN: 0.0111, MS: 0.0079,
  MO: 0.0098, MT: 0.0074, NE: 0.0167, NV: 0.0059, NH: 0.0209,
  NJ: 0.0247, NM: 0.0080, NY: 0.0173, NC: 0.0082, ND: 0.0100,
  OH: 0.0159, OK: 0.0090, OR: 0.0093, PA: 0.0158, RI: 0.0163,
  SC: 0.0057, SD: 0.0117, TN: 0.0071, TX: 0.0180, UT: 0.0063,
  VT: 0.0190, VA: 0.0087, WA: 0.0098, WV: 0.0059, WI: 0.0173,
  WY: 0.0061,
};

/** Base annual homeowners-insurance rate (fraction of home value). */
const BASE_INSURANCE_RATE = 0.005;

/** Minimum sensible annual insurance premium. */
const INSURANCE_FLOOR = 600;

/**
 * State catastrophe-risk multipliers applied to the base insurance rate.
 * High-risk (hurricane/tornado/wildfire) states cost more; mild states less.
 * Unlisted states use 1.0.
 */
const STATE_INSURANCE_FACTORS: Record<string, number> = {
  FL: 2.6, LA: 2.3, OK: 1.9, TX: 1.7, KS: 1.6,
  NE: 1.6, CO: 1.5, MS: 1.4, AL: 1.3, AR: 1.3,
  SD: 1.3, MO: 1.2, IA: 1.2, KY: 1.2, GA: 1.1,
  SC: 1.1, NC: 1.1, CA: 1.1,
  HI: 0.7, VT: 0.7, NH: 0.7, ME: 0.7, OR: 0.7,
  WA: 0.8, UT: 0.8, WI: 0.8, ID: 0.8,
};

function normalizeState(state: string | undefined): string {
  return (state || '').trim().toUpperCase();
}

/**
 * Estimate the annual property tax for a home when no real tax record exists.
 * Scales the purchase price by the state's effective tax rate.
 */
export function estimateAnnualPropertyTax(price: number, state?: string): number {
  if (!price || price <= 0) return 0;
  const rate = STATE_PROPERTY_TAX_RATES[normalizeState(state)] ?? NATIONAL_PROPERTY_TAX_RATE;
  return Math.round(price * rate);
}

/**
 * Estimate the annual homeowners-insurance premium when none is provided.
 * Scales the purchase price by a base rate and the state's catastrophe factor.
 */
export function estimateAnnualInsurance(price: number, state?: string): number {
  if (!price || price <= 0) return INSURANCE_FLOOR;
  const factor = STATE_INSURANCE_FACTORS[normalizeState(state)] ?? 1.0;
  return Math.max(INSURANCE_FLOOR, Math.round(price * BASE_INSURANCE_RATE * factor));
}

/** Fallback maintenance reserves (% of rent) when the build year is unknown. */
const DEFAULT_REPAIRS_PCT = 10;
const DEFAULT_CAPEX_PCT = 10;

/**
 * Estimate repairs & capex reserves (each as a % of monthly rent) from the
 * home's age. Older homes need larger maintenance and capital-expenditure
 * reserves; newer construction needs less. Falls back to the flat defaults when
 * the build year is missing or implausible.
 */
export function estimateMaintenancePct(
  yearBuilt?: number,
): { repairsPct: number; capexPct: number } {
  const currentYear = new Date().getFullYear();
  if (!yearBuilt || yearBuilt < 1800 || yearBuilt > currentYear + 1) {
    return { repairsPct: DEFAULT_REPAIRS_PCT, capexPct: DEFAULT_CAPEX_PCT };
  }
  const age = currentYear - yearBuilt;
  if (age <= 10) return { repairsPct: 6, capexPct: 6 };
  if (age <= 25) return { repairsPct: 8, capexPct: 8 };
  if (age <= 50) return { repairsPct: 10, capexPct: 11 };
  return { repairsPct: 12, capexPct: 13 };
}

/** Single-family midpoint for cost-segregation reclassification. */
const DEFAULT_COST_SEG_PCT = 22.5;

/**
 * Estimate the cost-segregation reclassification percentage (share of basis
 * moved to short-life property) from the property type. Multifamily reclassifies
 * more; condos/manufactured homes less. Falls back to a single-family midpoint.
 */
export function estimateCostSegPct(propertyType?: string): number {
  const t = (propertyType || '').toLowerCase();
  if (/(multi|duplex|triplex|fourplex|4-?plex|2-?4|apartment)/.test(t)) return 28;
  if (/(condo|townhouse|town_?house|townhome|co-?op|coop)/.test(t)) return 20;
  if (/(manufactured|mobile)/.test(t)) return 15;
  return DEFAULT_COST_SEG_PCT;
}
