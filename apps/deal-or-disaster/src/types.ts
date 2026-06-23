export interface Lien {
  type: string;
  holder: string;
  amount: number;
  priority: number;
  notes?: string;
  // Whether this lien survives the foreclosure sale (buyer inherits the debt).
  // When omitted, dealFinancials infers survival from the lien type.
  survivesForeclosure?: boolean;
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
  totalInvestment: number; // auction + baseRepairs + issueCosts + survivingLiens + closing
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
