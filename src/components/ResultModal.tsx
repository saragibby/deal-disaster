import { ScoreResult } from '../types';

interface ResultModalProps {
  result: ScoreResult | null;
  onNextCase: () => void;
}

export default function ResultModal({ result, onNextCase }: ResultModalProps) {
  if (!result) return null;

  const getResultClass = () => {
    if (result.points >= 100) return 'excellent';
    if (result.points >= 50) return 'good';
    if (result.points > 0) return 'okay';
    return 'bad';
  };

  return (
    <div className="modal-overlay">
      <div className={`result-modal ${getResultClass()}`}>
        <div className="result-header">
          <h2>{result.message}</h2>
          <div className="result-points">
            {result.points > 0 ? '+' : ''}{result.points} points
          </div>
        </div>
        <div className="result-explanation">
          <p>{result.explanation}</p>
        </div>
        <button className="next-case-btn" onClick={onNextCase}>
          Next Case →
        </button>
      </div>
    </div>
  );
}
