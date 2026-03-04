import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PropertyAnalysis, AnalysisParams } from '@deal-platform/shared-types';
import {
  Home, Building2, Calendar,
  BedDouble, Bath, Ruler, PiggyBank, RotateCcw,
  SlidersHorizontal, ChevronDown, ChevronUp,
} from 'lucide-react';
import ComparableProperties from './ComparableProperties';
import TermExplainer, { findExplainer } from './TermExplainer';
import {
  calculateMortgage,
  calculateCashFlow,
  calculateROI,
  calculateTaxSavings,
} from '../utils/calculations';

interface Props {
  analysis: PropertyAnalysis;
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

export default function AnalysisResults({ analysis }: Props) {
  const property = analysis.property_data;
  const results = analysis.analysis_results;
  const rental = results.rentalEstimate;
  const originalParams = analysis.analysis_params;

  // ── Adjustable parameters ────────────────────────────────────────
  const [params, setParams] = useState<AnalysisParams>({
    ...originalParams,
    offerPrice: originalParams.offerPrice || property.price,
    rentOverride: originalParams.rentOverride || rental.mid,
  });
  const [showAllParams, setShowAllParams] = useState(false);
  const [showOfferSlider, setShowOfferSlider] = useState(false);
  const offerRef = useRef<HTMLDivElement>(null);

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
    <div className="results">
      {/* Property Info Card */}
      <div className="results__card results__property">
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

      {/* Two column grid */}
      <div className="results__grid">
        {/* Rental Estimate Card */}
        <div className="results__card">
          <h3 className="results__card-title">
            <span className="results__icon results__icon--blue">🏘️</span>
            Rental Estimate
          </h3>

          <div className="results__big-number">
            <div className="results__big-label">Estimated Monthly Rent</div>
            <div className="results__editable-value results__editable-value--centered results__editable-value--hero">
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
            <div className="results__big-caption">
              Confidence: {rental.confidence} &bull; Range: {fmt(rental.low)} – {fmt(rental.high)}
            </div>

            <div className="results__rent-slider-inline">
              <input
                type="range"
                className="results__offer-range"
                value={effectiveRent}
                onChange={e => updateParam('rentOverride', parseFloat(e.target.value))}
                min={Math.round(rental.low * 0.8)}
                max={Math.round(rental.high * 1.2)}
                step={25}
              />
              <div className="results__offer-slider-bounds">
                <span>{fmt(Math.round(rental.low * 0.8))}</span>
                <span>{fmt(Math.round(rental.high * 1.2))}</span>
              </div>
            </div>
          </div>

          {rental.comps && rental.comps.length > 0 && (
            <div className="results__comps-table">
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
        </div>

        {/* Cash Flow Card */}
        <div className="results__card">
          <h3 className="results__card-title">
            <span className="results__icon results__icon--green">💵</span>
            Cash Flow Analysis
          </h3>

          <MetricRow label="Monthly Rent Income" value={fmt(cashFlow.monthlyRent)} positive />
          <div className="results__metric-row">
            <span className="results__metric-label">
              Mortgage (P&amp;I)
              <button
                type="button"
                className="results__adjust-link"
                onClick={() => document.getElementById('loan-calculator')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                title="Adjust in Loan Calculator below"
              >
                <SlidersHorizontal size={13} />
                Adjust
              </button>
            </span>
            <span className="results__metric-value">{fmt(cashFlow.monthlyMortgage)}</span>
          </div>
          <MetricRow label="Property Tax" value={fmt(cashFlow.monthlyTax)} />
          <MetricRow label="Insurance" value={fmt(cashFlow.monthlyInsurance)} />
          <MetricRow label="Vacancy Reserve" value={fmt(cashFlow.monthlyVacancy)} />
          <MetricRow label="Repairs Reserve" value={fmt(cashFlow.monthlyRepairs)} />
          <MetricRow label="CapEx Reserve" value={fmt(cashFlow.monthlyCapex)} />
          {cashFlow.monthlyManagement > 0 && (
            <MetricRow label="Management" value={fmt(cashFlow.monthlyManagement)} />
          )}

          <div className="results__big-number" style={{ marginTop: '1.5rem' }}>
            <div className="results__big-label">Monthly Cash Flow</div>
            <div className={`results__big-value ${cashFlowPositive ? 'results__big-value--positive' : 'results__big-value--negative'}`}>
              {fmt(cashFlow.monthlyCashFlow)}
            </div>
            <div className="results__big-caption">
              {fmt(cashFlow.annualCashFlow)}/year after all expenses
            </div>
          </div>

          <div className="results__metrics-footer">
            <MetricRow label="Cash-on-Cash ROI" value={pct(roi.cashOnCashROI)} positive={roi.cashOnCashROI > 0} />
            <MetricRow label="Cap Rate" value={pct(roi.capRate)} />
            <MetricRow label="Gross Rent Multiplier" value={roi.grossRentMultiplier.toFixed(1) + 'x'} />
            <MetricRow label="Total Cash Invested" value={fmt(roi.totalCashInvested)} />
          </div>
        </div>
      </div>

      {/* Comparable Properties */}
      {results.comparables && results.comparables.length > 0 && (
        <ComparableProperties
          comparables={results.comparables}
          subject={property}
          subjectRent={rental.mid}
        />
      )}

      {/* Tax Savings Card - Full Width */}
      <div className="results__card results__tax-card">
        <h3 className="results__card-title results__card-title--white">
          <span className="results__icon results__icon--white">💰</span>
          Cost Segregation Tax Savings
        </h3>
        <p className="results__tax-intro">
          Cost segregation accelerates depreciation deductions by reclassifying property
          components, providing immediate tax benefits.
        </p>

        <div className="results__tax-breakdown">
          <div className="results__tax-row">
            <span>Purchase Price</span>
            <span>{fmt(tax.purchasePrice)}</span>
          </div>
          <div className="results__tax-row">
            <span>Accelerated Depreciation</span>
            <span>{fmt(tax.depreciationDeduction)}</span>
          </div>
          <div className="results__tax-row">
            <span>Tax Savings (Year 1)</span>
            <span>{fmt(tax.taxSavings)}</span>
          </div>
        </div>

        <div className="results__big-number results__big-number--glass">
          <div className="results__big-label results__big-label--light">Effective First-Year Return</div>
          <div className="results__big-value results__big-value--white">
            {pct(tax.effectiveFirstYearReturn)}
          </div>
          <div className="results__big-caption results__big-caption--light">
            Including rental income + tax savings
          </div>
        </div>
      </div>

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
            <SliderInput label="Cost Seg" value={params.costSegPct} onChange={v => updateParam('costSegPct', v)} min={10} max={35} step={0.5} suffix="%" />
            <SliderInput label="Tax Rate" value={params.taxRate} onChange={v => updateParam('taxRate', v)} min={0} max={50} step={1} suffix="%" />
          </div>
        )}
      </div>
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
