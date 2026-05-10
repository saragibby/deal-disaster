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
  ai_insights_email_opt_in?: boolean;
  weekly_insights_email_opt_in?: boolean;
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
  dataSources?: {
    rental: 'algorithm' | 'rentcast' | 'blended';
    str: 'algorithm' | 'airdna';
    mtr: 'algorithm' | 'furnished-finder' | 'padsplit';
    hoa: 'zillow' | 'estimate' | 'none';
  };
}

export interface PropertyAnalysis {
  id: number;
  slug: string;
  user_id: number;
  zillow_url: string;
  zpid?: string;
  source_url?: string;
  source_type?: 'zillow' | 'redfin' | 'realtor' | 'trulia' | 'address';
  property_data: PropertyData;
  analysis_params: AnalysisParams;
  analysis_results: FullAnalysisResult;
  rental_comps?: RentalComp[];
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
