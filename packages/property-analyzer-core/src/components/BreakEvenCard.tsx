import type { CashFlowBreakdown, ROIMetrics } from '@deal-platform/shared-types';
import { ShieldCheck, Clock, TrendingDown } from 'lucide-react';
import TermExplainer, { findExplainer } from './TermExplainer';

interface Props {
  cashFlow: CashFlowBreakdown;
  roi: ROIMetrics;
  vacancyPct: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function BreakEvenCard({ cashFlow, roi, vacancyPct }: Props) {
  const expensesExVacancy = cashFlow.totalMonthlyExpenses - cashFlow.monthlyVacancy;
  const breakEvenOccupancy = cashFlow.monthlyRent > 0
    ? (expensesExVacancy / cashFlow.monthlyRent) * 100
    : 100;
  const currentOccupancy = 100 - vacancyPct;
  const safetyMargin = currentOccupancy - breakEvenOccupancy;
  const breakEvenRent = expensesExVacancy;
  const rentAboveBE = breakEvenRent > 0
    ? ((cashFlow.monthlyRent - breakEvenRent) / breakEvenRent) * 100
    : 0;

  const canRecoup = cashFlow.monthlyCashFlow > 0;
  const monthsToRecoup = canRecoup
    ? Math.ceil(roi.totalCashInvested / cashFlow.monthlyCashFlow)
    : null;

  const marginColor =
    safetyMargin >= 10 ? 'var(--be-green)' :
    safetyMargin >= 5  ? 'var(--be-yellow)' :
                         'var(--be-red)';

  const recoupColor =
    monthsToRecoup !== null && monthsToRecoup < 60  ? 'var(--be-green)' :
    monthsToRecoup !== null && monthsToRecoup <= 120 ? 'var(--be-yellow)' :
                                                       'var(--be-red)';

  const recoupLabel = (() => {
    if (!canRecoup) return 'N/A';
    if (monthsToRecoup! > 120) return '10+ years';
    return `${monthsToRecoup} mo`;
  })();

  const recoupSub = (() => {
    if (!canRecoup || monthsToRecoup! > 120) return null;
    return `= ${(monthsToRecoup! / 12).toFixed(1)} years`;
  })();

  return (
    <div className="break-even">
      {/* Occupancy */}
      <div className="break-even__block">
        <div className="break-even__header">
          <TrendingDown size={16} />
          <span className="break-even__label">Break-Even Occupancy</span>
        </div>
        <div className="break-even__bar-track">
          <div
            className="break-even__bar-fill"
            style={{ width: `${Math.min(breakEvenOccupancy, 100)}%` }}
          />
          <div
            className="break-even__bar-marker"
            style={{ left: `${Math.min(currentOccupancy, 100)}%` }}
          />
        </div>
        <div className="break-even__bar-labels">
          <span>Break-even: {breakEvenOccupancy.toFixed(1)}%</span>
          <span>Current: {currentOccupancy.toFixed(1)}%</span>
        </div>
        <div className="break-even__margin" style={{ color: marginColor }}>
          <ShieldCheck size={14} />
          {safetyMargin >= 0 ? '+' : ''}{safetyMargin.toFixed(1)}% margin
        </div>
      </div>

      {/* Break-Even Rent */}
      <div className="break-even__block">
        <div className="break-even__header">
          <TrendingDown size={16} />
          <span className="break-even__label">Break-Even Rent</span>
        </div>
        <div className="break-even__value">{fmt(breakEvenRent)}</div>
        <div className="break-even__sub">
          {rentAboveBE >= 0 ? (
            <span style={{ color: 'var(--be-green)' }}>
              {rentAboveBE.toFixed(1)}% above break-even
            </span>
          ) : (
            <span style={{ color: 'var(--be-red)' }}>
              {Math.abs(rentAboveBE).toFixed(1)}% below break-even
            </span>
          )}
        </div>
      </div>

      {/* Months to Recoup */}
      <div className="break-even__block">
        <div className="break-even__header">
          <Clock size={16} />
          <span className="break-even__label">Time to Recoup</span>
          {findExplainer('recoup') && <TermExplainer info={findExplainer('recoup')!} />}
        </div>
        <div className="break-even__value" style={{ color: recoupColor }}>
          {recoupLabel}
        </div>
        {recoupSub && <div className="break-even__sub">{recoupSub}</div>}
      </div>
    </div>
  );
}
