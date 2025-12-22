import { useState, useEffect } from 'react';
import CaseDisplay from './components/CaseDisplay';
import DecisionButtons from './components/DecisionButtons';
import ScoreDisplay from './components/ScoreDisplay';
import ResultModal from './components/ResultModal';
import { PropertyCase, Decision, GameScore, ScoreResult } from './types';
import { getRandomCase } from './data/cases';
import './App.css';

const CASE_TIME_LIMIT = 180; // 3 minutes in seconds

function App() {
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
    loadNextCase();
  };

  const loadNextCase = () => {
    const newCase = getRandomCase(completedCaseIds);
    setCurrentCase(newCase);
    setTimeRemaining(CASE_TIME_LIMIT);
    setResult(null);
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

  const handleDecision = (decision: Decision) => {
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
  };

  if (!gameStarted) {
    return (
      <div className="app">
        <div className="welcome-screen">
          <h1>🏠 Deal or Disaster</h1>
          <p className="tagline">Master the art of foreclosure investing</p>
          <div className="game-rules">
            <h2>How to Play</h2>
            <ul>
              <li>Review each foreclosure case carefully</li>
              <li>You have 3-5 minutes to make your decision</li>
              <li>Look for hidden red flags in the documents</li>
              <li>Decide: BUY, INVESTIGATE, or WALK AWAY</li>
            </ul>
            <h3>Scoring</h3>
            <table className="scoring-table">
              <tbody>
                <tr>
                  <td>Buy good deal</td>
                  <td>+100 points</td>
                </tr>
                <tr>
                  <td>Buy bad deal</td>
                  <td>-150 points</td>
                </tr>
                <tr>
                  <td>Walk from bad deal</td>
                  <td>+50 points</td>
                </tr>
                <tr>
                  <td>Walk from great deal</td>
                  <td>-50 points</td>
                </tr>
                <tr>
                  <td>Catch a hidden red flag</td>
                  <td>+25 bonus</td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="start-btn" onClick={startGame}>
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏠 Deal or Disaster</h1>
        <ScoreDisplay score={score} />
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

      <ResultModal result={result} caseData={currentCase} onNextCase={loadNextCase} />
    </div>
  );
}

export default App;
