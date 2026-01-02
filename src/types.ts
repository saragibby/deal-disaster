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
  severity: 'low' | 'medium' | 'high';
  hiddenIn: string;
  discovered: boolean;
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
  liens: Lien[];
  redFlags: RedFlag[];
  photos: string[];
  description: string;
  occupancyStatus: 'vacant' | 'occupied' | 'unknown';
  hoaFees?: number;
  actualValue: number; // true value after all issues considered
  isGoodDeal: boolean;
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
}

export interface ScoreResult {
  points: number;
  message: string;
  explanation: string;
}
