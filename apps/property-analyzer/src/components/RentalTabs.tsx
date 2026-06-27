import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  PropertyData,
  RentalEstimate,
  STREstimate,
  MTREstimate,
  ComparableProperty,
  CashFlowBreakdown,
  ROIMetrics,
  FullAnalysisResult,
  MarketStatistics,
  RentalStrategy,
} from '@deal-platform/shared-types';
import { api } from '@deal-platform/shared-auth';
import {
  Home, Building2, Sparkles,
  TrendingUp, BarChart3, Info,
  DollarSign, Star, TrendingDown,
  CircleCheck, CircleAlert, CircleMinus,
  Shield,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import StrategyComparison from './StrategyComparison';
import TermExplainer, { findExplainer } from './TermExplainer';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */
type TabKey = 'ltr' | 'mtr' | 'str';

interface Props {
  property: PropertyData;
  rental: RentalEstimate;
  strEstimate?: STREstimate;
  mtrEstimate?: MTREstimate;
  comparables?: ComparableProperty[];
  effectiveRent: number;
  cashFlow: CashFlowBreakdown;
  roi: ROIMetrics;
  dataSources?: FullAnalysisResult['dataSources'];
  marketStatistics?: MarketStatistics;
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
/*  Summary Strip (rendered outside RentalTabs, in AnalysisResults)     */
/* ================================================================== */
export function RentalSummaryStrip({
  property, effectiveRent, mtrEstimate, strEstimate,
}: {
  property: PropertyData;
  effectiveRent: number;
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
}) {
  const strategies = [
    { key: 'LTR', net: effectiveRent },
    ...(mtrEstimate ? [{ key: 'MTR', net: mtrEstimate.netMonthlyRevenue }] : []),
    ...(strEstimate ? [{ key: 'STR', net: strEstimate.netMonthlyRevenue }] : []),
  ];
  const best = strategies.reduce((a, b) => (b.net > a.net ? b : a));

  const annualRent = effectiveRent * 12;
  const priceToRent = annualRent > 0 ? property.price / annualRent : 0;
  const grossYield = property.price > 0 ? (annualRent / property.price) * 100 : 0;
  const demandScore = mtrEstimate?.demandFactors?.overallScore;

  // Signal quality for each card
  const bestSignal = best.net > 0 ? 'good' : best.net > -200 ? 'fair' : 'caution';
  const demandSignal = demandScore != null
    ? (demandScore >= 75 ? 'good' : demandScore >= 50 ? 'fair' : 'caution')
    : null;
  const yieldSignal = grossYield >= 8 ? 'good' : grossYield >= 5 ? 'fair' : 'caution';
  const ptrSignal = priceToRent < 15 ? 'good' : priceToRent <= 20 ? 'fair' : 'caution';

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rental-tabs__summary">
      <button
        type="button"
        className={`rental-tabs__summary-card rental-tabs__summary-card--signal-${bestSignal}`}
        onClick={() => scrollTo('rental-strategy')}
        title={`${best.key} strategy yields ${fmt(best.net)}/mo net — click to see all strategy details`}
      >
        <span className="rental-tabs__summary-value">{best.key}</span>
        <span className="rental-tabs__summary-label">Best Cash Flow</span>
        <span className="rental-tabs__summary-sub">{fmt(best.net)}/mo net</span>
        <span className={`rental-tabs__signal-badge rental-tabs__signal-badge--${bestSignal}`}>
          {bestSignal === 'good' ? '● Strong' : bestSignal === 'fair' ? '● Moderate' : '● Weak'}
        </span>
      </button>
      {demandScore != null && demandSignal && (
        <button
          type="button"
          className={`rental-tabs__summary-card rental-tabs__summary-card--signal-${demandSignal}`}
          onClick={() => scrollTo('rental-strategy')}
          title={`MTR demand score ${demandScore}/100 — ${demandSignal === 'good' ? 'strong demand for mid-term rentals' : demandSignal === 'fair' ? 'moderate demand' : 'low demand area'}`}
        >
          <span className="rental-tabs__summary-value">{demandScore}/100</span>
          <span className="rental-tabs__summary-label">Demand Score</span>
          <span className="rental-tabs__summary-sub">MTR demand index</span>
          <span className={`rental-tabs__signal-badge rental-tabs__signal-badge--${demandSignal}`}>
            {demandSignal === 'good' ? '● High' : demandSignal === 'fair' ? '● Moderate' : '● Low'}
          </span>
        </button>
      )}
      <button
        type="button"
        className={`rental-tabs__summary-card rental-tabs__summary-card--signal-${yieldSignal}`}
        onClick={() => scrollTo('cash-flow')}
        title={`Gross yield ${grossYield.toFixed(1)}% — ${yieldSignal === 'good' ? '≥8% is strong' : yieldSignal === 'fair' ? '5-8% is moderate' : '<5% is below average'}`}
      >
        <span className="rental-tabs__summary-value">{grossYield.toFixed(1)}%</span>
        <span className="rental-tabs__summary-label">Gross Yield</span>
        <span className="rental-tabs__summary-sub">Annual rent / price</span>
        <span className={`rental-tabs__signal-badge rental-tabs__signal-badge--${yieldSignal}`}>
          {yieldSignal === 'good' ? '● Strong' : yieldSignal === 'fair' ? '● Fair' : '● Low'}
        </span>
      </button>
      <button
        type="button"
        className={`rental-tabs__summary-card rental-tabs__summary-card--signal-${ptrSignal}`}
        onClick={() => scrollTo('cash-flow')}
        title={`Price-to-rent ${priceToRent.toFixed(1)}x — ${ptrSignal === 'good' ? '<15x is favorable for investors' : ptrSignal === 'fair' ? '15-20x is average' : '>20x means expensive relative to rents'}`}
      >
        <span className="rental-tabs__summary-value">{priceToRent.toFixed(1)}x</span>
        <span className="rental-tabs__summary-label">Price-to-Rent</span>
        <span className="rental-tabs__summary-sub">{priceToRent < 15 ? 'Good' : priceToRent <= 20 ? 'Fair' : 'Caution'}</span>
        <span className={`rental-tabs__signal-badge rental-tabs__signal-badge--${ptrSignal}`}>
          {ptrSignal === 'good' ? '● Good' : ptrSignal === 'fair' ? '● Fair' : '● Caution'}
        </span>
      </button>
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */
export default function RentalTabs({
  property, rental, strEstimate, mtrEstimate, effectiveRent,
  cashFlow, roi, dataSources, marketStatistics,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('ltr');

  // Reset to ltr whenever the property changes
  const propertyKey = property.address + property.zip;
  useEffect(() => {
    setActiveTab('ltr');
  }, [propertyKey]);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode; className: string; show: boolean }[] = [
    { key: 'ltr', label: 'Long-Term', icon: <Home size={15} />, className: 'rental-tabs__tab--ltr', show: true },
    { key: 'mtr', label: 'Mid-Term', icon: <Building2 size={15} />, className: 'rental-tabs__tab--mtr', show: !!mtrEstimate },
    { key: 'str', label: 'Short-Term', icon: <Sparkles size={15} />, className: 'rental-tabs__tab--str', show: !!strEstimate },
  ];

  return (
    <div className="rental-tabs">
      {/* ── Tab navigation ── */}
      <h3 className="results__card-title">
        <span className="results__icon results__icon--purple">📊</span>
        Strategy Deep Dive
      </h3>
      <nav className="rental-tabs__nav">
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.key}
            type="button"
            className={`rental-tabs__tab ${t.className}${activeTab === t.key ? ' rental-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {/* ── Tab panels ── */}
      <div className="rental-tabs__panel">
        {activeTab === 'ltr' && (
          <LTRPanel
            rental={rental}
            effectiveRent={effectiveRent}
            cashFlow={cashFlow}
            roi={roi}
            dataSources={dataSources}
            marketStatistics={marketStatistics}
          />
        )}
        {activeTab === 'mtr' && mtrEstimate && (
          <MTRPanel
            mtrEstimate={mtrEstimate}
            ltrRent={effectiveRent}
            cashFlow={cashFlow}
            dataSources={dataSources}
          />
        )}
        {activeTab === 'str' && strEstimate && (
          <STRPanel
            strEstimate={strEstimate}
            ltrRent={effectiveRent}
            cashFlow={cashFlow}
            dataSources={dataSources}
          />
        )}
      </div>

      {/* ── Disclaimer ── */}
      <div className="rental-insights__disclaimer" style={{ marginTop: '1.25rem' }}>
        <Info size={13} />
        <span>
          All figures are <strong>algorithmic estimates</strong> — not appraisals.
          Long-term rent is modeled from price tiers &amp; property traits.
          Short-term rental projections use national averages for occupancy,
          cleaning, and platform fees; actual results vary by season, location,
          and regulations.
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Exported sub-components for use in Rental Estimate card            */
/* ================================================================== */
export { StrategyComparison };
export { DemandIndicators };
export { MarketTrendChart };

/* ================================================================== */
/*  Strategy Details — folded deep-dive for the selected strategy      */
/* ================================================================== */
export function StrategyDetails({
  strategy, mtrEstimate, strEstimate, dataSources,
}: {
  strategy: RentalStrategy;
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
  dataSources?: FullAnalysisResult['dataSources'];
}) {
  if (strategy === 'mtr' && mtrEstimate) {
    const { furnishingCosts, demandFactors, source, seasonality, revenueRange } = mtrEstimate;
    const demandColor = demandFactors.overallScore >= 75
      ? 'rental-insights__demand-badge--green'
      : demandFactors.overallScore >= 50
        ? 'rental-insights__demand-badge--yellow'
        : 'rental-insights__demand-badge--red';
    return (
      <div className="strategy-details">
        <h4 className="strategy-details__heading">
          <Building2 size={15} /> Mid-Term Rental Details
        </h4>

        <div className="rental-insights__mtr-furnishing">
          <span>Furnishing: <strong>{fmt(furnishingCosts.totalCost)}</strong> ({furnishingCosts.quality} quality)</span>
          <span className="rental-insights__dot">·</span>
          <span>Amortized: <strong>{fmt(furnishingCosts.amortizedMonthly)}/mo</strong> over {furnishingCosts.usefulLifeYears} yrs</span>
        </div>

        <div className="rental-insights__mtr-demand">
          <TermExplainer info={findExplainer('MTR Demand Score')!} />
          <span className={`rental-insights__demand-badge ${demandColor}`}>
            MTR Demand Score: {demandFactors.overallScore}/100
          </span>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="rental-insights__deep-section">
            <h5 className="rental-insights__deep-heading">Demand Breakdown</h5>
            <div className="rental-insights__context-pills">
              <DemandPill label="Bedroom Score" score={demandFactors.bedroomScore} />
              <DemandPill label="Property Type Score" score={demandFactors.propertyTypeScore} />
            </div>
          </div>

          {demandFactors.nearbyInstitutions && demandFactors.nearbyInstitutions.length > 0 && (
            <div className="rental-insights__deep-section">
              <h5 className="rental-insights__deep-heading">
                <Building2 size={13} /> Nearby Institutions
              </h5>
              <div className="rental-insights__institutions-grid">
                {demandFactors.nearbyInstitutions.map((inst, i) => (
                  <div key={i} className="rental-insights__institution-row">
                    <span className="rental-insights__institution-emoji">{inst.emoji}</span>
                    <span className="rental-insights__institution-name">{inst.name}</span>
                    {inst.miles > 0 && (
                      <span className="rental-insights__institution-miles">{inst.miles} mi</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <SeasonalityChart
            seasonality={seasonality}
            source={dataSources?.mtr || source}
            label="MTR Monthly Revenue Seasonality"
            barColors={{ best: '#22c55e', worst: '#f59e0b', default: '#0d9488' }}
          />
          <RevenueRange revenueRange={revenueRange} source={dataSources?.mtr || source} label="MTR Revenue Range" />
        </div>
      </div>
    );
  }

  if (strategy === 'str' && strEstimate) {
    const { source, seasonality, revenueRange, marketContext } = strEstimate;
    return (
      <div className="strategy-details">
        <h4 className="strategy-details__heading">
          <Sparkles size={15} /> Short-Term Rental Details
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SeasonalityChart
            seasonality={seasonality}
            source={dataSources?.str || source}
            label="Monthly Revenue Seasonality"
            barColors={{ best: '#22c55e', worst: '#f59e0b', default: '#8b5cf6' }}
          />
          <RevenueRange revenueRange={revenueRange} source={dataSources?.str || source} label="Revenue Range" />
          {marketContext && (
            <div className="rental-insights__deep-section">
              <h5 className="rental-insights__deep-heading">Market Context</h5>
              <div className="rental-insights__context-pills">
                <span className="rental-insights__pill">
                  <Building2 size={13} /> {marketContext.activeListings.toLocaleString()} active listings
                </span>
                {marketContext.avgRating != null && (
                  <span className="rental-insights__pill">
                    <Star size={13} /> {marketContext.avgRating.toFixed(1)}★ avg rating
                  </span>
                )}
                {marketContext.supplyGrowth != null && (
                  <span className="rental-insights__pill">
                    <TrendingDown size={13} /> {marketContext.supplyGrowth > 0 ? '+' : ''}{(marketContext.supplyGrowth * 100).toFixed(0)}% supply YoY
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/* ================================================================== */
/*  LTR Panel                                                          */
/* ================================================================== */
function LTRPanel({
  rental, effectiveRent, cashFlow, roi, dataSources, marketStatistics,
}: {
  rental: RentalEstimate;
  effectiveRent: number;
  cashFlow: CashFlowBreakdown;
  roi: ROIMetrics;
  dataSources?: FullAnalysisResult['dataSources'];
  marketStatistics?: MarketStatistics;
}) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h4 className="rental-insights__heading" style={{ margin: 0 }}>
          <Home size={15} /> Long-Term Rental
        </h4>
        <DataSourceBadge source={dataSources?.rental} confidence={rental.confidence} />
      </div>

      <div className="rental-insights__str-metrics">
        <StatBox label="Monthly Rent" value={fmt(effectiveRent)} highlight />
        <StatBox label="Confidence" value={rental.confidence} />
        <StatBox label="Range Low" value={fmt(rental.low)} />
        <StatBox label="Range High" value={fmt(rental.high)} />
      </div>

      {/* Market statistics */}
      {marketStatistics && (
        <MarketStatsSection stats={marketStatistics} />
      )}

      {/* Rental comps table */}
      {rental.comps && rental.comps.length > 0 && (
        <div className="results__comps-table" style={{ marginTop: '1rem' }}>
          <h4 className="rental-insights__heading">
            <Home size={15} /> Rental Comparables
          </h4>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Rent</th>
                {rental.comps.some(c => c.bedrooms) && <th>Beds</th>}
                {rental.comps.some(c => c.sqft) && <th>Sq Ft</th>}
              </tr>
            </thead>
            <tbody>
              {rental.comps.map((comp, i) => (
                <tr key={i}>
                  <td>{comp.address || comp.source}</td>
                  <td><strong>{fmt(comp.rent)}</strong></td>
                  {rental.comps!.some(c => c.bedrooms) && <td>{comp.bedrooms || '—'}</td>}
                  {rental.comps!.some(c => c.sqft) && <td>{comp.sqft?.toLocaleString() || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LTR Cash Flow */}
      <div className="rental-tabs__cashflow">
        <h4 className="rental-tabs__cashflow-title">
          <DollarSign size={15} /> LTR Cash Flow
        </h4>
        <div className="rental-tabs__cashflow-grid">
          <CashFlowItem label="Gross Income" value={fmt(cashFlow.monthlyRent)} />
          <CashFlowItem label="Total Expenses" value={fmt(cashFlow.totalMonthlyExpenses)} muted />
          <CashFlowItem
            label="Net Cash Flow"
            value={fmt(cashFlow.monthlyCashFlow)}
            positive={cashFlow.monthlyCashFlow >= 0}
          />
          <CashFlowItem label="Annual" value={fmt(cashFlow.annualCashFlow)} positive={cashFlow.annualCashFlow >= 0} />
        </div>
        <div className="rental-tabs__expenses">
          <ExpenseItem label="Mortgage" amount={fmt(cashFlow.monthlyMortgage)} />
          <ExpenseItem label="Tax" amount={fmt(cashFlow.monthlyTax)} />
          <ExpenseItem label="Insurance" amount={fmt(cashFlow.monthlyInsurance)} />
          {cashFlow.monthlyHoa > 0 && <ExpenseItem label="HOA" amount={fmt(cashFlow.monthlyHoa)} />}
          <ExpenseItem label="Vacancy" amount={fmt(cashFlow.monthlyVacancy)} />
          <ExpenseItem label="Repairs" amount={fmt(cashFlow.monthlyRepairs)} />
          <ExpenseItem label="CapEx" amount={fmt(cashFlow.monthlyCapex)} />
          {cashFlow.monthlyManagement > 0 && <ExpenseItem label="Mgmt" amount={fmt(cashFlow.monthlyManagement)} />}
        </div>
        <div className="rental-tabs__cashflow-grid" style={{ marginTop: '0.5rem' }}>
          <CashFlowItem label="Cash-on-Cash" value={roi.cashOnCashROI.toFixed(2) + '%'} positive={roi.cashOnCashROI > 0} />
          <CashFlowItem label="Cap Rate" value={roi.capRate.toFixed(2) + '%'} />
          <CashFlowItem label="GRM" value={roi.grossRentMultiplier.toFixed(1) + 'x'} />
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  MTR Panel                                                          */
/* ================================================================== */
function MTRPanel({
  mtrEstimate, ltrRent, cashFlow, dataSources,
}: {
  mtrEstimate: MTREstimate;
  ltrRent: number;
  cashFlow: CashFlowBreakdown;
  dataSources?: FullAnalysisResult['dataSources'];
}) {
  const {
    monthlyRate, occupancyRate, grossMonthlyRevenue, netMonthlyRevenue,
    utilityCosts, turnoverCosts, platformFees, managementCosts,
    furnishingCosts, demandFactors, source,
    seasonality, revenueRange,
  } = mtrEstimate;

  const mtrVsLtr = ltrRent > 0 ? ((netMonthlyRevenue - ltrRent) / ltrRent) * 100 : 0;

  const demandColor = demandFactors.overallScore >= 75
    ? 'rental-insights__demand-badge--green'
    : demandFactors.overallScore >= 50
      ? 'rental-insights__demand-badge--yellow'
      : 'rental-insights__demand-badge--red';

  // MTR cash flow: net revenue minus shared ownership costs
  const ownershipCosts = cashFlow.monthlyMortgage + cashFlow.monthlyTax + cashFlow.monthlyInsurance + cashFlow.monthlyHoa;
  const mtrNetAfterOwnership = netMonthlyRevenue - ownershipCosts;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h4 className="rental-insights__heading" style={{ margin: 0 }}>
          <Building2 size={15} /> Mid-Term Rental
        </h4>
        <DataSourceBadge source={dataSources?.mtr || source} confidence={mtrEstimate.confidence} />
        <span className={`rental-tabs__delta ${mtrVsLtr >= 0 ? 'rental-tabs__delta--up' : 'rental-tabs__delta--down'}`}>
          {pctStr(mtrVsLtr)} vs LTR
        </span>
      </div>

      <div className="rental-insights__str-metrics">
        <StatBox label="Monthly Rate" value={fmt(monthlyRate)} />
        <StatBox label="Occupancy" value={`${Math.round(occupancyRate * 100)}%`} />
        <StatBox label="Gross / mo" value={fmt(grossMonthlyRevenue)} />
        <StatBox label="Net / mo" value={fmt(netMonthlyRevenue)} highlight />
      </div>

      <div className="rental-insights__str-costs">
        <span>Utilities {fmt(utilityCosts)}/mo</span>
        <span className="rental-insights__dot">·</span>
        <span>Turnover {fmt(turnoverCosts)}/mo</span>
        <span className="rental-insights__dot">·</span>
        <span>Platform fees {fmt(platformFees)}/mo</span>
        <span className="rental-insights__dot">·</span>
        <span>Management {fmt(managementCosts)}/mo</span>
      </div>

      {/* Furnishing cost summary */}
      <div className="rental-insights__mtr-furnishing">
        <span>One-time cost: <strong>{fmt(furnishingCosts.totalCost)}</strong> ({furnishingCosts.quality} quality)</span>
        <span className="rental-insights__dot">·</span>
        <span>Amortized: <strong>{fmt(furnishingCosts.amortizedMonthly)}/mo</strong> over {furnishingCosts.usefulLifeYears} years</span>
      </div>

      {/* Demand score badge */}
      <div className="rental-insights__mtr-demand">
        <TermExplainer info={findExplainer('MTR Demand Score')!} />
        <span className={`rental-insights__demand-badge ${demandColor}`}>
          MTR Demand Score: {demandFactors.overallScore}/100
        </span>
      </div>

      {/* Demand breakdown — always visible in tab */}
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="rental-insights__deep-section">
          <h5 className="rental-insights__deep-heading">Demand Breakdown</h5>
          <div className="rental-insights__context-pills">
            <DemandPill label="Bedroom Score" score={demandFactors.bedroomScore} />
            <DemandPill label="Property Type Score" score={demandFactors.propertyTypeScore} />
          </div>
        </div>

        {/* Nearby institutions (hospitals, military bases, universities, etc.) */}
        {demandFactors.nearbyInstitutions && demandFactors.nearbyInstitutions.length > 0 && (
          <div className="rental-insights__deep-section">
            <h5 className="rental-insights__deep-heading">
              <Building2 size={13} /> Nearby Institutions
            </h5>
            <div className="rental-insights__institutions-grid">
              {demandFactors.nearbyInstitutions.map((inst, i) => (
                <div key={i} className="rental-insights__institution-row">
                  <span className="rental-insights__institution-emoji">{inst.emoji}</span>
                  <span className="rental-insights__institution-name">{inst.name}</span>
                  {inst.miles > 0 && (
                    <span className="rental-insights__institution-miles">{inst.miles} mi</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seasonality chart */}
        <SeasonalityChart
          seasonality={seasonality}
          source={source}
          label="MTR Monthly Revenue Seasonality"
          barColors={{ best: '#22c55e', worst: '#f59e0b', default: '#0d9488' }}
        />

        {/* Revenue range */}
        <RevenueRange revenueRange={revenueRange} source={source} label="MTR Revenue Range" />
      </div>

      {/* MTR Cash Flow */}
      <div className="rental-tabs__cashflow">
        <h4 className="rental-tabs__cashflow-title">
          <DollarSign size={15} /> MTR Cash Flow
        </h4>
        <div className="rental-tabs__cashflow-grid">
          <CashFlowItem label="MTR Net Revenue" value={fmt(netMonthlyRevenue)} />
          <CashFlowItem label="Ownership Costs" value={fmt(ownershipCosts)} muted />
          <CashFlowItem
            label="Net After Ownership"
            value={fmt(mtrNetAfterOwnership)}
            positive={mtrNetAfterOwnership >= 0}
          />
          <CashFlowItem
            label="Annual"
            value={fmt(mtrNetAfterOwnership * 12)}
            positive={mtrNetAfterOwnership * 12 >= 0}
          />
        </div>
        <div className="rental-tabs__expenses">
          <ExpenseItem label="Mortgage" amount={fmt(cashFlow.monthlyMortgage)} />
          <ExpenseItem label="Tax" amount={fmt(cashFlow.monthlyTax)} />
          <ExpenseItem label="Insurance" amount={fmt(cashFlow.monthlyInsurance)} />
          {cashFlow.monthlyHoa > 0 && <ExpenseItem label="HOA" amount={fmt(cashFlow.monthlyHoa)} />}
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  STR Panel                                                          */
/* ================================================================== */
function STRPanel({
  strEstimate, ltrRent, cashFlow, dataSources,
}: {
  strEstimate: STREstimate;
  ltrRent: number;
  cashFlow: CashFlowBreakdown;
  dataSources?: FullAnalysisResult['dataSources'];
}) {
  const {
    nightlyRate, occupancyRate, grossMonthlyRevenue, cleaningCosts, platformFees,
    netMonthlyRevenue, source, seasonality, revenueRange, marketContext,
  } = strEstimate;

  const strVsLtr = ltrRent > 0 ? ((netMonthlyRevenue - ltrRent) / ltrRent) * 100 : 0;

  const ownershipCosts = cashFlow.monthlyMortgage + cashFlow.monthlyTax + cashFlow.monthlyInsurance + cashFlow.monthlyHoa;
  const strNetAfterOwnership = netMonthlyRevenue - ownershipCosts;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h4 className="rental-insights__heading" style={{ margin: 0 }}>
          <Sparkles size={15} /> Short-Term Rental
        </h4>
        <DataSourceBadge source={dataSources?.str || source} confidence={strEstimate.confidence} />
        <span className={`rental-tabs__delta ${strVsLtr >= 0 ? 'rental-tabs__delta--up' : 'rental-tabs__delta--down'}`}>
          {pctStr(strVsLtr)} vs LTR
        </span>
      </div>

      <div className="rental-insights__str-metrics">
        <StatBox label="Nightly Rate" value={fmt(nightlyRate)} />
        <StatBox label="Occupancy" value={`${Math.round(occupancyRate * 100)}%`} />
        <StatBox label="Gross / mo" value={fmt(grossMonthlyRevenue)} />
        <StatBox label="Net / mo" value={fmt(netMonthlyRevenue)} highlight />
      </div>

      <div className="rental-insights__str-costs">
        <span>Cleaning {fmt(cleaningCosts)}/mo</span>
        <span className="rental-insights__dot">·</span>
        <span>Platform fees {fmt(platformFees)}/mo</span>
      </div>

      {/* Details — always visible in tab */}
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Seasonality chart */}
        <SeasonalityChart
          seasonality={seasonality}
          source={source}
          label="Monthly Revenue Seasonality"
          barColors={{ best: '#22c55e', worst: '#f59e0b', default: '#8b5cf6' }}
        />

        {/* Revenue range */}
        <RevenueRange revenueRange={revenueRange} source={source} label="Revenue Range" />

        {/* Market context pills */}
        {marketContext && (
          <div className="rental-insights__deep-section">
            <h5 className="rental-insights__deep-heading">Market Context</h5>
            <div className="rental-insights__context-pills">
              <span className="rental-insights__pill">
                <Building2 size={13} /> {marketContext.activeListings.toLocaleString()} active listings
              </span>
              {marketContext.avgRating != null && (
                <span className="rental-insights__pill">
                  <Star size={13} /> {marketContext.avgRating.toFixed(1)}★ avg rating
                </span>
              )}
              {marketContext.supplyGrowth != null && (
                <span className="rental-insights__pill">
                  <TrendingDown size={13} /> {marketContext.supplyGrowth > 0 ? '+' : ''}{(marketContext.supplyGrowth * 100).toFixed(0)}% supply YoY
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* STR Cash Flow */}
      <div className="rental-tabs__cashflow">
        <h4 className="rental-tabs__cashflow-title">
          <DollarSign size={15} /> STR Cash Flow
        </h4>
        <div className="rental-tabs__cashflow-grid">
          <CashFlowItem label="STR Net Revenue" value={fmt(netMonthlyRevenue)} />
          <CashFlowItem label="Ownership Costs" value={fmt(ownershipCosts)} muted />
          <CashFlowItem
            label="Net After Ownership"
            value={fmt(strNetAfterOwnership)}
            positive={strNetAfterOwnership >= 0}
          />
          <CashFlowItem
            label="Annual"
            value={fmt(strNetAfterOwnership * 12)}
            positive={strNetAfterOwnership * 12 >= 0}
          />
        </div>
        <div className="rental-tabs__expenses">
          <ExpenseItem label="Mortgage" amount={fmt(cashFlow.monthlyMortgage)} />
          <ExpenseItem label="Tax" amount={fmt(cashFlow.monthlyTax)} />
          <ExpenseItem label="Insurance" amount={fmt(cashFlow.monthlyInsurance)} />
          {cashFlow.monthlyHoa > 0 && <ExpenseItem label="HOA" amount={fmt(cashFlow.monthlyHoa)} />}
        </div>
      </div>
    </>
  );
}

/* ================================================================== */
/*  Shared Sub-components                                              */
/* ================================================================== */

const SOURCE_LABELS: Record<string, string> = {
  rentcast: 'RentCast',
  airdna: 'AirDNA',
  blended: 'Blended',
  algorithm: 'Estimated',
  'furnished-finder': 'Furnished Finder',
};

function DataSourceBadge({ source, confidence }: { source?: string; confidence?: string | number }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  if (!source && !confidence) return null;

  const reposition = () => {
    if (!tooltipRef.current || !triggerRef.current) return;
    const node = tooltipRef.current;
    const triggerRect = triggerRef.current.getBoundingClientRect();
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

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
          tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const label = source ? (SOURCE_LABELS[source] || source) : '';
  const confLevel = typeof confidence === 'string'
    ? confidence
    : typeof confidence === 'number'
      ? (confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low')
      : null;
  const dotColor = confLevel === 'high' ? '#22c55e' : confLevel === 'medium' ? '#f59e0b' : confLevel === 'low' ? '#ef4444' : '#94a3b8';
  const explainer = confLevel ? findExplainer(`confidence ${confLevel}`) : undefined;
  return (
    <span
      ref={triggerRef}
      className="rental-insights__badge rental-insights__badge--source"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', position: 'relative' }}
      onClick={() => setOpen(o => !o)}
    >
      <Shield size={11} />
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
      {label}
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
            textTransform: 'none' as const,
            letterSpacing: 'normal',
            textAlign: 'left' as const,
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>{explainer.term}</div>
          <p style={{ fontSize: '0.78rem', lineHeight: 1.5, color: '#334155', margin: 0 }}>{explainer.definition}</p>
          {/* Pointer arrow */}
          <div style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            marginLeft: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #ffffff',
            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.06))',
          }} />
        </div>,
        document.body,
      )}
    </span>
  );
}

function MarketStatsSection({ stats }: { stats: MarketStatistics }) {
  const trendIcon = stats.rentTrend === 'rising'
    ? <TrendingUp size={13} style={{ color: '#22c55e' }} />
    : stats.rentTrend === 'declining'
      ? <TrendingDown size={13} style={{ color: '#ef4444' }} />
      : <CircleMinus size={13} style={{ color: '#94a3b8' }} />;
  const trendLabel = stats.rentTrend === 'rising' ? 'Rising' : stats.rentTrend === 'declining' ? 'Declining' : 'Stable';

  return (
    <div className="rental-insights__deep-section" style={{ marginTop: '1rem' }}>
      <h5 className="rental-insights__deep-heading">
        <BarChart3 size={13} /> Market Statistics
      </h5>
      <div className="rental-insights__context-pills">
        <span className="rental-insights__pill">
          {trendIcon} Rent trend: {trendLabel}
        </span>
        {stats.medianRent != null && (
          <span className="rental-insights__pill">Median rent: {fmt(stats.medianRent)}</span>
        )}
        {stats.rentGrowthPct != null && (
          <span className="rental-insights__pill">
            {stats.rentGrowthPct >= 0 ? '+' : ''}{stats.rentGrowthPct.toFixed(1)}% YoY
          </span>
        )}
        {stats.totalListings != null && (
          <span className="rental-insights__pill">{stats.totalListings.toLocaleString()} listings</span>
        )}
        {stats.avgDaysOnMarket != null && (
          <span className="rental-insights__pill">{stats.avgDaysOnMarket}d avg on market</span>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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

function CashFlowItem({ label, value, positive, muted }: {
  label: string; value: string; positive?: boolean; muted?: boolean;
}) {
  let cls = 'rental-tabs__cashflow-item-value';
  if (muted) cls += ' rental-tabs__cashflow-item-value--muted';
  else if (positive === true) cls += ' rental-tabs__cashflow-item-value--positive';
  else if (positive === false) cls += ' rental-tabs__cashflow-item-value--negative';
  return (
    <div className="rental-tabs__cashflow-item">
      <span className="rental-tabs__cashflow-item-label">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

function ExpenseItem({ label, amount }: { label: string; amount: string }) {
  return (
    <span className="rental-tabs__expense-item">
      {label}: <span className="rental-tabs__expense-amount">{amount}</span>
    </span>
  );
}

function DemandPill({ label, score }: { label: string; score: number }) {
  const cls = score >= 75 ? 'rental-insights__pill--green'
    : score >= 50 ? 'rental-insights__pill--yellow'
      : 'rental-insights__pill--red';
  return (
    <span className={`rental-insights__pill ${cls}`}>
      {label}: {score}/100
    </span>
  );
}

/* ================================================================== */
/*  Seasonality Chart (shared between STR/MTR)                         */
/* ================================================================== */
function SeasonalityChart({ seasonality, source, label, barColors }: {
  seasonality?: { month: string; revenue: number; occupancy: number }[];
  source: string;
  label: string;
  barColors: { best: string; worst: string; default: string };
}) {
  if (!seasonality || seasonality.length === 0) return null;

  const maxRev = Math.max(...seasonality.map(m => m.revenue));
  const minRev = Math.min(...seasonality.map(m => m.revenue));

  const data = seasonality.map(m => ({
    month: m.month,
    revenue: m.revenue,
    occupancy: Math.round(m.occupancy * 100),
  }));

  return (
    <div className="rental-insights__deep-section">
      <h5 className="rental-insights__deep-heading">
        {label}
        {source === 'algorithm' && (
          <span className="rental-insights__badge rental-insights__badge--muted">Estimated</span>
        )}
      </h5>
      <div className="rental-insights__seasonality-chart">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={0} />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip
              formatter={(value) => [fmt(Number(value ?? 0)), 'Revenue']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.revenue === maxRev ? barColors.best : entry.revenue === minRev ? barColors.worst : barColors.default}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="rental-insights__seasonality-legend">
        <span className="rental-insights__legend-item">
          <span className="rental-insights__legend-dot" style={{ background: barColors.best }} /> Best month
        </span>
        <span className="rental-insights__legend-item">
          <span className="rental-insights__legend-dot" style={{ background: barColors.worst }} /> Slowest month
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Revenue Range (shared between STR/MTR)                             */
/* ================================================================== */
function RevenueRange({ revenueRange, source, label }: {
  revenueRange?: { low: number; mid: number; high: number };
  source: string;
  label: string;
}) {
  if (!revenueRange) return null;

  const { low, mid, high } = revenueRange;
  const range = high - low || 1;
  const midPct = ((mid - low) / range) * 100;
  const explainer = findExplainer('revenue range');

  return (
    <div className="rental-insights__deep-section">
      <h5 className="rental-insights__deep-heading">
        {label}
        {explainer && <TermExplainer info={explainer} />}
        {source === 'algorithm' && (
          <span className="rental-insights__badge rental-insights__badge--muted">Estimated</span>
        )}
      </h5>
      <div className="rental-insights__range">
        <div className="rental-insights__range-track">
          <div className="rental-insights__range-fill" />
          <div
            className="rental-insights__range-marker"
            style={{ left: `${midPct}%` }}
            title={`Likely: ${fmt(mid)}/mo`}
          />
        </div>
        <div className="rental-insights__range-labels">
          <span className="rental-insights__range-label">{fmt(low)}/mo</span>
          <span className="rental-insights__range-label rental-insights__range-label--mid">{fmt(mid)}/mo</span>
          <span className="rental-insights__range-label">{fmt(high)}/mo</span>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Demand Indicators (for Overview tab)                               */
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

  const annualRent = effectiveRent * 12;
  const priceToRent = annualRent > 0 ? property.price / annualRent : 0;

  const grossYield = property.price > 0 ? (annualRent / property.price) * 100 : 0;

  return (
    <div className="rental-insights__section" style={{ border: 'none', paddingBottom: 0 }}>
      <h4 className="rental-insights__heading">
        <BarChart3 size={15} /> Rental Demand Indicators
      </h4>
      <div className="rental-insights__indicators">
        <Indicator
          label="Price-to-Rent"
          value={priceToRent.toFixed(1) + '×'}
          signal={priceToRent < 15 ? 'good' : priceToRent <= 20 ? 'neutral' : 'poor'}
          className={priceToRent < 15 ? 'rental-insights__indicator--green' : priceToRent <= 20 ? 'rental-insights__indicator--yellow' : 'rental-insights__indicator--red'}
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

/* ================================================================== */
/*  Market Trend Chart (for Overview tab)                              */
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
      <div className="rental-insights__section rental-insights__section--chart" style={{ border: 'none' }}>
        <h4 className="rental-insights__heading">
          <TrendingUp size={15} /> Market Snapshot
        </h4>
        <div className="rental-insights__chart-placeholder">Loading market data…</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rental-insights__section rental-insights__section--chart" style={{ border: 'none' }}>
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
    <div className="rental-insights__section rental-insights__section--chart" style={{ border: 'none' }}>
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

function extractMarketStats(raw: any): MarketStat[] {
  if (!raw) return [];
  const items = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  return items
    .filter((item: any) => {
      if (!item.displayName || item.score == null) return false;
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
/*  Indicator (for Overview demand section)                            */
/* ================================================================== */
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
