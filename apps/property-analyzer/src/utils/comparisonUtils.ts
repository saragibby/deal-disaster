/** Format a number as USD currency (no decimals). */
export function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

/** Truncate an address to the first line, max 25 chars. */
export function shortAddr(address: string): string {
  const short = address.split(',')[0];
  return short.length > 25 ? short.slice(0, 22) + '...' : short;
}

/** Return the index of the best (highest or lowest) value in an array. */
export function bestIdx(values: number[], higher = true): number {
  if (values.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (higher ? values[i] > values[best] : values[i] < values[best]) best = i;
  }
  return best;
}

// ── Scenario Adjustment ──────────────────────────────────────────────────

export interface ScenarioParams {
  vacancyPct: number | null;   // null = use original
  rentAdjustPct: number;       // e.g. -10 means rents drop 10%
}

export const DEFAULT_SCENARIO: ScenarioParams = { vacancyPct: null, rentAdjustPct: 0 };

/**
 * Return a deep-copy of PropertyAnalysis with cash flow, ROI, and tax savings
 * recalculated under the given scenario overrides.
 *
 * Keeps property_data, analysis_params, and STR estimate unchanged.
 */
export function applyScenario<T extends {
  property_data: { price: number };
  analysis_params?: { vacancyPct?: number; repairsPct?: number; capexPct?: number; managementPct?: number; annualPropertyTax?: number; annualInsurance?: number; costSegPct?: number; taxRate?: number };
  analysis_results?: {
    cashFlow?: { monthlyRent: number; monthlyMortgage: number; monthlyTax: number; monthlyInsurance: number; monthlyVacancy: number; monthlyRepairs: number; monthlyCapex: number; monthlyManagement: number; totalMonthlyExpenses: number; monthlyCashFlow: number; annualCashFlow: number };
    roi?: { totalCashInvested: number; cashOnCashROI: number; capRate: number; grossRentMultiplier: number };
    taxSavings?: { purchasePrice: number; depreciationDeduction: number; taxSavings: number; effectiveFirstYearReturn: number };
    [key: string]: any;
  };
  [key: string]: any;
}>(property: T, scenario: ScenarioParams): T {
  if (scenario.vacancyPct === null && scenario.rentAdjustPct === 0) return property;

  const cf = property.analysis_results?.cashFlow;
  if (!cf) return property;

  const params = property.analysis_params;
  const price = property.property_data.price;

  // Adjusted rent
  const newRent = Math.round(cf.monthlyRent * (1 + scenario.rentAdjustPct / 100) * 100) / 100;

  // Vacancy based on scenario override or original %
  const vacPct = scenario.vacancyPct ?? (params?.vacancyPct ?? 8);
  const monthlyVacancy = Math.round(newRent * (vacPct / 100) * 100) / 100;

  // Repairs/CapEx/Management scale with rent
  const repairsPct = params?.repairsPct ?? 10;
  const capexPct = params?.capexPct ?? 10;
  const mgmtPct = params?.managementPct ?? 0;
  const monthlyRepairs = Math.round(newRent * (repairsPct / 100) * 100) / 100;
  const monthlyCapex = Math.round(newRent * (capexPct / 100) * 100) / 100;
  const monthlyManagement = Math.round(newRent * (mgmtPct / 100) * 100) / 100;

  // Fixed costs stay the same
  const monthlyMortgage = cf.monthlyMortgage;
  const monthlyTax = cf.monthlyTax;
  const monthlyInsurance = cf.monthlyInsurance;

  const totalMonthlyExpenses = Math.round((monthlyMortgage + monthlyTax + monthlyInsurance + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement) * 100) / 100;
  const monthlyCashFlow = Math.round((newRent - totalMonthlyExpenses) * 100) / 100;
  const annualCashFlow = Math.round(monthlyCashFlow * 12 * 100) / 100;

  const newCashFlow = {
    monthlyRent: newRent,
    monthlyMortgage,
    monthlyTax,
    monthlyInsurance,
    monthlyVacancy,
    monthlyRepairs,
    monthlyCapex,
    monthlyManagement,
    totalMonthlyExpenses,
    monthlyCashFlow,
    annualCashFlow,
  };

  // Recalculate ROI
  const roi = property.analysis_results?.roi;
  const totalCashInvested = roi?.totalCashInvested ?? 0;
  const annualRent = newRent * 12;
  const annualOpEx = (monthlyTax + monthlyInsurance + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement) * 12;
  const noi = annualRent - annualOpEx;

  const newRoi = {
    totalCashInvested,
    cashOnCashROI: totalCashInvested > 0 ? Math.round((annualCashFlow / totalCashInvested) * 100 * 100) / 100 : 0,
    capRate: price > 0 ? Math.round((noi / price) * 100 * 100) / 100 : 0,
    grossRentMultiplier: annualRent > 0 ? Math.round((price / annualRent) * 100) / 100 : 0,
  };

  // Recalculate tax savings
  const ts = property.analysis_results?.taxSavings;
  let newTaxSavings = ts;
  if (ts && totalCashInvested > 0) {
    const totalFirstYearBenefit = annualCashFlow + (ts.taxSavings || 0);
    newTaxSavings = {
      ...ts,
      effectiveFirstYearReturn: Math.round((totalFirstYearBenefit / totalCashInvested) * 100 * 100) / 100,
    };
  }

  return {
    ...property,
    analysis_results: {
      ...property.analysis_results,
      cashFlow: newCashFlow,
      roi: newRoi,
      taxSavings: newTaxSavings,
    },
  } as T;
}
