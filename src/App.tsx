import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CaseDisplay from './components/CaseDisplay';
import DecisionButtons from './components/DecisionButtons';
import ScoreDisplay from './components/ScoreDisplay';
import ResultModal from './components/ResultModal';
import AuthForm from './components/AuthForm';
import Footer from './components/Footer';
import Profile from './components/Profile';
import Onboarding from './components/Onboarding';
import DailyChallenge from './components/DailyChallenge';
import ChallengeCalendar from './components/ChallengeCalendar';
import AskWill from './components/AskWill';
import { PropertyCase, Decision, GameScore, ScoreResult } from './types';
import { getRandomCase } from './data/cases';
import { api } from './services/api';
import logo from './assets/logo.png';
import './App.css';

const CASE_TIME_LIMIT = 300; // 5 minutes in seconds

function App() {
  const { date, dealId } = useParams();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [dailyChallengeData, setDailyChallengeData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'calendar'>('leaderboard');
  const [currentCase, setCurrentCase] = useState<PropertyCase | null>(null);
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
      // Clear auth state when token expires
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setIsAuthenticated(false);
      setUser(null);
      setGameStarted(false);
      setShowProfile(false);
      setShowOnboarding(false);
      setShowDailyChallenge(false);
    });
  }, []);

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    } else {
      setInitializing(false);
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
        setCurrentCase(caseData);
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
        question: flag.question,
        choices: flag.choices,
        correctChoice: flag.correctChoice,
        answerExplanation: flag.answerExplanation,
      })),
      photos: property.photos || [],
      description: property.funnyStory || property.description || 'AI-generated foreclosure scenario',
      occupancyStatus: property.occupancyStatus || ('unknown' as const),
      hoaFees: property.hoaFees,
      actualValue: property.actualValue || property.estimatedValue,
      isGoodDeal: property.isGoodDeal,
      difficulty: challengeData.difficulty,
      correctDecision: property.correctDecision,
      decisionExplanation: property.explanation,
    };
    
    setCurrentCase(dailyCase);
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
    setCurrentCase(newCase);
    setTimeRemaining(CASE_TIME_LIMIT);
    setResult(null);
    
    // Update URL to deal ID
    navigate(`/deal/${newCase.id}`);
  };

  const handleAuthSuccess = (_token: string, userData: any) => {
    setIsAuthenticated(true);
    setUser(userData);
    // Show onboarding if user hasn't completed it
    if (!userData.onboarding_completed) {
      setShowOnboarding(true);
    }
  };

  const handleOnboardingComplete = async (data: any) => {
    const isProduction = window.location.hostname !== 'localhost';
    const API_URL = isProduction ? '' : 'http://localhost:3001';
    
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
    setIsAuthenticated(false);
    setUser(null);
    setGameStarted(false);
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

  const handleRedFlagClick = (flagId: string) => {
    if (!currentCase) return;

    const updatedCase = { ...currentCase };
    const flag = updatedCase.redFlags.find((f) => f.id === flagId);

    if (flag && !flag.discovered) {
      flag.discovered = true;
      setCurrentCase(updatedCase);
      
      // Only award discovery points if there's no question (old behavior)
      if (!flag.question) {
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
    }
  };

  const handleRedFlagAnswer = (flagId: string, answerIndex: number) => {
    if (!currentCase) return;

    const updatedCase = { ...currentCase };
    const flag = updatedCase.redFlags.find((f) => f.id === flagId);

    if (flag && flag.correctChoice !== undefined) {
      flag.userAnswer = answerIndex;
      setCurrentCase(updatedCase);

      const isCorrect = answerIndex === flag.correctChoice;
      
      // Bonus points for high/severe severity flags
      let points = 0;
      if (isCorrect) {
        points = (flag.severity === 'high' || flag.severity === 'severe') ? 75 : 50;
      } else {
        points = -25;
      }

      setScore((prev) => ({
        ...prev,
        points: prev.points + points,
        redFlagCorrect: isCorrect ? prev.redFlagCorrect + 1 : prev.redFlagCorrect,
        redFlagMistakes: !isCorrect ? prev.redFlagMistakes + 1 : prev.redFlagMistakes,
      }));
    }
  };

  const handleDecision = async (decision: Decision, forcedTimeTaken?: number) => {
    if (!currentCase || !decision) return;

    let points = 0;
    let message = '';
    let explanation = '';
    const undiscoveredFlags = currentCase.redFlags.filter((f) => !f.discovered && f.severity !== 'red-herring');
    const missedSevereFlags = currentCase.redFlags.filter((f) => !f.discovered && (f.severity === 'severe' || f.severity === 'high'));

    if (decision === 'BUY') {
      if (currentCase.isGoodDeal) {
        points = 100;
        message = '✅ Excellent Decision!';
        explanation = `This was a solid deal! You'll make approximately $${(currentCase.actualValue - currentCase.auctionPrice - currentCase.repairEstimate).toLocaleString()} profit.`;
        setScore((prev) => ({ ...prev, goodDeals: prev.goodDeals + 1 }));
      } else {
        points = -150;
        message = '❌ Bad Investment!';
        const hiddenIssues = undiscoveredFlags.map((f) => f.description).join(' ');
        explanation = `This was a trap! ${hiddenIssues} You would lose approximately $${(currentCase.auctionPrice + currentCase.repairEstimate - currentCase.actualValue).toLocaleString()}.`;
        setScore((prev) => ({ ...prev, mistakes: prev.mistakes + 1 }));
        
        // Additional penalty for buying with missed severe issues
        if (missedSevereFlags.length > 0) {
          points -= 50;
          explanation += ` WARNING: You missed ${missedSevereFlags.length} critical issue(s) that should have triggered WALK_AWAY.`;
        }
      }
    } else if (decision === 'WALK_AWAY') {
      if (!currentCase.isGoodDeal) {
        points = 50;
        message = '👍 Smart Move!';
        explanation = `Good instincts! You avoided a bad deal. ${undiscoveredFlags.length > 0 ? undiscoveredFlags[0].description : 'There were hidden issues that would have cost you.'}`;
        setScore((prev) => ({ ...prev, badDealsAvoided: prev.badDealsAvoided + 1 }));
      } else {
        points = -50;
        message = '😬 Missed Opportunity';
        explanation = 'This was actually a good deal. You were too cautious and missed out on a profitable investment.';
        setScore((prev) => ({ ...prev, mistakes: prev.mistakes + 1 }));
      }
    } else if (decision === 'INVESTIGATE') {
      // Investigating gives partial credit but costs time
      points = 10;
      message = '⚠️ More Research Needed';
      explanation = 'In a real auction, you don\'t have time to investigate further. You need to decide now: BUY or WALK AWAY.';
    }

    setScore((prev) => ({
      ...prev,
      points: prev.points + points,
      casesSolved: prev.casesSolved + 1,
    }));

    setResult({ points, message, explanation, userDecision: decision });
    setCompletedCaseIds([...completedCaseIds, currentCase.id]);

    // Save to backend after each decision
    const newScore = {
      points: score.points + points,
      casesSolved: score.casesSolved + 1,
      goodDeals: score.goodDeals + (decision === 'BUY' && currentCase.isGoodDeal ? 1 : 0),
      badDealsAvoided: score.badDealsAvoided + (decision === 'WALK_AWAY' && !currentCase.isGoodDeal ? 1 : 0),
      mistakes: score.mistakes + ((decision === 'BUY' && !currentCase.isGoodDeal) || (decision === 'WALK_AWAY' && currentCase.isGoodDeal) ? 1 : 0),
      redFlagsFound: score.redFlagsFound,
    };

    try {
      if (isDailyChallenge && dailyChallengeData) {
        // Save daily challenge completion
        await api.completeDailyChallenge(dailyChallengeData.id, {
          decision,
          points_earned: points,
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
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <div className="homepage">
        <div className="homepage-left">
          <img 
            src={logo} 
            alt="Deal or Disaster Logo" 
            className="homepage-logo"
          />
          <h1 className="homepage-title">Welcome to the Foreclosure Jungle!</h1>
          <p className="homepage-tagline">
            Where one person's financial disaster is your treasure hunt... if you can spot the traps. 🎯
          </p>
          
          <div className="homepage-features">
            <div className="feature">
              <span className="feature-icon">📅</span>
              <div>
                <h3>Daily Challenges</h3>
                <p>Fresh foreclosure nightmares every day. Will you strike gold or get buried in hidden costs?</p>
              </div>
            </div>
            
            <div className="feature">
              <span className="feature-icon">🏆</span>
              <div>
                <h3>Leaderboard Glory</h3>
                <p>Climb the ranks and prove you're not just another rookie who buys a house with a surprise sinkhole.</p>
              </div>
            </div>
            
            <div className="feature">
              <span className="feature-icon">🎖️</span>
              <div>
                <h3>Earn Badges</h3>
                <p>From "Red Flag Hunter" to "Deal Sniper" - collect achievements that actually mean something (unlike that time you bought a fixer-upper with no foundation).</p>
              </div>
            </div>
            
            <div className="feature">
              <span className="feature-icon">🎓</span>
              <div>
                <h3>Master the Game</h3>
                <p>Learn to spot title issues, calculate real costs, and avoid properties that'll drain your bank account faster than your ex. We'll teach you the fundamentals of foreclosure investing without the $5,000 guru course.</p>
              </div>
            </div>
          </div>

          <div className="homepage-warning">
            <p>⚠️ <strong>Warning:</strong> 90% of beginners fail this simulation. Are you part of the 10% who can actually make money in foreclosure auctions?</p>
          </div>
        </div>

        <div className="homepage-right">
          <AuthForm onSuccess={handleAuthSuccess} />
        </div>
      </div>
      <Footer />
    </div>
  );
}

  if (!gameStarted) {
    return (
      <div className="app-container">
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
                    <p>Examine the property details, auction price, and estimated repairs carefully.</p>
                  </div>
                </div>
                <div className="instruction-step">
                  <span className="step-number">2</span>
                  <div>
                    <h4>Find Red Flags</h4>
                    <p>Click on documents to discover hidden issues. Each flag found earns +25 points!</p>
                  </div>
                </div>
                <div className="instruction-step">
                  <span className="step-number">3</span>
                  <div>
                    <h4>Make Your Decision</h4>
                    <p>You have 3 minutes to decide: BUY the property, INVESTIGATE further, or WALK AWAY.</p>
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
        {isAuthenticated && <AskWill />}
      </div>
    );
  }

  // Show game interface when authenticated and game started
  return (
    <div className="app-container">
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
        <>
          <CaseDisplay
            propertyCase={currentCase}
            timeRemaining={timeRemaining}
            onRedFlagClick={handleRedFlagClick}
            onRedFlagAnswer={handleRedFlagAnswer}
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
    {isAuthenticated && <AskWill />}
    </div>
  );
}

export default App;
