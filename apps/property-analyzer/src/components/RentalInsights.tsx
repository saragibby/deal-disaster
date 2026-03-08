import { useState, useEffect } from 'react';
import type {
  PropertyData,
  RentalEstimate,
  STREstimate,
  ComparableProperty,
} from '@deal-platform/shared-types';
import { api } from '@deal-platform/shared-auth';
import { TrendingUp, Home, BarChart3, Info, CircleCheck, CircleAlert, CircleMinus } from 'lucide-react';
import TermExplainer, { findExplainer } from './TermExplainer';

/* ================================================================== */
/*  Props                                                              */
/* ================================================================== */
interface Props {
  property: PropertyData;
  rental: RentalEstimate;
  strEstimate?: STREstimate;
  comparables?: ComparableProperty[];
  effectiveRent: number;
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */
function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function pctStr(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function RentalInsights({
  property, strEstimate, comparables, effectiveRent,
}: Props) {
  return (
    <div className="rental-insights">
      <STRSection strEstimate={strEstimate} ltrRent={effectiveRent} />
      <MarketTrendChart zip={property.zip} />
      <DemandIndicators
        property={property}
        comparables={comparables}
        effectiveRent={effectiveRent}
      />
      <div className="rental-insights__disclaimer">
        <Info size={13} />
        <span>
          All figures are <strong>algorithmic estimates</strong> — not appraisals.
          Long-term rent is modeled from price tiers &amp; property traits.
          Airbnb projections use national averages for occupancy, cleaning,
          and platform fees; actual results vary by season, location, and
          regulations.
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section A — Airbnb / Short-Term Rental Estimate                    */
/* ================================================================== */
function STRSection({ strEstimate, ltrRent }: { strEstimate?: STREstimate; ltrRent: number }) {
  if (!strEstimate) return null;

  const { nightlyRate, occupancyRate, grossMonthlyRevenue, cleaningCosts, platformFees, netMonthlyRevenue } = strEstimate;
  const strVsLtr = ltrRent > 0 ? ((netMonthlyRevenue - ltrRent) / ltrRent) * 100 : 0;

  // Bar widths for visual comparison
  const maxVal = Math.max(netMonthlyRevenue, ltrRent, 1);

  return (
    <div className="rental-insights__section">
      <h4 className="rental-insights__heading">
        <Home size={15} /> Airbnb Potential
        <span className="rental-insights__badge rental-insights__badge--purple">
          {strEstimate.source === 'algorithm' ? 'Estimate' : strEstimate.source.toUpperCase()}
        </span>
      </h4>

      <div className="rental-insights__str-metrics">
        <STRStat label="Nightly Rate" value={fmt(nightlyRate)} />
        <STRStat label="Occupancy" value={`${Math.round(occupancyRate * 100)}%`} />
        <STRStat label="Gross / mo" value={fmt(grossMonthlyRevenue)} />
        <STRStat label="Net / mo" value={fmt(netMonthlyRevenue)} highlight />
      </div>

      {/* Costs breakdown */}
      <div className="rental-insights__str-costs">
        <span>Cleaning {fmt(cleaningCosts)}/mo</span>
        <span className="rental-insights__dot">·</span>
        <span>Platform fees {fmt(platformFees)}/mo</span>
      </div>

      {/* LTR vs STR comparison bars */}
      <div className="rental-insights__compare">
        <div className="rental-insights__bar-row">
          <span className="rental-insights__bar-label">Long-term</span>
          <div className="rental-insights__bar-track">
            <div
              className="rental-insights__bar rental-insights__bar--ltr"
              style={{ width: `${(ltrRent / maxVal) * 100}%` }}
            />
          </div>
          <span className="rental-insights__bar-value">{fmt(ltrRent)}</span>
        </div>
        <div className="rental-insights__bar-row">
          <span className="rental-insights__bar-label">Airbnb net</span>
          <div className="rental-insights__bar-track">
            <div
              className="rental-insights__bar rental-insights__bar--str"
              style={{ width: `${(netMonthlyRevenue / maxVal) * 100}%` }}
            />
          </div>
          <span className="rental-insights__bar-value">
            {fmt(netMonthlyRevenue)}
            <span className={`rental-insights__delta ${strVsLtr >= 0 ? 'rental-insights__delta--up' : 'rental-insights__delta--down'}`}>
              {pctStr(strVsLtr)}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Section B — Market Snapshot Stats (from Xome)                      */
/* ================================================================== */
interface MarketStat {
  displayName: string;
  score: string;
  trend: 'up' | 'down' | 'flat';
}

function MarketTrendChart({ zip }: { zip: string }) {
  const [stats, setStats] = useState<MarketStat[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw: any = await api.getMarketTrends(zip);
        const parsed = extractMarketStats(raw);

        if (!cancelled) {
          if (parsed.length > 0) setStats(parsed);
          else setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (zip) load();
    else { setLoading(false); setError(true); }

    return () => { cancelled = true; };
  }, [zip]);

  if (loading) {
    return (
      <div className="rental-insights__section rental-insights__section--chart">
        <h4 className="rental-insights__heading">
          <TrendingUp size={15} /> Market Snapshot
        </h4>
        <div className="rental-insights__chart-placeholder">Loading market data…</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rental-insights__section rental-insights__section--chart">
        <h4 className="rental-insights__heading">
          <TrendingUp size={15} /> Market Snapshot
        </h4>
        <div className="rental-insights__chart-placeholder">
          Market data unavailable for {zip}
        </div>
      </div>
    );
  }

  return (
    <div className="rental-insights__section rental-insights__section--chart">
      <h4 className="rental-insights__heading">
        <TrendingUp size={15} /> Market Snapshot — {zip}
      </h4>
      <div className="rental-insights__market-stats">
        {stats.map((s) => {
          const explainer = findExplainer(s.displayName);
          return (
            <div key={s.displayName} className="rental-insights__market-stat">
              <span className="rental-insights__market-stat-value">{s.score}</span>
              <span className="rental-insights__market-stat-label">
                {s.displayName}
                {explainer && <TermExplainer info={explainer} />}
              </span>
              <span className={`rental-insights__market-stat-trend rental-insights__market-stat-trend--${s.trend}`}>
                {s.trend === 'up' ? '▲ Up' : s.trend === 'down' ? '▼ Down' : '— Flat'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Parse Xome market-trends response into display-ready stat cards. */
function extractMarketStats(raw: any): MarketStat[] {
  if (!raw) return [];

  // Xome returns { data: [{ displayName, score, trend, ... }] }
  const items = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];

  return items
    .filter((item: any) => {
      if (!item.displayName || item.score == null) return false;
      // Filter out price stats with nonsensical values (e.g. "-$1")
      const scoreStr = String(item.score);
      if (scoreStr.includes('$')) {
        const numericVal = Math.abs(parseFloat(scoreStr.replace(/[^0-9.-]/g, '')));
        if (numericVal < 1000) return false;
      }
      return true;
    })
    .map((item: any) => ({
      displayName: String(item.displayName),
      score: String(item.score),
      trend: item.trend === 'up' ? 'up' : item.trend === 'down' ? 'down' : 'flat',
    }));
}

/* ================================================================== */
/*  Section C — Rental Demand Indicators                               */
/* ================================================================== */
function DemandIndicators({
  property, comparables, effectiveRent,
}: {
  property: PropertyData;
  comparables?: ComparableProperty[];
  effectiveRent: number;
}) {
  if (!comparables || comparables.length === 0) return null;

  const avgCompRent =
    comparables.reduce((s, c) => s + (c.estimatedRent || 0), 0) / comparables.length;
  const rentDiff = avgCompRent > 0 ? ((effectiveRent - avgCompRent) / avgCompRent) * 100 : 0;

  const rentPerSqftValues = comparables
    .filter(c => c.rentPerSqft > 0)
    .map(c => c.rentPerSqft);
  const avgRentPerSqft =
    rentPerSqftValues.length > 0
      ? rentPerSqftValues.reduce((s, v) => s + v, 0) / rentPerSqftValues.length
      : 0;
  const subjectRentPerSqft =
    property.sqft > 0 ? Math.round((effectiveRent / property.sqft) * 100) / 100 : 0;

  // Price-to-rent ratio: annual rent ÷ price
  const annualRent = effectiveRent * 12;
  const priceToRent = annualRent > 0 ? property.price / annualRent : 0;
  let priceToRentColor: string;
  if (priceToRent < 15) {
    priceToRentColor = 'rental-insights__indicator--green';
  } else if (priceToRent <= 20) {
    priceToRentColor = 'rental-insights__indicator--yellow';
  } else {
    priceToRentColor = 'rental-insights__indicator--red';
  }

  // Gross rent yield
  const grossYield = property.price > 0 ? (annualRent / property.price) * 100 : 0;

  return (
    <div className="rental-insights__section">
      <h4 className="rental-insights__heading">
        <BarChart3 size={15} /> Rental Demand Indicators
      </h4>
      <div className="rental-insights__indicators">
        <Indicator
          label="Price-to-Rent"
          value={priceToRent.toFixed(1) + '×'}
          signal={priceToRent < 15 ? 'good' : priceToRent <= 20 ? 'neutral' : 'poor'}
          className={priceToRentColor}
        />
        <Indicator
          label="Gross Yield"
          value={grossYield.toFixed(1) + '%'}
          signal={grossYield >= 8 ? 'good' : grossYield >= 5 ? 'neutral' : 'poor'}
          className={grossYield >= 8 ? 'rental-insights__indicator--green' : grossYield >= 5 ? 'rental-insights__indicator--yellow' : 'rental-insights__indicator--red'}
        />
        <Indicator
          label="Rent vs Area"
          value={pctStr(rentDiff)}
          detail={`Avg ${fmt(Math.round(avgCompRent))}`}
          signal={rentDiff >= 3 ? 'good' : rentDiff >= -3 ? 'neutral' : 'poor'}
          className={rentDiff >= 0 ? 'rental-insights__indicator--green' : 'rental-insights__indicator--yellow'}
        />
        {avgRentPerSqft > 0 && (
          <Indicator
            label="Rent / Sq Ft"
            value={`$${subjectRentPerSqft.toFixed(2)}`}
            detail={`Avg $${avgRentPerSqft.toFixed(2)}`}
            signal={subjectRentPerSqft >= avgRentPerSqft ? 'good' : 'neutral'}
            className={subjectRentPerSqft >= avgRentPerSqft ? 'rental-insights__indicator--green' : 'rental-insights__indicator--yellow'}
          />
        )}
      </div>
    </div>
  );
}

const SIGNAL_CONFIG = {
  good:    { icon: CircleCheck,  label: 'Good',    cls: 'rental-insights__signal--good' },
  neutral: { icon: CircleMinus,  label: 'Fair',    cls: 'rental-insights__signal--neutral' },
  poor:    { icon: CircleAlert,  label: 'Caution', cls: 'rental-insights__signal--poor' },
} as const;

function Indicator({
  label, value, signal, detail, className,
}: {
  label: string; value: string; signal: 'good' | 'neutral' | 'poor'; detail?: string; className?: string;
}) {
  const explainer = findExplainer(label);
  const sig = SIGNAL_CONFIG[signal];
  const Icon = sig.icon;
  return (
    <div className={`rental-insights__indicator ${className || ''}`}>
      <div className="rental-insights__indicator-top">
        <span className="rental-insights__indicator-value">{value}</span>
        <span className={`rental-insights__signal ${sig.cls}`}>
          <Icon size={13} /> {sig.label}
        </span>
      </div>
      <span className="rental-insights__indicator-label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
        {detail && <span className="rental-insights__indicator-detail">{detail}</span>}
      </span>
    </div>
  );
}

function STRStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const explainer = findExplainer(label);
  return (
    <div className="rental-insights__str-stat">
      <span className="rental-insights__str-label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
      </span>
      <span className={`rental-insights__str-value${highlight ? ' rental-insights__str-value--highlight' : ''}`}>
        {value}
      </span>
    </div>
  );
}
