/**
 * Client-side investment calculators — mirrors the server-side
 * investmentAnalysisService.ts so that loan/expense parameters
 * can be adjusted in the browser without a round-trip.
 */

import type {
  AnalysisParams,
  MortgageBreakdown,
  CashFlowBreakdown,
  ROIMetrics,
  TaxSavingsBreakdown,
  MTREstimate,
  STREstimate,
} from '@deal-platform/shared-types';

/* ------------------------------------------------------------------ */
/*  Mortgage                                                          */
/* ------------------------------------------------------------------ */

export function calculateMortgage(
  price: number,
  downPaymentPct: number,
  annualRate: number,
  termYears: number,
): MortgageBreakdown {
  const downPayment = price * (downPaymentPct / 100);
  const loanAmount = price - downPayment;
  const monthlyRate = annualRate / 100 / 12;
  const numPayments = termYears * 12;

  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = loanAmount / numPayments;
  } else {
    monthlyPayment =
      loanAmount *
      (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);
  }

  const totalPaid = monthlyPayment * numPayments;
  const totalInterest = totalPaid - loanAmount;

  return {
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    loanAmount: Math.round(loanAmount),
    downPayment: Math.round(downPayment),
    totalInterest: Math.round(totalInterest),
  };
}

/* ------------------------------------------------------------------ */
/*  Cash Flow                                                         */
/* ------------------------------------------------------------------ */

