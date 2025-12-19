import { GameScore } from '../types';

interface ScoreDisplayProps {
  score: GameScore;
}

export default function ScoreDisplay({ score }: ScoreDisplayProps) {
  return (
    <div className="score-display">
      <div className="score-main">
        <span className="score-label">Score</span>
        <span className="score-points">{score.points}</span>
      </div>
      <div className="score-stats">
        <div className="stat">
          <span className="stat-value">{score.casesSolved}</span>
          <span className="stat-label">Cases</span>
        </div>
        <div className="stat">
          <span className="stat-value">{score.goodDeals}</span>
          <span className="stat-label">Good Deals</span>
        </div>
        <div className="stat">
          <span className="stat-value">{score.badDealsAvoided}</span>
          <span className="stat-label">Avoided</span>
        </div>
        <div className="stat">
          <span className="stat-value">{score.redFlagsFound}</span>
          <span className="stat-label">Flags Found</span>
        </div>
        <div className="stat">
          <span className="stat-value">{score.mistakes}</span>
          <span className="stat-label">Mistakes</span>
        </div>
      </div>
    </div>
  );
}
