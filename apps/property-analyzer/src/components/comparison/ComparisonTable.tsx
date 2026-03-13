import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { fmt, shortAddr, bestIdx } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';
import PropertyDot from './PropertyDot.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface TableRow {
  label: string;
  values: string[];
  bestIdx: number;
  higherIsBetter: boolean;
}

interface DemandIndicator {
  priceToRent: number;
  grossYield: number;
  rentPerSqft: number;
  ptrSignal: 'good' | 'neutral' | 'poor';
  yieldSignal: 'good' | 'neutral' | 'poor';
}

export default function ComparisonTable({ properties }: Props) {
  const tableRows: TableRow[] = useMemo(() => {
    const rows: TableRow[] = [];

    const add = (label: string, getter: (p: PropertyAnalysis) => number, higher: boolean, formatter: (n: number) => string = fmt) => {
      const vals = properties.map(getter);
      rows.push({
        label,
        values: vals.map(formatter),
        bestIdx: bestIdx(vals, higher),
        higherIsBetter: higher,
      });
    };

    const pct = (n: number) => n.toFixed(2) + '%';
    const num = (n: number) => n.toLocaleString();

    add('Price', p => p.property_data.price, false);
    add('Zestimate', p => p.property_data.zestimate || 0, true);
    add('Sq Ft', p => p.property_data.sqft || 0, true, num);
    add('$/sq ft', p => (p.property_data.sqft ? p.property_data.price / p.property_data.sqft : 0), false);
    add('Bedrooms', p => p.property_data.bedrooms || 0, true, num);
    add('Bathrooms', p => p.property_data.bathrooms || 0, true, num);
    add('Year Built', p => p.property_data.yearBuilt || 0, true, n => n ? String(n) : 'N/A');
    add('Monthly Rent', p => p.analysis_results?.cashFlow?.monthlyRent || 0, true);
    add('Monthly Mortgage', p => p.analysis_results?.cashFlow?.monthlyMortgage || 0, false);
    add('Monthly Cash Flow', p => p.analysis_results?.cashFlow?.monthlyCashFlow || 0, true);
    add('Annual Cash Flow', p => p.analysis_results?.cashFlow?.annualCashFlow || 0, true);
    add('Cash on Cash ROI', p => p.analysis_results?.roi?.cashOnCashROI || 0, true, pct);
    add('Cap Rate', p => p.analysis_results?.roi?.capRate || 0, true, pct);
    add('GRM', p => p.analysis_results?.roi?.grossRentMultiplier || 0, false, n => n.toFixed(1));
    add('Total Cash Invested', p => p.analysis_results?.roi?.totalCashInvested || 0, false);

    return rows;
  }, [properties]);

  const demandIndicators: DemandIndicator[] = useMemo(() =>
    properties.map((p) => {
      const rent = p.analysis_results?.cashFlow?.monthlyRent || p.analysis_results?.rentalEstimate?.mid || 0;
      const price = p.property_data.price;
      const sqft = p.property_data.sqft || 0;

      const priceToRent = rent > 0 ? price / (rent * 12) : 0;
      const grossYield = price > 0 ? (rent * 12 / price) * 100 : 0;
      const rentPerSqft = sqft > 0 ? rent / sqft : 0;

      const ptrSignal: 'good' | 'neutral' | 'poor' = priceToRent > 0 && priceToRent < 15 ? 'good' : priceToRent <= 20 ? 'neutral' : 'poor';
      const yieldSignal: 'good' | 'neutral' | 'poor' = grossYield >= 8 ? 'good' : grossYield >= 5 ? 'neutral' : 'poor';

      return { priceToRent, grossYield, rentPerSqft, ptrSignal, yieldSignal };
    }),
  [properties]);

  return (
    <div className="results__card comparison-dashboard__table-card">
      <h3>Detailed Comparison</h3>
      <div className="comparison-dashboard__table-wrapper">
        <table className="comparison-dashboard__table">
          <thead>
            <tr>
              <th className="comparison-dashboard__table-metric">Metric</th>
              {properties.map((p, i) => (
                <th key={p.id} style={{ borderBottomColor: PROPERTY_COLORS[i] }}>
                  <PropertyDot color={PROPERTY_COLORS[i]} />
                  {shortAddr(p.property_data.address)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(row => (
              <tr key={row.label}>
                <td className="comparison-dashboard__table-metric">{row.label}</td>
                {row.values.map((val, i) => (
                  <td
                    key={i}
                    className={i === row.bestIdx ? 'comparison-dashboard__table-best' : ''}
                  >
                    {val}
                  </td>
                ))}
              </tr>
            ))}
            {/* Demand Indicators */}
            <tr className="comparison-dashboard__table-section">
              <td colSpan={properties.length + 1}><strong>Rental Demand Indicators</strong></td>
            </tr>
            <tr>
              <td className="comparison-dashboard__table-metric">Price-to-Rent Ratio</td>
              {demandIndicators.map((d, i) => (
                <td key={i}>
                  {d.priceToRent.toFixed(1)}x
                  <span className={`comparison-dashboard__demand-pill comparison-dashboard__demand-pill--${d.ptrSignal}`}>
                    {d.ptrSignal === 'good' ? 'Strong' : d.ptrSignal === 'neutral' ? 'Fair' : 'Weak'}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="comparison-dashboard__table-metric">Gross Yield</td>
              {demandIndicators.map((d, i) => (
                <td key={i}>
                  {d.grossYield.toFixed(2)}%
                  <span className={`comparison-dashboard__demand-pill comparison-dashboard__demand-pill--${d.yieldSignal}`}>
                    {d.yieldSignal === 'good' ? 'Strong' : d.yieldSignal === 'neutral' ? 'Fair' : 'Weak'}
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="comparison-dashboard__table-metric">Rent / Sq Ft</td>
              {demandIndicators.map((d, i) => (
                <td key={i}>${d.rentPerSqft.toFixed(2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
