import { useState, useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts';
import { Droplets } from 'lucide-react';
import { shortAddr, fmt } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface WaterfallEntry {
  name: string;
  /** The visible bar segment (positive height) */
  value: number;
  /** Invisible base the bar sits on */
  base: number;
  /** The actual signed amount for display */
  display: number;
  type: 'income' | 'expense' | 'total';
}

function buildWaterfall(p: PropertyAnalysis): WaterfallEntry[] {
  const cf = p.analysis_results?.cashFlow;
  if (!cf) return [];

  const rent = cf.monthlyRent;
  let running = rent;

  const entries: WaterfallEntry[] = [
    { name: 'Rent', value: rent, base: 0, display: rent, type: 'income' },
  ];

  const expenses: [string, number][] = [
    ['Mortgage', cf.monthlyMortgage],
    ['Tax', cf.monthlyTax],
    ['Insurance', cf.monthlyInsurance],
    ['Vacancy', cf.monthlyVacancy],
    ['Repairs', cf.monthlyRepairs],
    ['CapEx', cf.monthlyCapex],
  ];
  if (cf.monthlyManagement > 0) {
    expenses.push(['Mgmt', cf.monthlyManagement]);
  }

  for (const [label, amount] of expenses) {
    if (amount <= 0) continue;
    running -= amount;
    entries.push({
      name: label,
      value: amount,
      base: Math.max(running, 0),
      display: -amount,
      type: 'expense',
    });
  }

  // Cash flow total bar
  const cashFlow = cf.monthlyCashFlow;
  entries.push({
    name: 'Cash Flow',
    value: Math.abs(cashFlow),
    base: cashFlow >= 0 ? 0 : Math.abs(cashFlow) > running + Math.abs(cashFlow) ? 0 : 0,
    display: cashFlow,
    type: 'total',
  });

  return entries;
}

const EXPENSE_COLOR = '#ef4444';
const INCOME_COLOR = '#10b981';
const TOTAL_POSITIVE = '#10b981';
const TOTAL_NEGATIVE = '#ef4444';

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload?.[1]) return null;
  const entry = payload[1].payload as WaterfallEntry;
  return (
    <div className="comparison-tooltip">
      <strong>{entry.name}</strong>
      <div style={{ color: entry.type === 'expense' ? EXPENSE_COLOR : entry.display >= 0 ? INCOME_COLOR : EXPENSE_COLOR }}>
        {entry.type === 'expense' ? '−' : ''}{fmt(Math.abs(entry.display))}/mo
      </div>
    </div>
  );
}

