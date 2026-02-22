// ===== Property & Game Types =====

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
  photoUrls?: string[];
  description: string;
  occupancyStatus: 'vacant' | 'occupied' | 'unknown';
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
  sort_order: number;
  created_by?: number;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'user' | 'admin';
