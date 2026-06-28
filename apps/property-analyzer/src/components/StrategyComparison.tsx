import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  MTREstimate, STREstimate, RentalEstimate,
  FullAnalysisResult, MarketStatistics,
  StrategyComparison as StrategyComparisonData,
} from '@deal-platform/shared-types';
import { Home, Building2, Clock, DollarSign, TrendingUp, Sparkles, Shield, ShieldAlert, TrendingDown, Minus } from 'lucide-react';
import { findExplainer } from './TermExplainer';
import { estimateApplianceCost, estimateFurnitureCost } from '../utils/calculations';

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
  /** Single source of truth for ranking; cards display its net cash flow figures. */
  strategyComparison: StrategyComparisonData;
  /** Currently selected rental type, driven by the rent slider above the cards. */
  selectedKey?: 'ltr' | 'mtr' | 'str';
  /** Called when a card is clicked to make it the active rental type. */
  onSelectKey?: (key: 'ltr' | 'mtr' | 'str') => void;
  /** Bedroom count — drives furniture / appliance upfront-cost estimates. */
  bedrooms: number;
}

interface StrategyCard {
  key: 'ltr' | 'mtr' | 'str';
  label: string;
  icon: React.ReactNode;
  grossMonthly: number;
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
    : source === 'furnished-finder' ? 'Furnished Finder'
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

function ComparisonBar({ cards }: { cards: StrategyCard[] }) {
  // Scale every bar against the largest income or expense figure so the
  // income vs. expense bars are directly comparable across rental types.
  const maxVal = Math.max(
    1,
    ...cards.map((c) => Math.max(c.grossMonthly, Math.max(0, c.grossMonthly - c.netMonthly)))
  );
  return (
    <div className="strategy-comparison__bars">
      <div className="strategy-comparison__bars-legend">
        <span className="strategy-comparison__bars-legend-item">
          <span className="strategy-comparison__bars-legend-swatch strategy-comparison__bars-legend-swatch--income" />
          Income
        </span>
        <span className="strategy-comparison__bars-legend-item">
          <span className="strategy-comparison__bars-legend-swatch strategy-comparison__bars-legend-swatch--expense" />
          Expenses
        </span>
      </div>
      {cards.map((card) => {
        const expenses = Math.max(0, card.grossMonthly - card.netMonthly);
        const incomeWidth = (card.grossMonthly / maxVal) * 100;
        const expenseWidth = (expenses / maxVal) * 100;
        return (
          <div key={card.key} className="strategy-comparison__bar-group">
            <span className="strategy-comparison__bar-label">{card.label}</span>
            <div className="strategy-comparison__bar-stack">
              <div className="strategy-comparison__bar-row">
                <div className="strategy-comparison__bar-track">
                  <div
                    className={`strategy-comparison__bar-fill strategy-comparison__bar-fill--income strategy-comparison__bar-fill--income-${card.key}`}
                    style={{ width: `${incomeWidth}%` }}
                  />
                </div>
                <span className="strategy-comparison__bar-value">{fmt(card.grossMonthly)}</span>
              </div>
              <div className="strategy-comparison__bar-row">
                <div className="strategy-comparison__bar-track">
                  <div
                    className="strategy-comparison__bar-fill strategy-comparison__bar-fill--expense"
                    style={{ width: `${expenseWidth}%` }}
                  />
                </div>
                <span className="strategy-comparison__bar-value">{fmt(expenses)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostComparisonRow({
  mtrEstimate,
  strEstimate,
  bedrooms,
  strategies,
}: {
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
  bedrooms: number;
  strategies: StrategyCard[];
}) {
  // Upfront cost mirrors the cash-flow card's one-time setup costs: appliances
  // apply to every strategy (landlord-provided), and furnished strategies add a
  // furniture package on top.
  const appliances = estimateApplianceCost(bedrooms);
  const mtrUpfront = mtrEstimate ? mtrEstimate.furnishingCosts.totalCost + appliances : undefined;
  const strUpfront = strEstimate ? estimateFurnitureCost(bedrooms) + appliances : undefined;

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
        ltr: fmt(appliances),
        mtr: mtrUpfront != null ? fmt(mtrUpfront) : '—',
        str: strUpfront != null ? fmt(strUpfront) : '—',
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

export default function StrategyComparison({ ltrRent, mtrEstimate, strEstimate, rentalEstimate, dataSources, marketStatistics, strategyComparison, selectedKey, onSelectKey, bedrooms }: Props) {
  // Render nothing if neither MTR nor STR data is available
  if (!mtrEstimate && !strEstimate) return null;

  // Net cash flow per strategy from the single source of truth (after mortgage +
  // shared carrying costs).  All cards display this so the comparison, the KPI
  // strip, and the section nav can never disagree on the best strategy.  The
  // prominent number is the potential gross rent/revenue; net cash flow sits
  // beneath it.
  const netByKey: Record<string, number> = {};
  const grossByKey: Record<string, number> = {};
  for (const s of strategyComparison.strategies) {
    netByKey[s.key.toLowerCase()] = s.netCashFlow;
    grossByKey[s.key.toLowerCase()] = s.grossMonthly;
  }

  const strategies: StrategyCard[] = [
    {
      key: 'ltr',
      label: 'Long-Term',
      icon: <Home size={20} />,
      grossMonthly: grossByKey['ltr'] ?? ltrRent,
      netMonthly: netByKey['ltr'] ?? ltrRent,
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
      grossMonthly: grossByKey['mtr'] ?? (mtrEstimate?.grossMonthlyRevenue ?? 0),
      netMonthly: netByKey['mtr'] ?? (mtrEstimate?.netMonthlyRevenue ?? 0),
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
      grossMonthly: grossByKey['str'] ?? (strEstimate?.grossMonthlyRevenue ?? 0),
      netMonthly: netByKey['str'] ?? (strEstimate?.netMonthlyRevenue ?? 0),
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
  const bestKey = strategyComparison.bestKey.toLowerCase();
  const lowConfidence = activeStrategies.filter((s) => s.confidence === 'low').map((s) => s.label);

  // Resolve the currently selected card (default to the best strategy).
  const fallbackKey =
    (activeStrategies.find((s) => s.key === bestKey) ?? activeStrategies[0]).key;
  const selKey =
    selectedKey && activeStrategies.some((s) => s.key === selectedKey)
      ? selectedKey
      : fallbackKey;

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
          const isSelected = strategy.key === selKey;
          return (
          <div
            key={strategy.key}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onSelectKey?.(strategy.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectKey?.(strategy.key);
              }
            }}
            className={`strategy-comparison__card strategy-comparison__card--${strategy.key}${isBest ? ' strategy-comparison__card--best' : ''}${isSelected ? ' strategy-comparison__card--selected' : ''}`}
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
                {fmt(strategy.grossMonthly)}
              </span>
              <span className="strategy-comparison__revenue-period">
                {strategy.key === 'ltr' ? '/mo rent' : '/mo revenue'}
              </span>
            </div>

            <div className="strategy-comparison__revenue-annual">
              {fmt(strategy.grossMonthly * 12)}/yr
            </div>

            <div
              className={`strategy-comparison__net${strategy.netMonthly < 0 ? ' strategy-comparison__net--negative' : ''}`}
            >
              <span className="strategy-comparison__net-value">{fmt(strategy.netMonthly)}</span>
              <span className="strategy-comparison__net-label">/mo net cash flow</span>
            </div>

            <RevenueRange range={strategy.revenueRange} />

            <div className="strategy-comparison__tagline">{strategy.tagline}</div>
          </div>
          );
        })}
      </div>

      {/* Income vs. expense comparison bars */}
      <ComparisonBar cards={activeStrategies} />

      {/* Cost / effort comparison */}
      <CostComparisonRow
        mtrEstimate={mtrEstimate}
        strEstimate={strEstimate}
        bedrooms={bedrooms}
        strategies={strategies}
      />

      {/* Low-confidence caveat — surfaced here alongside the per-strategy badges */}
      {lowConfidence.length > 0 && (
        <div className="strategy-comparison__confidence-note">
          <ShieldAlert size={15} />
          <span>
            {lowConfidence.join(' and ')} {lowConfidence.length > 1 ? 'estimates are' : 'estimate is'} low-confidence — less local market data was available, so treat {lowConfidence.length > 1 ? 'them' : 'it'} as a starting point and verify against local comps before committing.
          </span>
        </div>
      )}
    </div>
  );
}