export default function CashFlowWaterfall({ properties }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [compareIdx, setCompareIdx] = useState<number | null>(null);

  const propNames = properties.map(p => shortAddr(p.property_data.address));

  const primaryData = useMemo(() => buildWaterfall(properties[selectedIdx]), [properties, selectedIdx]);
  const compareData = useMemo(
    () => compareIdx !== null ? buildWaterfall(properties[compareIdx]) : null,
    [properties, compareIdx],
  );

  // For overlay mode, merge entries by name
  const overlayData = useMemo(() => {
    if (!compareData) return null;
    const map = new Map(compareData.map(e => [e.name, e]));
    return primaryData.map(e => ({
      ...e,
      compareValue: map.get(e.name)?.value ?? 0,
      compareDisplay: map.get(e.name)?.display ?? 0,
      compareBase: map.get(e.name)?.base ?? 0,
    }));
  }, [primaryData, compareData]);

  const chartData = overlayData ?? primaryData;
  const maxVal = useMemo(() => {
    let m = 0;
    for (const d of primaryData) m = Math.max(m, d.base + d.value);
    if (compareData) {
      for (const d of compareData) m = Math.max(m, d.base + d.value);
    }
    return m * 1.1;
  }, [primaryData, compareData]);

  return (
    <div className="results__card comparison-dashboard__waterfall">
      <div className="comparison-dashboard__waterfall-header">
        <h3><Droplets size={18} /> Cash Flow Waterfall</h3>
        <p className="comparison-dashboard__waterfall-desc">
          See exactly where rental income goes — each bar shows the expense eating into your rent.
        </p>
      </div>

      {/* Property selector tabs */}
      <div className="comparison-dashboard__waterfall-tabs">
        <div className="comparison-dashboard__waterfall-tab-group">
          <span className="comparison-dashboard__waterfall-tab-label">Primary:</span>
          {propNames.map((name, i) => (
            <button
              key={i}
              className={`comparison-dashboard__waterfall-tab${selectedIdx === i ? ' comparison-dashboard__waterfall-tab--active' : ''}`}
              style={{ '--tab-color': PROPERTY_COLORS[i] } as React.CSSProperties}
              onClick={() => {
                setSelectedIdx(i);
                if (compareIdx === i) setCompareIdx(null);
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="comparison-dashboard__waterfall-tab-group">
          <span className="comparison-dashboard__waterfall-tab-label">Compare:</span>
          <button
            className={`comparison-dashboard__waterfall-tab${compareIdx === null ? ' comparison-dashboard__waterfall-tab--active' : ''}`}
            onClick={() => setCompareIdx(null)}
          >
            None
          </button>
          {propNames.map((name, i) => i !== selectedIdx && (
            <button
              key={i}
              className={`comparison-dashboard__waterfall-tab${compareIdx === i ? ' comparison-dashboard__waterfall-tab--active' : ''}`}
              style={{ '--tab-color': PROPERTY_COLORS[i] } as React.CSSProperties}
              onClick={() => setCompareIdx(i)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Waterfall chart */}
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={chartData} barGap={compareIdx !== null ? -20 : 4} barCategoryGap="15%">
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis
            domain={[0, maxVal]}
            tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`}
            width={55}
          />
          <Tooltip content={<WaterfallTooltip />} />
          <ReferenceLine y={0} stroke="#e2e8f0" />

          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="primary" fill="transparent" isAnimationActive={false} />
          {/* Visible value bar */}
          <Bar dataKey="value" stackId="primary" radius={[4, 4, 0, 0]} isAnimationActive={true}>
            {(chartData as WaterfallEntry[]).map((entry, i) => {
              let fill: string;
              if (entry.type === 'income') fill = INCOME_COLOR;
              else if (entry.type === 'total') fill = entry.display >= 0 ? TOTAL_POSITIVE : TOTAL_NEGATIVE;
              else fill = EXPENSE_COLOR;
              return <Cell key={i} fill={fill} fillOpacity={compareIdx !== null ? 0.85 : 1} />;
            })}
          </Bar>

          {/* Compare overlay bars */}
          {compareIdx !== null && (
            <>
              <Bar dataKey="compareBase" stackId="compare" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="compareValue" stackId="compare" radius={[4, 4, 0, 0]} isAnimationActive={true} fillOpacity={0.4}>
                {(chartData as any[]).map((entry, i) => {
                  const d = entry.compareDisplay ?? 0;
                  let fill: string;
                  if (entry.type === 'income') fill = PROPERTY_COLORS[compareIdx];
                  else if (entry.type === 'total') fill = d >= 0 ? PROPERTY_COLORS[compareIdx] : TOTAL_NEGATIVE;
                  else fill = PROPERTY_COLORS[compareIdx];
                  return <Cell key={i} fill={fill} />;
                })}
              </Bar>
            </>
          )}
        </BarChart>
      </ResponsiveContainer>

      {/* Summary footer */}
      <div className="comparison-dashboard__waterfall-summary">
        <div className="comparison-dashboard__waterfall-stat" style={{ borderColor: PROPERTY_COLORS[selectedIdx] }}>
          <span className="comparison-dashboard__waterfall-stat-label">{propNames[selectedIdx]}</span>
          <span className={`comparison-dashboard__waterfall-stat-value${(properties[selectedIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0) >= 0 ? ' comparison-dashboard__waterfall-stat-value--pos' : ' comparison-dashboard__waterfall-stat-value--neg'}`}>
            {fmt(properties[selectedIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0)}/mo
          </span>
          <span className="comparison-dashboard__waterfall-stat-sub">
            {((properties[selectedIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0) / (properties[selectedIdx].analysis_results?.cashFlow?.monthlyRent || 1) * 100).toFixed(0)}% margin
          </span>
        </div>
        {compareIdx !== null && (
          <>
            <div className="comparison-dashboard__waterfall-vs">vs</div>
            <div className="comparison-dashboard__waterfall-stat" style={{ borderColor: PROPERTY_COLORS[compareIdx] }}>
              <span className="comparison-dashboard__waterfall-stat-label">{propNames[compareIdx]}</span>
              <span className={`comparison-dashboard__waterfall-stat-value${(properties[compareIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0) >= 0 ? ' comparison-dashboard__waterfall-stat-value--pos' : ' comparison-dashboard__waterfall-stat-value--neg'}`}>
                {fmt(properties[compareIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0)}/mo
              </span>
              <span className="comparison-dashboard__waterfall-stat-sub">
                {((properties[compareIdx].analysis_results?.cashFlow?.monthlyCashFlow ?? 0) / (properties[compareIdx].analysis_results?.cashFlow?.monthlyRent || 1) * 100).toFixed(0)}% margin
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
