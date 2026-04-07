import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  MTREstimate, STREstimate, RentalEstimate,
  FullAnalysisResult, MarketStatistics,
} from '@deal-platform/shared-types';
import { Home, Building2, Clock, DollarSign, TrendingUp, Sparkles, Shield, TrendingDown, Minus } from 'lucide-react';
import { findExplainer } from './TermExplainer';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Props {
  ltrRent: number;
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
  rentalEstimate?: RentalEstimate;
  dataSources?: FullAnalysisResult['dataSources'];
  marketStatistics?: MarketStatistics;
}

interface StrategyCard {
  key: 'ltr' | 'mtr' | 'str';
  label: string;
  icon: React.ReactNode;
  netMonthly: number;
  tagline: string;
  available: boolean;
  confidence?: 'low' | 'medium' | 'high';
  source?: string;
  revenueRange?: { low: number; mid: number; high: number };
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function ConfidenceBadge({ confidence, source }: { confidence?: string; source?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  if (!confidence) return null;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const colors: Record<string, string> = {
    high: '#22c55e',
    medium: '#eab308',
    low: '#f97316',
  };
  const color = colors[confidence] || '#94a3b8';
  const sourceLabel = source === 'rentcast' ? 'RentCast' : source === 'airdna' ? 'AirDNA'
    : source === 'blended' ? 'Blended' : 'Estimated';
  const explainer = findExplainer(`confidence ${confidence}`);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    if (!tooltipRef.current || !ref.current) return;
    const node = tooltipRef.current;
    const triggerRect = ref.current.getBoundingClientRect();
    const tooltipHeight = node.offsetHeight;
    node.style.top = `${triggerRect.top - tooltipHeight - 10}px`;
    node.style.left = `${triggerRect.left + triggerRect.width / 2 - 150}px`;
    node.style.opacity = '1';
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div className="strategy-comparison__badges" ref={ref} style={{ position: 'relative' }}>
      <span
        className="strategy-comparison__confidence-badge"
        style={{ color, borderColor: color, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <Shield size={11} /> {confidence}
      </span>
      <span className="strategy-comparison__source-badge">{sourceLabel}</span>
      {open && explainer && createPortal(
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: -9999,
            left: -9999,
            opacity: 0,
            zIndex: 10000,
            width: 300,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
            textAlign: 'left' as const,
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>{explainer.term}</div>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: '#334155', margin: 0 }}>{explainer.definition}</p>
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', marginLeft: -6,
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid #ffffff',
          }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function RevenueRange({ range }: { range?: { low: number; mid: number; high: number } }) {
  if (!range) return null;
  return (
    <div className="strategy-comparison__range">
      <span className="strategy-comparison__range-bound">{fmt(range.low)}</span>
      <span className="strategy-comparison__range-sep">–</span>
      <span className="strategy-comparison__range-bound">{fmt(range.high)}</span>
      <span className="strategy-comparison__range-label">revenue range</span>
    </div>
  );
}

function MarketTrendBadge({ stats }: { stats?: MarketStatistics }) {
  if (!stats) return null;
  const icon = stats.rentTrend === 'rising' ? <TrendingUp size={13} />
    : stats.rentTrend === 'declining' ? <TrendingDown size={13} />
    : <Minus size={13} />;
  const color = stats.rentTrend === 'rising' ? '#22c55e'
    : stats.rentTrend === 'declining' ? '#ef4444'
    : '#eab308';
  const sign = stats.rentGrowthPct > 0 ? '+' : '';
  return (
    <div className="strategy-comparison__market-trend">
      <span className="strategy-comparison__market-trend-badge" style={{ color, borderColor: color }}>
        {icon} {stats.rentTrend} ({sign}{stats.rentGrowthPct.toFixed(1)}% YoY)
      </span>
      <span className="strategy-comparison__market-trend-detail">
        Median: {fmt(stats.medianRent)}/mo · {stats.totalListings} listings
        {stats.avgDaysOnMarket > 0 && ` · ${stats.avgDaysOnMarket} avg DOM`}
      </span>
    </div>
  );
}

function ComparisonBar({ cards, maxRevenue }: { cards: StrategyCard[]; maxRevenue: number }) {
  return (
    <div className="strategy-comparison__bars">
      {cards.map((card) => {
        const width = maxRevenue > 0 ? (card.netMonthly / maxRevenue) * 100 : 0;
        return (
          <div key={card.key} className="strategy-comparison__bar-row">
            <span className="strategy-comparison__bar-label">{card.label}</span>
            <div className="strategy-comparison__bar-track">
              <div
                className={`strategy-comparison__bar-fill strategy-comparison__bar-fill--${card.key}`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="strategy-comparison__bar-value">{fmt(card.netMonthly)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CostComparisonRow({
  mtrEstimate,
  strEstimate,
  strategies,
}: {
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
  strategies: StrategyCard[];
}) {
  const rows: { label: string; icon: React.ReactNode; values: Record<string, string> }[] = [
    {
      label: 'Management effort',
      icon: <TrendingUp size={16} />,
      values: {
        ltr: 'Low',
        mtr: 'Medium',
        str: 'High',
      },
    },
    {
      label: 'Turnover frequency',
      icon: <Clock size={16} />,
      values: {
        ltr: '~1/yr',
        mtr: mtrEstimate ? `${mtrEstimate.turnoversPerYear}/yr` : '—',
        str: 'Varies',
      },
    },
    {
      label: 'Upfront cost',
      icon: <DollarSign size={16} />,
      values: {
        ltr: 'None',
        mtr: mtrEstimate ? fmt(mtrEstimate.furnishingCosts.totalCost) : '—',
        str: strEstimate ? 'Varies' : 'None',
      },
    },
  ];

  const activeStrategies = strategies.filter((s) => s.available);

  return (
    <div className="strategy-comparison__glance">
      <h4 className="strategy-comparison__glance-heading">At a Glance</h4>
      <table className="strategy-comparison__glance-table">
        <thead>
          <tr>
            <th className="strategy-comparison__glance-th" />
            {activeStrategies.map((s) => (
              <th key={s.key} className={`strategy-comparison__glance-th strategy-comparison__glance-th--${s.key}`}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="strategy-comparison__glance-tr">
              <td className="strategy-comparison__glance-label">
                {row.icon}
                <span>{row.label}</span>
              </td>
              {activeStrategies.map((s) => (
                <td key={s.key} className="strategy-comparison__glance-td">
                  {row.values[s.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function StrategyComparison({ ltrRent, mtrEstimate, strEstimate, rentalEstimate, dataSources, marketStatistics }: Props) {
  // Render nothing if neither MTR nor STR data is available
  if (!mtrEstimate && !strEstimate) return null;

  const strategies: StrategyCard[] = [
    {
      key: 'ltr',
      label: 'Long-Term',
      icon: <Home size={20} />,
      netMonthly: ltrRent,
      tagline: 'Unfurnished · Long lease',
      available: true,
      confidence: rentalEstimate?.confidence,
      source: dataSources?.rental,
      revenueRange: rentalEstimate ? { low: rentalEstimate.low, mid: rentalEstimate.mid, high: rentalEstimate.high } : undefined,
    },
    {
      key: 'mtr',
      label: 'Mid-Term',
      icon: <Building2 size={20} />,
      netMonthly: mtrEstimate?.netMonthlyRevenue ?? 0,
      tagline: mtrEstimate
        ? `Furnished · ${mtrEstimate.avgStayMonths}mo avg stay`
        : '',
      available: !!mtrEstimate,
      confidence: mtrEstimate?.confidence,
      source: dataSources?.mtr,
      revenueRange: mtrEstimate?.revenueRange,
    },
    {
      key: 'str',
      label: 'Short-Term',
      icon: <Sparkles size={20} />,
      netMonthly: strEstimate?.netMonthlyRevenue ?? 0,
      tagline: strEstimate
        ? `${fmt(strEstimate.nightlyRate)}/night · ${pct(strEstimate.occupancyRate)} occ`
        : '',
      available: !!strEstimate,
      confidence: strEstimate?.confidence,
      source: dataSources?.str,
      revenueRange: strEstimate?.revenueRange,
    },
  ];

  const activeStrategies = strategies.filter((s) => s.available);
  const maxRevenue = Math.max(...activeStrategies.map((s) => s.netMonthly));
  const bestKey = activeStrategies.reduce((best, s) =>
    s.netMonthly > best.netMonthly ? s : best,
  ).key;

  return (
    <div className="strategy-comparison">
      <h3 className="strategy-comparison__title">
        <TrendingUp size={18} />
        Strategy Comparison
      </h3>

      {/* Market trend indicator */}
      <MarketTrendBadge stats={marketStatistics} />

      {/* Cards */}
      <div
        className="strategy-comparison__cards"
        style={{ gridTemplateColumns: `repeat(${activeStrategies.length}, 1fr)` }}
      >
        {activeStrategies.map((strategy) => {
          const isBest = strategy.key === bestKey && activeStrategies.length > 1;
          return (
          <div
            key={strategy.key}
            className={`strategy-comparison__card strategy-comparison__card--${strategy.key}${isBest ? ' strategy-comparison__card--best' : ''}`}
          >
            <div className="strategy-comparison__card-header">
              <span className={`strategy-comparison__icon strategy-comparison__icon--${strategy.key}`}>
                {strategy.icon}
              </span>
              <span className="strategy-comparison__card-label">{strategy.label}</span>
            </div>
            {isBest && (
              <span className="strategy-comparison__best-star">⭐</span>
            )}

            <ConfidenceBadge confidence={strategy.confidence} source={strategy.source} />

            <div className="strategy-comparison__revenue">
              <span className="strategy-comparison__revenue-monthly">
                {fmt(strategy.netMonthly)}
              </span>
              <span className="strategy-comparison__revenue-period">/mo net</span>
            </div>

            <div className="strategy-comparison__revenue-annual">
              {fmt(strategy.netMonthly * 12)}/yr
            </div>

            <RevenueRange range={strategy.revenueRange} />

            <div className="strategy-comparison__tagline">{strategy.tagline}</div>
          </div>
          );
        })}
      </div>

      {/* Revenue comparison bars */}
      <ComparisonBar cards={activeStrategies} maxRevenue={maxRevenue} />

      {/* Cost / effort comparison */}
      <CostComparisonRow
        mtrEstimate={mtrEstimate}
        strEstimate={strEstimate}
        strategies={strategies}
      />
    </div>
  );
}
