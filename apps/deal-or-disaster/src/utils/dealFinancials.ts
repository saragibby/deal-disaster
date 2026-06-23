import { DealClassification, DealFinancials, Lien, PropertyCase, RedFlag } from '../types';

/**
 * Canonical financial model for Deal or Disaster.
 *
 * Every screen renders from `computeDeal()` so the case summary, win/loss
 * banner, financial analysis calculator, and the "why this scoring" footer can
 * never disagree (fixes bugs A–G).
 *
 * NOTE: A mirror of this logic lives in
 * `server/src/services/foreclosureGenerator.ts` (validation gate). If you change
 * the formula or thresholds here, update it there too.
 */

/** Closing costs as a fraction of the auction price. */
export const CLOSING_RATE = 0.025;

/** ROI at/above this is a clear GOOD/BUY deal. */
export const GOOD_ROI_THRESHOLD = 0.15;

/**
 * Whether a lien survives the foreclosure sale (the buyer inherits the debt).
 * Prefers the explicit `survivesForeclosure` flag; falls back to inferring from
 * the lien type for legacy/AI-generated data that omits the flag.
 */
export function lienSurvives(lien: Lien): boolean {
  if (typeof lien.survivesForeclosure === 'boolean') {
    return lien.survivesForeclosure;
  }

  const type = lien.type.toLowerCase();

  // Mortgages, HELOCs and junior liens are wiped at sale. Check these first so
  // a stray substring (e.g. "irs" inside "fIRSt mortgage") can't misclassify.
  const wipedPatterns = [/\bmortgage\b/, /\bheloc\b/];
  if (wipedPatterns.some((p) => p.test(type))) {
    return false;
  }

  // Senior obligations that survive a foreclosure sale. Word boundaries keep
  // short tokens (irs, tax) from matching inside unrelated words.
  const survivingPatterns = [
    /federal tax/,
    /\birs\b/,
    /property[\s-]?tax/,
    /county tax/,
    /tax lien/, // catches generic tax liens (property/federal)
    /code[\s-]?enforcement/,
    /municipal/,
    /superpriority|super[\s-]priority/,
    /mechanic/, // mechanics/contractor liens
    /contractor/,
    /child[\s-]?support/,
  ];
  return survivingPatterns.some((p) => p.test(type));
}

/**
 * Midpoint dollar cost an issue adds to the deal, if any.
 *
 * Only explicit `costLow`/`costHigh` contribute to the P&L. Issues that merely
 * mirror a surviving lien carry their dollar figure in `impact` text (for
 * display) but no cost fields, so they are counted once via the lien stack and
 * never double-counted here.
 */
export function issueCost(flag: RedFlag): number {
  const low = typeof flag.costLow === 'number' ? flag.costLow : undefined;
  const high = typeof flag.costHigh === 'number' ? flag.costHigh : undefined;

  if (low !== undefined && high !== undefined) {
    return Math.round((low + high) / 2);
  }
  if (low !== undefined) return low;
  if (high !== undefined) return high;
  return 0;
}

/** Classify a deal from its ROI. */
export function classifyRoi(roi: number): DealClassification {
  if (roi >= GOOD_ROI_THRESHOLD) return 'GOOD';
  if (roi >= 0) return 'MARGINAL';
  return 'BAD';
}

/**
 * Whether the player has uncovered the property's redemption-period risk. The
 * redemption carrying cost only hits the live (discovery-gated) P&L once a
 * redemption-related document has actually been inspected.
 */
export function redemptionDiscovered(caseData: PropertyCase): boolean {
  return (caseData.redFlags ?? []).some(
    (f) => f.discovered && /redemption/i.test(`${f.description} ${f.hiddenIn} ${f.impact ?? ''}`)
  );
}

/**
 * Format an ROI fraction as a signed percentage string, e.g. 0.181 -> "+18.1%",
 * -0.468 -> "-46.8%". Never produces "+-".
 */
export function formatPct(roi: number): string {
  const pct = roi * 100;
  const sign = pct > 0 ? '+' : ''; // negative numbers already carry "-"
  return `${sign}${pct.toFixed(1)}%`;
}

export interface ComputeDealOptions {
  /**
   * When true, only issues the player has actually discovered contribute their
   * cost to the P&L (used for a live, in-progress estimate). Defaults to false,
   * which reflects the full, true economics of the deal for the final analysis.
   */
  discoveredOnly?: boolean;
}

/**
 * Compute the full, canonical financial picture for a case.
 */
export function computeDeal(
  caseData: PropertyCase,
  options: ComputeDealOptions = {}
): DealFinancials {
  const { discoveredOnly = false } = options;

  const preForeclosureValue = caseData.propertyValue;
  // Single resale anchor: the property's market value. We deliberately do NOT
  // use a separate, lower "after issues" valuation (the old `actualValue`) —
  // every cost that erodes the deal is an explicit, inspectable line item
  // (repairs, surviving liens, occupancy, redemption, issue costs) so beginners
  // only ever reason about one headline number.
  const resaleValue = caseData.propertyValue;
  const baseRepairs = caseData.repairEstimate;
  const closingCosts = Math.round(caseData.auctionPrice * CLOSING_RATE);

  const survivingLiens = (caseData.liens ?? [])
    .filter(lienSurvives)
    .reduce((sum, lien) => sum + (lien.amount || 0), 0);

  const issueCosts = (caseData.redFlags ?? [])
    .filter((flag) => flag.severity !== 'red-herring')
    .filter((flag) => (discoveredOnly ? flag.discovered : true))
    .reduce((sum, flag) => sum + issueCost(flag), 0);

  // Occupancy is visible from the listing, so its eviction/holding cost always
  // counts. Redemption risk is a title/county discovery, so in the live
  // (discoveredOnly) view it only counts once the player has inspected it.
  const occupancyCost = caseData.occupancyCost ?? 0;
  const redemptionApplies = !discoveredOnly || redemptionDiscovered(caseData);
  const redemptionCost = redemptionApplies ? caseData.redemptionCost ?? 0 : 0;

  const totalInvestment =
    caseData.auctionPrice +
    baseRepairs +
    issueCosts +
    survivingLiens +
    occupancyCost +
    redemptionCost +
    closingCosts;

  const netProfit = resaleValue - totalInvestment;
  const roi = totalInvestment > 0 ? netProfit / totalInvestment : 0;

  const spreadBeforeCosts =
    caseData.propertyValue - caseData.auctionPrice - caseData.repairEstimate;

  return {
    preForeclosureValue,
    resaleValue,
    closingRate: CLOSING_RATE,
    closingCosts,
    baseRepairs,
    issueCosts,
    survivingLiens,
    occupancyCost,
    redemptionCost,
    totalInvestment,
    netProfit,
    roi,
    classification: classifyRoi(roi),
    spreadBeforeCosts,
  };
}
