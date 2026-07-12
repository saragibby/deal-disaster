import type { ReactNode } from 'react';

// ===== Property & Game Types =====

/** Grouping for the lien library; drives survival rules and education. */
export type LienCategory =
  | 'mortgage'
  | 'junior-mortgage'
  | 'property-tax'
  | 'federal-tax'
  | 'state-tax'
  | 'hoa'
  | 'hoa-super-priority'
  | 'mechanics'
  | 'judgment'
  | 'child-support'
  | 'code-enforcement'
  | 'municipal-utility'
  | 'special-assessment'
  | 'environmental'
  | 'lis-pendens';

/** Who is living in the property at the time of sale. */
export type OccupantType = 'vacant' | 'owner' | 'tenant' | 'squatter';

export interface Lien {
  type: string;
  holder: string;
  amount: number;
  priority: number;
  notes?: string;
  /** Library grouping for this lien (drives default survival + education). */
  category?: LienCategory;
  /** Whether the buyer inherits this debt after the sale. When omitted,
   *  dealFinancials infers survival from the lien type. */
  survivesForeclosure?: boolean;
  /** One-sentence teaching note surfaced in the post-game breakdown. */
  educationalNote?: string;
}

export interface RedFlag {
  id: string;
  description: string;
  severity: 'red-herring' | 'low' | 'medium' | 'high' | 'severe';
  hiddenIn: string;
  discovered: boolean;
  impact?: string;
  question?: string;
  choices?: string[];
  correctChoice?: number;
  userAnswer?: number;
  answerExplanation?: string;
}

export interface PropertyCase {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyValue: number;
  auctionPrice: number;
  repairEstimate: number;
  repairEstimateMin?: number;
  repairEstimateMax?: number;
  liens: Lien[];
  redFlags: RedFlag[];
  photos: string[];
  photoUrls?: string[];
  description: string;
  occupancyStatus: 'vacant' | 'occupied' | 'unknown';
  /** Richer occupancy detail. When set, drives the eviction/holding cost.
   *  occupancyStatus is kept for back-compat and derived from this. */
  occupant?: OccupantType;
  /** Eviction / cash-for-keys / holding cost applied when the property is not
   *  vacant. Flows into the scored P&L. */
  occupancyCost?: number;
  /** Statutory redemption window (days) during which the former owner can
   *  reclaim the property. 0 / undefined means no redemption right. */
  redemptionPeriodDays?: number;
  /** Carrying cost incurred because the property cannot be resold until the
   *  redemption window closes. Flows into the P&L once discovered. */
  redemptionCost?: number;
  hoaFees?: number;
  actualValue: number;
  isGoodDeal: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  correctDecision?: 'BUY' | 'INVESTIGATE' | 'WALK_AWAY';
  decisionExplanation?: string;
  propertyType?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
}

export type Decision = 'BUY' | 'INVESTIGATE' | 'WALK_AWAY' | null;

export interface GameScore {
  points: number;
  casesSolved: number;
  goodDeals: number;
  badDealsAvoided: number;
  mistakes: number;
  redFlagsFound: number;
  redFlagCorrect: number;
  redFlagMistakes: number;
}

export interface ScoreResult {
  points: number;
  message: string;
  explanation: string;
  userDecision?: Decision;
  investigationPoints?: number;
  decisionPoints?: number;
}

// ===== User & Auth Types =====

export interface User {
  id: number;
  email: string;
  name: string;
  avatar?: string;
  username?: string;
  is_admin?: boolean;
  onboarding_completed?: boolean;
  oauth_provider?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ===== Portal Types =====

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  shortDescription: string;
  path: string;
  icon: string;
  status: 'live' | 'coming-soon' | 'beta';
  category: string;
  color: string;
  is_featured?: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'news' | 'update' | 'tip';
  is_active: boolean;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  name: string;
  avatar?: string;
  total_points: number;
  games_played: number;
}

export interface UserStats {
  lifetimePoints: number;
  currentStreak: number;
  dealsFound: number;
  disastersAvoided: number;
}

// ===== Resources & Tools Types =====

export interface Resource {
  id: number;
  title: string;
  description: string;
  content?: string;          // full content — only sent to authenticated users
  type: 'article' | 'video' | 'guide' | 'external';
  url?: string;
  category: string;
  is_premium: boolean;       // if true, only preview shown to unauthenticated
  is_featured: boolean;      // if true, highlighted and sorted first
  sort_order: number;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export interface Tool {
  id: number;
  name: string;
  description: string;
  content?: string;          // full content / embed / instructions — auth-gated
  type: 'calculator' | 'checklist' | 'template' | 'spreadsheet' | 'external';
  url?: string;
  category: string;
  icon: string;
  is_premium: boolean;
  is_featured: boolean;      // if true, highlighted on dashboard home
  sort_order: number;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'user' | 'admin';

// ===== Property Analyzer Types =====

export interface RentalMarketTrends {
  areaName: string;
  medianRent: number;
  monthlyChange: number;
  yearlyChange: number;
  availableRentals: number;
  marketTemperature: string;
  rentHistogram?: Array<{ price: number; count: number }>;
  medianRentOverTime?: {
    currentYear: Array<{ month: string; year: string; price: number }>;
    prevYear: Array<{ month: string; year: string; price: number }>;
  };
  nationalMedianRent?: number;
}

export interface HousingMarket {
  areaName: string;
  typicalHomeValue: number;
  medianSalePrice: number;
  medianListPrice: number;
  saleToListRatio: number;
  pctSoldAboveList: number;
  pctSoldBelowList: number;
  medianDaysToPending: number;
  forSaleInventory: number;
  newListings: number;
  zhviTimeSeries: Array<{ date: string; value: number }>;
}

export interface PropertyData {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  zestimate?: number;
  rentZestimate?: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize?: number;
  yearBuilt: number;
  propertyType?: string;
  description?: string;
  photos?: string[];
  taxHistory?: Array<{ year: number; amount: number }>;
  priceHistory?: Array<{ date: string; price: number; event: string }>;
  rentalMarketTrends?: RentalMarketTrends;
  housingMarket?: HousingMarket;
  homeStatus?: string;
  hoaFee?: number;
  latitude?: number;
  longitude?: number;
  zillowUrl?: string;
}

export interface PropertySummary {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  photo?: string;
}

export interface RentalComp {
  address?: string;
  rent: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  distance?: number;
  source: 'api' | 'estimate' | 'rentcast';
}

export interface RentalEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: 'low' | 'medium' | 'high';
  comps?: RentalComp[];
}

export interface AnalysisParams {
  downPaymentPct: number;
  interestRate: number;
  loanTermYears: number;
  vacancyPct: number;
  repairsPct: number;
  capexPct: number;
  managementPct: number;
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHoa: number;
  costSegPct: number;
  taxRate: number;
  offerPrice: number;
  rentOverride: number;

