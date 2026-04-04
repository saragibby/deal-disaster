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



/** Clamp a value between min and max, then return 0–100 position percentage */
function pct(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function GaugeBar({ config }: { config: GaugeConfig }) {
  const signal = getSignal(config);
  const color = signalColor(signal);
  const position = pct(config.value, config.min, config.max);

  // Zone widths as percentages of the full track
  const zone1Width = pct(config.zones[0], config.min, config.max);
  const zone2Width = pct(config.zones[1], config.min, config.max) - zone1Width;
  const zone3Width = 100 - zone1Width - zone2Width;

  // Color order depends on inversion
  const colors = config.inverted
    ? ['var(--success)', 'var(--warning)', 'var(--danger)']
    : ['var(--danger)', 'var(--warning)', 'var(--success)'];

  const explainer = findExplainer(config.label);

  return (
    <div className="roi-scorecard__gauge">
      <div className="roi-scorecard__gauge-header">
        <span className="roi-scorecard__gauge-label">
          {config.label}
          {explainer && <TermExplainer info={explainer} />}
        </span>
        <span className="roi-scorecard__gauge-value">{config.displayValue}</span>
      </div>

      <div className="roi-scorecard__track">
        <div
          className="roi-scorecard__zone"
          style={{ width: `${zone1Width}%`, background: colors[0] }}
        />
        <div
          className="roi-scorecard__zone"
          style={{ width: `${zone2Width}%`, background: colors[1] }}
        />
        <div
          className="roi-scorecard__zone"
          style={{ width: `${zone3Width}%`, background: colors[2] }}
        />
        <div
          className="roi-scorecard__marker"
          style={{ left: `${position}%` }}
        />
      </div>

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
