import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CaseDisplay from './components/CaseDisplay';
import DecisionButtons from './components/DecisionButtons';
import ScoreDisplay from './components/ScoreDisplay';
import ResultModal from './components/ResultModal';
import { Footer } from '@deal-platform/shared-ui';
import Profile from './components/Profile';
import Onboarding from './components/Onboarding';
import DailyChallenge from './components/DailyChallenge';
import ChallengeCalendar from './components/ChallengeCalendar';
import { AskWill } from '@deal-platform/shared-ui';
import { PropertyCase, Decision, GameScore, ScoreResult } from './types';
import { getRandomCase } from './data/cases';
import { computeDeal, dealIsBuyWorthy, formatPct } from './utils/dealFinancials';
import { withDerivedQuizzes } from './utils/quizGenerator';
import { api } from './services/api';
import { buildAppUrl } from '@deal-platform/shared-auth';
import { LogOut, User } from 'lucide-react';
import logo from './assets/logo.png';
import './App.css';

const CASE_TIME_LIMIT = 300; // 5 minutes in seconds

// Due diligence on a foreclosure is limited and costly: inspecting a document
// spends one action from a per-case budget, advances the auction clock, and
// charges a small fee. This turns investigation into a real tradeoff instead of
// a risk-free escape, and forces a final BUY / WALK_AWAY commitment at the gavel.
const INVESTIGATE_TIME_COST = 45; // seconds removed from the clock per inspection
const INVESTIGATE_FEE = 5; // points charged per inspection

// How much of the available investigation set a player may inspect, scaled by
// difficulty. Easy lets you pull every item on the case; harder cases ration
// due diligence so you must choose which records are worth the time/fee. The
// budget can never exceed the number of items actually present.
const DUE_DILIGENCE_FRACTION: Record<string, number> = { easy: 1, medium: 0.75, hard: 0.5 };
const DEFAULT_DUE_DILIGENCE_FRACTION = 0.75;

function dueDiligenceBudget(itemCount: number, difficulty?: string): number {
  if (itemCount <= 0) return 0;
  const fraction = DUE_DILIGENCE_FRACTION[difficulty ?? 'medium'] ?? DEFAULT_DUE_DILIGENCE_FRACTION;
  return Math.min(itemCount, Math.max(1, Math.ceil(itemCount * fraction)));
}

function getInitialAuth() {
  try {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      return { isAuthenticated: true, user: JSON.parse(savedUser) };
    }
  } catch { /* ignore */ }
  return { isAuthenticated: false, user: null };
}

