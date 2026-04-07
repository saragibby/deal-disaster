import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PropertyAnalysis, AnalysisParams } from '@deal-platform/shared-types';
import { api } from '@deal-platform/shared-auth';
import {
  Home, Building2, Calendar,
  BedDouble, Bath, Ruler, PiggyBank, RotateCcw,
  SlidersHorizontal, ChevronDown, ChevronUp,
  Coins, Share2, Download, Lock, Globe, Pencil,
} from 'lucide-react';
import ComparableProperties from './ComparableProperties';
import ForeclosureCard from './ForeclosureCard';
import RentalTabs, { RentalSummaryStrip, StrategyComparison, DemandIndicators, MarketTrendChart } from './RentalTabs';
import ROIScorecard from './ROIScorecard';
import WealthProjection from './FiveYearProjection';
import HousingMarketTrends from './comparison/HousingMarketTrends';
import RentalMarketTrends from './comparison/RentalMarketTrends';
import TermExplainer, { findExplainer } from './TermExplainer';
import useExportAnalysis from '../hooks/useExportAnalysis';
import {
  calculateMortgage,
  calculateCashFlow,
  calculateROI,
  calculateTaxSavings,
} from '../utils/calculations';

interface Props {
  analysis: PropertyAnalysis;
  skipEntrance?: boolean;
  readOnly?: boolean;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return n.toFixed(2) + '%';
}

