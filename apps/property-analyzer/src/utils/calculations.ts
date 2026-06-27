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
  RentalStrategy,
  StrategyCashFlow,
  CashFlowLine,
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
): ROIMetrics {
  const closingCosts = price * 0.03;
  const totalCashInvested = mortgage.downPayment + closingCosts;

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
): TaxSavingsBreakdown {
  const depreciationDeduction = price * (costSegPct / 100);
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
  };
}

/* ------------------------------------------------------------------ */
/*  Strategy-aware cash flow (LTR / MTR / STR)                         */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface FurnishedDefaults {
  furnishingCost: number;
  applianceCost: number;
  furnishingLifeYears: number;
  furnitureRepairMonthly: number;
  cleaningMonthly: number;
}

/**
 * Derives sensible furnished-strategy cost defaults for a property, honoring
 * any explicit overrides already present on `params`. MTR pulls furnishing
 * from its estimate when available; STR falls back to a bedroom heuristic.
 */
export function deriveFurnishedDefaults(
  strategy: RentalStrategy,
  params: AnalysisParams,
  ctx: { bedrooms?: number; mtrEstimate?: MTREstimate },
): FurnishedDefaults {
  const beds = Math.max(1, ctx.bedrooms || 1);

  // Furnishing (furniture + decor)
  let furnishingCost =
    strategy === 'mtr' && ctx.mtrEstimate?.furnishingCosts?.totalCost
      ? ctx.mtrEstimate.furnishingCosts.totalCost
      : 6000 + 3000 * beds; // common areas + per-bedroom
  if (typeof params.furnishingCost === 'number') furnishingCost = params.furnishingCost;

  // Appliances / electronics (separate from furniture)
  let applianceCost = 2500 + 500 * beds;
  if (typeof params.applianceCost === 'number') applianceCost = params.applianceCost;

  // Amortization horizon
  let furnishingLifeYears =
    strategy === 'mtr' && ctx.mtrEstimate?.furnishingCosts?.usefulLifeYears
      ? ctx.mtrEstimate.furnishingCosts.usefulLifeYears
      : 7;
  if (typeof params.furnishingLifeYears === 'number' && params.furnishingLifeYears > 0) {
    furnishingLifeYears = params.furnishingLifeYears;
  }

  // Recurring repair/replacement of furniture & appliances (~6%/yr of value)
  let furnitureRepairMonthly = r2(((furnishingCost + applianceCost) * 0.06) / 12);
  if (typeof params.furnitureRepairMonthly === 'number') {
    furnitureRepairMonthly = params.furnitureRepairMonthly;
  }

  // Extra cleaning not already in the estimate (STR estimate already covers cleaning)
  let cleaningMonthly = 0;
  if (typeof params.cleaningMonthly === 'number') cleaningMonthly = params.cleaningMonthly;

  return { furnishingCost, applianceCost, furnishingLifeYears, furnitureRepairMonthly, cleaningMonthly };
}

export interface StrategyCashFlowContext {
  mortgage: MortgageBreakdown;
  params: AnalysisParams;
  /** Effective long-term rent — also the reserve base for all strategies. */
  ltrRent: number;
  bedrooms?: number;
  mtrEstimate?: MTREstimate;
  strEstimate?: STREstimate;
}

/**
 * Computes a generic line-item cash flow for a given rental strategy.
 * Income is always GROSS; estimates' pre-netted revenue is never used as
 * income to avoid double-counting operating costs.
 */
