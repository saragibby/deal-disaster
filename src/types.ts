export interface Lien {
  type: string;
  holder: string;
  amount: number;
  priority: number;
  notes?: string;
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
}
