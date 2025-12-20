import { useState, useEffect } from 'react';
import CaseDisplay from './components/CaseDisplay';
import DecisionButtons from './components/DecisionButtons';
import ScoreDisplay from './components/ScoreDisplay';
import ResultModal from './components/ResultModal';
import AuthForm from './components/AuthForm';
import Footer from './components/Footer';
import { PropertyCase, Decision, GameScore, ScoreResult } from './types';
import { getRandomCase } from './data/cases';
import { api } from './services/api';
import logo from './assets/logo.png';
import './App.css';

const CASE_TIME_LIMIT = 180; // 3 minutes in seconds

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentCase, setCurrentCase] = useState<PropertyCase | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(CASE_TIME_LIMIT);
  const [score, setScore] = useState<GameScore>({
    points: 0,
    casesSolved: 0,
    goodDeals: 0,
    badDealsAvoided: 0,
    mistakes: 0,
    redFlagsFound: 0,
  });
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [completedCaseIds, setCompletedCaseIds] = useState<string[]>([]);

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      setIsAuthenticated(true);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // Timer logic
  useEffect(() => {
    if (!gameStarted || !currentCase || result) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Time's up - force a decision
          handleDecision('WALK_AWAY');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, currentCase, result]);

  const startGame = () => {
    setGameStarted(true);
    setScore({
      points: 0,
      casesSolved: 0,
      goodDeals: 0,
      badDealsAvoided: 0,
      mistakes: 0,
      redFlagsFound: 0,
    });
    setCompletedCaseIds([]);
    loadNextCase();
  };

  const loadNextCase = () => {
    const newCase = getRandomCase(completedCaseIds);
    setCurrentCase(newCase);
    setTimeRemaining(CASE_TIME_LIMIT);
    setResult(null);
  };

  const handleAuthSuccess = (_token: string, userData: any) => {
    setIsAuthenticated(true);
    setUser(userData);
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
    });
  };

  const handleRedFlagClick = (flagId: string) => {
    if (!currentCase) return;

    const updatedCase = { ...currentCase };
    const flag = updatedCase.redFlags.find((f) => f.id === flagId);

    if (flag && !flag.discovered) {
      flag.discovered = true;
      setCurrentCase(updatedCase);
      setScore((prev) => ({
        ...prev,
        points: prev.points + 25,
        redFlagsFound: prev.redFlagsFound + 1,
      }));
    }
  };

  const handleDecision = async (decision: Decision) => {
    if (!currentCase || !decision) return;

    let points = 0;
    let message = '';
    let explanation = '';
    const undiscoveredFlags = currentCase.redFlags.filter((f) => !f.discovered && f.severity !== 'low');

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

    setResult({ points, message, explanation });
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
      await api.saveGameSession(newScore);
    } catch (error) {
      console.error('Failed to save score:', error);
    }
  };

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
                    <span className="badge-value">12,450</span>
                    <span className="badge-label">Lifetime Points</span>
                  </div>
                </div>
                <div className="badge-item">
                  <span className="badge-icon">🔥</span>
                  <div className="badge-info">
                    <span className="badge-value">7 Days</span>
                    <span className="badge-label">Current Streak</span>
                  </div>
                </div>
                <div className="badge-item badge-success">
                  <span className="badge-icon">💰</span>
                  <div className="badge-info">
                    <span className="badge-value">23</span>
                    <span className="badge-label">Deals Found</span>
                  </div>
                </div>
                <div className="badge-item badge-danger">
                  <span className="badge-icon">⚠️</span>
                  <div className="badge-info">
                    <span className="badge-value">18</span>
                    <span className="badge-label">Disasters Avoided</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="welcome-text-section">
              <h2>Welcome back, {user?.name || user?.email?.split('@')[0]}! 👋</h2>
              <button className="logout-btn-inline" onClick={handleLogout}>Logout</button>
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
              <p className="challenge-text">90% of beginners fail. Will you beat the odds?</p>
              <button className="start-btn-large" onClick={startGame}>
                🏠 Start New Game
              </button>
            </div>

            <div className="leaderboard-section">
              <h3>🏆 Today's Leaderboard</h3>
              <div className="leaderboard-list">
                <div className="leaderboard-item top-rank">
                  <span className="rank">1st</span>
                  <span className="player-name">DealHunter99</span>
                  <span className="player-score">1,250 pts</span>
                </div>
                <div className="leaderboard-item">
                  <span className="rank">2nd</span>
                  <span className="player-name">PropertyPro</span>
                  <span className="player-score">980 pts</span>
                </div>
                <div className="leaderboard-item">
                  <span className="rank">3rd</span>
                  <span className="player-name">RealEstateAce</span>
                  <span className="player-score">875 pts</span>
                </div>
                <div className="leaderboard-item">
                  <span className="rank">4th</span>
                  <span className="player-name">FlipMaster</span>
                  <span className="player-score">720 pts</span>
                </div>
                <div className="leaderboard-item">
                  <span className="rank">5th</span>
                  <span className="player-name">InvestorKing</span>
                  <span className="player-score">650 pts</span>
                </div>
              </div>
              <p className="leaderboard-note">Play today to climb the ranks!</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-container">
    <div className="app">
      <header className="app-header">
        <h1>🏠 Deal or Disaster</h1>
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
          />
          <DecisionButtons
            onDecision={handleDecision}
            disabled={!!result}
          />
        </>
      )}

      <ResultModal result={result} onNextCase={loadNextCase} />
    </div>
    <Footer />
    </div>
  );
}

export default App;
