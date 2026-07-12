import { useState, useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { Target, ChevronDown } from 'lucide-react';
import { shortAddr, fmt } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface MetricDef {
  key: string;
  label: string;
  unit: 'currency' | 'pct' | 'ratio' | 'currencyK';
  extract: (p: PropertyAnalysis) => number;
  higherIsBetter: boolean;
  group: string;
}

const METRICS: MetricDef[] = [
  // Cash Flow
  { key: 'cashFlow', label: 'Monthly Cash Flow', unit: 'currency', group: 'Cash Flow',
    extract: p => p.analysis_results?.cashFlow?.monthlyCashFlow ?? 0, higherIsBetter: true },
  { key: 'monthlyRent', label: 'Monthly Rent', unit: 'currency', group: 'Cash Flow',
    extract: p => p.analysis_results?.cashFlow?.monthlyRent ?? 0, higherIsBetter: true },
  { key: 'expenses', label: 'Monthly Expenses', unit: 'currency', group: 'Cash Flow',
    extract: p => p.analysis_results?.cashFlow?.totalMonthlyExpenses ?? 0, higherIsBetter: false },
  // Returns
  { key: 'cocRoi', label: 'Cash-on-Cash ROI', unit: 'pct', group: 'Returns',
    extract: p => p.analysis_results?.roi?.cashOnCashROI ?? 0, higherIsBetter: true },
  { key: 'capRate', label: 'Cap Rate', unit: 'pct', group: 'Returns',
    extract: p => p.analysis_results?.roi?.capRate ?? 0, higherIsBetter: true },
  { key: 'grm', label: 'Gross Rent Multiplier', unit: 'ratio', group: 'Returns',
    extract: p => p.analysis_results?.roi?.grossRentMultiplier ?? 0, higherIsBetter: false },
  // Price & Value
  { key: 'price', label: 'Purchase Price', unit: 'currencyK', group: 'Price',
    extract: p => p.property_data.price, higherIsBetter: false },
  { key: 'priceDiscount', label: 'Price vs Zestimate', unit: 'pct', group: 'Price',
    extract: p => {
      const z = p.property_data.zestimate;
      if (!z) return 0;
      return ((z - p.property_data.price) / z) * 100;
    }, higherIsBetter: true },
  { key: 'priceSqft', label: 'Price / Sq Ft', unit: 'currency', group: 'Price',
    extract: p => p.property_data.sqft ? p.property_data.price / p.property_data.sqft : 0, higherIsBetter: false },
  // Rental Strategy
  { key: 'ltrRent', label: 'LTR Rent Estimate', unit: 'currency', group: 'Rental',
    extract: p => p.analysis_results?.rentalEstimate?.mid ?? p.property_data.rentZestimate ?? 0, higherIsBetter: true },
  { key: 'strRev', label: 'STR Net Revenue', unit: 'currency', group: 'Rental',
    extract: p => p.analysis_results?.strEstimate?.netMonthlyRevenue ?? 0, higherIsBetter: true },
  // Tax
  { key: 'taxSavings', label: 'Year 1 Tax Savings', unit: 'currencyK', group: 'Tax',
    extract: p => p.analysis_results?.taxSavings?.taxSavings ?? 0, higherIsBetter: true },
  { key: 'effReturn', label: 'Effective Return', unit: 'pct', group: 'Tax',
    extract: p => p.analysis_results?.taxSavings?.effectiveFirstYearReturn ?? 0, higherIsBetter: true },
];

const GROUPS = [...new Set(METRICS.map(m => m.group))];

function formatValue(value: number, unit: MetricDef['unit']): string {
  switch (unit) {
    case 'currency': return fmt(Math.round(value));
    case 'currencyK': return `$${(value / 1000).toFixed(0)}k`;
    case 'pct': return `${value.toFixed(1)}%`;
    case 'ratio': return value.toFixed(1);
  }
}

export default function PropertyRadar({ properties }: Props) {
  const [activeGroups, setActiveGroups] = useState<Set<string>>(() => new Set(GROUPS));
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);
  const [hoveredProperty, setHoveredProperty] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState(true);

  const toggleGroup = (group: string) => {
    setActiveGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const visibleMetrics = useMemo(
    () => METRICS.filter(m => activeGroups.has(m.group)),
    [activeGroups],
  );

  // For each metric, compute raw values, min, max, and normalized 0-1 positions
  const rows = useMemo(() =>
    visibleMetrics.map(metric => {
      const rawValues = properties.map(metric.extract);
      const min = Math.min(...rawValues);
      const max = Math.max(...rawValues);
      const range = max - min || 1;
      const normalized = rawValues.map(v => (v - min) / range);
      // Determine winner index
      const winnerIdx = rawValues.reduce((best, v, i) =>
        metric.higherIsBetter
          ? (v > rawValues[best] ? i : best)
          : (v < rawValues[best] ? i : best),
      0);
      return { metric, rawValues, normalized, min, max, winnerIdx };
    }),
  [visibleMetrics, properties]);

  const propNames = properties.map(p => shortAddr(p.property_data.address));

  return (
    <div className="results__card comparison-dashboard__radar">
      <div className="comparison-dashboard__radar-header">
        <h3><Target size={18} /> Property Comparison Radar</h3>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setExpandedGroups(!expandedGroups)}
        >
          Metrics <ChevronDown size={14} style={{ transform: expandedGroups ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {expandedGroups && (
        <div className="comparison-dashboard__radar-filters">
          {GROUPS.map(g => (
            <button
              key={g}
              className={`comparison-dashboard__radar-filter${activeGroups.has(g) ? ' comparison-dashboard__radar-filter--active' : ''}`}
              onClick={() => toggleGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Property legend */}
      <div className="comparison-dashboard__radar-legend">
        {propNames.map((name, i) => (
          <button
            key={i}
            className={`comparison-dashboard__radar-legend-item${hoveredProperty === i ? ' comparison-dashboard__radar-legend-item--active' : ''}`}
            onMouseEnter={() => setHoveredProperty(i)}
            onMouseLeave={() => setHoveredProperty(null)}
            style={{ '--prop-color': PROPERTY_COLORS[i] } as React.CSSProperties}
          >
            <span className="comparison-dashboard__radar-legend-dot" />
            {name}
          </button>
        ))}
      </div>

      {/* The chart rows */}
      <div className="comparison-dashboard__radar-chart">
        {rows.map(({ metric, rawValues, normalized, winnerIdx }) => {
          const isHighlightedRow = hoveredMetric === metric.key;
          return (
            <div
              key={metric.key}
              className={`comparison-dashboard__radar-row${isHighlightedRow ? ' comparison-dashboard__radar-row--hover' : ''}`}
              onMouseEnter={() => setHoveredMetric(metric.key)}
              onMouseLeave={() => setHoveredMetric(null)}
            >
              <div className="comparison-dashboard__radar-label">
                <span className="comparison-dashboard__radar-label-name">{metric.label}</span>
                {!metric.higherIsBetter && (
                  <span className="comparison-dashboard__radar-label-hint">lower is better</span>
                )}
              </div>
              <div className="comparison-dashboard__radar-track">
                {/* Track background */}
                <div className="comparison-dashboard__radar-track-bg" />
                {/* Dots for each property */}
                {normalized.map((pos, i) => {
                  // Flip position if lower is better so "best" is always rightmost visually
                  const displayPos = metric.higherIsBetter ? pos : 1 - pos;
                  const dimmed = hoveredProperty !== null && hoveredProperty !== i;
                  const isWinner = i === winnerIdx;
                  return (
                    <div
                      key={i}
                      className={`comparison-dashboard__radar-dot${isWinner ? ' comparison-dashboard__radar-dot--winner' : ''}${dimmed ? ' comparison-dashboard__radar-dot--dimmed' : ''}`}
                      style={{
                        left: `${displayPos * 100}%`,
                        backgroundColor: PROPERTY_COLORS[i],
                        zIndex: isWinner ? 3 : dimmed ? 1 : 2,
                      }}
                      onMouseEnter={() => setHoveredProperty(i)}
                      onMouseLeave={() => setHoveredProperty(null)}
                    >
                      {/* Tooltip */}
                      <div className="comparison-dashboard__radar-dot-tip">
                        <strong>{propNames[i]}</strong>
                        <span>{formatValue(rawValues[i], metric.unit)}</span>
                      </div>
                    </div>
                  );
                })}
                {/* Best/worst labels on track edges */}
                {isHighlightedRow && (
                  <>
                    <span className="comparison-dashboard__radar-edge comparison-dashboard__radar-edge--left">
                      {metric.higherIsBetter ? 'Worst' : 'Best'}
                    </span>
                    <span className="comparison-dashboard__radar-edge comparison-dashboard__radar-edge--right">
                      {metric.higherIsBetter ? 'Best' : 'Worst'}
                    </span>
                  </>
                )}
              </div>
              {/* Winner badge on right */}
              <div className="comparison-dashboard__radar-winner" style={{ color: PROPERTY_COLORS[winnerIdx] }}>
                {formatValue(rawValues[winnerIdx], metric.unit)}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="comparison-dashboard__radar-empty">Select at least one metric group above to compare properties.</p>
      )}
    </div>
  );
}