export default function AnalysisResults({ analysis, skipEntrance, readOnly }: Props) {
  const property = analysis.property_data;
  const results = analysis.analysis_results;
  const rental = results.rentalEstimate;
  const originalParams = analysis.analysis_params;

  // Print / PDF export
  const resultsRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, exporting } = useExportAnalysis(resultsRef);

  // Sharing
  const [isShared, setIsShared] = useState(analysis.is_shared ?? false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const toggleShare = useCallback(async () => {
    if (!analysis.slug) return;
    setShareLoading(true);
    try {
      const result = await api.toggleShareAnalysis(analysis.slug, !isShared);
      setIsShared(result.is_shared);
    } catch (err: any) {
      alert(err.message || 'Failed to update sharing.');
    } finally {
      setShareLoading(false);
    }
  }, [analysis.slug, isShared]);

  const copyShareLink = useCallback(() => {
    const origin = window.location.origin;
    const url = `${origin}/property-analyzer/shared/${analysis.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  }, [analysis.slug]);

  // ── Adjustable parameters ────────────────────────────────────────
  const [params, setParams] = useState<AnalysisParams>({
    ...originalParams,
    offerPrice: originalParams.offerPrice || property.price,
    rentOverride: originalParams.rentOverride || rental.mid,
  });
  const [showAllParams, setShowAllParams] = useState(false);
  const [showOfferSlider, setShowOfferSlider] = useState(false);
  const offerRef = useRef<HTMLDivElement>(null);

  // Open expense params panel and scroll to it
  const openExpenseParams = useCallback(() => {
    setShowAllParams(true);
    setTimeout(() => {
      document.getElementById('loan-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  // Scroll to loan calculator for mortgage adjustment
  const scrollToLoanCalc = useCallback(() => {
    document.getElementById('loan-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Close offer popover on outside click
  useEffect(() => {
    if (!showOfferSlider) return;
    function handleClick(e: MouseEvent) {
      if (offerRef.current && !offerRef.current.contains(e.target as Node)) {
        setShowOfferSlider(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOfferSlider]);

  const updateParam = useCallback((key: keyof AnalysisParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const isAdjusted = useMemo(() => {
    const baseline = {
      ...originalParams,
      offerPrice: originalParams.offerPrice || property.price,
      rentOverride: originalParams.rentOverride || rental.mid,
    };
    return (Object.keys(baseline) as (keyof AnalysisParams)[]).some(
      k => params[k] !== baseline[k],
    );
  }, [params, originalParams, property.price, rental.mid]);

  const resetParams = useCallback(() => {
    setParams({ ...originalParams, offerPrice: property.price, rentOverride: rental.mid });
  }, [originalParams, property.price, rental.mid]);

  // ── Live recalculation ───────────────────────────────────────────
  const effectivePrice = params.offerPrice > 0 ? params.offerPrice : property.price;
  const priceAdjusted = effectivePrice !== property.price;
  const priceDelta = effectivePrice - property.price;
  const priceDeltaPct = ((priceDelta / property.price) * 100).toFixed(1);

  const { mortgage, cashFlow, roi, tax } = useMemo(() => {
    const price = params.offerPrice > 0 ? params.offerPrice : property.price;
    const m = calculateMortgage(
      price,
      params.downPaymentPct,
      params.interestRate,
      params.loanTermYears,
    );
    const cf = calculateCashFlow(params.rentOverride || rental.mid, m, params);
    const r = calculateROI(price, cf, m);
    const t = calculateTaxSavings(
      price,
      params.costSegPct,
      params.taxRate,
      r.totalCashInvested,
      cf.annualCashFlow,
    );
    return { mortgage: m, cashFlow: cf, roi: r, tax: t };
  }, [params, property.price, rental.mid]);

  const effectiveRent = params.rentOverride || rental.mid;
  const rentAdjusted = effectiveRent !== rental.mid;

  const cashFlowPositive = cashFlow.monthlyCashFlow >= 0;

  return (
    <div className={`results${skipEntrance ? ' results--no-entrance' : ''}`} ref={resultsRef}>
      {/* Print-only report header */}
      <div className="analysis-print-header">
        <div className="analysis-print-header__top">
          <h1 className="analysis-print-header__title">⚡ Investment Analysis</h1>
          <span className="analysis-print-header__date">
            {new Date(analysis.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>
        </div>
        <p className="analysis-print-header__address">{property.address}, {property.city}, {property.state} {property.zip}</p>
      </div>

      {/* Action toolbar */}
      {!readOnly && (
        <div className="results__toolbar no-print">
          <div className="results__toolbar-share">
            <button
              className={`btn btn--outline btn--sm ${isShared ? 'btn--shared' : ''}`}
              onClick={toggleShare}
              disabled={shareLoading}
              title={isShared ? 'Make private' : 'Make shareable'}
            >
              {isShared ? <Globe size={14} /> : <Lock size={14} />}
              {shareLoading ? 'Updating...' : isShared ? 'Public' : 'Private'}
            </button>
            {isShared && (
              <button
                className="btn btn--outline btn--sm"
                onClick={copyShareLink}
                title="Copy share link"
              >
                <Share2 size={14} />
                {shareCopied ? 'Copied!' : 'Copy Link'}
              </button>
            )}
          </div>
          <div className="results__toolbar-export">
            <button
              className="btn btn--outline btn--sm"
              onClick={exportToPdf}
              disabled={exporting}
              title="Download as PDF"
            >
              {exporting ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Download size={14} />}
              {exporting ? 'Exporting...' : 'PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Property Info Card */}
      <div id="property-info" className="results__card results__property results__section">
        <div className="results__property-top">
          {/* Info */}
          <div className="results__property-info">
            <div className="results__property-header">
              <div>
                <h2 className="results__property-address">
                  <Home size={20} /> {property.address || 'Property'}
                </h2>
                <p className="results__property-location">
                  {[property.city, property.state, property.zip].filter(Boolean).join(', ')}
                </p>
              </div>
              <div className="results__property-price-block" ref={offerRef}>
                <div className="results__property-price">
                  {priceAdjusted ? fmt(effectivePrice) : fmt(property.price)}
                  <button
                    type="button"
                    className="results__offer-toggle"
                    onClick={() => setShowOfferSlider(o => !o)}
                    title="Run offer scenarios"
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                </div>
                {priceAdjusted && (
                  <div className="results__offer-meta">
                    <span className="results__list-price">List: {fmt(property.price)}</span>
                    <span className={`results__price-delta ${priceDelta < 0 ? 'results__price-delta--savings' : 'results__price-delta--over'}`}>
                      {priceDelta < 0 ? '−' : '+'}{fmt(Math.abs(priceDelta))} ({priceDelta < 0 ? '' : '+'}{priceDeltaPct}%)
                    </span>
                  </div>
                )}
                {showOfferSlider && (
                  <div className="results__offer-popover">
                    <label className="results__offer-slider-label">Offer Price</label>
                    <div className="results__editable-value">
                      <span className="results__editable-prefix">$</span>
                      <input
                        type="number"
                        className="results__editable-input"
                        value={params.offerPrice || property.price}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v > 0) updateParam('offerPrice', v);
                        }}
                        step={1000}
                      />
                    </div>
                    <input
                      type="range"
                      className="results__offer-range"
                      value={params.offerPrice || property.price}
                      onChange={e => updateParam('offerPrice', parseFloat(e.target.value))}
                      min={Math.round(property.price * 0.5)}
                      max={Math.round(property.price * 1.2)}
                      step={1000}
                    />
                    <div className="results__offer-slider-bounds">
                      <span>{fmt(Math.round(property.price * 0.5))}</span>
                      <span>{fmt(Math.round(property.price * 1.2))}</span>
                    </div>
                    {priceAdjusted && (
                      <button
                        type="button"
                        className="results__offer-reset"
                        onClick={() => updateParam('offerPrice', property.price)}
                      >
                        Reset to list price
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="results__stats-row">
              <Stat icon={<BedDouble size={16} />} value={String(property.bedrooms)} label="Beds" />
              <Stat icon={<Bath size={16} />} value={String(property.bathrooms)} label="Baths" />
              <Stat icon={<Ruler size={16} />} value={property.sqft?.toLocaleString() || '—'} label="Sq Ft" />
              <Stat icon={<Calendar size={16} />} value={String(property.yearBuilt || '—')} label="Built" />
              {property.propertyType && (
                <Stat icon={<Building2 size={16} />} value={property.propertyType} label="Type" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rental summary strip */}
      <div id="rental-summary" className="results__section">
        <RentalSummaryStrip
          property={property}
          effectiveRent={effectiveRent}
          mtrEstimate={results.mtrEstimate}
          strEstimate={results.strEstimate}
        />
      </div>

      {/* Two column grid */}
      <div className="results__grid results__section">
        {/* Rental Estimate Card */}
        <div className="results__card results__section">
          <h3 className="results__card-title">
            <span className="results__icon results__icon--blue">🏘️</span>
            Rental Estimate
          </h3>

          <div className="results__rent-compact">
            <div className="results__rent-compact-header">
              <span className="results__rent-compact-label">Long-Term Rental Estimate</span>
              <span className="results__rent-compact-confidence">
                {rental.confidence} &bull; {fmt(rental.low)} – {fmt(rental.high)}
              </span>
            </div>
            <div className="results__rent-compact-controls">
              <div className="results__editable-value results__editable-value--centered">
                <span className="results__editable-prefix results__editable-prefix--hero">$</span>
                <input
                  type="number"
                  className="results__editable-input results__editable-input--rent results__editable-input--hero"
                  value={effectiveRent}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0) updateParam('rentOverride', v);
                  }}
                  step={25}
                />
                {rentAdjusted && (
                  <button
                    type="button"
                    className="results__rent-reset"
                    onClick={() => updateParam('rentOverride', rental.mid)}
                  >
                    Reset
                  </button>
                )}
              </div>
              <input
                type="range"
                className="results__offer-range"
                value={effectiveRent}
                onChange={e => updateParam('rentOverride', parseFloat(e.target.value))}
                min={Math.round(rental.low * 0.8)}
                max={Math.round(rental.high * 1.2)}
                step={25}
              />
            </div>
          </div>

          <StrategyComparison
            ltrRent={effectiveRent}
            mtrEstimate={results.mtrEstimate}
            strEstimate={results.strEstimate}
            rentalEstimate={rental}
            dataSources={results.dataSources}
            marketStatistics={results.marketStatistics}
          />
          <DemandIndicators
            property={property}
            comparables={results.comparables}
            effectiveRent={effectiveRent}
          />
          <MarketTrendChart zip={property.zip} />
        </div>

        {/* Cash Flow Card */}
        <div id="cash-flow" className="results__card results__section">
          <h3 className="results__card-title">
            <span className="results__icon results__icon--green">💵</span>
            Cash Flow Analysis
          </h3>
          {!readOnly && (
            <p className="results__adjust-hint">
              <SlidersHorizontal size={12} />
              Click any expense to adjust
            </p>
          )}

          <MetricRow label="Monthly Rent Income" value={fmt(cashFlow.monthlyRent)} positive />
          <AdjustableExpenseRow label="Mortgage (P&I)" value={fmt(cashFlow.monthlyMortgage)} readOnly={readOnly} onAdjust={scrollToLoanCalc} />
          <AdjustableExpenseRow label="Property Tax" value={fmt(cashFlow.monthlyTax)} readOnly={readOnly} onAdjust={openExpenseParams} />
          <AdjustableExpenseRow label="Insurance" value={fmt(cashFlow.monthlyInsurance)} readOnly={readOnly} onAdjust={openExpenseParams} />
          <AdjustableExpenseRow
            label="HOA Fees"
            value={fmt(cashFlow.monthlyHoa)}
            readOnly={readOnly}
            onAdjust={openExpenseParams}
            sourceBadge={
              results.dataSources?.hoa === 'zillow'
                ? { text: 'From Zillow', variant: 'api' }
                : results.dataSources?.hoa === 'estimate'
                ? { text: 'Estimated', variant: 'estimate' }
                : undefined
            }
          />
          <AdjustableExpenseRow label="Vacancy Reserve" value={fmt(cashFlow.monthlyVacancy)} readOnly={readOnly} onAdjust={openExpenseParams} />
          <AdjustableExpenseRow label="Repairs Reserve" value={fmt(cashFlow.monthlyRepairs)} readOnly={readOnly} onAdjust={openExpenseParams} />
          <AdjustableExpenseRow label="CapEx Reserve" value={fmt(cashFlow.monthlyCapex)} readOnly={readOnly} onAdjust={openExpenseParams} />
          {cashFlow.monthlyManagement > 0 && (
            <AdjustableExpenseRow label="Management" value={fmt(cashFlow.monthlyManagement)} readOnly={readOnly} onAdjust={openExpenseParams} />
          )}

          <div className="results__big-number" style={{ marginTop: '0.75rem' }}>
            <div className="results__big-label">Monthly Cash Flow</div>
            <div className={`results__big-value ${cashFlowPositive ? 'results__big-value--positive' : 'results__big-value--negative'}`}>
              {fmt(cashFlow.monthlyCashFlow)}
            </div>
            <div className="results__big-caption">
              {fmt(cashFlow.annualCashFlow)}/year after all expenses
            </div>
          </div>

          <ROIScorecard roi={roi} />

          {/* Tax Savings — two-panel layout */}
          <div className="results__tax-inline">
            <h4 className="results__tax-inline-title">
              <Coins size={15} /> Cost Segregation Tax Savings
            </h4>
            <div className="results__tax-panels">
              {/* Left panel — 3 data rows */}
              <div className="results__tax-panel results__tax-panel--left">
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Purchase Price</span>
                  <span className="results__tax-row-value">{fmt(tax.purchasePrice)}</span>
                </div>
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Accelerated Depreciation</span>
                  <span className="results__tax-row-value">{fmt(tax.depreciationDeduction)}</span>
                </div>
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Tax Savings (Yr 1)</span>
                  <span className="results__tax-row-value results__tax-row-value--green">{fmt(tax.taxSavings)}</span>
                </div>
              </div>
              {/* Right panel — hero percentage */}
              <div className="results__tax-panel results__tax-panel--right">
                <span className="results__tax-hero-label">Effective First-Year Return</span>
                <span className="results__tax-hero-value">{pct(tax.effectiveFirstYearReturn)}</span>
                <span className="results__tax-hero-caption">Cash flow + tax savings</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wealth Projection — full width */}
      <div className="results__card results__section">
        <h3 className="results__card-title">
          <span className="results__icon results__icon--blue">📈</span>
          Wealth Projection
        </h3>
        <WealthProjection
          purchasePrice={effectivePrice}
          cashFlow={cashFlow}
          mortgage={mortgage}
          roi={roi}
          vacancyPct={params.vacancyPct}
        />
      </div>

      {/* Rental Strategy Tabs — full width */}
      <div id="strategy-tabs" className="results__section">
        <RentalTabs
          property={property}
          rental={rental}
          strEstimate={results.strEstimate}
          mtrEstimate={results.mtrEstimate}
          comparables={results.comparables}
          effectiveRent={effectiveRent}
          cashFlow={cashFlow}
          roi={roi}
          dataSources={results.dataSources}
          marketStatistics={results.marketStatistics}
        />
      </div>

      {/* Comparable Properties */}
      {results.comparables && results.comparables.length > 0 && (
        <div id="comparables" className="results__section"><ComparableProperties
          comparables={results.comparables}
          subject={property}
          subjectRent={rental.mid}
        /></div>
      )}

      {/* Housing Market + Rental Market side-by-side */}
      <div id="market-trends" className="results__trends-grid results__section">
        <HousingMarketTrends properties={[analysis]} />
        <RentalMarketTrends properties={[analysis]} />
      </div>

      {/* Bottom grid — Foreclosures + Loan Calculator side by side */}
      <div id="bottom-tools" className={`results__bottom-grid results__section${readOnly ? ' results__bottom-grid--full' : ''}`}>
        {/* Nearby Foreclosures (hidden on shared/read-only view) */}
        {!readOnly && (
          <ForeclosureCard
            zip={property.zip}
            city={property.city}
            state={property.state}
            latitude={property.latitude}
            longitude={property.longitude}
          />
        )}

        {/* Loan Calculator — adjustable */}
        <div id="loan-calculator" className={`results__card results__mortgage-card ${isAdjusted ? 'results__mortgage-card--adjusted' : ''}`}>
        <div className="results__loan-header">
          <h3 className="results__card-title" style={{ marginBottom: 0 }}>
            <span className="results__icon results__icon--purple"><PiggyBank size={20} /></span>
            Loan Calculator
            {isAdjusted && <span className="results__adjusted-badge">Adjusted</span>}
          </h3>
          {isAdjusted && (
            <button className="results__reset-btn" onClick={resetParams}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        {/* Core loan sliders — always visible */}
        <div className="loan-calc__params">
          <SliderInput
            label="Down Payment"
            value={params.downPaymentPct}
            onChange={v => updateParam('downPaymentPct', v)}
            min={0} max={100} step={1}
            suffix="%"
            detail={fmt(effectivePrice * (params.downPaymentPct / 100))}
          />
          <SliderInput
            label="Interest Rate"
            value={params.interestRate}
            onChange={v => updateParam('interestRate', v)}
            min={0} max={15} step={0.125}
            suffix="%"
          />
          <SliderInput
            label="Loan Term"
            value={params.loanTermYears}
            onChange={v => updateParam('loanTermYears', v)}
            min={1} max={40} step={1}
            suffix=" yrs"
          />
        </div>

        {/* Output metrics */}
        <div className="loan-calc__outputs">
          <div className="loan-calc__output">
            <span className="loan-calc__output-label">Down Payment</span>
            <span className="loan-calc__output-value">{fmt(mortgage.downPayment)}</span>
          </div>
          <div className="loan-calc__output">
            <span className="loan-calc__output-label">Loan Amount</span>
            <span className="loan-calc__output-value">{fmt(mortgage.loanAmount)}</span>
          </div>
          <div className="loan-calc__output">
            <span className="loan-calc__output-label">Monthly P&I</span>
            <span className="loan-calc__output-value loan-calc__output-value--highlight">{fmt(mortgage.monthlyPayment)}</span>
          </div>
          <div className="loan-calc__output">
            <span className="loan-calc__output-label">Total Interest</span>
            <span className="loan-calc__output-value">{fmt(mortgage.totalInterest)}</span>
          </div>
        </div>

        {/* Expandable: expense / tax parameters */}
        <button
          className="loan-calc__more-toggle"
          onClick={() => setShowAllParams(!showAllParams)}
        >
          <SlidersHorizontal size={14} />
          Expense &amp; Tax Parameters
          {showAllParams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showAllParams && (
          <div className="loan-calc__params loan-calc__params--secondary">
            <SliderInput label="Vacancy" value={params.vacancyPct} onChange={v => updateParam('vacancyPct', v)} min={0} max={25} step={1} suffix="%" />
            <SliderInput label="Repairs" value={params.repairsPct} onChange={v => updateParam('repairsPct', v)} min={0} max={25} step={1} suffix="%" />
            <SliderInput label="CapEx" value={params.capexPct} onChange={v => updateParam('capexPct', v)} min={0} max={25} step={1} suffix="%" />
            <SliderInput label="Management" value={params.managementPct} onChange={v => updateParam('managementPct', v)} min={0} max={15} step={1} suffix="%" />
            <SliderInput label="Property Tax" value={params.annualPropertyTax} onChange={v => updateParam('annualPropertyTax', v)} min={0} max={50000} step={100} suffix="/yr" isCurrency />
            <SliderInput label="Insurance" value={params.annualInsurance} onChange={v => updateParam('annualInsurance', v)} min={0} max={20000} step={100} suffix="/yr" isCurrency />
            <SliderInput label="HOA Fees" value={params.monthlyHoa} onChange={v => updateParam('monthlyHoa', v)} min={0} max={1500} step={10} suffix="/mo" isCurrency />
            {results.dataSources?.hoa !== 'zillow' && property.zillowUrl && (
              <a
                className="results__hoa-check-link"
                href={property.zillowUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                Check HOA fees on Zillow listing →
              </a>
            )}
            <SliderInput label="Cost Seg" value={params.costSegPct} onChange={v => updateParam('costSegPct', v)} min={10} max={35} step={0.5} suffix="%" />
            <SliderInput label="Tax Rate" value={params.taxRate} onChange={v => updateParam('taxRate', v)} min={0} max={50} step={1} suffix="%" />
          </div>
        )}
      </div>
      </div>{/* end results__bottom-grid */}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="results__stat">
      <div className="results__stat-icon">{icon}</div>
      <div className="results__stat-value">{value}</div>
      <div className="results__stat-label">{label}</div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const explainer = findExplainer(label);
  return (
    <div className="results__metric-row">
      <span className="results__metric-label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
      </span>
      <span className={`results__metric-value ${positive ? 'results__metric-value--positive' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function AdjustableExpenseRow({
  label,
  value,
  readOnly,
  onAdjust,
  sourceBadge,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onAdjust: () => void;
  sourceBadge?: { text: string; variant: 'api' | 'estimate' };
}) {
  const explainer = findExplainer(label);
  if (readOnly) {
    return <MetricRow label={label} value={value} />;
  }
  return (
    <div
      className="results__metric-row results__metric-row--adjustable"
      onClick={onAdjust}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdjust(); } }}
      title={`Click to adjust ${label}`}
    >
      <span className="results__metric-label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
        {sourceBadge && (
          <span className={`results__source-badge results__source-badge--${sourceBadge.variant}`}>
            {sourceBadge.text}
          </span>
        )}
        <Pencil size={11} className="results__edit-icon" />
      </span>
      <span className="results__metric-value">{value}</span>
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  detail,
  isCurrency,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  detail?: string;
  isCurrency?: boolean;
}) {
  const displayValue = isCurrency
    ? `$${value.toLocaleString()}`
    : `${value}`;

  const explainer = findExplainer(label);

  return (
    <div className="slider-input">
      <div className="slider-input__header">
        <label className="slider-input__label">
          {label}
          {explainer && <TermExplainer info={explainer} />}
        </label>
        <span className="slider-input__value">
          {displayValue}{suffix}
          {detail && <span className="slider-input__detail"> ({detail})</span>}
        </span>
      </div>
      <div className="slider-input__controls">
        <input
          type="range"
          className="slider-input__range"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          min={min}
          max={max}
          step={step}
        />
        <input
          type="number"
          className="slider-input__number"
          value={value}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          min={min}
          max={max}
          step={step}
        />
      </div>
    </div>
  );
}
