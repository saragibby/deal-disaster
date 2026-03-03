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
  const monthlyVacancy = monthlyRent * (params.vacancyPct / 100);
  const monthlyRepairs = monthlyRent * (params.repairsPct / 100);
  const monthlyCapex = monthlyRent * (params.capexPct / 100);
  const monthlyManagement = monthlyRent * ((params.managementPct || 0) / 100);

  const totalMonthlyExpenses =
    mortgage.monthlyPayment +
    monthlyTax +
    monthlyInsurance +
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
