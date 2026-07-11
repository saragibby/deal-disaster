import { useEffect, useRef, useState } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { computeStrategyComparison } from '@deal-platform/shared-types';
import {
  Home, DollarSign, BarChart3, GitCompareArrows,
  TrendingUp, LineChart, Gavel, Calculator,
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
  const [activeId, setActiveId] = useState<string | null>(null);
  // While a programmatic (click) scroll is animating, ignore the scroll-spy so
  // it can't transiently flip the highlight to a section being scrolled past.
  const lockUntilRef = useRef(0);

  // Distance from the top of the viewport to the line that marks the boundary
  // between "above the fold" and "current" — accounts for the two stacked
  // sticky bars (app header + section nav).
  const getActiveLine = () => {
    const header = document.querySelector('.analyzer-app__header') as HTMLElement | null;
    const nav = document.querySelector('.results__nav-bar') as HTMLElement | null;
    return (header?.offsetHeight ?? 0) + (nav?.offsetHeight ?? 0) + 24;
  };

  // Scroll-spy: highlight the section whose top has most recently crossed above
  // the sticky bars. Position-based (not intersection-ratio based) so sections
  // of very different heights — and the loan calculator nested inside the
  // foreclosures row — are compared reliably.
  useEffect(() => {
    const ids = signals.map(s => s.id);

    const update = () => {
      if (Date.now() < lockUntilRef.current) return;
      const line = getActiveLine();
      let best: string | null = null;
      let bestTop = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // Candidate if its top has scrolled to or above the line; among those,
        // pick the one closest to the line (greatest top). Ties keep the
        // earlier section so an outer row wins over a nested child.
        if (top - line <= 1 && top > bestTop) {
          bestTop = top;
          best = id;
        }
      }
      setActiveId(best ?? ids[0]);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [signals]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Reflect the click intent immediately and suppress the scroll-spy until the
    // smooth-scroll animation settles on the target.
    setActiveId(id);
    lockUntilRef.current = Date.now() + 900;
    const offset = getActiveLine() - 8;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  return (
    <nav className="section-nav">
      {signals.map(s => (
        <button
          key={s.id}
          className={`section-nav__item${s.id === activeId ? ' section-nav__item--active' : ''}`}
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

  // Strategy signal — single source of truth (net cash flow across LTR/MTR/STR)
  const strategyComparison = results.strategyComparison ?? computeStrategyComparison({
    cashFlow,
    rentalEstimate: results.rentalEstimate,
    strEstimate: strEst,
    mtrEstimate: mtrEst,
    dataSources: results.dataSources,
  });
  const bestNet = strategyComparison.bestNetCashFlow;
  const bestLabel = strategyComparison.bestKey;
  const stratSignal: SignalLevel = bestNet > 0 ? 'good' : bestNet > -200 ? 'fair' : 'caution';
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
      id: 'stress-test',
      label: 'Long-Term',
      icon: <LineChart size={14} />,
      signal: null,
      tooltip: 'Stress test & long-term wealth projection',
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
