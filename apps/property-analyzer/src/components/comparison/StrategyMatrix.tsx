import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';
import PropertyDot from './PropertyDot.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface StrategyEntry {
  name: string;
  color: string;
  ltr: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlyCashFlow: number;
    cocROI: number;
  };
  str: {
    nightlyRate: number;
    occupancy: number;
    grossRevenue: number;
    costs: number;
    netRevenue: number;
    monthlyCashFlow: number;
    cocROI: number;
  } | null;
  winner: string;
}

export default function StrategyMatrix({ properties }: Props) {
  const strategyData: StrategyEntry[] = useMemo(() =>
    properties.map((p, i) => {
      const cf = p.analysis_results?.cashFlow;
      const str = p.analysis_results?.strEstimate;
      const roi = p.analysis_results?.roi;
      const monthlyRent = cf?.monthlyRent || 0;

      const expensesOnly = (cf?.monthlyMortgage || 0) + (cf?.monthlyTax || 0) + (cf?.monthlyInsurance || 0)
        + (cf?.monthlyVacancy || 0) + (cf?.monthlyRepairs || 0) + (cf?.monthlyCapex || 0) + (cf?.monthlyManagement || 0);
      const strMonthlyCF = str ? str.netMonthlyRevenue - expensesOnly : 0;
      const cashInvested = roi?.totalCashInvested || 1;

      return {
        name: shortAddr(p.property_data.address),
        color: PROPERTY_COLORS[i],
        ltr: {
          monthlyIncome: monthlyRent,
          monthlyExpenses: expensesOnly,
          monthlyCashFlow: cf?.monthlyCashFlow || 0,
          cocROI: roi?.cashOnCashROI || 0,
        },
        str: str ? {
          nightlyRate: str.nightlyRate,
          occupancy: str.occupancyRate * 100,
          grossRevenue: str.grossMonthlyRevenue,
          costs: str.cleaningCosts + str.platformFees,
          netRevenue: str.netMonthlyRevenue,
          monthlyCashFlow: strMonthlyCF,
          cocROI: (strMonthlyCF * 12 / cashInvested) * 100,
        } : null,
        winner: str ? (strMonthlyCF > (cf?.monthlyCashFlow || 0) ? 'STR' : 'LTR') : 'LTR',
      };
    }),
  [properties]);

  return (
    <div className="results__card comparison-dashboard__strategy">
      <h3>LTR vs STR Strategy Comparison</h3>
      <div className="comparison-dashboard__strategy-grid">
        {strategyData.map((s, i) => (
          <div key={i} className="comparison-dashboard__strategy-card" style={{ borderTopColor: s.color }}>
            <div className="comparison-dashboard__strategy-header">
              <PropertyDot color={s.color} />
              <strong>{s.name}</strong>
              <span className={`comparison-dashboard__strategy-winner comparison-dashboard__strategy-winner--${s.winner.toLowerCase()}`}>
                {s.winner} wins
              </span>
            </div>
            <div className="comparison-dashboard__strategy-cols">
              <div className="comparison-dashboard__strategy-col">
                <h4>Long-Term Rental</h4>
                <div className="comparison-dashboard__strategy-row">
                  <span>Monthly Income</span>
                  <strong>{fmt(s.ltr.monthlyIncome)}</strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>Monthly Expenses</span>
                  <strong className="text--negative">{fmt(s.ltr.monthlyExpenses)}</strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>Cash Flow</span>
                  <strong className={s.ltr.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                    {fmt(s.ltr.monthlyCashFlow)}/mo
                  </strong>
                </div>
                <div className="comparison-dashboard__strategy-row">
                  <span>CoC ROI</span>
                  <strong>{s.ltr.cocROI.toFixed(2)}%</strong>
                </div>
              </div>
              {s.str ? (
                <div className="comparison-dashboard__strategy-col">
                  <h4>Short-Term Rental</h4>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Nightly Rate</span>
                    <strong>{fmt(s.str.nightlyRate)}</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Occupancy</span>
                    <strong>{s.str.occupancy.toFixed(0)}%</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Gross Revenue</span>
                    <strong>{fmt(s.str.grossRevenue)}</strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>Cash Flow</span>
                    <strong className={s.str.monthlyCashFlow >= 0 ? 'text--positive' : 'text--negative'}>
                      {fmt(s.str.monthlyCashFlow)}/mo
                    </strong>
                  </div>
                  <div className="comparison-dashboard__strategy-row">
                    <span>CoC ROI</span>
                    <strong>{s.str.cocROI.toFixed(2)}%</strong>
                  </div>
                </div>
              ) : (
                <div className="comparison-dashboard__strategy-col comparison-dashboard__strategy-col--empty">
                  <h4>Short-Term Rental</h4>
                  <p>No STR data available</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
