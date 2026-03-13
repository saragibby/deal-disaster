import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { ScenarioParams } from '../../utils/comparisonUtils.js';

interface Props {
  scenario: ScenarioParams;
  originalVacancyPct: number;
  onChange: (scenario: ScenarioParams) => void;
  onReset: () => void;
}

export default function ScenarioSliders({ scenario, originalVacancyPct, onChange, onReset }: Props) {
  const vacancyValue = scenario.vacancyPct ?? originalVacancyPct;
  const rentValue = scenario.rentAdjustPct;
  const isModified = scenario.vacancyPct !== null || scenario.rentAdjustPct !== 0;

  return (
    <div className={`results__card comparison-dashboard__scenario${isModified ? ' comparison-dashboard__scenario--active' : ''}`}>
      <div className="comparison-dashboard__scenario-header">
        <h3><SlidersHorizontal size={18} /> What-If Scenarios</h3>
        {isModified && (
          <button className="btn btn--ghost" onClick={onReset} title="Reset to defaults">
            <RotateCcw size={14} /> Reset
          </button>
        )}
      </div>
      <p className="comparison-dashboard__scenario-desc">
        Stress-test your investments. Adjust vacancy and rent to see how properties perform under different conditions.
      </p>
      <div className="comparison-dashboard__scenario-controls">
        <div className="comparison-dashboard__scenario-slider">
          <div className="comparison-dashboard__scenario-label">
            <span>Vacancy Rate</span>
            <strong className={scenario.vacancyPct !== null ? 'comparison-dashboard__scenario-changed' : ''}>
              {vacancyValue}%
            </strong>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={vacancyValue}
            onChange={e => onChange({ ...scenario, vacancyPct: Number(e.target.value) })}
          />
          <div className="comparison-dashboard__scenario-range">
            <span>0%</span>
            <span>15%</span>
            <span>30%</span>
          </div>
        </div>
        <div className="comparison-dashboard__scenario-slider">
          <div className="comparison-dashboard__scenario-label">
            <span>Rent Adjustment</span>
            <strong className={rentValue !== 0 ? 'comparison-dashboard__scenario-changed' : ''}>
              {rentValue >= 0 ? '+' : ''}{rentValue}%
            </strong>
          </div>
          <input
            type="range"
            min={-30}
            max={30}
            step={1}
            value={rentValue}
            onChange={e => onChange({ ...scenario, rentAdjustPct: Number(e.target.value) })}
          />
          <div className="comparison-dashboard__scenario-range">
            <span>−30%</span>
            <span>0%</span>
            <span>+30%</span>
          </div>
        </div>
      </div>
      {isModified && (
        <div className="comparison-dashboard__scenario-badge">
          Scenario active — all metrics below reflect adjusted values
        </div>
      )}
    </div>
  );
}
