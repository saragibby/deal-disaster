import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PropertyAnalysis, AnalysisParams } from '@deal-platform/shared-types';
import { computeStrategyComparison, computeDealVerdict } from '@deal-platform/shared-types';
import {
  Home, Building2, Calendar,
  BedDouble, Bath, Ruler, PiggyBank, RotateCcw,
  SlidersHorizontal, ChevronDown, ChevronUp,
  Coins, Share2, Download, Lock, Globe, Pencil, RefreshCw, Gauge, ExternalLink, Plus, X,
  MapPin, Printer,
} from 'lucide-react';
import ComparableProperties from './ComparableProperties';
import ForeclosureCard from './ForeclosureCard';
import DealVerdictCard from './DealVerdictCard';
import { SectionNav, deriveSignals } from './SectionNav';
import RentalTabs, { RentalSummaryStrip, StrategyComparison, DemandIndicators, MarketTrendChart } from './RentalTabs';
import ROIScorecard from './ROIScorecard';
import WealthProjection from './FiveYearProjection';
import SensitivityCard from './SensitivityCard';
import HousingMarketTrends from './comparison/HousingMarketTrends';
import RentalMarketTrends from './comparison/RentalMarketTrends';
import TermExplainer, { findExplainer } from './TermExplainer';
import useExportAnalysis from '../hooks/useExportAnalysis';
import { usePropertyAnalyzerCore } from '../context.js';
import {
  calculateMortgage,
  calculateCashFlow,
  calculateROI,
  calculateTaxSavings,
  calculateStrategyCashFlow,
  calculateStrOperating,
  calculateMtrOperating,
} from '../utils/calculations';