export function calculateStrategyCashFlow(
  strategy: RentalStrategy,
  ctx: StrategyCashFlowContext,
): StrategyCashFlow {
  const { mortgage, params, ltrRent } = ctx;

  const monthlyTax = params.annualPropertyTax / 12;
  const monthlyInsurance = params.annualInsurance / 12;
  const monthlyHoa = params.monthlyHoa || 0;

  // Property reserves use the LTR-equivalent rent as a stable base so they
  // don't balloon simply because STR/MTR gross revenue is higher.
  const reserveBase = ltrRent;
  const monthlyRepairs = reserveBase * (params.repairsPct / 100);
  const monthlyCapex = reserveBase * (params.capexPct / 100);

  const ownership: CashFlowLine[] = [
    { key: 'mortgage', label: 'Mortgage (P&I)', amount: mortgage.monthlyPayment },
    { key: 'tax', label: 'Property Tax', amount: r2(monthlyTax), adjustable: true, badge: 'Estimated' },
    { key: 'insurance', label: 'Insurance', amount: r2(monthlyInsurance), adjustable: true, badge: 'Estimated' },
    { key: 'hoa', label: 'HOA Fees', amount: r2(monthlyHoa), adjustable: true },
  ];

  const reserves: CashFlowLine[] = [
    { key: 'repairs', label: 'Repairs Reserve', amount: r2(monthlyRepairs), adjustable: true, badge: 'Estimated' },
    { key: 'capex', label: 'CapEx Reserve', amount: r2(monthlyCapex), adjustable: true, badge: 'Estimated' },
  ];

  let incomeLines: CashFlowLine[] = [];
  const operating: CashFlowLine[] = [];
  const furnished: CashFlowLine[] = [];
  const cashInvestedLines: CashFlowLine[] = [];
  let occupancyRate: number | undefined;
  // Fraction of income that scales with income (used for break-even).
  let variableRate = 0;

  if (strategy === 'ltr') {
    incomeLines = [{ key: 'rent', label: 'Monthly Rent Income', amount: r2(ltrRent) }];
    const monthlyVacancy = ltrRent * (params.vacancyPct / 100);
    reserves.unshift({
      key: 'vacancy', label: 'Vacancy Reserve', amount: r2(monthlyVacancy), adjustable: true, badge: 'Estimated',
    });
    variableRate = (params.vacancyPct + params.repairsPct + params.capexPct + (params.managementPct || 0)) / 100;
    if (params.managementPct > 0) {
      operating.push({
        key: 'management', label: 'Management', amount: r2(ltrRent * (params.managementPct / 100)), adjustable: true,
      });
    }
  } else if (strategy === 'mtr') {
    const est = ctx.mtrEstimate;
    const gross = est?.grossMonthlyRevenue ?? 0;
    occupancyRate = est?.occupancyRate;
    incomeLines = [{
      key: 'gross', label: 'Gross Rental Revenue', amount: r2(gross),
      note: occupancyRate != null ? `Furnished · ${Math.round(occupancyRate * 100)}% occupancy assumed` : undefined,
    }];
    if (est) {
      operating.push(
        { key: 'utilities', label: 'Utilities', amount: r2(est.utilityCosts), badge: 'Estimated' },
        { key: 'turnover', label: 'Turnover Costs', amount: r2(est.turnoverCosts), badge: 'Estimated' },
        { key: 'platform', label: 'Platform Fees', amount: r2(est.platformFees), badge: 'Estimated' },
        { key: 'management', label: 'Management', amount: r2(est.managementCosts), badge: 'Estimated' },
      );
    }
    const fd = deriveFurnishedDefaults('mtr', params, { bedrooms: ctx.bedrooms, mtrEstimate: est });
    addFurnished(furnished, cashInvestedLines, operating, fd);
  } else {
    // str
    const est = ctx.strEstimate;
    const gross = est?.grossMonthlyRevenue ?? 0;
    occupancyRate = est?.occupancyRate;
    incomeLines = [{
      key: 'gross', label: 'Gross Rental Revenue', amount: r2(gross),
      note: occupancyRate != null ? `${Math.round(occupancyRate * 100)}% occupancy assumed` : undefined,
    }];
    if (est) {
      operating.push(
        { key: 'cleaning', label: 'Cleaning', amount: r2(est.cleaningCosts), badge: 'Estimated' },
        { key: 'platform', label: 'Platform Fees', amount: r2(est.platformFees), badge: 'Estimated' },
      );
    }
    const fd = deriveFurnishedDefaults('str', params, { bedrooms: ctx.bedrooms });
    addFurnished(furnished, cashInvestedLines, operating, fd);
  }

  const expenseLines = [...ownership, ...operating, ...reserves, ...furnished];

  const monthlyIncome = incomeLines.reduce((s, l) => s + l.amount, 0);
  const totalMonthlyExpenses = r2(expenseLines.reduce((s, l) => s + l.amount, 0));
  const monthlyCashFlow = r2(monthlyIncome - totalMonthlyExpenses);

  // Break-even income: B = fixedExpenses / (1 − variableRate)
  const variableExpenses = monthlyIncome * variableRate;
  const fixedExpenses = totalMonthlyExpenses - variableExpenses;
  const breakEvenIncome = variableRate < 1 ? r2(fixedExpenses / (1 - variableRate)) : totalMonthlyExpenses;

  return {
    strategy,
    incomeLines,
    expenseLines,
    cashInvestedLines,
    monthlyIncome: r2(monthlyIncome),
    totalMonthlyExpenses,
    monthlyCashFlow,
    annualCashFlow: r2(monthlyCashFlow * 12),
    breakEvenIncome,
    occupancyRate,
  };
}