  // ── Furnished-strategy costs (MTR / STR) ──────────────────────────
  // Optional. Defaults are derived per-property when a furnished strategy
  // is first selected (see calculations.deriveFurnishedDefaults).
  furnishingCost?: number;        // one-time, furniture + decor
  applianceCost?: number;         // one-time, appliances / electronics
  furnishingLifeYears?: number;   // amortization horizon for the above
  furnitureRepairMonthly?: number;// recurring repair/replacement of furniture & appliances
  cleaningMonthly?: number;       // recurring cleaning not already in the estimate (MTR)
}

/**
 * User-made adjustments to a saved analysis. Persisted alongside the analysis
 * so manual fine-tuning is restored on reload and reflected in property
 * comparisons. `params` holds only the keys the user changed from the model's
 * estimate baseline (a diff), so untouched estimates can still self-heal on
 * re-analyze and the "Custom / Estimated" badges keep working.
 */
export interface AnalysisUserOverrides {
  selectedStrategy?: 'ltr' | 'mtr' | 'str' | null;
  mtrRevenue?: number | null;
  strRevenue?: number | null;
  operating?: Record<string, number>;
  furniture?: number | null;
  appliances?: number | null;
  params?: Partial<AnalysisParams>;
  /** How furniture/appliance upfront costs are depreciated in year 1. */
  depreciationMethod?: 'full' | 'straight';
}

export const DEFAULT_ANALYSIS_PARAMS: AnalysisParams = {
  downPaymentPct: 20,
  interestRate: 7.0,
  loanTermYears: 30,
  vacancyPct: 8,
  repairsPct: 10,
  capexPct: 10,
  managementPct: 0,
  annualPropertyTax: 2500,
  annualInsurance: 1500,
  monthlyHoa: 0,
  costSegPct: 22.5,
  taxRate: 20,
  offerPrice: 0,
  rentOverride: 0,
};

// ── Rental strategy + generic cash-flow line-item model ─────────────

export type RentalStrategy = 'ltr' | 'mtr' | 'str';

export interface CashFlowLine {
  /** Stable key for the line (used for React keys / adjust wiring). */
  key: string;
  label: string;
  /** Monthly amount (income/expense) or one-time amount (cash invested). */
  amount: number;
  /** Whether this line is user-adjustable via the params panel. */
  adjustable?: boolean;
  /** Source/category badge text, e.g. 'Estimated', 'From AirDNA'. */
  badge?: string;
  /** Optional caption shown under the line (e.g. occupancy assumption). */
  note?: string;
}

export interface StrategyCashFlow {
  strategy: RentalStrategy;
  /** Gross monthly income lines (usually one). */
  incomeLines: CashFlowLine[];
  /** Monthly expense lines. */
  expenseLines: CashFlowLine[];
  /** One-time costs that increase cash invested (ROI denominator). */
  cashInvestedLines: CashFlowLine[];
  /** Derived totals. */
  monthlyIncome: number;
  totalMonthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  /** Break-even monthly income required to cover every cost. */
  breakEvenIncome: number;
  /** Occupancy assumption (0-1) for MTR/STR, undefined for LTR. */
  occupancyRate?: number;
}

export interface MortgageBreakdown {
  monthlyPayment: number;
  loanAmount: number;
  downPayment: number;
  totalInterest: number;
}

export interface CashFlowBreakdown {
  monthlyRent: number;
  monthlyMortgage: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyHoa: number;
  monthlyVacancy: number;
  monthlyRepairs: number;
  monthlyCapex: number;
  monthlyManagement: number;
  totalMonthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
}

export interface ROIMetrics {
  totalCashInvested: number;
  cashOnCashROI: number;
  capRate: number;
  grossRentMultiplier: number;
}

export interface TaxSavingsBreakdown {
  purchasePrice: number;
  depreciationDeduction: number;
  taxSavings: number;
  effectiveFirstYearReturn: number;
  /** Year-1 depreciation on the building via cost segregation. */
  buildingDepreciation?: number;
  /** Furniture + appliance cost basis eligible for personal-property depreciation. */
  personalPropertyBasis?: number;
  /** Year-1 depreciation taken on furniture + appliances (method-dependent). */
  personalPropertyDepreciation?: number;
}

export interface ComparableProperty {
  zpid: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSize?: number;
  yearBuilt?: number;
  homeStatus?: string;
  homeType?: string;
  photo?: string;
  estimatedRent: number;
  pricePerSqft: number;
  rentPerSqft: number;
  rentConfidence?: 'low' | 'medium' | 'high';
  rentSource?: 'algorithm' | 'market-calibrated';
  latitude?: number;
  longitude?: number;
  zillowUrl?: string;
}

export interface STRSeasonalityMonth {
  month: string;
  revenue: number;
  occupancy: number;              // 0-1
}

export interface STRRevenueRange {
  low: number;
  mid: number;
  high: number;
}

export interface STRMarketContext {
  activeListings: number;
  avgRating?: number;
  supplyGrowth?: number;          // YoY percentage, e.g. 0.08 = +8%
}

export interface STREstimate {
  nightlyRate: number;
  occupancyRate: number;          // 0-1
  grossMonthlyRevenue: number;
  cleaningCosts: number;
  platformFees: number;
  netMonthlyRevenue: number;
  confidence: 'low' | 'medium' | 'high';
  source: 'algorithm' | 'airdna' | 'mashvisor';
  seasonality?: STRSeasonalityMonth[];
  revenueRange?: STRRevenueRange;
  marketContext?: STRMarketContext;
}

// ── Mid-Term Rental (MTR) Types ──────────────────────────────────────────

export interface NearbyInstitution {
  name: string;
  emoji: string;
  miles: number;
}

export interface MTRDemandFactors {
  bedroomScore: number;           // 0-100 — 2-3BR ideal for MTR
  propertyTypeScore: number;      // 0-100 — SFH & townhouse preferred
  overallScore: number;           // 0-100 — weighted composite
  nearbyInstitutions?: NearbyInstitution[];  // hospitals, bases, universities within ~10mi
}

export type FurnishingQuality = 'budget' | 'standard' | 'premium';

export interface FurnishingCostBreakdown {
  perBedroomCost: number;
  commonAreaCost: number;
  totalCost: number;
  amortizedMonthly: number;       // totalCost / (usefulLifeYears × 12)
  usefulLifeYears: number;
  quality: FurnishingQuality;
}

export interface MTRSeasonalityMonth {
  month: string;
  revenue: number;
  occupancy: number;              // 0-1
}

export interface MTRRevenueRange {
  low: number;
  mid: number;
  high: number;
}

/** A single furnished comparable pulled from a real MTR marketplace. */
export interface MTRComp {
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  monthlyRate: number;            // furnished monthly rent, USD
}

/** Real furnished comps + the area they were pulled from (e.g. Furnished Finder). */
export interface MTRMarketComps {
  radiusMiles: number;            // search radius used to gather comps
  sampleSize: number;             // bedroom-matched comps used for the rate
  totalListings: number;          // total furnished listings found in the area
  comps: MTRComp[];               // comparable listings (capped for display)
}

export interface MTREstimate {
  monthlyRate: number;
  furnishedPremium: number;       // multiplier over LTR, e.g. 1.35
  occupancyRate: number;          // 0-1
  avgStayMonths: number;
  turnoversPerYear: number;
  grossMonthlyRevenue: number;
  utilityCosts: number;
  turnoverCosts: number;          // amortized monthly
  platformFees: number;
  managementCosts: number;
  netMonthlyRevenue: number;
  furnishingCosts: FurnishingCostBreakdown;
  demandFactors: MTRDemandFactors;
  confidence: 'low' | 'medium' | 'high';
  source: 'algorithm' | 'furnished-finder' | 'padsplit';
  seasonality?: MTRSeasonalityMonth[];
  revenueRange?: MTRRevenueRange;
  /** Real furnished comps from a marketplace (present when source !== algorithm). */
  marketComps?: MTRMarketComps;
}

// ─────────────────────────────────────────────────────────────────────────

export interface MarketStatistics {
  medianRent: number;
  averageRent: number;
  rentGrowthPct: number;        // YoY percentage e.g. 3.5 = 3.5%
  totalListings: number;
  avgDaysOnMarket: number;
  rentTrend: 'rising' | 'stable' | 'declining';
}

// ── Strategy Comparison (single source of truth) ──────────────────────────

export type StrategyKey = 'LTR' | 'MTR' | 'STR';

export interface StrategyMetrics {
  key: StrategyKey;
  label: string;
  available: boolean;
  /** Gross monthly rent/revenue before any costs. */
  grossMonthly: number;
  /** Net of the strategy's own operating costs, BEFORE mortgage/tax/insurance/HOA. */
  netRentalIncome: number;
  /**
   * Net cash flow AFTER the shared property carrying costs (mortgage + property
   * tax + insurance + HOA).  This is the canonical apples-to-apples figure used
   * to rank strategies.
   */
  netCashFlow: number;
  confidence?: 'low' | 'medium' | 'high';
  source?: string;
}

export interface StrategyComparison {
  /** All three strategies; only `available` ones participate in ranking. */
  strategies: StrategyMetrics[];
  bestKey: StrategyKey;
  bestNetCashFlow: number;
}

// ── Deal Verdict (deterministic decision-first summary) ───────────────────

export type DealRating = 'strong' | 'marginal' | 'caution';

export interface DealVerdictReason {
  code: string;
  /** Short, plain-language statement shown to the user. */
  label: string;
  impact: 'positive' | 'neutral' | 'negative';
}

export interface DealVerdict {
  rating: DealRating;
  /** 0-100 composite score. */
  score: number;
  /** One-line synthesis of the verdict. */
  headline: string;
  reasons: DealVerdictReason[];
}

export interface FullAnalysisResult {
  mortgage: MortgageBreakdown;
  cashFlow: CashFlowBreakdown;
  roi: ROIMetrics;
  taxSavings: TaxSavingsBreakdown;
  rentalEstimate: RentalEstimate;
  strEstimate?: STREstimate;
  mtrEstimate?: MTREstimate;
  comparables?: ComparableProperty[];
  marketStatistics?: MarketStatistics;
  /** Single source of truth for ranking LTR/MTR/STR by net cash flow. */
  strategyComparison?: StrategyComparison;
  /** Monthly rent at which LTR cash flow breaks even (cash flow = $0). */
  breakEvenRent?: number;
  /** Decision-first "is this a good deal?" verdict (deterministic rules). */
  verdict?: DealVerdict;
  dataSources?: {
    rental: 'algorithm' | 'rentcast' | 'blended' | 'zillow' | 'realtor';
    str: 'algorithm' | 'airdna';
    mtr: 'algorithm' | 'furnished-finder' | 'padsplit';
    hoa: 'zillow' | 'estimate' | 'none';
    tax?: 'actual' | 'estimate';
    insurance?: 'actual' | 'estimate';
  };
}

export interface StrategyComparisonInput {
  cashFlow: CashFlowBreakdown;
  rentalEstimate: RentalEstimate;
  strEstimate?: STREstimate;
  mtrEstimate?: MTREstimate;
  dataSources?: FullAnalysisResult['dataSources'];
}

/**
 * Single source of truth for comparing rental strategies.
 *
 * Every strategy is reduced to a consistent NET CASH FLOW — net of its own
 * operating costs AND the shared property carrying costs (mortgage, property
 * tax, insurance, HOA) — so LTR/MTR/STR are ranked apples-to-apples.  This is
 * the ONLY place "best strategy" should be decided; all UI must read from here.
 */
export function computeStrategyComparison(input: StrategyComparisonInput): StrategyComparison {
  const { cashFlow, rentalEstimate, strEstimate, mtrEstimate, dataSources } = input;

  // Shared property carrying costs that apply regardless of rental strategy.
  const carryingCosts =
    cashFlow.monthlyMortgage +
    cashFlow.monthlyTax +
    cashFlow.monthlyInsurance +
    cashFlow.monthlyHoa;

  const round = (n: number) => Math.round(n * 100) / 100;

  // LTR — derived directly from the canonical cash-flow breakdown so it stays
  // consistent with the Cash Flow section.
  const ltrNetRentalIncome =
    cashFlow.monthlyRent -
    (cashFlow.monthlyVacancy +
      cashFlow.monthlyRepairs +
      cashFlow.monthlyCapex +
      cashFlow.monthlyManagement);

  const strategies: StrategyMetrics[] = [
    {
      key: 'LTR',
      label: 'Long-Term',
      available: true,
      grossMonthly: round(cashFlow.monthlyRent),
      netRentalIncome: round(ltrNetRentalIncome),
      netCashFlow: round(cashFlow.monthlyCashFlow),
      confidence: rentalEstimate.confidence,
      source: dataSources?.rental,
    },
  ];

  if (mtrEstimate) {
    strategies.push({
      key: 'MTR',
      label: 'Mid-Term',
      available: true,
      grossMonthly: round(mtrEstimate.grossMonthlyRevenue),
      netRentalIncome: round(mtrEstimate.netMonthlyRevenue),
      netCashFlow: round(mtrEstimate.netMonthlyRevenue - carryingCosts),
      confidence: mtrEstimate.confidence,
      source: dataSources?.mtr ?? mtrEstimate.source,
    });
  }

  if (strEstimate) {
    strategies.push({
      key: 'STR',
      label: 'Short-Term',
      available: true,
      grossMonthly: round(strEstimate.grossMonthlyRevenue),
      netRentalIncome: round(strEstimate.netMonthlyRevenue),
      netCashFlow: round(strEstimate.netMonthlyRevenue - carryingCosts),
      confidence: strEstimate.confidence,
      source: dataSources?.str ?? strEstimate.source,
    });
  }

  const best = strategies.reduce((a, b) => (b.netCashFlow > a.netCashFlow ? b : a));

  return {
    strategies,
    bestKey: best.key,
    bestNetCashFlow: best.netCashFlow,
  };
}

export interface DealVerdictInput {
  cashFlow: CashFlowBreakdown;
  roi: ROIMetrics;
  rentalEstimate: RentalEstimate;
  breakEvenRent?: number | null;
  comparables?: ComparableProperty[];
  marketStatistics?: MarketStatistics;
  /** Effective purchase price (offer price if set, otherwise list price). */
  price: number;
  /**
   * Strategy ranking (LTR/MTR/STR). When supplied, the verdict is scored
   * against the BEST strategy rather than assuming long-term, so a property
   * that only pencils out as a short-/mid-term rental is rated on that basis.
   */
  strategyComparison?: StrategyComparison;
}

/**
 * Deterministic, auditable "is this a good deal?" verdict.
 *
 * No AI — every input maps to an explicit, tunable threshold so the verdict is
 * fully explainable.  The AskWill assistant layers the plain-language narrative
 * on top; this function decides the rating.
 */
export function computeDealVerdict(input: DealVerdictInput): DealVerdict {
  const { cashFlow, roi, rentalEstimate, breakEvenRent, comparables, price, strategyComparison } = input;
  const reasons: DealVerdictReason[] = [];
  let score = 50;

  const dollars = (n: number) =>
    `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;

  // Score the verdict against the BEST strategy (LTR/MTR/STR), not just LTR.
  // For LTR these equal the canonical ROI, so behaviour is unchanged when
  // long-term wins. CoC/cap for an alt strategy are derived from its net cash
  // flow (cap rate adds back mortgage since it excludes debt service).
  const bestStrategy = strategyComparison?.strategies.find(
    (s) => s.key === strategyComparison.bestKey,
  );
  const usingAltStrategy = !!bestStrategy && bestStrategy.key !== 'LTR';
  const coc = usingAltStrategy && roi.totalCashInvested > 0
    ? ((bestStrategy!.netCashFlow * 12) / roi.totalCashInvested) * 100
    : roi.cashOnCashROI;
  const cap = usingAltStrategy && price > 0
    ? (((bestStrategy!.netCashFlow + cashFlow.monthlyMortgage) * 12) / price) * 100
    : roi.capRate;
  const confidence = bestStrategy ? bestStrategy.confidence : rentalEstimate.confidence;

  if (usingAltStrategy) {
    const ltr = strategyComparison!.strategies.find((s) => s.key === 'LTR');
    reasons.push({
      code: 'best_strategy',
      label: `Best as a ${bestStrategy!.label.toLowerCase()} rental (${dollars(bestStrategy!.netCashFlow)}/mo net)${ltr ? ` vs ${dollars(ltr.netCashFlow)}/mo long-term` : ''}`,
      impact: 'positive',
    });
  }

  // ── Monthly cash flow ──────────────────────────────────────────────────
  const cf = bestStrategy ? bestStrategy.netCashFlow : cashFlow.monthlyCashFlow;
  if (cf > 0) {
    score += 20;
    reasons.push({
      code: 'cash_flow_positive',
      label: `Positive cash flow of ${dollars(cf)}/mo`,
      impact: 'positive',
    });
  } else if (cf > -200) {
    score -= 5;
    reasons.push({
      code: 'cash_flow_slightly_negative',
      label: `Slightly negative cash flow (${dollars(cf)}/mo)`,
      impact: 'neutral',
    });
  } else {
    score -= 20;
    reasons.push({
      code: 'cash_flow_negative',
      label: `Negative cash flow (${dollars(cf)}/mo) — you'd fund the shortfall each month`,
      impact: 'negative',
    });
  }

  // ── Cash-on-cash return ────────────────────────────────────────────────
  if (coc >= 8) {
    score += 15;
    reasons.push({
      code: 'coc_strong',
      label: `Strong cash-on-cash return (${coc.toFixed(1)}%)`,
      impact: 'positive',
    });
  } else if (coc >= 3) {
    score += 5;
    reasons.push({
      code: 'coc_moderate',
      label: `Moderate cash-on-cash return (${coc.toFixed(1)}%)`,
      impact: 'neutral',
    });
  } else {
    score -= 15;
    reasons.push({
      code: 'coc_weak',
      label: `Low cash-on-cash return (${coc.toFixed(1)}%) — investors typically look for 8%+`,
      impact: 'negative',
    });
  }

  // ── Cap rate ───────────────────────────────────────────────────────────
  if (cap >= 6) {
    score += 10;
    reasons.push({
      code: 'cap_healthy',
      label: `Healthy cap rate (${cap.toFixed(1)}%)`,
      impact: 'positive',
    });
  } else if (cap >= 4) {
    score += 3;
    reasons.push({
      code: 'cap_average',
      label: `Average cap rate (${cap.toFixed(1)}%)`,
      impact: 'neutral',
    });
  } else {
    score -= 8;
    reasons.push({
      code: 'cap_low',
      label: `Below-average cap rate (${cap.toFixed(1)}%)`,
      impact: 'negative',
    });
  }

  // ── Price vs comparable sales ──────────────────────────────────────────
  if (comparables && comparables.length > 0) {
    const avgPrice =
      comparables.reduce((s, c) => s + c.price, 0) / comparables.length;
    if (avgPrice > 0) {
      const deltaPct = ((price - avgPrice) / avgPrice) * 100;
      if (deltaPct < -5) {
        score += 12;
        reasons.push({
          code: 'comps_below',
          label: `Priced ${Math.abs(deltaPct).toFixed(0)}% below comparable sales — potential bargain`,
          impact: 'positive',
        });
      } else if (deltaPct <= 5) {
        reasons.push({
          code: 'comps_at_market',
          label: 'Priced in line with comparable sales',
          impact: 'neutral',
        });
      } else {
        score -= 10;
        reasons.push({
          code: 'comps_above',
          label: `Priced ${deltaPct.toFixed(0)}% above comparable sales`,
          impact: 'negative',
        });
      }
    }
  }

  // ── Rent confidence caveat ─────────────────────────────────────────────
  if (confidence === 'high') {
    score += 5;
  } else if (confidence === 'low') {
    score -= 10;
    reasons.push({
      code: 'rent_confidence_low',
      label: `${usingAltStrategy ? `${bestStrategy!.label} revenue` : 'Rent'} estimate confidence is low — figures may shift as better data becomes available`,
      impact: 'negative',
    });
  }

  // ── Break-even context (informational, not scored) ─────────────────────
  if (breakEvenRent != null && rentalEstimate.mid > 0) {
    const margin = rentalEstimate.mid - breakEvenRent;
    reasons.push({
      code: 'break_even',
      label: `Break-even rent is ${dollars(breakEvenRent)}/mo vs. estimated rent ${dollars(rentalEstimate.mid)}/mo (${margin >= 0 ? 'cushion' : 'shortfall'} of ${dollars(Math.abs(margin))}/mo)`,
      impact: margin >= 0 ? 'positive' : 'negative',
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const rating: DealRating = score >= 65 ? 'strong' : score >= 40 ? 'marginal' : 'caution';

  const asStrategy = usingAltStrategy ? ` as a ${bestStrategy!.label.toLowerCase()} rental` : '';
  const headline =
    rating === 'strong'
      ? `Strong deal${asStrategy} — ${cf >= 0 ? `${dollars(cf)}/mo cash flow` : 'tight cash flow'} and a ${coc.toFixed(1)}% cash-on-cash return.`
      : rating === 'marginal'
        ? `Marginal deal${asStrategy} — ${cf >= 0 ? `${dollars(cf)}/mo cash flow` : `${dollars(cf)}/mo today`}, but some metrics are borderline.`
        : `${cf < 0 ? `${dollars(cf)}/mo cash flow` : 'Weak returns'}${usingAltStrategy ? ` even as a ${bestStrategy!.label.toLowerCase()} rental` : ''} relative to the cash invested.`;

  return { rating, score, headline, reasons };
}

export interface PropertyAnalysis {
  id: number;
  slug: string;
  public_share_id?: string | null;
  user_id: number;
  zillow_url: string;
  zpid?: string;
  source_url?: string;
  source_type?: 'zillow' | 'redfin' | 'realtor' | 'trulia' | 'address';
  property_data: PropertyData;
  analysis_params: AnalysisParams;
  analysis_results: FullAnalysisResult;
  rental_comps?: RentalComp[];
  user_overrides?: AnalysisUserOverrides;
  is_shared?: boolean;
  created_at: string;
}

// ── AI Comparison Types ──────────────────────────────────────────────────

export interface AIComparisonSummary {
  summary: string;
  generatedAt: string;
}

export interface AIPropertyNarrative {
  propertyId: string;
  address: string;
  narrative: string;
}

export interface AIComparisonNarratives {
  narratives: AIPropertyNarrative[];
  generatedAt: string;
}

// ── Saved Comparison Types ───────────────────────────────────────────────

export interface SavedComparison {
  id: number;
  name: string;
  property_slugs: string[];
  created_at: string;
  updated_at: string;
}

// ===== Property Analyzer Wrapper/Core Contract Types =====

export type AnalyzerRoute =
  | { kind: 'analyze'; slug?: string }
  | { kind: 'history' }
  | { kind: 'compare'; propertySlugs?: string[] }
  | { kind: 'shared'; slug: string };

export interface PropertyAnalyzerCoreProps {
  basePath: string;
  initialRoute: AnalyzerRoute;
  adapters: PropertyAnalyzerAdapters;
  features: PropertyAnalyzerFeatureFlags;
  branding: PropertyAnalyzerBranding;
  shellSlots?: PropertyAnalyzerShellSlots;
  onAnalysisContextChange?: (context: AnalyzerAssistantContext | null) => void;
}

export interface PropertyAnalyzerAdapters {
  auth: AnalyzerAuthAdapter;
  api: AnalyzerApiClient;
  navigation: AnalyzerNavigationAdapter;
  storage: AnalyzerStorageAdapter;
  shareUrls: AnalyzerShareUrlBuilder;
  events?: Partial<PropertyAnalyzerCoreEvents>;
}

export type AnalyzerExportKind =
  | 'analysis-pdf'
  | 'analysis-print'
  | 'comparison-pdf'
  | 'comparison-print';

export interface PropertyAnalyzerCoreEvents {
  navigate(route: AnalyzerRoute, options?: AnalyzerNavigationOptions): void;
  analysisCompleted(analysis: PropertyAnalysis): void;
  analysisUpdated(analysis: PropertyAnalysis): void;
  shareLinkCopied(url: string): void;
  exportStarted(kind: AnalyzerExportKind): void;
  error(error: AnalyzerError): void;
}

export interface AnalyzerAuthAdapter {
  isLoading?: boolean;
  getSession(): Promise<AnalyzerSession | null>;
  requireSession(reason: AnalyzerSessionRequirement): Promise<AnalyzerSession>;
  onUnauthorized(error: unknown): void;
  signOut?(): void;
}

export type AnalyzerSessionRequirement =
  | 'private-analysis'
  | 'history'
  | 'comparison'
  | 'export'
  | 'assistant';

export interface AnalyzerSession {
  userId: string;
  email?: string;
  displayName?: string;
  token?: string;
  tenantId?: string;
  roles: string[];
  permissions: AnalyzerPermission[];
}

export type AnalyzerPlatform = 'asset-dashboard' | 'property-analyzer-saas';

export interface OwnerContext {
  actorUserId: string;
  ownerUserId?: string;
  tenantId: string;
  platform: AnalyzerPlatform;
  permissions: AnalyzerPermission[];
  roles: string[];
  requestId?: string;
}

export type AnalyzerPermission =
  | 'analysis:read'
  | 'analysis:write'
  | 'analysis:delete'
  | 'analysis:share'
  | 'comparison:read'
  | 'comparison:write'
  | 'provider-cache:read'
  | 'provider-cache:write'
  | 'admin:tenant';

export interface AnalyzerApiAdapter {
  runAnalysis(input: RunAnalysisInput): Promise<PropertyAnalysis>;
  getHistory(input: PageInput): Promise<PagedResult<PropertyAnalysis>>;
  getAnalysis(slug: string): Promise<PropertyAnalysis>;
  deleteAnalysis(slug: string): Promise<void>;
  reAnalyze(slug: string, params: Partial<AnalysisParams>): Promise<PropertyAnalysis>;
  saveAdjustments(slug: string, payload: SaveAdjustmentsPayload): Promise<void>;
  setShared(slug: string, shared: boolean): Promise<AnalyzerShareState>;
  getSharedAnalysis(slug: string): Promise<PropertyAnalysis>;
  saveComparison(name: string, propertySlugs: string[]): Promise<SavedComparison>;
  getSavedComparisons(input: PageInput): Promise<PagedResult<SavedComparison>>;
  getSavedComparison(id: number): Promise<SavedComparison>;
  updateComparisonSlugs(id: number, propertySlugs: string[]): Promise<SavedComparison>;
  deleteSavedComparison(id: number): Promise<void>;
  getComparisonSummary(propertySlugs: string[]): Promise<AIComparisonSummary>;
  getPropertyNarratives(propertySlugs: string[]): Promise<AIPropertyNarrative[]>;
  searchForeclosures(params: { latitude: number; longitude: number; radius?: number; limit?: number }): Promise<unknown>;
  getMarketTrends(postalCode: string): Promise<unknown>;
  submitFeedback(message: string): Promise<unknown>;
}

export type AnalyzerApiClient = AnalyzerApiAdapter;

export interface RunAnalysisInput {
  url: string;
  params?: Partial<AnalysisParams>;
}

export interface PageInput {
  page?: number;
  limit?: number;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SaveAdjustmentsPayload {
  overrides: AnalysisUserOverrides;
  derived?: AnalyzerDerivedAdjustments;
}

export interface AnalyzerDerivedAdjustments {
  cashFlow?: CashFlowBreakdown;
  roi?: ROIMetrics;
  strategyComparison?: StrategyComparison;
  strNet?: number | null;
  mtrNet?: number | null;
}

export interface AnalyzerShareState {
  slug: string;
  isShared: boolean;
  publicShareId?: string | null;
}

export interface AnalyzerNavigationOptions {
  replace?: boolean;
}

export interface AnalyzerNavigationAdapter {
  currentUrl(): URL;
  toUrl(route: AnalyzerRoute): string;
  navigate(route: AnalyzerRoute, options?: AnalyzerNavigationOptions): void;
  external(path: string): string;
}

export interface PropertyAnalyzerBranding {
  productName: string;
  platformName: string;
  logoText?: string;
  homeLabel: string;
  themeClassName?: string;
}

export interface PropertyAnalyzerShellSlots {
  header?: ReactNode;
  footer?: ReactNode;
  assistant?: (context: AnalyzerAssistantContext | null) => ReactNode;
  loadingFallback?: ReactNode;
  publicSharedBanner?: ReactNode;
}

export interface AnalyzerStorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export interface PropertyAnalyzerFeatureFlags {
  askWill: boolean;
  comparisons: boolean;
  savedComparisons: boolean;
  publicSharing: boolean;
  pdfExport: boolean;
  streetView: boolean;
  aiComparisonSummary: boolean;
  aiPropertyNarratives: boolean;
}

export interface AnalyzerShareUrlBuilder {
  analysis(analysisSlug: string): string;
  publicAnalysis(sharedSlug: string): string;
  privateComparison(propertySlugs: string[]): string;
}

export interface AnalyzerAssistantContext {
  address: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt: number;
  propertyType?: string;
  zestimate?: number;
  rentEstimate?: number;
  monthlyCashFlow?: number;
  cashOnCashROI?: number;
  capRate?: number;
  monthlyMortgage?: number;
  taxSavings?: number;
  strNetMonthly?: number;
}

export type AnalyzerErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'provider-unavailable'
  | 'analysis-failed'
  | 'history-failed'
  | 'comparison-failed'
  | 'sharing-failed'
  | 'export-failed'
  | 'network'
  | 'unknown';

export interface AnalyzerError {
  code: AnalyzerErrorCode;
  message: string;
  cause?: unknown;
  route?: AnalyzerRoute;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

// ── Lien & Issue Library ─────────────────────────────────────────────────
// Authored catalog of real-world lien and issue archetypes. Single source of
// truth shared by the AI generator (prompt + validation gate) and the game UI
// (static cases + post-game education). Add variety here, not in the prompt.

export interface LienArchetype {
  category: LienCategory;
  /** Canonical display label, e.g. "IRS Federal Tax Lien". */
  type: string;
  /** Whether the buyer inherits this debt at a typical foreclosure sale. */
  survivesForeclosure: boolean;
  /** Typical priority position (1 = most senior / super-priority). */
  typicalPriority: number;
  /** Realistic dollar range [low, high]. Use [0, 0] for non-dollar clouds. */
  amountRange: [number, number];
  /** Concrete example holders to ground the scenario. */
  holderExamples: string[];
  /** One-sentence teaching note for the post-game breakdown. */
  educationalNote: string;
}

export const LIEN_CATALOG: LienArchetype[] = [
  {
    category: 'mortgage',
    type: 'First Mortgage',
    survivesForeclosure: false,
    typicalPriority: 1,
    amountRange: [80000, 320000],
    holderExamples: ['Wells Fargo Home Mortgage', 'Bank of America, N.A.', 'Rocket Mortgage'],
    educationalNote:
      'The foreclosing first mortgage is extinguished by the sale — that is what the auction wipes out — so you do not inherit it.',
  },
  {
    category: 'junior-mortgage',
    type: 'Second Mortgage / HELOC',
    survivesForeclosure: false,
    typicalPriority: 2,
    amountRange: [15000, 90000],
    holderExamples: ['Chase HELOC', 'Discover Home Loans', 'a local credit union'],
    educationalNote:
      'Junior mortgages and HELOCs are wiped when a senior lien forecloses; the lender chases the surplus, not you.',
  },
  {
    category: 'property-tax',
    type: 'Property Tax Lien',
    survivesForeclosure: true,
    typicalPriority: 1,
    amountRange: [3000, 45000],
    holderExamples: ['County Tax Collector', 'County Treasurer'],
    educationalNote:
      'Property taxes hold super-priority and survive any foreclosure — unpaid taxes always follow the property to the new owner.',
  },
  {
    category: 'federal-tax',
    type: 'IRS Federal Tax Lien',
    survivesForeclosure: true,
    typicalPriority: 3,
    amountRange: [10000, 150000],
    holderExamples: ['IRS - Centralized Lien Operation'],
    educationalNote:
      'Federal tax liens survive foreclosure and the IRS keeps a 120-day right of redemption — you can inherit the debt or lose the property back to the IRS.',
  },
  {
    category: 'state-tax',
    type: 'State Tax Lien',
    survivesForeclosure: true,
    typicalPriority: 3,
    amountRange: [5000, 80000],
    holderExamples: ['[State] Dept of Revenue', '[State] Franchise Tax Board'],
    educationalNote:
      'State income and sales-tax liens generally survive foreclosure much like federal tax liens.',
  },
  {
    category: 'hoa',
    type: 'HOA Lien',
    survivesForeclosure: false,
    typicalPriority: 4,
    amountRange: [1500, 25000],
    holderExamples: ['Sunset Ridge HOA', 'Oakwood Community Association'],
    educationalNote:
      'Ordinary HOA-dues liens are usually junior and wiped — but watch for a super-priority slice that is not.',
  },
  {
    category: 'hoa-super-priority',
    type: 'HOA Super-Priority Lien',
    survivesForeclosure: true,
    typicalPriority: 1,
    amountRange: [2000, 18000],
    holderExamples: ['Oakwood COA - super-priority assessment'],
    educationalNote:
      'In super-lien states a few months of unpaid HOA dues leap ahead of the first mortgage — they can wipe the mortgage and survive the sale.',
  },
  {
    category: 'mechanics',
    type: "Mechanic's Lien",
    survivesForeclosure: true,
    typicalPriority: 2,
    amountRange: [3000, 60000],
    holderExamples: ['ABC Roofing LLC', "Joe's Plumbing", 'Good Times Remodeling LLC'],
    educationalNote:
      "A perfected mechanic's lien for unpaid work can survive foreclosure and attach to the property regardless of who owns it.",
  },
  {
    category: 'judgment',
    type: 'Judgment Lien',
    survivesForeclosure: false,
    typicalPriority: 4,
    amountRange: [5000, 120000],
    holderExamples: ['ABC Collections', 'a former business partner', '[County] Civil Court'],
    educationalNote:
      'Money-judgment liens are usually junior and wiped at sale — but confirm priority, because a senior judgment can survive.',
  },
  {
    category: 'child-support',
    type: 'Child Support Lien',
    survivesForeclosure: true,
    typicalPriority: 3,
    amountRange: [2000, 75000],
    holderExamples: ['[State] Child Support Enforcement', 'a custodial parent'],
    educationalNote:
      "Child-support liens are statutory and typically survive foreclosure — the obligation follows the property's equity.",
  },
  {
    category: 'code-enforcement',
    type: 'Code Enforcement Lien',
    survivesForeclosure: true,
    typicalPriority: 2,
    amountRange: [2000, 40000],
    holderExamples: ['City of [City] - Code Enforcement Division'],
    educationalNote:
      'Municipal code-enforcement fines attach to the land and survive foreclosure — you inherit both the fines and the violations.',
  },
  {
    category: 'municipal-utility',
    type: 'Water/Sewer Lien',
    survivesForeclosure: true,
    typicalPriority: 2,
    amountRange: [500, 12000],
    holderExamples: ['County Water Authority', 'City Utilities Department'],
    educationalNote:
      'Unpaid municipal water and sewer charges can become liens that run with the land and survive the sale.',
  },
  {
    category: 'special-assessment',
    type: 'Special Assessment Lien',
    survivesForeclosure: true,
    typicalPriority: 1,
    amountRange: [5000, 50000],
    holderExamples: ['PACE financing - Ygrene', 'City Improvement District'],
    educationalNote:
      'Special assessments (sidewalks, sewer, PACE solar) attach to the property and survive — they are collected alongside property taxes.',
  },
  {
    category: 'environmental',
    type: 'Environmental Lien',
    survivesForeclosure: true,
    typicalPriority: 1,
    amountRange: [15000, 250000],
    holderExamples: ['EPA - Superfund Program', '[State] Dept of Environmental Quality'],
    educationalNote:
      "Environmental cleanup liens can be super-priority, survive foreclosure, and dwarf the property's value — a true deal-killer.",
  },
  {
    category: 'lis-pendens',
    type: 'Lis Pendens',
    survivesForeclosure: true,
    typicalPriority: 5,
    amountRange: [0, 0],
    holderExamples: ['[County] Superior Court - quiet title action'],
    educationalNote:
      'A lis pendens is not a dollar lien — it is notice of pending litigation that clouds title and can unwind your purchase. Clear it before resale.',
  },
];

export type IssueCategory =
  | 'structural'
  | 'systems'
  | 'title'
  | 'environmental'
  | 'occupancy'
  | 'legal'
  | 'financial'
  | 'market';

export interface IssueArchetype {
  category: IssueCategory;
  /** Short label / type for the red flag. */
  type: string;
  severity: 'red-herring' | 'low' | 'medium' | 'high' | 'severe';
  /** Realistic remediation/cost range [low, high]. [0, 0] for pure clouds or red herrings. */
  costRange: [number, number];
  /** Document/source where this is discovered (maps to RedFlag.hiddenIn). */
  sourceDocument: string;
  /** One-sentence teaching note / why it matters. */
  educationalNote: string;
}

export const ISSUE_CATALOG: IssueArchetype[] = [
  {
    category: 'structural',
    type: 'Foundation settlement',
    severity: 'high',
    costRange: [15000, 60000],
    sourceDocument: 'Inspection report',
    educationalNote:
      'Underpinning and waterproofing a settling foundation runs roughly $100–150 per linear foot — budget tens of thousands.',
  },
  {
    category: 'structural',
    type: 'Roof at end of life',
    severity: 'medium',
    costRange: [8000, 25000],
    sourceDocument: 'Inspection report',
    educationalNote: 'A roof past its service life is a near-term capital cost you cannot defer.',
  },
  {
    category: 'systems',
    type: 'Failing HVAC',
    severity: 'medium',
    costRange: [5000, 15000],
    sourceDocument: 'Inspection report',
    educationalNote: 'Full HVAC replacement is a predictable five-figure hit on an as-is purchase.',
  },
  {
    category: 'systems',
    type: 'Outdated electrical panel',
    severity: 'medium',
    costRange: [4000, 12000],
    sourceDocument: 'Inspection report',
    educationalNote: 'Outdated panels and knob-and-tube wiring fail insurance and lender requirements.',
  },
  {
    category: 'environmental',
    type: 'Mold remediation',
    severity: 'medium',
    costRange: [6000, 20000],
    sourceDocument: 'Inspection report',
    educationalNote: 'Hidden mold behind walls means remediation plus repairing whatever caused it.',
  },
  {
    category: 'environmental',
    type: 'Buried oil tank / soil contamination',
    severity: 'high',
    costRange: [10000, 80000],
    sourceDocument: 'Environmental report',
    educationalNote: 'A leaking buried tank can trigger costly soil remediation and environmental liability.',
  },
  {
    category: 'environmental',
    type: 'Asbestos materials',
    severity: 'medium',
    costRange: [8000, 30000],
    sourceDocument: 'Inspection report',
    educationalNote: 'Pre-1980 homes may need licensed asbestos abatement before renovation.',
  },
  {
    category: 'title',
    type: 'Clouded title / missing heir',
    severity: 'high',
    costRange: [0, 0],
    sourceDocument: 'Title report',
    educationalNote:
      'A missing-heir or wild-deed cloud can stall resale for months until a quiet-title action resolves it.',
  },
  {
    category: 'title',
    type: 'Easement / encroachment',
    severity: 'low',
    costRange: [0, 0],
    sourceDocument: 'Survey / plat',
    educationalNote: 'An encroaching structure or shared-driveway easement can limit use and scare buyers.',
  },
  {
    category: 'occupancy',
    type: 'Owner refuses to leave',
    severity: 'high',
    costRange: [5000, 15000],
    sourceDocument: 'Occupancy / field report',
    educationalNote:
      'An owner-occupant fights eviction hardest; expect 3–6 months of delay plus legal or cash-for-keys costs.',
  },
  {
    category: 'occupancy',
    type: 'Tenant with active lease',
    severity: 'medium',
    costRange: [3000, 12000],
    sourceDocument: 'Occupancy / field report',
    educationalNote:
      'A valid lease may survive the sale; you inherit the tenant until it expires or you pay them to leave.',
  },
  {
    category: 'occupancy',
    type: 'Squatters in possession',
    severity: 'high',
    costRange: [6000, 20000],
    sourceDocument: 'Occupancy / field report',
    educationalNote: 'Removing squatters can require a formal eviction and become a months-long, costly fight.',
  },
  {
    category: 'legal',
    type: 'Redemption-period right',
    severity: 'high',
    costRange: [4000, 18000],
    sourceDocument: 'Foreclosure / county records',
    educationalNote:
      'In redemption states the former owner can buy the property back; you carry it (taxes, insurance, interest) and cannot resell until the window closes.',
  },
  {
    category: 'legal',
    type: 'Open permits / unpermitted work',
    severity: 'medium',
    costRange: [4000, 20000],
    sourceDocument: 'Building department records',
    educationalNote: 'Unpermitted additions must be legalized or removed — and they can block your resale or refi.',
  },
  {
    category: 'financial',
    type: 'Pending special assessment',
    severity: 'medium',
    costRange: [5000, 25000],
    sourceDocument: 'HOA statement',
    educationalNote: 'A board-approved special assessment becomes the new owner\u2019s bill even before it is a lien.',
  },
  {
    category: 'market',
    type: 'Inflated ARV / declining micro-market',
    severity: 'medium',
    costRange: [0, 0],
    sourceDocument: 'Comps / market data',
    educationalNote: 'If your ARV leans on stale comps, the resale will not clear your numbers.',
  },
  {
    category: 'structural',
    type: 'Dated finishes (cosmetic only)',
    severity: 'red-herring',
    costRange: [0, 0],
    sourceDocument: 'Inspection report',
    educationalNote: 'Dated finishes look scary but are cheap cosmetic updates — do not overweight them.',
  },
];

/** Fuzzy-match a lien type/category string to a catalog archetype. */
export function findLienArchetype(typeOrCategory: string): LienArchetype | undefined {
  const needle = (typeOrCategory || '').toLowerCase();
  const byCategory = LIEN_CATALOG.find((l) => l.category === needle);
  if (byCategory) return byCategory;
  // Keyword scan against the type label and category tokens.
  return LIEN_CATALOG.find((l) => {
    const hay = `${l.type} ${l.category}`.toLowerCase();
    return needle.includes(l.category.replace(/-/g, ' ')) || hay.includes(needle) || needle.includes(l.type.toLowerCase());
  });
}

/** Format the lien catalog (optionally filtered to categories) for an AI prompt. */
export function formatLienCatalogForPrompt(categories?: LienCategory[]): string {
  const rows = categories
    ? LIEN_CATALOG.filter((l) => categories.includes(l.category))
    : LIEN_CATALOG;
  return rows
    .map(
      (l) =>
        `- ${l.type} [${l.category}] — ${l.survivesForeclosure ? 'SURVIVES (buyer inherits)' : 'wiped at sale'}; typical $${l.amountRange[0].toLocaleString()}–$${l.amountRange[1].toLocaleString()}; e.g. ${l.holderExamples[0]}`
    )
    .join('\n');
}

/** Format the issue catalog for an AI prompt. */
export function formatIssueCatalogForPrompt(): string {
  return ISSUE_CATALOG.map(
    (i) =>
      `- ${i.type} [${i.category}, ${i.severity}] — cost $${i.costRange[0].toLocaleString()}–$${i.costRange[1].toLocaleString()}; found in: ${i.sourceDocument}`
  ).join('\n');
}