interface Props {
  analysis: PropertyAnalysis;
  skipEntrance?: boolean;
  readOnly?: boolean;
  onUpdate?: (updated: PropertyAnalysis) => void;
  onAnalyzeAnother?: () => void;
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

export default function AnalysisResults({ analysis, skipEntrance, readOnly, onUpdate, onAnalyzeAnother }: Props) {
  const { adapters, features } = usePropertyAnalyzerCore();
  const { api, shareUrls } = adapters;
  const property = analysis.property_data;
  const results = analysis.analysis_results;
  const rental = results.rentalEstimate;
  const originalParams = analysis.analysis_params;

  // Print / PDF export
  const resultsRef = useRef<HTMLDivElement>(null);
  const { exportToPdf, printAnalysis, exporting } = useExportAnalysis(resultsRef);

  // Detect when the section nav is stuck below the header (to go full-width)
  const navBarRef = useRef<HTMLDivElement>(null);
  const [navStuck, setNavStuck] = useState(false);
  useEffect(() => {
    const el = navBarRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const headerH =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--analyzer-header-h'),
        10
      ) || 76;
    const observer = new IntersectionObserver(
      ([entry]) => setNavStuck(entry.intersectionRatio < 1),
      { threshold: [1], rootMargin: `-${headerH + 1}px 0px 0px 0px` }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sharing
  const [isShared, setIsShared] = useState(analysis.is_shared ?? false);
  const [publicShareId, setPublicShareId] = useState(analysis.public_share_id ?? null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    setIsShared(analysis.is_shared ?? false);
    setPublicShareId(analysis.public_share_id ?? null);
  }, [analysis.is_shared, analysis.public_share_id]);

  const toggleShare = useCallback(async () => {
    if (!analysis.slug) return;
    setShareLoading(true);
    try {
      const result = await api.setShared(analysis.slug, !isShared);
      setIsShared(result.isShared);
      setPublicShareId(result.publicShareId ?? null);
    } catch (err: any) {
      alert(err.message || 'Failed to update sharing.');
    } finally {
      setShareLoading(false);
    }
  }, [analysis.slug, api, isShared]);

  const copyShareLink = useCallback(() => {
    const shareIdentifier = publicShareId || analysis.public_share_id || analysis.slug;
    const url = shareUrls.publicAnalysis(shareIdentifier);
    navigator.clipboard.writeText(url).then(() => {
      adapters.events?.shareLinkCopied?.(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  }, [adapters.events, analysis.public_share_id, analysis.slug, publicShareId, shareUrls]);

  // ── Adjustable parameters ────────────────────────────────────────
  // Persisted user adjustments (if any) are merged back in so manual
  // fine-tuning is restored on reload. `analysis_params` stays the model's
  // estimate baseline; the user's param edits live in `user_overrides.params`.
  const savedOverrides = analysis.user_overrides;
  const [params, setParams] = useState<AnalysisParams>({
    ...originalParams,
    offerPrice: originalParams.offerPrice || property.price,
    rentOverride: originalParams.rentOverride || rental.mid,
    ...(savedOverrides?.params ?? {}),
  });
  const [showAllParams, setShowAllParams] = useState(false);
  const [showOfferSlider, setShowOfferSlider] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showStreetView, setShowStreetView] = useState(false);
  const offerRef = useRef<HTMLDivElement>(null);

  // Keyless Google Street View embed. Prefers exact coordinates; falls back to
  // the formatted address when lat/lng aren't available.
  const streetViewSrc = useMemo(() => {
    const { latitude, longitude } = property;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return `https://www.google.com/maps?q=&layer=c&cbll=${latitude},${longitude}&cbp=11,0,0,0,0&output=svembed`;
    }
    const q = [property.address, property.city, property.state, property.zip].filter(Boolean).join(', ').trim();
    if (!q) return null;
    return `https://www.google.com/maps?q=${encodeURIComponent(q)}&layer=c&output=svembed`;
  }, [property]);

  // Rental type selected via the strategy cards; the rent slider above the cards
  // adjusts whichever type is active. MTR/STR carry their own revenue overrides.
  const [selectedStrategy, setSelectedStrategy] = useState<'ltr' | 'mtr' | 'str' | null>(
    savedOverrides?.selectedStrategy ?? null,
  );
  const [mtrRevenueOverride, setMtrRevenueOverride] = useState<number | null>(
    savedOverrides?.mtrRevenue ?? null,
  );
  const [strRevenueOverride, setStrRevenueOverride] = useState<number | null>(
    savedOverrides?.strRevenue ?? null,
  );
  // Inline-editable strategy cost overrides (null = use the model default).
  // Per-line operating overrides for MTR / STR, keyed `${strategy}:${lineKey}`.
  const [operatingOverrides, setOperatingOverrides] = useState<Record<string, number>>(
    savedOverrides?.operating ?? {},
  );
  const [furnitureOverride, setFurnitureOverride] = useState<number | null>(
    savedOverrides?.furniture ?? null,
  );
  const [applianceOverride, setApplianceOverride] = useState<number | null>(
    savedOverrides?.appliances ?? null,
  );
  // How furniture/appliance upfront costs are depreciated in year 1:
  // 'full' = bonus/Section 179 (100% in Yr 1); 'straight' = straight-line over 5 yrs.
  const [depreciationMethod, setDepreciationMethod] = useState<'full' | 'straight'>(
    savedOverrides?.depreciationMethod ?? 'full',
  );

  // Set/clear a single operating-cost override for a strategy line.
  const setOpOverride = useCallback((strategy: string, lineKey: string, value: number | null) => {
    setOperatingOverrides(prev => {
      const k = `${strategy}:${lineKey}`;
      if (value == null) {
        if (!(k in prev)) return prev;
        const { [k]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [k]: value };
    });
  }, []);

  // Re-fetch live data and recompute with current assumptions. Tax/insurance
  // the user hasn't overridden are omitted so the server re-derives them.
  const handleReanalyze = useCallback(async () => {
    if (!analysis.slug || !onUpdate) return;
    setReanalyzing(true);
    try {
      const payload: Partial<AnalysisParams> = { ...params };
      // Omit any server-derived param the user hasn't overridden so it re-derives
      // from the latest property data instead of pinning the stored value.
      if (params.annualPropertyTax === originalParams.annualPropertyTax) delete payload.annualPropertyTax;
      if (params.annualInsurance === originalParams.annualInsurance) delete payload.annualInsurance;
      if (params.repairsPct === originalParams.repairsPct) delete payload.repairsPct;
      if (params.capexPct === originalParams.capexPct) delete payload.capexPct;
      if (params.costSegPct === originalParams.costSegPct) delete payload.costSegPct;
      const updated = await api.reAnalyze(analysis.slug, payload);
      onUpdate(updated);
    } catch (err: any) {
      alert(err?.message || 'Re-analyze failed. Please try again.');
    } finally {
      setReanalyzing(false);
    }
  }, [analysis.slug, api, onUpdate, params, originalParams]);

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

  // Baseline used to detect which params the user changed (persisted as a diff).
  const paramsBaseline = useMemo<AnalysisParams>(() => ({
    ...originalParams,
    offerPrice: originalParams.offerPrice || property.price,
    rentOverride: originalParams.rentOverride || rental.mid,
  }), [originalParams, property.price, rental.mid]);

  const resetParams = useCallback(() => {
    setParams({ ...originalParams, offerPrice: property.price, rentOverride: rental.mid });
  }, [originalParams, property.price, rental.mid]);

  // ── Live recalculation ───────────────────────────────────────────
  const effectivePrice = params.offerPrice > 0 ? params.offerPrice : property.price;
  const priceAdjusted = effectivePrice !== property.price;
  const priceDelta = effectivePrice - property.price;
  const priceDeltaPct = ((priceDelta / property.price) * 100).toFixed(1);

  const { mortgage, cashFlow, roi } = useMemo(() => {
    const price = params.offerPrice > 0 ? params.offerPrice : property.price;
    const m = calculateMortgage(
      price,
      params.downPaymentPct,
      params.interestRate,
      params.loanTermYears,
    );
    const cf = calculateCashFlow(params.rentOverride || rental.mid, m, params);
    const r = calculateROI(price, cf, m);
    return { mortgage: m, cashFlow: cf, roi: r };
  }, [params, property.price, rental.mid]);

  const effectiveRent = params.rentOverride || rental.mid;
  const rentAdjusted = effectiveRent !== rental.mid;

  // Break-even rent — the monthly rent at which cash flow hits exactly $0,
  // recomputed live so it tracks the current price / rate / expense assumptions.
  // Cash flow is linear in rent: rent * (1 - reserveRate) - fixedMonthly.
  const breakEvenRent = useMemo(() => {
    const reserveRate =
      (params.vacancyPct + params.repairsPct + params.capexPct + (params.managementPct || 0)) / 100;
    if (reserveRate >= 1) return null;
    const fixedMonthly =
      mortgage.monthlyPayment +
      params.annualPropertyTax / 12 +
      params.annualInsurance / 12 +
      (params.monthlyHoa || 0);
    return Math.round(fixedMonthly / (1 - reserveRate));
  }, [mortgage.monthlyPayment, params]);

  const rentCushion = breakEvenRent != null ? effectiveRent - breakEvenRent : null;
  const rentCushionPct =
    breakEvenRent != null && breakEvenRent > 0
      ? Math.round(((effectiveRent - breakEvenRent) / breakEvenRent) * 100)
      : null;

  // Strategy revenue overrides (MTR/STR) from the rent slider. Expenses are held
  // constant (gross − net of the original estimate) so the slider flows straight
  // through to net cash flow, mirroring how the LTR rentOverride behaves.
  // Operating overrides scoped to a single strategy (strip the `strategy:` key
  // prefix) — fed to both the comparison-card net and the cash-flow card.
  const mtrOpOv = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(operatingOverrides)) {
      if (k.startsWith('mtr:')) out[k.slice(4)] = v;
    }
    return out;
  }, [operatingOverrides]);
  const strOpOv = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(operatingOverrides)) {
      if (k.startsWith('str:')) out[k.slice(4)] = v;
    }
    return out;
  }, [operatingOverrides]);

  const adjustedMtr = useMemo(() => {
    const est = results.mtrEstimate;
    if (!est) return est;
    const gross = mtrRevenueOverride ?? est.grossMonthlyRevenue;
    const withGross = { ...est, grossMonthlyRevenue: gross };
    const { netMonthlyRevenue } = calculateMtrOperating(withGross, mtrOpOv);
    return { ...withGross, netMonthlyRevenue };
  }, [results.mtrEstimate, mtrRevenueOverride, mtrOpOv]);

  const adjustedStr = useMemo(() => {
    const est = results.strEstimate;
    if (!est) return est;
    // STR carries more than the server's cleaning + platform net: hosts also pay
    // utilities, management, and furnishing wear. Recompute the net from the full
    // cost model (applying any slider override) so the comparison cards, bars,
    // ranking, and cash-flow card all use the same honest STR figure.
    const gross = strRevenueOverride ?? est.grossMonthlyRevenue;
    const withGross = { ...est, grossMonthlyRevenue: gross };
    const { netMonthlyRevenue } = calculateStrOperating(withGross, property.bedrooms, strOpOv);
    return { ...withGross, platformFees: Math.round(gross * 0.03), netMonthlyRevenue };
  }, [results.strEstimate, strRevenueOverride, property.bedrooms, strOpOv]);

  // Single source of truth for ranking strategies — recomputed live so the KPI
  // strip, strategy comparison, and section nav always agree.
  const strategyComparison = useMemo(() => computeStrategyComparison({
    cashFlow,
    rentalEstimate: rental,
    strEstimate: adjustedStr,
    mtrEstimate: adjustedMtr,
    dataSources: results.dataSources,
  }), [cashFlow, rental, adjustedStr, adjustedMtr, results.dataSources]);

  // ── Persist user adjustments ─────────────────────────────────────
  // Debounced, best-effort auto-save so manual fine-tuning is restored on
  // reload and flows into property comparisons. We send only the changed params
  // (a diff vs the estimate baseline) plus the client-computed derived figures;
  // the server merges the net/cash-flow values into analysis_results while
  // keeping gross revenue raw, so a reload recomputes identically.
  const didMountRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (readOnly || !analysis.slug) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const paramDiff: Partial<AnalysisParams> = {};
      (Object.keys(paramsBaseline) as (keyof AnalysisParams)[]).forEach(k => {
        if (params[k] !== paramsBaseline[k]) paramDiff[k] = params[k];
      });
      const overrides = {
        selectedStrategy,
        mtrRevenue: mtrRevenueOverride,
        strRevenue: strRevenueOverride,
        operating: operatingOverrides,
        furniture: furnitureOverride,
        appliances: applianceOverride,
        params: paramDiff,
        depreciationMethod,
      };
      api.saveAdjustments(analysis.slug, {
        overrides,
        derived: {
          cashFlow,
          roi,
          strategyComparison,
          strNet: adjustedStr?.netMonthlyRevenue ?? null,
          mtrNet: adjustedMtr?.netMonthlyRevenue ?? null,
        },
      }).catch(() => { /* best-effort autosave */ });
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    params, selectedStrategy, mtrRevenueOverride, strRevenueOverride,
    operatingOverrides, furnitureOverride, applianceOverride,
    cashFlow, roi, strategyComparison, adjustedStr, adjustedMtr,
    api, paramsBaseline, readOnly, analysis.slug, depreciationMethod,
  ]);

  // Active rental type for the slider (defaults to the best strategy).
  const selectedKey = (selectedStrategy ?? strategyComparison.bestKey.toLowerCase()) as 'ltr' | 'mtr' | 'str';

  // Slider/editor config for whichever rental type is currently selected.
  const selectedMeta = (() => {
    if (selectedKey === 'mtr' && results.mtrEstimate) {
      const est = results.mtrEstimate;
      return {
        label: 'Mid-Term',
        noun: 'Revenue',
        value: mtrRevenueOverride ?? Math.round(est.grossMonthlyRevenue),
        low: est.revenueRange?.low ?? est.grossMonthlyRevenue,
        high: est.revenueRange?.high ?? est.grossMonthlyRevenue,
        confidence: est.confidence,
        adjusted: mtrRevenueOverride != null,
        set: (v: number) => setMtrRevenueOverride(v),
        reset: () => setMtrRevenueOverride(null),
      };
    }
    if (selectedKey === 'str' && results.strEstimate) {
      const est = results.strEstimate;
      return {
        label: 'Short-Term',
        noun: 'Revenue',
        value: strRevenueOverride ?? Math.round(est.grossMonthlyRevenue),
        low: est.revenueRange?.low ?? est.grossMonthlyRevenue,
        high: est.revenueRange?.high ?? est.grossMonthlyRevenue,
        confidence: est.confidence,
        adjusted: strRevenueOverride != null,
        set: (v: number) => setStrRevenueOverride(v),
        reset: () => setStrRevenueOverride(null),
      };
    }
    return {
      label: 'Long-Term',
      noun: 'Rental',
      value: effectiveRent,
      low: rental.low,
      high: rental.high,
      confidence: rental.confidence,
      adjusted: rentAdjusted,
      set: (v: number) => updateParam('rentOverride', v),
      reset: () => updateParam('rentOverride', rental.mid),
    };
  })();

  // Strategy-aware cash flow for the Cash Flow Analysis card. Switches its
  // income, operating expenses, monthly cash flow, one-time setup costs, ROI
  // and tax figures to the selected rental type (LTR / MTR / STR). LTR mirrors
  // the existing long-term breakdown exactly.
  const displayCashFlow = useMemo(
    () => calculateStrategyCashFlow(selectedKey, cashFlow, {
      bedrooms: property.bedrooms,
      mtr: adjustedMtr,
      str: adjustedStr,
      overrides: {
        operating: selectedKey === 'mtr' ? mtrOpOv : selectedKey === 'str' ? strOpOv : undefined,
        furniture: furnitureOverride,
        appliances: applianceOverride,
      },
    }),
    [selectedKey, cashFlow, property.bedrooms, adjustedMtr, adjustedStr, mtrOpOv, strOpOv, furnitureOverride, applianceOverride],
  );

  // ROI / tax recomputed for the selected strategy. One-time setup costs
  // (furniture, appliances) are added to cash invested.
  const displayRoi = useMemo(
    () => calculateROI(effectivePrice, displayCashFlow.breakdown, mortgage, displayCashFlow.totalOneTime),
    [effectivePrice, displayCashFlow, mortgage],
  );

  const displayTax = useMemo(
    () => {
      // Furniture + appliances are depreciable personal property. Year-1 deduction
      // is the full basis (bonus / Section 179) or 1/5 of it (straight-line, 5 yr).
      const basis = displayCashFlow.totalOneTime;
      const firstYearDeduction = depreciationMethod === 'full' ? basis : basis / 5;
      return calculateTaxSavings(
        effectivePrice,
        params.costSegPct,
        params.taxRate,
        displayRoi.totalCashInvested,
        displayCashFlow.annualCashFlow,
        { basis, firstYearDeduction },
      );
    },
    [effectivePrice, params.costSegPct, params.taxRate, displayRoi.totalCashInvested, displayCashFlow.annualCashFlow, displayCashFlow.totalOneTime, depreciationMethod],
  );

  // Decision-first verdict — recomputed live so it reflects any adjusted
  // assumptions (price, rent, expenses) rather than only the saved snapshot.
  // Scored against the BEST strategy (LTR/MTR/STR) via strategyComparison, so
  // the recommendation reflects the property's strongest viable use.
  // FUTURE ENHANCEMENT: make the Cash Flow section itself strategy-aware so its
  // figures switch to MTR/STR values when one of those is the selected/best
  // strategy, instead of always showing long-term.
  const verdict = useMemo(() => computeDealVerdict({
    cashFlow,
    roi,
    rentalEstimate: rental,
    breakEvenRent,
    comparables: results.comparables,
    marketStatistics: results.marketStatistics,
    price: effectivePrice,
    strategyComparison,
  }), [cashFlow, roi, rental, breakEvenRent, results.comparables, results.marketStatistics, effectivePrice, strategyComparison]);

  // ── "What changed" — diff current assumptions against the saved baseline ──
  const baselineParams = useMemo<AnalysisParams>(() => ({
    ...originalParams,
    offerPrice: originalParams.offerPrice || property.price,
    rentOverride: originalParams.rentOverride || rental.mid,
  }), [originalParams, property.price, rental.mid]);

  const baselineCashFlow = useMemo(() => {
    const price = baselineParams.offerPrice > 0 ? baselineParams.offerPrice : property.price;
    const m = calculateMortgage(price, baselineParams.downPaymentPct, baselineParams.interestRate, baselineParams.loanTermYears);
    return calculateCashFlow(baselineParams.rentOverride || rental.mid, m, baselineParams);
  }, [baselineParams, property.price, rental.mid]);

  const changes = useMemo(() => {
    const money = (n: number) => fmt(n);
    const percent = (n: number) => `${n}%`;
    type ChangedParamKey =
      | 'offerPrice'
      | 'rentOverride'
      | 'downPaymentPct'
      | 'interestRate'
      | 'loanTermYears'
      | 'vacancyPct'
      | 'repairsPct'
      | 'capexPct'
      | 'managementPct'
      | 'annualPropertyTax'
      | 'annualInsurance'
      | 'monthlyHoa'
      | 'costSegPct'
      | 'taxRate';
    const defs: { key: ChangedParamKey; label: string; format: (n: number) => string }[] = [
      { key: 'offerPrice', label: 'Offer price', format: money },
      { key: 'rentOverride', label: 'Monthly rent', format: money },
      { key: 'downPaymentPct', label: 'Down payment', format: percent },
      { key: 'interestRate', label: 'Interest rate', format: percent },
      { key: 'loanTermYears', label: 'Loan term', format: (n) => `${n} yr` },
      { key: 'vacancyPct', label: 'Vacancy', format: percent },
      { key: 'repairsPct', label: 'Repairs', format: percent },
      { key: 'capexPct', label: 'CapEx', format: percent },
      { key: 'managementPct', label: 'Management', format: percent },
      { key: 'annualPropertyTax', label: 'Property tax (yr)', format: money },
      { key: 'annualInsurance', label: 'Insurance (yr)', format: money },
      { key: 'monthlyHoa', label: 'HOA (mo)', format: money },
      { key: 'costSegPct', label: 'Cost-seg %', format: percent },
      { key: 'taxRate', label: 'Tax rate', format: percent },
    ];
    return defs
      .filter(d => params[d.key] !== baselineParams[d.key])
      .map(d => ({ label: d.label, from: d.format(baselineParams[d.key]), to: d.format(params[d.key]) }));
  }, [params, baselineParams]);

  const cashFlowDelta = cashFlow.monthlyCashFlow - baselineCashFlow.monthlyCashFlow;

  const cashFlowPositive = displayCashFlow.monthlyCashFlow >= 0;

  // Plain-language explanation of how the age-based repairs/capex reserves were
  // derived — surfaced in the row's info tooltip.
  const homeAge = property.yearBuilt && property.yearBuilt > 1800
    ? new Date().getFullYear() - property.yearBuilt
    : null;
  const ageDesc = homeAge != null
    ? `built ${property.yearBuilt} (~${homeAge} yr${homeAge === 1 ? '' : 's'} old)`
    : 'an unknown build year';
  const maintenanceNote = (pct: number, overridden: boolean) =>
    overridden
      ? `Your custom override of ${pct}% of monthly rent.`
      : `Estimated at ${pct}% of monthly rent from the home's age — ${ageDesc}. Newer homes use smaller reserves; older homes larger.`;
  const repairsNote = maintenanceNote(params.repairsPct, params.repairsPct !== originalParams.repairsPct);
  const capexNote = maintenanceNote(params.capexPct, params.capexPct !== originalParams.capexPct);

  // Shared property-level costs for the Cash Flow card — inline-editable. The
  // mortgage stays a scroll-to-loan-terms row since it's derived from four
  // inputs; tax / insurance / HOA edit their dollar amount directly.
  const carryingRows = (
    <>
      <AdjustableExpenseRow label="Mortgage (P&I)" value={fmt(cashFlow.monthlyMortgage)} readOnly={readOnly} onAdjust={scrollToLoanCalc} />
      <EditableCostRow
        label="Property Tax"
        value={cashFlow.monthlyTax}
        step={10}
        min={0}
        max={2000}
        readOnly={readOnly}
        adjusted={params.annualPropertyTax !== originalParams.annualPropertyTax}
        onChange={v => updateParam('annualPropertyTax', Math.round(v * 12))}
        onReset={() => updateParam('annualPropertyTax', originalParams.annualPropertyTax)}
        sourceBadge={
          params.annualPropertyTax !== originalParams.annualPropertyTax
            ? { text: 'Custom', variant: 'estimate' }
            : results.dataSources?.tax === 'actual'
            ? { text: 'Actual', variant: 'api' }
            : results.dataSources?.tax === 'estimate'
            ? { text: 'Estimated', variant: 'estimate' }
            : undefined
        }
      />
      <EditableCostRow
        label="Insurance"
        value={cashFlow.monthlyInsurance}
        step={10}
        min={0}
        max={1000}
        readOnly={readOnly}
        adjusted={params.annualInsurance !== originalParams.annualInsurance}
        onChange={v => updateParam('annualInsurance', Math.round(v * 12))}
        onReset={() => updateParam('annualInsurance', originalParams.annualInsurance)}
        sourceBadge={
          params.annualInsurance !== originalParams.annualInsurance
            ? { text: 'Custom', variant: 'estimate' }
            : results.dataSources?.insurance === 'estimate'
            ? { text: 'Estimated', variant: 'estimate' }
            : undefined
        }
      />
      <EditableCostRow
        label="HOA Fees"
        value={cashFlow.monthlyHoa}
        step={10}
        min={0}
        max={1500}
        readOnly={readOnly}
        adjusted={(params.monthlyHoa || 0) !== (originalParams.monthlyHoa || 0)}
        onChange={v => updateParam('monthlyHoa', Math.round(v))}
        onReset={() => updateParam('monthlyHoa', originalParams.monthlyHoa || 0)}
        sourceBadge={
          (params.monthlyHoa || 0) !== (originalParams.monthlyHoa || 0)
            ? { text: 'Custom', variant: 'estimate' }
            : results.dataSources?.hoa === 'zillow'
            ? { text: 'From Zillow', variant: 'api' }
            : results.dataSources?.hoa === 'estimate'
            ? { text: 'Estimated', variant: 'estimate' }
            : undefined
        }
      />
    </>
  );

  // Long-term reserve assumptions — edited inline as a percent of monthly rent.
  const reserveRows = (
    <>
      <EditableCostRow
        label="Vacancy Reserve"
        value={params.vacancyPct}
        unit="%"
        step={0.5}
        min={0}
        max={25}
        readOnly={readOnly}
        amount={cashFlow.monthlyVacancy}
        adjusted={params.vacancyPct !== originalParams.vacancyPct}
        onChange={v => updateParam('vacancyPct', v)}
        onReset={() => updateParam('vacancyPct', originalParams.vacancyPct)}
        sourceBadge={{ text: params.vacancyPct !== originalParams.vacancyPct ? 'Custom' : 'Estimated', variant: 'estimate' }}
      />
      <EditableCostRow
        label="Repairs Reserve"
        value={params.repairsPct}
        unit="%"
        step={0.5}
        min={0}
        max={25}
        readOnly={readOnly}
        amount={cashFlow.monthlyRepairs}
        adjusted={params.repairsPct !== originalParams.repairsPct}
        onChange={v => updateParam('repairsPct', v)}
        onReset={() => updateParam('repairsPct', originalParams.repairsPct)}
        sourceBadge={{ text: params.repairsPct !== originalParams.repairsPct ? 'Custom' : 'Estimated', variant: 'estimate' }}
        explainerNote={repairsNote}
      />
      <EditableCostRow
        label="CapEx Reserve"
        value={params.capexPct}
        unit="%"
        step={0.5}
        min={0}
        max={25}
        readOnly={readOnly}
        amount={cashFlow.monthlyCapex}
        adjusted={params.capexPct !== originalParams.capexPct}
        onChange={v => updateParam('capexPct', v)}
        onReset={() => updateParam('capexPct', originalParams.capexPct)}
        sourceBadge={{ text: params.capexPct !== originalParams.capexPct ? 'Custom' : 'Estimated', variant: 'estimate' }}
        explainerNote={capexNote}
      />
      <EditableCostRow
        label="Management"
        value={params.managementPct || 0}
        unit="%"
        step={0.5}
        min={0}
        max={15}
        readOnly={readOnly}
        amount={cashFlow.monthlyManagement}
        adjusted={(params.managementPct || 0) !== (originalParams.managementPct || 0)}
        onChange={v => updateParam('managementPct', v)}
        onReset={() => updateParam('managementPct', originalParams.managementPct || 0)}
        sourceBadge={(params.managementPct || 0) !== (originalParams.managementPct || 0) ? { text: 'Custom', variant: 'estimate' } : undefined}
      />
    </>
  );

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

      {/* What changed — appears once assumptions are adjusted */}
      {!readOnly && isAdjusted && changes.length > 0 && (
        <div className="results__section">
          <div className="what-changed">
            <div className="what-changed__head">
              <span className="what-changed__title">
                <Pencil size={14} /> You changed {changes.length} assumption{changes.length > 1 ? 's' : ''}
              </span>
              <span className={`what-changed__impact ${cashFlowDelta >= 0 ? 'what-changed__impact--up' : 'what-changed__impact--down'}`}>
                Cash flow {cashFlowDelta >= 0 ? '+' : '−'}{fmt(Math.abs(cashFlowDelta))}/mo vs. original
              </span>
              <button className="what-changed__reset" onClick={resetParams} type="button">
                <RotateCcw size={13} /> Reset all
              </button>
            </div>
            <ul className="what-changed__list">
              {changes.map(c => (
                <li key={c.label} className="what-changed__item">
                  <span className="what-changed__item-label">{c.label}</span>
                  <span className="what-changed__item-from">{c.from}</span>
                  <span className="what-changed__item-arrow">→</span>
                  <span className="what-changed__item-to">{c.to}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Property Info Card */}
      <div id="property-info" className={`results__card results__property results__section${showOfferSlider ? ' results__property--popover-open' : ''}`}>
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
                <div className="results__property-links">
                  {(() => {
                    const zillowQuery = [property.address, property.city, property.state, property.zip]
                      .filter(Boolean)
                      .join(' ')
                      .trim();
                    if (!zillowQuery) return null;
                    const zillowUrl = `https://www.zillow.com/homes/${encodeURIComponent(zillowQuery).replace(/%20/g, '-')}_rb/`;
                    return (
                      <a
                        className="results__property-link"
                        href={zillowUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on Zillow"
                        aria-label="View this property on Zillow"
                      >
                        <ExternalLink size={16} />
                        <span className="results__property-link-text">Zillow</span>
                      </a>
                    );
                  })()}
                  {features.streetView && streetViewSrc && (
                    <button
                      type="button"
                      className="results__property-link results__streetview-btn"
                      onClick={() => setShowStreetView(true)}
                      title="Open Street View"
                      aria-label="Open Street View of this property"
                    >
                      <MapPin size={16} />
                      <span className="results__property-link-text">Street View</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="results__property-price-block" ref={offerRef}>
                <div className="results__property-price">
                  {priceAdjusted ? fmt(effectivePrice) : fmt(property.price)}
                  {!readOnly && (
                    <button
                      type="button"
                      className="results__offer-toggle"
                      onClick={() => setShowOfferSlider(o => !o)}
                      title="Run offer scenarios"
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                  )}
                </div>
                {priceAdjusted && (
                  <div className="results__offer-meta">
                    <span className="results__list-price">List: {fmt(property.price)}</span>
                    <span className={`results__price-delta ${priceDelta < 0 ? 'results__price-delta--savings' : 'results__price-delta--over'}`}>
                      {priceDelta < 0 ? '−' : '+'}{fmt(Math.abs(priceDelta))} ({priceDelta < 0 ? '' : '+'}{priceDeltaPct}%)
                    </span>
                  </div>
                )}
                {!readOnly && showOfferSlider && (
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

          {!readOnly && (
            <div className="results__property-actions no-print">
              {onAnalyzeAnother && (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={onAnalyzeAnother}
                  title="Analyze a different property"
                >
                  <Plus size={14} />
                  Analyze another
                </button>
              )}
              {features.publicSharing && (
                <button
                  className={`btn btn--outline btn--sm ${isShared ? 'btn--shared' : ''}`}
                  onClick={toggleShare}
                  disabled={shareLoading}
                  title={isShared ? 'Make private' : 'Make shareable'}
                >
                  {isShared ? <Globe size={14} /> : <Lock size={14} />}
                  {shareLoading ? 'Updating...' : isShared ? 'Public' : 'Private'}
                </button>
              )}
              {features.publicSharing && isShared && (
                <button
                  className="btn btn--outline btn--sm"
                  onClick={copyShareLink}
                  title="Copy share link"
                >
                  <Share2 size={14} />
                  {shareCopied ? 'Copied!' : 'Copy Link'}
                </button>
              )}
              {features.pdfExport && (
                <button
                  className="btn btn--outline btn--sm"
                  onClick={exportToPdf}
                  disabled={exporting}
                  title="Download as PDF"
                >
                  {exporting ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <Download size={14} />}
                  {exporting ? 'Exporting...' : 'Export PDF'}
                </button>
              )}
              <button
                className="btn btn--outline btn--sm"
                onClick={printAnalysis}
                title="Print analysis"
              >
                <Printer size={14} />
                Print
              </button>
              {onUpdate && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={handleReanalyze}
                  disabled={reanalyzing}
                  title="Re-fetch live data and recompute with current assumptions"
                >
                  {reanalyzing ? <span className="analyzer-spinner analyzer-spinner--sm" /> : <RefreshCw size={14} />}
                  {reanalyzing ? 'Re-analyzing...' : 'Re-analyze'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Section nav — sticky pills below the property card */}
      <div ref={navBarRef} className={`results__nav-bar no-print${navStuck ? ' results__nav-bar--stuck' : ''}`}>
        <SectionNav signals={deriveSignals(analysis)} />
      </div>

      {/* Decision-first verdict */}
      <div id="deal-verdict" className="results__section">
        <DealVerdictCard verdict={verdict} address={property.address} />
      </div>

      {/* Rental summary strip */}
      <div id="rental-summary" className="results__section">
        <RentalSummaryStrip
          property={property}
          effectiveRent={effectiveRent}
          mtrEstimate={results.mtrEstimate}
          strEstimate={results.strEstimate}
          strategyComparison={strategyComparison}
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
              <span className="results__rent-compact-label">{selectedMeta.label} {selectedMeta.noun} Estimate</span>
              <span className="results__rent-compact-confidence">
                {selectedMeta.confidence} &bull; {fmt(selectedMeta.low)} – {fmt(selectedMeta.high)}
              </span>
            </div>
            {readOnly ? (
              <div className="results__rent-compact-controls">
                <div className="results__big-value">{fmt(selectedMeta.value)}</div>
              </div>
            ) : (
              <div className="results__rent-compact-controls">
                <div className="results__editable-value results__editable-value--centered">
                  <span className="results__editable-prefix results__editable-prefix--hero">$</span>
                  <input
                    type="number"
                    className="results__editable-input results__editable-input--rent results__editable-input--hero"
                    value={selectedMeta.value}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) selectedMeta.set(v);
                    }}
                    step={25}
                  />
                  {selectedMeta.adjusted && (
                    <button
                      type="button"
                      className="results__rent-reset"
                      onClick={selectedMeta.reset}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <input
                  type="range"
                  className="results__offer-range"
                  value={selectedMeta.value}
                  onChange={e => selectedMeta.set(parseFloat(e.target.value))}
                  min={Math.round(selectedMeta.low * 0.8)}
                  max={Math.round(selectedMeta.high * 1.2)}
                  step={25}
                />
              </div>
            )}
          </div>

          <StrategyComparison
            ltrRent={effectiveRent}
            mtrEstimate={adjustedMtr}
            strEstimate={adjustedStr}
            rentalEstimate={rental}
            dataSources={results.dataSources}
            marketStatistics={results.marketStatistics}
            strategyComparison={strategyComparison}
            selectedKey={selectedKey}
            onSelectKey={readOnly ? undefined : setSelectedStrategy}
            readOnly={readOnly}
            bedrooms={property.bedrooms}
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
          <span className={`results__type-tag results__type-tag--${selectedKey}`}>
            {selectedMeta.label}
          </span>
          <h3 className="results__card-title">
            <span className="results__icon results__icon--green">💵</span>
            Cash Flow Analysis
          </h3>
          <p className="results__card-subtitle">All figures are per month unless noted.</p>
          {!readOnly && (
            <p className="results__adjust-hint">
              <SlidersHorizontal size={12} />
              Click any price or % to fine-tune it
            </p>
          )}

          {selectedKey === 'ltr' ? (
            <>
              <MetricRow label="Monthly Rent Income" value={fmt(cashFlow.monthlyRent)} positive />
              {carryingRows}
              {reserveRows}
            </>
          ) : (
            <>
              <MetricRow label={displayCashFlow.incomeLabel} value={fmt(displayCashFlow.monthlyIncome)} positive />
              {carryingRows}
              {displayCashFlow.operating.map(line => (
                <EditableCostRow
                  key={line.key}
                  label={line.label}
                  value={line.value}
                  step={10}
                  readOnly={readOnly}
                  adjusted={operatingOverrides[`${selectedKey}:${line.key}`] != null}
                  onChange={v => setOpOverride(selectedKey, line.key, v)}
                  onReset={() => setOpOverride(selectedKey, line.key, null)}
                />
              ))}
              <p className="results__strategy-note">
                {selectedKey === 'mtr' ? 'Mid-term' : 'Short-term'} operating costs are derived from the{' '}
                {selectedKey === 'mtr' ? 'furnished mid-term' : 'short-term rental'} revenue estimate.{' '}
                {readOnly
                  ? 'Operating costs are derived from the furnished revenue estimate.'
                  : 'Click any cost above (or the setup costs below) to match your numbers; adjust revenue with the slider above.'}
              </p>
            </>
          )}

          <div className="results__big-number" style={{ marginTop: '0.75rem' }}>
            <div className="results__big-label">Monthly Cash Flow</div>
            <div className={`results__big-value ${cashFlowPositive ? 'results__big-value--positive' : 'results__big-value--negative'}`}>
              {fmt(displayCashFlow.monthlyCashFlow)}
            </div>
            <div className="results__big-caption">
              {fmt(displayCashFlow.annualCashFlow)}/year after all expenses
            </div>
            <div className={`results__big-verdict ${cashFlowPositive ? 'results__big-verdict--positive' : displayCashFlow.monthlyCashFlow > -200 ? 'results__big-verdict--neutral' : 'results__big-verdict--negative'}`}>
              {cashFlowPositive
                ? `The ${selectedKey === 'ltr' ? 'rent covers' : 'revenue covers'} every expense with ${fmt(displayCashFlow.monthlyCashFlow)}/mo left over.`
                : displayCashFlow.monthlyCashFlow > -200
                  ? `Nearly breaks even — you'd cover a small ${fmt(Math.abs(displayCashFlow.monthlyCashFlow))}/mo gap.`
                  : `You'd fund a ${fmt(Math.abs(displayCashFlow.monthlyCashFlow))}/mo shortfall out of pocket.`}
            </div>
          </div>

          {selectedKey === 'ltr' && breakEvenRent != null && rentCushion != null && (
            <div className={`results__breakeven results__breakeven--${rentCushion >= 0 ? 'safe' : 'risk'}`}>
              <Gauge size={20} className="results__breakeven-icon" />
              <div className="results__breakeven-body">
                <div className="results__breakeven-head">
                  <span className="results__breakeven-label">Break-even rent</span>
                  <span className="results__breakeven-value">{fmt(breakEvenRent)}/mo</span>
                </div>
                <p className="results__breakeven-note">
                  {rentCushion >= 0
                    ? `Today's rent of ${fmt(effectiveRent)} clears break-even with a ${fmt(rentCushion)}/mo cushion${rentCushionPct != null ? ` (${rentCushionPct}% above)` : ''}.`
                    : `Today's rent of ${fmt(effectiveRent)} sits ${fmt(Math.abs(rentCushion))}/mo below break-even — rent must reach ${fmt(breakEvenRent)} to cover every cost.`}
                </p>
              </div>
            </div>
          )}

          {displayCashFlow.oneTime.length > 0 && (
            <div className="results__onetime">
              <div className="results__onetime-head">
                <span className="results__onetime-title">One-Time Setup Costs</span>
                <span className="results__onetime-total">{fmt(displayCashFlow.totalOneTime)}</span>
              </div>
              {displayCashFlow.oneTime.map(line => {
                const editable = line.key === 'furniture' || line.key === 'appliances';
                const isFurniture = line.key === 'furniture';
                const adjusted = isFurniture ? furnitureOverride != null : applianceOverride != null;
                return (
                  <div className="results__onetime-row" key={line.key}>
                    <span className="results__onetime-label">
                      {line.label}
                      {adjusted && <span className="results__source-badge results__source-badge--estimate">Custom</span>}
                    </span>
                    {editable && !readOnly ? (
                      <PopoverEditValue
                        label={line.label}
                        value={line.value}
                        step={100}
                        adjusted={adjusted}
                        onChange={isFurniture ? setFurnitureOverride : setApplianceOverride}
                        onReset={() => (isFurniture ? setFurnitureOverride(null) : setApplianceOverride(null))}
                      />
                    ) : (
                      <span className="results__onetime-value">{fmt(line.value)}</span>
                    )}
                  </div>
                );
              })}
              <p className="results__onetime-note">
                Upfront capital added to your cash invested — factored into the ROI below, not monthly cash flow.
                {!readOnly && ' Edit any amount to match your quotes.'}
              </p>
            </div>
          )}

          <ROIScorecard roi={displayRoi} />

          {/* Tax Savings — two-panel layout */}
          <div className="results__tax-inline">
            <h4 className="results__tax-inline-title">
              <Coins size={15} /> Cost Segregation Tax Savings
            </h4>
            {!readOnly && displayTax.personalPropertyBasis ? (
              <div className="results__tax-method" role="group" aria-label="Furniture & appliance depreciation method">
                <span className="results__tax-method-label">Furniture &amp; appliances:</span>
                <div className="results__tax-method-toggle">
                  <button
                    type="button"
                    className={`results__tax-method-btn ${depreciationMethod === 'full' ? 'results__tax-method-btn--active' : ''}`}
                    onClick={() => setDepreciationMethod('full')}
                  >
                    Full Yr-1 write-off
                  </button>
                  <button
                    type="button"
                    className={`results__tax-method-btn ${depreciationMethod === 'straight' ? 'results__tax-method-btn--active' : ''}`}
                    onClick={() => setDepreciationMethod('straight')}
                  >
                    Straight-line (5 yr)
                  </button>
                </div>
              </div>
            ) : null}
            <div className="results__tax-panels">
              {/* Left panel — data rows */}
              <div className="results__tax-panel results__tax-panel--left">
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Purchase Price</span>
                  <span className="results__tax-row-value">{fmt(displayTax.purchasePrice)}</span>
                </div>
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Building Depreciation</span>
                  <span className="results__tax-row-value">{fmt(displayTax.buildingDepreciation ?? 0)}</span>
                </div>
                {displayTax.personalPropertyBasis ? (
                  <div className="results__tax-row">
                    <span className="results__tax-row-label">
                      Furniture &amp; Appliances
                      <span className="results__tax-row-sub">
                        {depreciationMethod === 'full'
                          ? `100% of ${fmt(displayTax.personalPropertyBasis)}`
                          : `1/5 of ${fmt(displayTax.personalPropertyBasis)}`}
                      </span>
                    </span>
                    <span className="results__tax-row-value">{fmt(displayTax.personalPropertyDepreciation ?? 0)}</span>
                  </div>
                ) : null}
                <div className="results__tax-row">
                  <span className="results__tax-row-label">Tax Savings (Yr 1)</span>
                  <span className="results__tax-row-value results__tax-row-value--green">{fmt(displayTax.taxSavings)}</span>
                </div>
              </div>
              {/* Right panel — hero percentage */}
              <div className="results__tax-panel results__tax-panel--right">
                <span className="results__tax-hero-label">Effective First-Year Return</span>
                <span className="results__tax-hero-value">{pct(displayTax.effectiveFirstYearReturn)}</span>
                <span className="results__tax-hero-caption">Cash flow + tax savings</span>
              </div>
            </div>
            <p className="results__tax-assumption">
              Assumes {params.costSegPct}% cost segregation
              {params.costSegPct === originalParams.costSegPct ? ' (estimated from property type)' : ' (custom)'} at a{' '}
              {params.taxRate}% marginal tax rate
              {displayTax.personalPropertyBasis
                ? `, plus ${depreciationMethod === 'full' ? 'a full first-year' : 'straight-line 5-year'} write-off of furniture & appliances`
                : ''}
              {!readOnly && ' — adjust in assumptions.'}
            </p>
          </div>
        </div>
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

      {/* Stress Test + Wealth Projection — combined */}
      <div id="stress-test" className="results__card results__section">
        <h3 className="results__card-title">
          <span className="results__icon results__icon--blue">📈</span>
          Long-Term Outlook
        </h3>
        <SensitivityCard embedded params={params} price={effectivePrice} rent={effectiveRent} />
        <WealthProjection
          purchasePrice={effectivePrice}
          cashFlow={cashFlow}
          mortgage={mortgage}
          roi={roi}
          vacancyPct={params.vacancyPct}
        />
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
          {!readOnly && isAdjusted && (
            <button className="results__reset-btn" onClick={resetParams}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        {!readOnly && (
          <div className="loan-calc__params">
            <SliderInput
              label="Down Payment"
              value={params.downPaymentPct}
              onChange={v => updateParam('downPaymentPct', v)}
              min={0} max={100} step={1}
              suffix="%"
              detail={fmt(effectivePrice * (params.downPaymentPct / 100))}
              adjusted={params.downPaymentPct !== originalParams.downPaymentPct}
            />
            <SliderInput
              label="Interest Rate"
              value={params.interestRate}
              onChange={v => updateParam('interestRate', v)}
              min={0} max={15} step={0.125}
              suffix="%"
              adjusted={params.interestRate !== originalParams.interestRate}
            />
            <SliderInput
              label="Loan Term"
              value={params.loanTermYears}
              onChange={v => updateParam('loanTermYears', v)}
              min={1} max={40} step={1}
              suffix=" yrs"
              adjusted={params.loanTermYears !== originalParams.loanTermYears}
            />
          </div>
        )}

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

        {!readOnly && (
          <button
            className="loan-calc__more-toggle"
            onClick={() => setShowAllParams(!showAllParams)}
          >
            <SlidersHorizontal size={14} />
            Expense &amp; Tax Parameters
            {showAllParams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {!readOnly && showAllParams && (
          <div className="loan-calc__params loan-calc__params--secondary">
            <SliderInput label="Vacancy" value={params.vacancyPct} onChange={v => updateParam('vacancyPct', v)} min={0} max={25} step={1} suffix="%" adjusted={params.vacancyPct !== originalParams.vacancyPct} />
            <SliderInput label="Repairs" value={params.repairsPct} onChange={v => updateParam('repairsPct', v)} min={0} max={25} step={1} suffix="%" adjusted={params.repairsPct !== originalParams.repairsPct} />
            <SliderInput label="CapEx" value={params.capexPct} onChange={v => updateParam('capexPct', v)} min={0} max={25} step={1} suffix="%" adjusted={params.capexPct !== originalParams.capexPct} />
            <SliderInput label="Management" value={params.managementPct} onChange={v => updateParam('managementPct', v)} min={0} max={15} step={1} suffix="%" adjusted={params.managementPct !== originalParams.managementPct} />
            <SliderInput label="Property Tax" value={params.annualPropertyTax} onChange={v => updateParam('annualPropertyTax', v)} min={0} max={50000} step={100} suffix="/yr" isCurrency adjusted={params.annualPropertyTax !== originalParams.annualPropertyTax} />
            <SliderInput label="Insurance" value={params.annualInsurance} onChange={v => updateParam('annualInsurance', v)} min={0} max={20000} step={100} suffix="/yr" isCurrency adjusted={params.annualInsurance !== originalParams.annualInsurance} />
            <SliderInput label="HOA Fees" value={params.monthlyHoa} onChange={v => updateParam('monthlyHoa', v)} min={0} max={1500} step={10} suffix="/mo" isCurrency adjusted={(params.monthlyHoa || 0) !== (originalParams.monthlyHoa || 0)} />
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
            <SliderInput label="Cost Seg" value={params.costSegPct} onChange={v => updateParam('costSegPct', v)} min={10} max={35} step={0.5} suffix="%" adjusted={params.costSegPct !== originalParams.costSegPct} />
            <SliderInput label="Tax Rate" value={params.taxRate} onChange={v => updateParam('taxRate', v)} min={0} max={50} step={1} suffix="%" adjusted={params.taxRate !== originalParams.taxRate} />
          </div>
        )}
      </div>
      </div>{/* end results__bottom-grid */}

      {features.streetView && showStreetView && streetViewSrc && (
        <div className="streetview-modal-overlay" onClick={() => setShowStreetView(false)}>
          <div className="streetview-modal" onClick={e => e.stopPropagation()}>
            <div className="streetview-modal__header">
              <span className="streetview-modal__title">
                <MapPin size={16} /> {[property.address, property.city, property.state].filter(Boolean).join(', ')}
              </span>
              <button
                type="button"
                className="streetview-modal__close"
                onClick={() => setShowStreetView(false)}
                aria-label="Close Street View"
              >
                <X size={20} />
              </button>
            </div>
            <iframe
              className="streetview-modal__frame"
              title="Google Street View"
              src={streetViewSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      )}
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

// Click-to-edit value control. Renders the value as a small button; clicking it
// opens a popover (below the value) with a slider + number input — the same look
// as the loan parameter controls. Closes on the X, outside click, or Escape.
function PopoverEditValue({
  label,
  value,
  onChange,
  onReset,
  adjusted,
  step,
  unit = '$',
  min,
  max,
  suffix,
  amount,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  adjusted: boolean;
  step?: number;
  unit?: '$' | '%';
  min?: number;
  max?: number;
  suffix?: string;
  amount?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const resolvedMin = min ?? 0;
  const resolvedMax = max ?? (unit === '%' ? 25 : Math.max(100, Math.round(value * 3)));
  const resolvedStep = step ?? (unit === '%' ? 0.5 : 5);
  const display = unit === '%' ? `${value}%` : `$${Math.round(value).toLocaleString()}`;

  return (
    <span className="results__popover-edit" ref={ref}>
      <button
        type="button"
        className={`results__popover-trigger ${adjusted ? 'results__popover-trigger--adjusted' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={`Edit ${label}`}
      >
        <Pencil size={12} className="results__edit-icon" />
        {unit === '%' && amount != null && (
          <span className="results__popover-amount">{fmt(amount)}</span>
        )}
        <span className="results__popover-value">{display}</span>
      </button>
      {open && (
        <div className="results__popover" role="dialog">
          <button
            type="button"
            className="results__popover-close"
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X size={14} />
          </button>
          <SliderInput
            label={label}
            value={value}
            onChange={onChange}
            min={resolvedMin}
            max={resolvedMax}
            step={resolvedStep}
            suffix={suffix ?? (unit === '%' ? '%' : '')}
            isCurrency={unit === '$'}
          />
          {adjusted && (
            <button type="button" className="results__popover-reset" onClick={onReset}>
              <RotateCcw size={12} /> Reset to estimate
            </button>
          )}
        </div>
      )}
    </span>
  );
}

// A cash-flow expense row whose value can be edited via a popover. Supports a
// `$` or `%` unit, an optional source badge, and an explainer note. Falls back
// to a plain MetricRow in read-only mode.
function EditableCostRow({
  label,
  value,
  onChange,
  onReset,
  adjusted,
  step,
  readOnly,
  unit = '$',
  min,
  max,
  suffix,
  sourceBadge,
  explainerNote,
  amount,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  adjusted: boolean;
  step?: number;
  readOnly?: boolean;
  unit?: '$' | '%';
  min?: number;
  max?: number;
  suffix?: string;
  sourceBadge?: { text: string; variant: 'api' | 'estimate' };
  explainerNote?: string;
  amount?: number;
}) {
  const baseExplainer = findExplainer(label);
  const explainer = baseExplainer && explainerNote
    ? { ...baseExplainer, note: explainerNote }
    : baseExplainer;
  if (readOnly) {
    const display =
      unit === '%'
        ? amount != null ? `${fmt(amount)} · ${value}%` : `${value}%`
        : fmt(value);
    return <MetricRow label={label} value={display} />;
  }
  return (
    <div className="results__metric-row results__metric-row--editable">
      <span className="results__metric-label">
        {label}
        {explainer && <TermExplainer info={explainer} />}
        {sourceBadge && (
          <span className={`results__source-badge results__source-badge--${sourceBadge.variant}`}>
            {sourceBadge.text}
          </span>
        )}
        {!sourceBadge && adjusted && (
          <span className="results__source-badge results__source-badge--estimate">Custom</span>
        )}
      </span>
      <PopoverEditValue
        label={label}
        value={value}
        onChange={onChange}
        onReset={onReset}
        adjusted={adjusted}
        step={step}
        unit={unit}
        min={min}
        max={max}
        suffix={suffix}
        amount={amount}
      />
    </div>
  );
}

function AdjustableExpenseRow({
  label,
  value,
  readOnly,
  onAdjust,
  sourceBadge,
  explainerNote,
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  onAdjust: () => void;
  sourceBadge?: { text: string; variant: 'api' | 'estimate' };
  explainerNote?: string;
}) {
  const baseExplainer = findExplainer(label);
  const explainer = baseExplainer && explainerNote
    ? { ...baseExplainer, note: explainerNote }
    : baseExplainer;
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
  adjusted,
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
  adjusted?: boolean;
}) {
  const displayValue = isCurrency
    ? `$${value.toLocaleString()}`
    : `${value}`;

  const explainer = findExplainer(label);

  return (
    <div className={`slider-input${adjusted ? ' slider-input--adjusted' : ''}`}>
      <div className="slider-input__header">
        <label className="slider-input__label">
          {label}
          {explainer && <TermExplainer info={explainer} />}
          {adjusted && (
            <span className="results__source-badge results__source-badge--estimate">Custom</span>
          )}
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
