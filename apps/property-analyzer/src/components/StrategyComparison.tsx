import type { MTREstimate, STREstimate } from '@deal-platform/shared-types';
import { Home, Building2, Clock, DollarSign, TrendingUp, Sparkles } from 'lucide-react';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface Props {
  ltrRent: number;
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
}

interface StrategyCard {
  key: 'ltr' | 'mtr' | 'str';
  label: string;
  icon: React.ReactNode;
  netMonthly: number;
  tagline: string;
  available: boolean;
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

export default function StrategyComparison({ ltrRent, mtrEstimate, strEstimate }: Props) {
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

            <div className="strategy-comparison__revenue">
              <span className="strategy-comparison__revenue-monthly">
                {fmt(strategy.netMonthly)}
              </span>
              <span className="strategy-comparison__revenue-period">/mo net</span>
            </div>

            <div className="strategy-comparison__revenue-annual">
              {fmt(strategy.netMonthly * 12)}/yr
            </div>

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