export function calculateCashFlow(
  monthlyRent: number,
  mortgage: MortgageBreakdown,
  params: AnalysisParams,
): CashFlowBreakdown {
  const monthlyTax = params.annualPropertyTax / 12;
  const monthlyInsurance = params.annualInsurance / 12;
  const monthlyHoa = params.monthlyHoa || 0;
  const monthlyVacancy = monthlyRent * (params.vacancyPct / 100);
  const monthlyRepairs = monthlyRent * (params.repairsPct / 100);
  const monthlyCapex = monthlyRent * (params.capexPct / 100);
  const monthlyManagement = monthlyRent * ((params.managementPct || 0) / 100);

  const totalMonthlyExpenses =
    mortgage.monthlyPayment +
    monthlyTax +
    monthlyInsurance +
    monthlyHoa +
    monthlyVacancy +
    monthlyRepairs +
    monthlyCapex +
    monthlyManagement;

  const monthlyCashFlow = monthlyRent - totalMonthlyExpenses;

  return {
    monthlyRent: Math.round(monthlyRent * 100) / 100,
    monthlyMortgage: mortgage.monthlyPayment,
    monthlyTax: Math.round(monthlyTax * 100) / 100,
    monthlyInsurance: Math.round(monthlyInsurance * 100) / 100,
    monthlyHoa: Math.round(monthlyHoa * 100) / 100,
    monthlyVacancy: Math.round(monthlyVacancy * 100) / 100,
    monthlyRepairs: Math.round(monthlyRepairs * 100) / 100,
    monthlyCapex: Math.round(monthlyCapex * 100) / 100,
    monthlyManagement: Math.round(monthlyManagement * 100) / 100,
    totalMonthlyExpenses: Math.round(totalMonthlyExpenses * 100) / 100,
    monthlyCashFlow: Math.round(monthlyCashFlow * 100) / 100,
    annualCashFlow: Math.round(monthlyCashFlow * 12 * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  ROI                                                                */
/* ------------------------------------------------------------------ */

export function calculateROI(
  price: number,
  cashFlow: CashFlowBreakdown,
  mortgage: MortgageBreakdown,
  extraCashInvested = 0,
): ROIMetrics {
  const closingCosts = price * 0.03;
  const totalCashInvested = mortgage.downPayment + closingCosts + extraCashInvested;

  const cashOnCashROI =
    totalCashInvested > 0
      ? (cashFlow.annualCashFlow / totalCashInvested) * 100
      : 0;

  const annualRent = cashFlow.monthlyRent * 12;
  const annualOperatingExpenses =
    (cashFlow.monthlyTax +
      cashFlow.monthlyInsurance +
      cashFlow.monthlyHoa +
      cashFlow.monthlyVacancy +
      cashFlow.monthlyRepairs +
      cashFlow.monthlyCapex +
      cashFlow.monthlyManagement) * 12;
  const noi = annualRent - annualOperatingExpenses;
  const capRate = price > 0 ? (noi / price) * 100 : 0;

  const grossRentMultiplier = annualRent > 0 ? price / annualRent : 0;

  return {
    totalCashInvested: Math.round(totalCashInvested),
    cashOnCashROI: Math.round(cashOnCashROI * 100) / 100,
    capRate: Math.round(capRate * 100) / 100,
    grossRentMultiplier: Math.round(grossRentMultiplier * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Tax Savings                                                        */
/* ------------------------------------------------------------------ */

export function calculateTaxSavings(
  price: number,
  costSegPct: number,
  taxRate: number,
  totalCashInvested: number,
  annualCashFlow: number,
  personalProperty?: { basis: number; firstYearDeduction: number },
): TaxSavingsBreakdown {
  const buildingDepreciation = price * (costSegPct / 100);
  const ppBasis = personalProperty?.basis ?? 0;
  const ppDeduction = personalProperty?.firstYearDeduction ?? 0;
  const depreciationDeduction = buildingDepreciation + ppDeduction;
  const taxSavings = depreciationDeduction * (taxRate / 100);
  const totalFirstYearBenefit = annualCashFlow + taxSavings;
  const effectiveFirstYearReturn =
    totalCashInvested > 0
      ? (totalFirstYearBenefit / totalCashInvested) * 100
      : 0;

  return {
    purchasePrice: price,
    depreciationDeduction: Math.round(depreciationDeduction),
    taxSavings: Math.round(taxSavings),
    effectiveFirstYearReturn: Math.round(effectiveFirstYearReturn * 100) / 100,
    buildingDepreciation: Math.round(buildingDepreciation),
    personalPropertyBasis: Math.round(ppBasis),
    personalPropertyDepreciation: Math.round(ppDeduction),
  };
}

/* ------------------------------------------------------------------ */
/*  Strategy-aware cash flow (LTR / MTR / STR)                         */
/* ------------------------------------------------------------------ */

export interface StrategyCashFlowLine {
  key: string;
  label: string;
  value: number;
}

export interface StrategyCashFlow {
  key: 'ltr' | 'mtr' | 'str';
  monthlyIncome: number;
  incomeLabel: string;
  /** Shared property-level costs (mortgage, tax, insurance, HOA). */
  carrying: StrategyCashFlowLine[];
  /** Strategy-specific operating costs. */
  operating: StrategyCashFlowLine[];
  totalMonthlyExpenses: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  /** Upfront capital outlays (furniture, appliances) — feed cash invested. */
  oneTime: StrategyCashFlowLine[];
  totalOneTime: number;
  /** Synthetic breakdown so calculateROI / calculateTaxSavings can be reused. */
  breakdown: CashFlowBreakdown;
}

/**
 * One-time appliance package (fridge, range, dishwasher, microwave,
 * washer + dryer). Applies to every strategy; larger homes trend higher.
 */
export function estimateApplianceCost(bedrooms: number): number {
  const beds = Math.max(1, bedrooms || 1);
  return Math.round(3200 + Math.max(0, beds - 3) * 250);
}

/**
 * One-time furnishing package for a furnished rental (bedrooms + common
 * areas, kitchenware, decor). Used for STR and as an MTR fallback.
 */
export function estimateFurnitureCost(bedrooms: number): number {
  const beds = Math.max(1, bedrooms || 1);
  return Math.round(3500 + beds * 2500);
}

/**
 * Monthly utilities for a guest-ready STR — hosts cover everything (power,
 * water, gas, high-speed internet, streaming) with heavier usage than a
 * long-term tenant.
 */
export function estimateStrUtilities(bedrooms: number): number {
  const beds = Math.max(1, bedrooms || 1);
  if (beds <= 1) return 200;
  if (beds === 2) return 260;
  if (beds === 3) return 340;
  return 450;
}

/**
 * Full short-term-rental operating cost breakdown. The server STR estimate only
 * nets out cleaning + platform fees, so we layer in the costs a real STR also
 * carries — utilities, management, and furnishing wear — and return a corrected
 * net so the comparison cards, bars, and cash-flow card all agree.
 */
export function calculateStrOperating(
  str: STREstimate,
  bedrooms: number,
  overrides?: Record<string, number | null | undefined>,
): { lines: StrategyCashFlowLine[]; total: number; netMonthlyRevenue: number } {
  const beds = Math.max(1, bedrooms || 1);
  const gross = str.grossMonthlyRevenue;
  const ov = overrides ?? {};
  const lines: StrategyCashFlowLine[] = [
    { key: 'cleaning', label: 'Cleaning', value: str.cleaningCosts },
    { key: 'utilities', label: 'Utilities (guest-ready)', value: estimateStrUtilities(beds) },
    { key: 'platform', label: 'Platform Fees', value: Math.round(gross * 0.03) },
    { key: 'management', label: 'Management', value: Math.round(gross * 0.20) },
    { key: 'furnishing', label: 'Furnishing Wear (amortized)', value: Math.round(estimateFurnitureCost(beds) / (5 * 12)) },
  ].map(l => ({ ...l, value: ov[l.key] ?? l.value }));
  const total = lines.reduce((s, e) => s + e.value, 0);
  return { lines, total, netMonthlyRevenue: Math.round((gross - total) * 100) / 100 };
}

/**
 * Mid-term-rental operating cost breakdown. The five line items come straight
 * from the server MTR estimate (they sum to gross − net), with per-line user
 * overrides applied so the comparison cards and cash-flow card stay in sync.
 */
export function calculateMtrOperating(
  mtr: MTREstimate,
  overrides?: Record<string, number | null | undefined>,
): { lines: StrategyCashFlowLine[]; total: number; netMonthlyRevenue: number } {
  const ov = overrides ?? {};
  const lines: StrategyCashFlowLine[] = [
    { key: 'utilities', label: 'Utilities (tenant-ready)', value: mtr.utilityCosts },
    { key: 'turnover', label: 'Cleaning & Turnover', value: mtr.turnoverCosts },
    { key: 'platform', label: 'Platform Fees', value: mtr.platformFees },
    { key: 'management', label: 'Management', value: mtr.managementCosts },
    { key: 'furnishing', label: 'Furnishing Wear (amortized)', value: mtr.furnishingCosts.amortizedMonthly },
  ].map(l => ({ ...l, value: ov[l.key] ?? l.value }));
  const total = lines.reduce((s, e) => s + e.value, 0);
  return { lines, total, netMonthlyRevenue: Math.round((mtr.grossMonthlyRevenue - total) * 100) / 100 };
}

/**
 * Build the cash-flow picture for the selected rental strategy. LTR reuses the
 * long-term reserve breakdown; MTR/STR pull their operating costs straight from
 * the revenue estimate so the monthly cash flow matches the strategy cards
 * (single source of truth). Furniture (MTR/STR) and appliances (all) are
 * surfaced as one-time capital costs that flow into cash invested for ROI.
 */
export function calculateStrategyCashFlow(
  key: 'ltr' | 'mtr' | 'str',
  base: CashFlowBreakdown,
  opts: {
    bedrooms: number;
    mtr?: MTREstimate | null;
    str?: STREstimate | null;
    overrides?: {
      operating?: Record<string, number | null | undefined>;
      furniture?: number | null;
      appliances?: number | null;
    };
  },
): StrategyCashFlow {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ov = opts.overrides ?? {};
  const carrying: StrategyCashFlowLine[] = [
    { key: 'mortgage', label: 'Mortgage (P&I)', value: base.monthlyMortgage },
    { key: 'tax', label: 'Property Tax', value: base.monthlyTax },
    { key: 'insurance', label: 'Insurance', value: base.monthlyInsurance },
    { key: 'hoa', label: 'HOA Fees', value: base.monthlyHoa },
  ];
  const carryingTotal =
    base.monthlyMortgage + base.monthlyTax + base.monthlyInsurance + base.monthlyHoa;
  const appliances = ov.appliances ?? estimateApplianceCost(opts.bedrooms);

  const build = (
    resolvedKey: 'ltr' | 'mtr' | 'str',
    income: number,
    incomeLabel: string,
    operating: StrategyCashFlowLine[],
    oneTime: StrategyCashFlowLine[],
  ): StrategyCashFlow => {
    const operatingTotal = operating.reduce((s, e) => s + e.value, 0);
    const totalMonthlyExpenses = r2(carryingTotal + operatingTotal);
    const monthlyCashFlow = r2(income - totalMonthlyExpenses);
    const totalOneTime = oneTime.reduce((s, e) => s + e.value, 0);
    // Lump strategy operating into a single reserve field so calculateROI
    // derives NOI / cap rate from the correct operating total.
    const breakdown: CashFlowBreakdown = {
      monthlyRent: r2(income),
      monthlyMortgage: base.monthlyMortgage,
      monthlyTax: base.monthlyTax,
      monthlyInsurance: base.monthlyInsurance,
      monthlyHoa: base.monthlyHoa,
      monthlyVacancy: r2(operatingTotal),
      monthlyRepairs: 0,
      monthlyCapex: 0,
      monthlyManagement: 0,
      totalMonthlyExpenses,
      monthlyCashFlow,
      annualCashFlow: r2(monthlyCashFlow * 12),
    };
    return {
      key: resolvedKey,
      monthlyIncome: r2(income),
      incomeLabel,
      carrying,
      operating,
      totalMonthlyExpenses,
      monthlyCashFlow,
      annualCashFlow: r2(monthlyCashFlow * 12),
      oneTime,
      totalOneTime,
      breakdown,
    };
  };

  if (key === 'mtr' && opts.mtr) {
    const m = opts.mtr;
    // These five sum to (gross − net), so monthly cash flow == MTR net − carrying.
    const { lines } = calculateMtrOperating(m, ov.operating);
    const oneTime: StrategyCashFlowLine[] = [
      { key: 'furniture', label: 'Furniture & Furnishings', value: ov.furniture ?? m.furnishingCosts.totalCost },
      { key: 'appliances', label: 'Appliances', value: appliances },
    ];
    return build('mtr', m.grossMonthlyRevenue, 'Monthly Revenue', lines, oneTime);
  }

  if (key === 'str' && opts.str) {
    const s = opts.str;
    // Full STR operating costs (cleaning, utilities, platform, management,
    // furnishing wear) sum to (gross − net), so monthly cash flow matches the
    // STR strategy card. The initial furniture buy is a separate one-time cost.
    const { lines } = calculateStrOperating(s, opts.bedrooms, ov.operating);
    const oneTime: StrategyCashFlowLine[] = [
      { key: 'furniture', label: 'Furniture & Furnishings', value: ov.furniture ?? estimateFurnitureCost(opts.bedrooms) },
      { key: 'appliances', label: 'Appliances', value: appliances },
    ];
    return build('str', s.grossMonthlyRevenue, 'Monthly Revenue', lines, oneTime);
  }

  // LTR — reuse the long-term reserve breakdown unchanged.
  const operating: StrategyCashFlowLine[] = [
    { key: 'vacancy', label: 'Vacancy Reserve', value: base.monthlyVacancy },
    { key: 'repairs', label: 'Repairs Reserve', value: base.monthlyRepairs },
    { key: 'capex', label: 'CapEx Reserve', value: base.monthlyCapex },
  ];
  if (base.monthlyManagement > 0) {
    operating.push({ key: 'management', label: 'Management', value: base.monthlyManagement });
  }
  const oneTime: StrategyCashFlowLine[] = [
    { key: 'appliances', label: 'Appliances', value: appliances },
  ];
  const result = build('ltr', base.monthlyRent, 'Monthly Rent Income', operating, oneTime);
  // Preserve the exact base breakdown (and its rounding) for ROI / tax reuse.
  return {
    ...result,
    breakdown: base,
    totalMonthlyExpenses: base.totalMonthlyExpenses,
    monthlyCashFlow: base.monthlyCashFlow,
    annualCashFlow: base.annualCashFlow,
  };
}
