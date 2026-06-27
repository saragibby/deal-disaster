import type { PropertyAnalysis } from '@deal-platform/shared-types';
import {
  Home, DollarSign, BarChart3, GitCompareArrows,
  TrendingUp, Gavel, Calculator,
} from 'lucide-react';

export type SignalLevel = 'good' | 'fair' | 'caution' | null;

export interface SectionSignal {
  id: string;
  label: string;
  icon: React.ReactNode;
  signal: SignalLevel;
  count?: number;
  tooltip: string;
}

interface SectionNavProps {
  signals: SectionSignal[];
}

const SIGNAL_COLORS: Record<string, string> = {
  good: '#10b981',
  fair: '#f59e0b',
  caution: '#ef4444',
};

export function SectionNav({ signals }: SectionNavProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="section-nav">
      {signals.map(s => (
        <button
          key={s.id}
          className="section-nav__item"
          onClick={() => scrollTo(s.id)}
          title={s.tooltip}
          type="button"
        >
          <span className="section-nav__icon">{s.icon}</span>
          <span className="section-nav__label">{s.label}</span>
          {s.signal && (
            <span
              className="section-nav__signal"
              style={{ background: SIGNAL_COLORS[s.signal] }}
            />
          )}
          {s.count != null && (
            <span className="section-nav__badge">{s.count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** Derives section nav signals from a PropertyAnalysis result. */
export function deriveSignals(analysis: PropertyAnalysis): SectionSignal[] {
  const results = analysis.analysis_results;
  const property = analysis.property_data;
  const cashFlow = results.cashFlow;
  const roi = results.roi;
  const comps = results.comparables;
  const housing = property.housingMarket;
  const rental = property.rentalMarketTrends;
  const strEst = results.strEstimate;
  const mtrEst = results.mtrEstimate;

  // Cash flow signal
  const cfSignal: SignalLevel = cashFlow.monthlyCashFlow >= 0 ? 'good' : 'caution';
  const cfTip = cashFlow.monthlyCashFlow >= 0
    ? `Positive cash flow: $${Math.round(cashFlow.monthlyCashFlow)}/mo`
    : `Negative cash flow: -$${Math.round(Math.abs(cashFlow.monthlyCashFlow))}/mo`;

  // ROI signal
  const roiTip = `Cash-on-Cash ROI: ${roi.cashOnCashROI.toFixed(1)}%`;

  // Strategy signal — best net revenue across LTR/MTR/STR
  const ltrNet = cashFlow.monthlyCashFlow;
  const mtrNet = mtrEst?.netMonthlyRevenue ?? -Infinity;
  const strNet = strEst?.netMonthlyRevenue ?? -Infinity;
  const bestNet = Math.max(ltrNet, mtrNet, strNet);
  const stratSignal: SignalLevel = bestNet > 0 ? 'good' : bestNet > -200 ? 'fair' : 'caution';
  const bestLabel = bestNet === mtrNet ? 'MTR' : bestNet === strNet ? 'STR' : 'LTR';
  const stratTip = `Best strategy: ${bestLabel} at $${Math.round(bestNet)}/mo net`;

  // Comps signal — price vs market
  let compsSignal: SignalLevel = null;
  let compsTip = 'Comparable properties in the area';
  const compsCount = comps?.length ?? 0;
  if (comps && comps.length > 0) {
    const avgPrice = comps.reduce((s, c) => s + c.price, 0) / comps.length;
    const priceDiffPct = avgPrice > 0 ? ((property.price - avgPrice) / avgPrice) * 100 : 0;
    // Below market = good, at market = fair, above = caution (inverted — cheaper is better)
    compsSignal = priceDiffPct < -5 ? 'good' : priceDiffPct <= 5 ? 'fair' : 'caution';
    compsTip = priceDiffPct < 0
      ? `${Math.abs(priceDiffPct).toFixed(0)}% below avg comp price — potential bargain`
      : priceDiffPct > 0
      ? `${priceDiffPct.toFixed(0)}% above avg comp price`
      : 'Priced at market average';
  }

  // Housing market signal — 1yr change
  let housingSignal: SignalLevel = null;
  let housingTip = 'Housing & rental market trends';
  if (housing?.zhviTimeSeries?.length) {
    const ts = housing.zhviTimeSeries;
    const latest = ts[ts.length - 1].value;
    const oneYrAgo = ts.length > 12 ? ts[ts.length - 13].value : null;
    if (oneYrAgo) {
      const change = ((latest - oneYrAgo) / oneYrAgo) * 100;
      housingSignal = change > 3 ? 'good' : change >= 0 ? 'fair' : 'caution';
      housingTip = `Home values ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% YoY`;
    }
  }
  // Overlay rental temp if available
  if (rental) {
    const temp = rental.marketTemperature?.toUpperCase();
    if (temp === 'HOT' || temp === 'WARM') {
      housingTip += ` · Rental market: ${rental.marketTemperature}`;
    } else if (temp === 'COOL' || temp === 'COLD') {
      housingTip += ` · Rental market: ${rental.marketTemperature}`;
      if (!housingSignal || housingSignal === 'good') housingSignal = 'fair';
    }
  }

  const signals: SectionSignal[] = [
    {
      id: 'property-info',
      label: 'Property',
      icon: <Home size={14} />,
      signal: null,
      tooltip: `${property.address} — ${property.bedrooms}bd/${property.bathrooms}ba, ${property.sqft?.toLocaleString() || '?'} sqft`,
    },
    {
      id: 'cash-flow',
      label: 'Cash Flow',
      icon: <DollarSign size={14} />,
      signal: cfSignal,
      tooltip: `${cfTip} · ${roiTip}`,
    },
    {
      id: 'rental-strategy',
      label: 'Strategies',
      icon: <BarChart3 size={14} />,
      signal: stratSignal,
      tooltip: stratTip,
    },
    {
      id: 'comparables',
      label: 'Comps',
      icon: <GitCompareArrows size={14} />,
      signal: compsSignal,
      count: compsCount || undefined,
      tooltip: compsTip,
    },
    {
      id: 'market-trends',
      label: 'Market',
      icon: <TrendingUp size={14} />,
      signal: housingSignal,
      tooltip: housingTip,
    },
    {
      id: 'bottom-tools',
      label: 'Foreclosures',
      icon: <Gavel size={14} />,
      signal: null,
      tooltip: 'Nearby foreclosure auctions & loan calculator',
    },
    {
      id: 'loan-calculator',
      label: 'Calculator',
      icon: <Calculator size={14} />,
      signal: null,
      tooltip: 'Adjust loan terms, expenses, and tax parameters',
    },
  ];

  return signals;
}