function addFurnished(
  furnished: CashFlowLine[],
  cashInvestedLines: CashFlowLine[],
  operating: CashFlowLine[],
  fd: FurnishedDefaults,
) {
  const months = Math.max(1, fd.furnishingLifeYears * 12);
  const furnishingAmortized = r2(fd.furnishingCost / months);
  const applianceAmortized = r2(fd.applianceCost / months);
  furnished.push(
    { key: 'furnishing', label: 'Furnishing (amortized)', amount: furnishingAmortized, adjustable: true },
    { key: 'appliances', label: 'Appliances (amortized)', amount: applianceAmortized, adjustable: true },
    { key: 'furnitureRepair', label: 'Furniture & Appliance Repair', amount: r2(fd.furnitureRepairMonthly), adjustable: true },
  );
  if (fd.cleaningMonthly > 0) {
    operating.push({ key: 'extraCleaning', label: 'Cleaning Service', amount: r2(fd.cleaningMonthly), adjustable: true });
  }
  cashInvestedLines.push(
    { key: 'furnishingUpfront', label: 'Furnishing (one-time)', amount: r2(fd.furnishingCost) },
    { key: 'applianceUpfront', label: 'Appliances (one-time)', amount: r2(fd.applianceCost) },
  );
}

/**
 * Strategy-aware ROI. One-time furnished spend (cashInvestedLines) is added to
 * the cash-on-cash denominator.
 */
export function calculateStrategyROI(
  price: number,
  scf: StrategyCashFlow,
  mortgage: MortgageBreakdown,
): ROIMetrics {
  const closingCosts = price * 0.03;
  const upfrontFurnished = scf.cashInvestedLines.reduce((s, l) => s + l.amount, 0);
  const totalCashInvested = mortgage.downPayment + closingCosts + upfrontFurnished;

  const cashOnCashROI =
    totalCashInvested > 0 ? (scf.annualCashFlow / totalCashInvested) * 100 : 0;

  const annualIncome = scf.monthlyIncome * 12;
  // Operating expenses for NOI exclude mortgage (debt service).
  const annualOperatingExpenses =
    (scf.totalMonthlyExpenses -
      (scf.expenseLines.find((l) => l.key === 'mortgage')?.amount ?? 0)) * 12;
  const noi = annualIncome - annualOperatingExpenses;
  const capRate = price > 0 ? (noi / price) * 100 : 0;
  const grossRentMultiplier = annualIncome > 0 ? price / annualIncome : 0;

  return {
    totalCashInvested: Math.round(totalCashInvested),
    cashOnCashROI: r2(cashOnCashROI),
    capRate: r2(capRate),
    grossRentMultiplier: r2(grossRentMultiplier),
  };
}
