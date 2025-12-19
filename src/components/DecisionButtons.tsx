import { Decision } from '../types';

interface DecisionButtonsProps {
  onDecision: (decision: Decision) => void;
  disabled: boolean;
}

export default function DecisionButtons({ onDecision, disabled }: DecisionButtonsProps) {
  return (
    <div className="decision-buttons">
      <button
        className="decision-btn buy-btn"
        onClick={() => onDecision('BUY')}
        disabled={disabled}
      >
        <span className="btn-icon">✅</span>
        <span className="btn-text">BUY</span>
        <span className="btn-subtitle">Make the deal</span>
      </button>

      <button
        className="decision-btn investigate-btn"
        onClick={() => onDecision('INVESTIGATE')}
        disabled={disabled}
      >
        <span className="btn-icon">⚠️</span>
        <span className="btn-text">INVESTIGATE MORE</span>
        <span className="btn-subtitle">Need more info</span>
      </button>

      <button
        className="decision-btn walk-btn"
        onClick={() => onDecision('WALK_AWAY')}
        disabled={disabled}
      >
        <span className="btn-icon">❌</span>
        <span className="btn-text">WALK AWAY</span>
        <span className="btn-subtitle">Too risky</span>
      </button>
    </div>
  );
}