function App() {
  const { date, dealId } = useParams();
  const navigate = useNavigate();
  const initialAuth = getInitialAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuth.isAuthenticated);
  const [initializing, setInitializing] = useState(initialAuth.isAuthenticated);
  const [user, setUser] = useState<any>(initialAuth.user);
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [dailyChallengeData, setDailyChallengeData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'calendar'>('leaderboard');
  const [currentCase, setCurrentCase] = useState<PropertyCase | null>(null);
  // Track which flags have already been revealed/answered so rapid, repeated
  // clicks (or React StrictMode double-invokes) can't double-count or drop
  // points. Reset whenever a new case loads.
  const revealedFlagsRef = useRef<Set<string>>(new Set());
  const answeredFlagsRef = useRef<Set<string>>(new Set());
  // Due-diligence actions spent on this case. The ref provides a synchronous,
  // race-safe count for the budget gate; the state drives the on-screen counter.
  const investigationsUsedRef = useRef(0);
  const [investigationsUsed, setInvestigationsUsed] = useState(0);
  // Net points earned during investigation of the CURRENT case (quiz answers +/-
  // and inspection fees). Tracked per-case so the post-decision "investigation vs
  // decision" breakdown is correct and identical in both game modes. Reset on a
  // new case below.
  const caseInvestigationPointsRef = useRef(0);
  useEffect(() => {
    revealedFlagsRef.current = new Set();
    answeredFlagsRef.current = new Set();
    investigationsUsedRef.current = 0;
    setInvestigationsUsed(0);
    caseInvestigationPointsRef.current = 0;
  }, [currentCase?.id]);
  const [timeRemaining, setTimeRemaining] = useState(CASE_TIME_LIMIT);
  const [score, setScore] = useState<GameScore>({
    points: 0,
    casesSolved: 0,
    goodDeals: 0,
    badDealsAvoided: 0,
    mistakes: 0,
    redFlagsFound: 0,
    redFlagCorrect: 0,
    redFlagMistakes: 0,
  });
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  // Reveal a compact sticky bar (property, score, time) once the player scrolls
  // past the case header, so the key context stays visible during a long case.
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [completedCaseIds, setCompletedCaseIds] = useState<string[]>([]);
  const [userStats, setUserStats] = useState({
    lifetimePoints: 0,
    currentStreak: 0,
    dealsFound: 0,
    disastersAvoided: 0
  });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  // Set up unauthorized handler to auto-logout on token expiration
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    });
  }, []);

  // Handle SSO params passed via URL (fallback for direct sub-app access)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUserStr = params.get('user');

    if (urlToken && urlUserStr) {
      try {
        const urlUser = JSON.parse(decodeURIComponent(urlUserStr));
        localStorage.setItem('token', urlToken);
        localStorage.setItem('user', JSON.stringify(urlUser));
        setIsAuthenticated(true);
        setUser(urlUser);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        console.error('Failed to parse SSO params:', err);
      }
    }
  }, []);

  // Fetch user stats when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserStats();
      fetchLeaderboard();
    }
  }, [isAuthenticated]);

  // Handle URL parameters for direct links to challenges or deals
  useEffect(() => {
    if (isAuthenticated && !gameStarted && initializing) {
      if (date) {
        // Load specific daily challenge by date directly
        loadChallengeByDateDirect(date);
      } else if (dealId) {
        // Load specific static deal by ID
        loadDealById(dealId);
      } else {
        // No URL params, we're done initializing
        setInitializing(false);
      }
    }
  }, [isAuthenticated, date, dealId, gameStarted, initializing]);

  const loadChallengeByDateDirect = async (challengeDate: string) => {
    try {
      const response = await api.getDailyChallengeByDate(challengeDate);
      // API returns { challenge: {...}, completed: bool, completion: {...} }
      // We need to transform it to the format startDailyChallenge expects
      const challengeData = {
        id: response.challenge.id,
        challenge_date: response.challenge.date,
        difficulty: response.challenge.difficulty,
        property_data: {
          address: response.challenge.address,
          city: response.challenge.city,
          state: response.challenge.state,
          zipCode: response.challenge.zipCode,
          propertyType: response.challenge.propertyType,
          beds: response.challenge.beds,
          baths: response.challenge.baths,
          sqft: response.challenge.sqft,
          yearBuilt: response.challenge.yearBuilt,
          auctionPrice: response.challenge.auctionPrice,
          estimatedValue: response.challenge.estimatedValue,
          estimatedRepairs: response.challenge.estimatedRepairs,
          monthlyRent: response.challenge.monthlyRent,
          actualValue: response.challenge.actualValue,
          isGoodDeal: response.challenge.isGoodDeal,
          occupancyStatus: response.challenge.occupancyStatus,
          occupant: response.challenge.occupant,
          occupancyCost: response.challenge.occupancyCost,
          redemptionPeriodDays: response.challenge.redemptionPeriodDays,
          redemptionCost: response.challenge.redemptionCost,
          hoaFees: response.challenge.hoaFees,
          description: response.challenge.description,
          funnyStory: response.challenge.funnyStory,
          photos: response.challenge.photos,
          liens: response.challenge.liens,
          redFlags: response.challenge.redFlags,
          hiddenIssues: response.challenge.hiddenIssues,
          correctDecision: response.challenge.correctDecision,
          explanation: response.challenge.explanation,
        }
      };
      // Start the challenge directly without showing modal
      startDailyChallenge(challengeData);
      setInitializing(false);
    } catch (error) {
      console.error('Error loading challenge for date:', error);
      alert('Failed to load challenge for this date. Please try again.');
      navigate('/');
      setInitializing(false);
    }
  };

  const loadDealById = async (id: string) => {
    try {
      // Get the static case by ID from the cases data
      const { propertyCases } = await import('./data/cases');
      const caseData = propertyCases.find((c: PropertyCase) => c.id === id);
      
      if (caseData) {
        setCurrentCase(withDerivedQuizzes(caseData));
        setGameStarted(true);
        setIsDailyChallenge(false);
        setTimeRemaining(CASE_TIME_LIMIT);
        setResult(null);
        setInitializing(false);
      } else {
        console.error('Deal not found:', id);
        navigate('/');
        setInitializing(false);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
      navigate('/');
      setInitializing(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      const stats = await api.getUserStats();
      setUserStats(stats);
    } catch (error) {
      console.error('Failed to fetch user stats:', error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await api.getDailyLeaderboard();
      setLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      setLeaderboard([]);
    }
  };

  // Timer logic
  useEffect(() => {
    if (!gameStarted || !currentCase || result) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - force a decision with full time limit
          handleDecision('WALK_AWAY', CASE_TIME_LIMIT);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, currentCase, result]);

  // Toggle the sticky context bar based on scroll position while a case is open.
  useEffect(() => {
    if (!gameStarted || !currentCase) {
      setShowStickyHeader(false);
      return;
    }
    const onScroll = () => setShowStickyHeader(window.scrollY > 220);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [gameStarted, currentCase]);

  const startGame = () => {
    setGameStarted(true);
    setIsDailyChallenge(false);
    setScore({
      points: 0,
      casesSolved: 0,
      goodDeals: 0,
      badDealsAvoided: 0,
      mistakes: 0,
      redFlagsFound: 0,
      redFlagCorrect: 0,
      redFlagMistakes: 0,
    });
    setCompletedCaseIds([]);
    loadNextCase();
  };

  const startDailyChallenge = (challengeData: any) => {
    setShowDailyChallenge(false);
    setGameStarted(true);
    setIsDailyChallenge(true);
    setDailyChallengeData(challengeData);
    const initialScore = {
      points: 0,
      casesSolved: 0,
      goodDeals: 0,
      badDealsAvoided: 0,
      mistakes: 0,
      redFlagsFound: 0,
      redFlagCorrect: 0,
      redFlagMistakes: 0,
    };
    setScore(initialScore);
    
    // Convert daily challenge data to PropertyCase format
    const property = challengeData.property_data;
    const dailyCase: PropertyCase = {
      id: `daily-${challengeData.id}`,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zipCode,
      propertyValue: property.estimatedValue,
      auctionPrice: property.auctionPrice,
      repairEstimate: property.estimatedRepairs,
      repairEstimateMin: property.estimatedRepairsMin,
      repairEstimateMax: property.estimatedRepairsMax,
      liens: property.liens || [],
      redFlags: property.redFlags.map((flag: any, index: number) => ({
        id: `flag-${index}`,
        description: flag.description,
        severity: flag.severity,
        hiddenIn: flag.type,
        discovered: false,
        impact: flag.impact,
        costLow: flag.costLow,
        costHigh: flag.costHigh,
        question: flag.question,
        choices: flag.choices,
        correctChoice: flag.correctChoice,
        answerExplanation: flag.answerExplanation,
      })),
      photos: property.photos || [],
      description: property.funnyStory || property.description || 'AI-generated foreclosure scenario',
      occupancyStatus: property.occupancyStatus || ('unknown' as const),
      occupant: property.occupant,
      occupancyCost: property.occupancyCost,
      redemptionPeriodDays: property.redemptionPeriodDays,
      redemptionCost: property.redemptionCost,
      hoaFees: property.hoaFees,
      actualValue: property.actualValue || property.estimatedValue,
      isGoodDeal: property.isGoodDeal,
      difficulty: challengeData.difficulty,
      correctDecision: property.correctDecision,
      decisionExplanation: property.explanation,
      propertyType: property.propertyType,
      auctionType: property.auctionType,
      beds: property.beds,
      baths: property.baths,
      sqft: property.sqft,
      yearBuilt: property.yearBuilt,
    };
    
    setCurrentCase(withDerivedQuizzes(dailyCase));
    setTimeRemaining(CASE_TIME_LIMIT);
    setResult(null);
    
    // Update URL to challenge date (format as YYYY-MM-DD)
    const challengeDate = challengeData.challenge_date || challengeData.date;
    const dateOnly = typeof challengeDate === 'string' 
      ? challengeDate.split('T')[0] 
      : new Date(challengeDate).toISOString().split('T')[0];
    navigate(`/challenge/${dateOnly}`);
  };

  const loadNextCase = () => {
    const newCase = getRandomCase(completedCaseIds);
    setCurrentCase(withDerivedQuizzes(newCase));
    setTimeRemaining(CASE_TIME_LIMIT);
    setResult(null);
    
    // Update URL to deal ID
    navigate(`/deal/${newCase.id}`);
  };

  const handleOnboardingComplete = async (data: any) => {
    const isProduction = window.location.hostname !== 'localhost';
    const API_URL = isProduction ? '' : 'http://localhost:3002';
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/auth/complete-onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to complete onboarding');
      }

      const updatedUser = { ...user, ...result.user };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setShowOnboarding(false);
    } catch (error: any) {
      console.error('Onboarding error:', error);
      // Re-throw the error so Onboarding component can display it
      throw error;
    }
  };

  const handleLogout = async () => {
    // Save final score before logging out
    if (gameStarted && score.casesSolved > 0) {
      try {
        await api.saveGameSession(score);
      } catch (error) {
        console.error('Failed to save final score:', error);
      }
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleBackToHome = async () => {
    // Save score before going back
    if (gameStarted && score.casesSolved > 0) {
      try {
        if (isDailyChallenge && dailyChallengeData && !result) {
          // Don't auto-save incomplete daily challenge
        } else if (!isDailyChallenge) {
          await api.saveGameSession(score);
        }
      } catch (error) {
        console.error('Failed to save score:', error);
      }
    }

    // Reset all game state first
    setGameStarted(false);
    setCurrentCase(null);
    setResult(null);
    setIsDailyChallenge(false);
    setDailyChallengeData(null);
    setScore({
      points: 0,
      casesSolved: 0,
      goodDeals: 0,
      badDealsAvoided: 0,
      mistakes: 0,
      redFlagsFound: 0,
      redFlagCorrect: 0,
      redFlagMistakes: 0,
    });
    setCompletedCaseIds([]);
    
    // Navigate to home and clear URL params immediately
    navigate('/', { replace: true });
    
    // Stop initializing to prevent URL param effect from running
    setInitializing(false);
    
    // Fetch updated stats
    fetchUserStats();
    fetchLeaderboard();
  };

  const handleCalendarDateSelect = async (date: string) => {
    try {
      const response = await api.getDailyChallengeByDate(date);
      setDailyChallengeData(response);
      setShowDailyChallenge(true);
    } catch (error) {
      console.error('Error loading challenge for date:', error);
      alert('Failed to load challenge for this date. Please try again.');
    }
  };

  // Spend one due-diligence action to inspect a document. Returns false when the
  // budget is exhausted or there isn't enough time on the clock, in which case
  // the caller should keep the document locked. Charging here (time + small fee)
  // is what gives investigation a real cost.
  const tryInvestigate = (): boolean => {
    if (!currentCase) return false;
    const budget = dueDiligenceBudget(currentCase.redFlags.length, currentCase.difficulty);
    if (investigationsUsedRef.current >= budget) return false;
    if (timeRemaining < INVESTIGATE_TIME_COST) return false;
    investigationsUsedRef.current += 1;
    setInvestigationsUsed(investigationsUsedRef.current);
    setTimeRemaining((prev) => Math.max(0, prev - INVESTIGATE_TIME_COST));
    caseInvestigationPointsRef.current -= INVESTIGATE_FEE;
    setScore((prev) => ({ ...prev, points: prev.points - INVESTIGATE_FEE }));
    return true;
  };

  const handleRedFlagClick = (flagId: string) => {
    if (!currentCase) return;
    // Synchronous guard: dedupe rapid repeated clicks and StrictMode double-invokes.
    if (revealedFlagsRef.current.has(flagId)) return;
    const flag = currentCase.redFlags.find((f) => f.id === flagId);
    if (!flag || flag.discovered) return;
    revealedFlagsRef.current.add(flagId);

    // Immutable functional update so concurrent clicks on different flags compose.
    setCurrentCase((prev) =>
      prev
        ? { ...prev, redFlags: prev.redFlags.map((f) => (f.id === flagId ? { ...f, discovered: true } : f)) }
        : prev
    );

    // Only award discovery points if there's no question (old behavior). With
    // quiz derivation every flag now carries a question, so scoring flows
    // through handleRedFlagAnswer in both modes; this remains as a safe fallback.
    if (!flag.question) {
      caseInvestigationPointsRef.current += 25;
      setScore((prev) => ({
        ...prev,
        points: prev.points + 25,
        redFlagsFound: prev.redFlagsFound + 1,
      }));
    } else {
      // Just mark as found for stats
      setScore((prev) => ({
        ...prev,
        redFlagsFound: prev.redFlagsFound + 1,
      }));
    }
  };

  const handleRedFlagAnswer = (flagId: string, answerIndex: number) => {
    if (!currentCase) return;
    // Synchronous guard: an already-answered flag can't be rescored.
    if (answeredFlagsRef.current.has(flagId)) return;
    const flag = currentCase.redFlags.find((f) => f.id === flagId);
    if (!flag || flag.correctChoice === undefined || flag.userAnswer !== undefined) return;
    answeredFlagsRef.current.add(flagId);

    setCurrentCase((prev) =>
      prev
        ? { ...prev, redFlags: prev.redFlags.map((f) => (f.id === flagId ? { ...f, userAnswer: answerIndex } : f)) }
        : prev
    );

    const isCorrect = answerIndex === flag.correctChoice;

    // Bonus points for high/severe severity flags
    let points = 0;
    if (isCorrect) {
      points = (flag.severity === 'high' || flag.severity === 'severe') ? 75 : 50;
    } else {
      points = -25;
    }

    caseInvestigationPointsRef.current += points;
    setScore((prev) => ({
      ...prev,
      points: prev.points + points,
      redFlagCorrect: isCorrect ? prev.redFlagCorrect + 1 : prev.redFlagCorrect,
      redFlagMistakes: !isCorrect ? prev.redFlagMistakes + 1 : prev.redFlagMistakes,
    }));
  };

  const handleDecision = async (decision: Decision, forcedTimeTaken?: number) => {
    if (!currentCase || !decision) return;

    let points = 0;
    let message = '';
    let explanation = '';
    // Single canonical model so the banner agrees with the result calculator.
    const deal = computeDeal(currentCase);
    // Correctness is derived from the live financial model, not the authored
    // `isGoodDeal` answer key, so the points always match this case's real
    // economics (ROI / classification from `computeDeal`).
    const dealIsGood = dealIsBuyWorthy(deal);
    const undiscoveredFlags = currentCase.redFlags.filter((f) => !f.discovered && f.severity !== 'red-herring');
    const missedSevereFlags = currentCase.redFlags.filter((f) => !f.discovered && (f.severity === 'severe' || f.severity === 'high'));

    if (decision === 'BUY') {
      if (dealIsGood) {
        points = 100;
        message = '✅ Excellent Decision!';
        explanation = `This was a solid deal! After all costs you'd net approximately $${deal.netProfit.toLocaleString()} (ROI ${formatPct(deal.roi)}).`;
        setScore((prev) => ({ ...prev, goodDeals: prev.goodDeals + 1 }));
      } else {
        points = -150;
        message = '❌ Bad Investment!';
        const hiddenIssues = undiscoveredFlags.map((f) => f.description).join(' ');
        explanation = `This was a trap! ${hiddenIssues} After all costs you would lose approximately $${Math.abs(deal.netProfit).toLocaleString()}.`;
        setScore((prev) => ({ ...prev, mistakes: prev.mistakes + 1 }));
        
        // Additional penalty for buying with missed severe issues
        if (missedSevereFlags.length > 0) {
          points -= 50;
          explanation += ` WARNING: You missed ${missedSevereFlags.length} critical issue(s) that should have triggered WALK_AWAY.`;
        }
      }
    } else if (decision === 'WALK_AWAY') {
      if (!dealIsGood) {
        points = 50;
        message = '👍 Smart Move!';
        explanation = `Good instincts! You avoided a loss of about $${Math.abs(deal.netProfit).toLocaleString()}. ${undiscoveredFlags.length > 0 ? undiscoveredFlags[0].description : 'There were hidden issues that would have cost you.'}`;
        setScore((prev) => ({ ...prev, badDealsAvoided: prev.badDealsAvoided + 1 }));
      } else {
        points = -50;
        message = '😬 Missed Opportunity';
        explanation = `This was actually a good deal — you missed about $${deal.netProfit.toLocaleString()} in profit. You were too cautious.`;
        setScore((prev) => ({ ...prev, mistakes: prev.mistakes + 1 }));
      }
    }

    // Investigation points earned on THIS case (quiz answers and inspection
    // fees), tracked per-case so the breakdown is identical in both modes.
    const investigationPoints = caseInvestigationPointsRef.current;
    const totalPointsEarned = investigationPoints + points;

    setScore((prev) => ({
      ...prev,
      points: prev.points + points,
      casesSolved: prev.casesSolved + 1,
    }));

    setResult({ 
      points: totalPointsEarned, 
      message, 
      explanation, 
      userDecision: decision,
      investigationPoints,
      decisionPoints: points
    });
    setCompletedCaseIds([...completedCaseIds, currentCase.id]);

    // Save to backend after each decision
    const newScore = {
      points: score.points + points,
      casesSolved: score.casesSolved + 1,
      goodDeals: score.goodDeals + (decision === 'BUY' && dealIsGood ? 1 : 0),
      badDealsAvoided: score.badDealsAvoided + (decision === 'WALK_AWAY' && !dealIsGood ? 1 : 0),
      mistakes: score.mistakes + ((decision === 'BUY' && !dealIsGood) || (decision === 'WALK_AWAY' && dealIsGood) ? 1 : 0),
      redFlagsFound: score.redFlagsFound,
    };

    try {
      if (isDailyChallenge && dailyChallengeData) {
        // Save daily challenge completion with total points (investigation + decision)
        await api.completeDailyChallenge(dailyChallengeData.id, {
          decision,
          points_earned: totalPointsEarned,
          time_taken: forcedTimeTaken !== undefined ? forcedTimeTaken : CASE_TIME_LIMIT - timeRemaining,
        });
      } else {
        // Save regular game session
        await api.saveGameSession(newScore);
      }
      // Refresh stats and leaderboard after completing a case
      await fetchUserStats();
      if (isDailyChallenge) {
        await fetchLeaderboard();
      }
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

  // Show loading screen while initializing
  if (initializing) {
    return (
      <div className="app-container">
        <header className="platform-header">
          <a href={buildAppUrl('/')} className="platform-header__logo">⚡ Passive Income Club</a>
          <nav className="platform-header__nav">
            <a href={buildAppUrl('/')} className="platform-header__link">Home</a>
            <a href={buildAppUrl('/games')} className="platform-header__link">Games</a>
            <a href={buildAppUrl('/tools')} className="platform-header__link">Tools</a>
          </nav>
        </header>
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to dashboard login if not authenticated
  if (!isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  if (!gameStarted) {
    return (
      <div className="app-container">
        <header className="platform-header">
          <a href={buildAppUrl('/')} className="platform-header__logo">⚡ Passive Income Club</a>
          <nav className="platform-header__nav">
            <a href={buildAppUrl('/')} className="platform-header__link">Home</a>
            <a href={buildAppUrl('/games')} className="platform-header__link">Games</a>
            <a href={buildAppUrl('/tools')} className="platform-header__link">Tools</a>
            <a href={buildAppUrl('/profile')} className="platform-header__user">
              <User size={16} /> {user?.name || user?.email}
            </a>
            <button className="platform-header__logout" onClick={handleLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          </nav>
        </header>
        <div className="welcome-page">
          <div className="welcome-left">
            <div className="welcome-header-horizontal">
              <img 
                src={logo} 
                alt="Deal or Disaster Logo" 
                className="welcome-logo"
              />
              <div className="user-badges">
                <div className="badge-item">
                  <span className="badge-icon">🏆</span>
                  <div className="badge-info">
                    <span className="badge-value">{userStats.lifetimePoints.toLocaleString()}</span>
                    <span className="badge-label">Lifetime Points</span>
                  </div>
                </div>
                <div className="badge-item">
                  <span className="badge-icon">🔥</span>
                  <div className="badge-info">
                    <span className="badge-value">{userStats.currentStreak} {userStats.currentStreak === 1 ? 'Day' : 'Days'}</span>
                    <span className="badge-label">Current Streak</span>
                  </div>
                </div>
                <div className="badge-item badge-success">
                  <span className="badge-icon">💰</span>
                  <div className="badge-info">
                    <span className="badge-value">{userStats.dealsFound}</span>
                    <span className="badge-label">Deals Found</span>
                  </div>
                </div>
                <div className="badge-item badge-danger">
                  <span className="badge-icon">⚠️</span>
                  <div className="badge-info">
                    <span className="badge-value">{userStats.disastersAvoided}</span>
                    <span className="badge-label">Disasters Avoided</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="welcome-text-section">
              <h2>Welcome back, {user?.name || user?.email?.split('@')[0]}! 👋</h2>
              <div className="header-buttons">
                <button className="profile-btn-inline" onClick={() => setShowProfile(true)}>⚙️ Profile</button>
                <button className="logout-btn-inline" onClick={handleLogout}>Logout</button>
              </div>
            </div>

            <div className="game-description">
              <p>🎲 Think you can spot the difference between a diamond in the rough and a money pit with foundation issues? This isn't HGTV where every house gets a happy ending. Here, one wrong click and you're the proud owner of a "fixer-upper" that's actually a teardown. But hey, at least it's virtual bankruptcy! 😅</p>
            </div>

            <div className="how-to-play">
              <h3>How to Play</h3>
              <div className="instructions">
                <div className="instruction-step">
                  <span className="step-number">1</span>
                  <div>
                    <h4>Review the Case</h4>
                    <p>Examine the property details, starting bid, and estimated repairs carefully.</p>
                  </div>
                </div>
                <div className="instruction-step">
                  <span className="step-number">2</span>
                  <div>
                    <h4>Run Due Diligence</h4>
                    <p>Inspect documents to uncover hidden issues — but due diligence is limited. Each inspection spends one action, burns auction time, and costs a small fee. Choose wisely!</p>
                  </div>
                </div>
                <div className="instruction-step">
                  <span className="step-number">3</span>
                  <div>
                    <h4>Commit at the Gavel</h4>
                    <p>When the clock runs down (5 minutes) you must commit: BUY the property or WALK AWAY. Run out of time and you auto-pass.</p>
                  </div>
                </div>
                <div className="instruction-step">
                  <span className="step-number">4</span>
                  <div>
                    <h4>Score Points</h4>
                    <p>Buy good deals: +100 pts | Avoid bad deals: +50 pts | Wrong choice: -150 pts</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="welcome-right">
            <div className="start-section">
              <h2>Ready to Play?</h2>
              <p className="challenge-text">Test your foreclosure analysis skills!</p>
              <button className="start-btn-large daily-challenge-btn" onClick={() => setShowDailyChallenge(true)}>
                🌟 Today's Daily Challenge
              </button>
              <button className="start-btn-secondary" onClick={startGame}>
                🏠 Play Regular Game
              </button>
            </div>

            <div className="tabbed-section">
              <div className="tab-buttons">
                <button 
                  className={`tab-button ${activeTab === 'leaderboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('leaderboard')}
                >
                  🏆 Today's Leaderboard
                </button>
                <button 
                  className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('calendar')}
                >
                  📅 Challenge Calendar
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'leaderboard' ? (
                  <div className="leaderboard-tab">
                    <div className="leaderboard-list">
                      {leaderboard.length === 0 ? (
                        <p className="leaderboard-note">No one has completed today's challenge yet. Be the first!</p>
                      ) : (
                        <>
                          {leaderboard.slice(0, 5).map((entry, index) => (
                            <div 
                              key={entry.rank} 
                              className={`leaderboard-item ${index === 0 ? 'top-rank' : ''}`}
                            >
                              <span className="rank">
                                {entry.rank === 1 ? '1st' : 
                                 entry.rank === 2 ? '2nd' : 
                                 entry.rank === 3 ? '3rd' : 
                                 `${entry.rank}th`}
                              </span>
                              <span className="player-name">{entry.username}</span>
                              <span className="player-score">
                                {entry.points} pts
                                <span className="player-time"> ({Math.floor(entry.time / 60)}:{(entry.time % 60).toString().padStart(2, '0')})</span>
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="leaderboard-note">Play today's challenge to climb the ranks!</p>
                  </div>
                ) : (
                  <div className="calendar-tab">
                    <ChallengeCalendar onSelectDate={handleCalendarDateSelect} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <Footer />
        {showProfile && <Profile onClose={() => setShowProfile(false)} />}
        {showOnboarding && <Onboarding onComplete={handleOnboardingComplete} userName={user?.name || 'there'} />}
        {showDailyChallenge && (
          <DailyChallenge 
            onStartChallenge={startDailyChallenge}
            onClose={() => setShowDailyChallenge(false)}
            challengeData={dailyChallengeData}
          />
        )}
        {isAuthenticated && import.meta.env.VITE_DISABLE_ASK_WILL !== 'true' && <AskWill />}
      </div>
    );
  }

  // Show game interface when authenticated and game started
  return (
    <div className="app-container">
    <header className="platform-header">
      <a href={buildAppUrl('/')} className="platform-header__logo">⚡ Passive Income Club</a>
      <nav className="platform-header__nav">
        <a href={buildAppUrl('/')} className="platform-header__link">Home</a>
        <a href={buildAppUrl('/games')} className="platform-header__link">Games</a>
        <a href={buildAppUrl('/tools')} className="platform-header__link">Tools</a>
        <a href={buildAppUrl('/profile')} className="platform-header__user">
          <User size={16} /> {user?.name || user?.email}
        </a>
        <button className="platform-header__logout" onClick={handleLogout} title="Sign out">
          <LogOut size={14} />
        </button>
      </nav>
    </header>
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="back-to-home-btn" onClick={handleBackToHome} title="Back to Home">
            ← Home
          </button>
          <h1>🏠 Deal or Disaster</h1>
        </div>
        <div className="header-right">
          <ScoreDisplay score={score} />
          <button className="logout-btn-small" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {currentCase && (
        <div className={`game-sticky-bar ${showStickyHeader ? 'is-visible' : ''}`} aria-hidden={!showStickyHeader}>
          <span className="game-sticky-bar__address" title={currentCase.address}>
            🏠 {currentCase.address}
          </span>
          <div className="game-sticky-bar__meta">
            <span className="game-sticky-bar__score">⭐ {score.points.toLocaleString()} pts</span>
            <span className={`game-sticky-bar__timer ${timeRemaining < 60 ? 'urgent' : ''}`}>
              ⏱️ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      )}

      {currentCase && (
        <>
          <CaseDisplay
            propertyCase={currentCase}
            timeRemaining={timeRemaining}
            onRedFlagClick={handleRedFlagClick}
            onRedFlagAnswer={handleRedFlagAnswer}
            onTryInvestigate={tryInvestigate}
            investigationBudget={dueDiligenceBudget(currentCase.redFlags.length, currentCase.difficulty)}
            investigationsUsed={investigationsUsed}
            investigationTimeCost={INVESTIGATE_TIME_COST}
            investigationFee={INVESTIGATE_FEE}
          />
          <DecisionButtons
            onDecision={handleDecision}
            disabled={!!result}
          />
        </>
      )}

      <ResultModal 
        result={result} 
        caseData={currentCase} 
        onNextCase={loadNextCase}
        onBackToHome={handleBackToHome}
      />
    </div>
    <Footer />
    {showProfile && <Profile onClose={() => setShowProfile(false)} />}
    {isAuthenticated && import.meta.env.VITE_DISABLE_ASK_WILL !== 'true' && <AskWill />}
    </div>
  );
}

export default App;
