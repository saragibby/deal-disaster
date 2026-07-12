import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { AlertTriangle } from 'lucide-react';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';
import PropertyDot from './PropertyDot.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface BreakEvenEntry {
  name: string;
  color: string;
  breakEvenOccupancy: number;
  breakEvenRent: number;
  monthsToRecoup: number | null;
  currentOccupancy: number;
  margin: number;
}

export default function BreakEvenAnalysis({ properties }: Props) {
  const breakEvenData: BreakEvenEntry[] = useMemo(() =>
    properties.map((p, i) => {
      const cf = p.analysis_results?.cashFlow;
      const roi = p.analysis_results?.roi;
      const monthlyRent = cf?.monthlyRent || 0;
      const expensesOnly = (cf?.monthlyMortgage || 0) + (cf?.monthlyTax || 0) + (cf?.monthlyInsurance || 0)
        + (cf?.monthlyRepairs || 0) + (cf?.monthlyCapex || 0) + (cf?.monthlyManagement || 0);
      const breakEvenOccupancy = monthlyRent > 0 ? (expensesOnly / monthlyRent) * 100 : 0;
      const breakEvenRent = expensesOnly + (cf?.monthlyVacancy || 0);
      const monthlyCF = cf?.monthlyCashFlow || 0;
      const cashInvested = roi?.totalCashInvested || 0;
      const monthsToRecoup = monthlyCF > 0 ? Math.ceil(cashInvested / monthlyCF) : null;

      return {
        name: shortAddr(p.property_data.address),
        color: PROPERTY_COLORS[i],
        breakEvenOccupancy,
        breakEvenRent: Math.round(breakEvenRent),
        monthsToRecoup,
        currentOccupancy: 100 - (p.analysis_params?.vacancyPct || 8),
        margin: 100 - breakEvenOccupancy,
      };
    }),
  [properties]);

  return (
    <div className="results__card comparison-dashboard__breakeven">
      <h3><AlertTriangle size={18} /> Break-Even Analysis</h3>
      <div className="comparison-dashboard__breakeven-grid">
        {breakEvenData.map((b, i) => (
          <div key={i} className="comparison-dashboard__breakeven-card" style={{ borderTopColor: b.color }}>
            <div className="comparison-dashboard__breakeven-header">
              <PropertyDot color={b.color} />
              <strong>{b.name}</strong>
            </div>
            <div className="comparison-dashboard__breakeven-stat">
              <span>Break-Even Occupancy</span>
              <div className="comparison-dashboard__breakeven-bar-wrap">
                <div
                  className="comparison-dashboard__breakeven-bar"
                  style={{ width: `${Math.min(b.breakEvenOccupancy, 100)}%`, background: b.breakEvenOccupancy > 90 ? '#ef4444' : b.breakEvenOccupancy > 75 ? '#f59e0b' : '#10b981' }}
                />
                <div
                  className="comparison-dashboard__breakeven-bar comparison-dashboard__breakeven-bar--current"
                  style={{ width: `${b.currentOccupancy}%` }}
                />
              </div>
              <div className="comparison-dashboard__breakeven-bar-labels">
                <span>Break-even: {b.breakEvenOccupancy.toFixed(2)}%</span>
                <span>Current: {b.currentOccupancy}%</span>
              </div>
            </div>
            <div className="comparison-dashboard__breakeven-stat">
              <span>Safety Margin</span>
              <strong className={b.margin > 15 ? 'text--positive' : b.margin > 5 ? '' : 'text--negative'}>
                {b.margin > 0 ? '+' : ''}{b.margin.toFixed(2)}% above break-even
              </strong>
            </div>
            <div className="comparison-dashboard__breakeven-stat">
              <span>Break-Even Rent</span>
              <strong>{fmt(b.breakEvenRent)}/mo</strong>
            </div>
            {b.monthsToRecoup && (
              <div className="comparison-dashboard__breakeven-stat">
                <span>Months to Recoup</span>
                <strong>{b.monthsToRecoup.toLocaleString()} mo ({(b.monthsToRecoup / 12).toFixed(1)} yrs)</strong>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
