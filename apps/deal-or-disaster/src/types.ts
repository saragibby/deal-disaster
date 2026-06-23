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

export type OccupantType = 'vacant' | 'owner' | 'tenant' | 'squatter';

export interface Lien {
  type: string;
  holder: string;
  amount: number;
  priority: number;
  notes?: string;
  // Whether this lien survives the foreclosure sale (buyer inherits the debt).
  // When omitted, dealFinancials infers survival from the lien type.
  survivesForeclosure?: boolean;
  // Library grouping (drives default survival + education).
  category?: LienCategory;
  // One-sentence teaching note surfaced in the post-game breakdown.
  educationalNote?: string;
}

export interface RedFlag {
  id: string;
  description: string;
  severity: 'red-herring' | 'low' | 'medium' | 'high' | 'severe';
  hiddenIn: string;
  discovered: boolean;
  impact?: string;
  // Hard-dollar cost range this issue adds to the deal (remediation, surviving
  // debt, bring-to-code, etc.). The midpoint flows into the P&L. Leave both
  // undefined for non-cost issues (e.g. pure title clouds with no dollar value).
  costLow?: number;
  costHigh?: number;
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
  photoUrls?: string[]; // URLs to the generated images (for static cases)
  description: string;
  occupancyStatus: 'vacant' | 'occupied' | 'unknown';
  // Richer occupancy detail; drives the eviction/holding cost. occupancyStatus
  // is kept for back-compat and derived from this when present.
  occupant?: OccupantType;
  // Eviction / cash-for-keys / holding cost applied when not vacant. Flows into
  // the scored P&L.
  occupancyCost?: number;
  // Statutory redemption window (days) the former owner can reclaim the
  // property. 0 / undefined means no redemption right.
  redemptionPeriodDays?: number;
  // Carrying cost while the property cannot be resold until redemption closes.
  // Flows into the P&L once discovered.
  redemptionCost?: number;
  hoaFees?: number;
  actualValue: number; // true value after all issues considered
  isGoodDeal: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  correctDecision?: 'BUY' | 'INVESTIGATE' | 'WALK_AWAY';
  decisionExplanation?: string;
  // Additional property details
  propertyType?: string;
  // Listing category shown on the listing, one of: "Bank Owned",
  // "2nd Chance Foreclosure", "Short Sale", "Foreclosure Homes",
  // "Non-Bank Owned". Defaults to "2nd Chance Foreclosure".
  auctionType?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
}

export type DealClassification = 'GOOD' | 'MARGINAL' | 'BAD';

// The single, canonical financial model for a case. Every screen (case summary,
// win/loss banner, financial analysis, and the "why this scoring" footer) must
// render from this object so the numbers can never disagree.
export interface DealFinancials {
  preForeclosureValue: number; // estimated value before foreclosure (propertyValue)
  resaleValue: number; // realistic after-repair resale value / ARV (actualValue)
  closingRate: number; // e.g. 0.025
  closingCosts: number; // auctionPrice * closingRate
  baseRepairs: number; // repairEstimate
  issueCosts: number; // sum of midpoints of discovered/real issue cost ranges
  survivingLiens: number; // sum of liens that survive the sale
  occupancyCost: number; // eviction/holding cost when the property is occupied
  redemptionCost: number; // carrying cost during a statutory redemption window
  totalInvestment: number; // auction + baseRepairs + issueCosts + survivingLiens + occupancy + redemption + closing
  netProfit: number; // resaleValue - totalInvestment
  roi: number; // netProfit / totalInvestment (fraction, e.g. 0.18)
  classification: DealClassification; // derived from roi
  spreadBeforeCosts: number; // honest "optimistic" figure: value - auction - repairs
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
