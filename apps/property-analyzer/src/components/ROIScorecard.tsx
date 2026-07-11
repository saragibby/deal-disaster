import { useMemo } from 'react';
import type { ROIMetrics } from '@deal-platform/shared-types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import TermExplainer, { findExplainer } from './TermExplainer';

interface Props {
  roi: ROIMetrics;
}

type Signal = 'Strong' | 'Fair' | 'Weak';

interface GaugeConfig {
  label: string;
  value: number;
  displayValue: string;
  /** Range for the bar track */
  min: number;
  max: number;
  /** Zone boundaries (in value space, ascending) */
  zones: [number, number, number]; // [redEnd, yellowEnd, max]
  /** Whether lower values are better (inverts color mapping) */
  inverted?: boolean;
}

function getSignal(config: GaugeConfig): Signal {
  const { value, zones, inverted } = config;
  if (inverted) {
    if (value < zones[0]) return 'Strong';
    if (value < zones[1]) return 'Fair';
    return 'Weak';
  }
  if (value >= zones[1]) return 'Strong';
  if (value >= zones[0]) return 'Fair';
  return 'Weak';
}

function signalColor(signal: Signal): string {
  if (signal === 'Strong') return 'var(--success)';
  if (signal === 'Fair') return 'var(--warning)';
  return 'var(--danger)';
}

function SignalIcon({ signal }: { signal: Signal }) {
  if (signal === 'Strong') return <TrendingUp size={16} />;
  if (signal === 'Fair') return <Minus size={16} />;
  return <TrendingDown size={16} />;
}



function GaugeBar({ config }: { config: GaugeConfig }) {
  const signal = getSignal(config);
  const color = signalColor(signal);

  const explainer = findExplainer(config.label);

  return (
    <div className="roi-scorecard__card">
      <div className="roi-scorecard__card-head">
        <span className="roi-scorecard__gauge-label">{config.label}</span>
        {explainer && <TermExplainer info={explainer} />}
      </div>
      <span className="roi-scorecard__gauge-value">{config.displayValue}</span>
      <div className="roi-scorecard__signal" style={{ color }}>
        <SignalIcon signal={signal} />
        <span>{signal}</span>
      </div>
    </div>
  );
}

export default function ROIScorecard({ roi }: Props) {
  const gauges = useMemo<GaugeConfig[]>(
    () => [
      {
        label: 'Cash-on-Cash ROI',
        value: roi.cashOnCashROI,
        displayValue: `${roi.cashOnCashROI.toFixed(1)}%`,
        min: 0,
        max: 15,
        zones: [4, 8, 15],
      },
      {
        label: 'Cap Rate',
        value: roi.capRate,
        displayValue: `${roi.capRate.toFixed(1)}%`,
        min: 0,
        max: 12,
        zones: [5, 8, 12],
      },
      {
        label: 'Gross Rent Multiplier',
        value: roi.grossRentMultiplier,
        displayValue: `${roi.grossRentMultiplier.toFixed(1)}x`,
        min: 5,
        max: 25,
        zones: [10, 15, 25],
        inverted: true,
      },
    ],
    [roi],
  );

  return (
    <div className="roi-scorecard">
      {gauges.map(g => (
        <GaugeBar key={g.label} config={g} />
      ))}
    </div>
  );
}
