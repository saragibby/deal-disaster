import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell } from 'recharts';
import ComparisonChartCard from './ComparisonChartCard.js';
import ComparisonChartTooltip from './ComparisonChartTooltip.js';
import { shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
}

export default function ComparisonCharts({ properties }: Props) {
  const priceData = useMemo(() =>
    properties.map((p, i) => ({
      name: shortAddr(p.property_data.address),
      Price: p.property_data.price,
      Zestimate: p.property_data.zestimate || 0,
      fill: PROPERTY_COLORS[i],
    })),
  [properties]);

  const cashFlowData = useMemo(() =>
    properties.map((p, i) => {
      const cf = p.analysis_results?.cashFlow;
      return {
        name: shortAddr(p.property_data.address),
        'Monthly Rent': cf?.monthlyRent || 0,
        'Monthly Expenses': cf?.totalMonthlyExpenses || 0,
        'Cash Flow': cf?.monthlyCashFlow || 0,
        fill: PROPERTY_COLORS[i],
      };
    }),
  [properties]);

  const roiData = useMemo(() =>
    properties.map((p, i) => ({
      name: shortAddr(p.property_data.address),
      'CoC ROI': p.analysis_results?.roi?.cashOnCashROI || 0,
      'Cap Rate': p.analysis_results?.roi?.capRate || 0,
      fill: PROPERTY_COLORS[i],
    })),
  [properties]);

  const rentalData = useMemo(() =>
    properties.map((p, i) => {
      const r = p.analysis_results;
      return {
        name: shortAddr(p.property_data.address),
        'LTR Rent': r?.rentalEstimate?.mid || p.property_data.rentZestimate || 0,
        'STR Revenue': r?.strEstimate?.netMonthlyRevenue || 0,
        fill: PROPERTY_COLORS[i],
      };
    }),
  [properties]);

  const expenseData = useMemo(() =>
    properties.map((p, i) => {
      const cf = p.analysis_results?.cashFlow;
      return {
        name: shortAddr(p.property_data.address),
        Mortgage: cf?.monthlyMortgage || 0,
        Tax: cf?.monthlyTax || 0,
        Insurance: cf?.monthlyInsurance || 0,
        Vacancy: cf?.monthlyVacancy || 0,
        Repairs: cf?.monthlyRepairs || 0,
        CapEx: cf?.monthlyCapex || 0,
        Management: cf?.monthlyManagement || 0,
        fill: PROPERTY_COLORS[i],
      };
    }),
  [properties]);

  const taxSavingsData = useMemo(() =>
    properties.map((p, i) => {
      const ts = p.analysis_results?.taxSavings;
      return {
        name: shortAddr(p.property_data.address),
        'Depreciation': ts?.depreciationDeduction || 0,
        'Tax Savings': ts?.taxSavings || 0,
        'Eff. Return': ts?.effectiveFirstYearReturn || 0,
        fill: PROPERTY_COLORS[i],
      };
    }),
  [properties]);

  const barChartXAxis = <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />;

  return (
    <div className="comparison-dashboard__charts">

      {/* Price & Value */}
      <ComparisonChartCard title="Price & Value">
        <BarChart data={priceData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="Price" radius={[4, 4, 0, 0]}>
            {priceData.map((_, i) => <Cell key={i} fill={PROPERTY_COLORS[i]} />)}
          </Bar>
          <Bar dataKey="Zestimate" radius={[4, 4, 0, 0]} fillOpacity={0.5}>
            {priceData.map((_, i) => <Cell key={i} fill={PROPERTY_COLORS[i]} />)}
          </Bar>
        </BarChart>
      </ComparisonChartCard>

      {/* Cash Flow */}
      <ComparisonChartCard title="Monthly Cash Flow">
        <BarChart data={cashFlowData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="Monthly Rent" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Monthly Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Cash Flow" radius={[4, 4, 0, 0]}>
            {cashFlowData.map((d) => <Cell key={d.name} fill={d['Cash Flow'] >= 0 ? '#10b981' : '#ef4444'} />)}
          </Bar>
        </BarChart>
      </ComparisonChartCard>

      {/* ROI */}
      <ComparisonChartCard title="Return on Investment">
        <BarChart data={roiData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="CoC ROI" radius={[4, 4, 0, 0]}>
            {roiData.map((_, i) => <Cell key={i} fill={PROPERTY_COLORS[i]} />)}
          </Bar>
          <Bar dataKey="Cap Rate" radius={[4, 4, 0, 0]} fillOpacity={0.6}>
            {roiData.map((_, i) => <Cell key={i} fill={PROPERTY_COLORS[i]} />)}
          </Bar>
        </BarChart>
      </ComparisonChartCard>

      {/* Rental Comparison */}
      <ComparisonChartCard title="Rental Income Comparison">
        <BarChart data={rentalData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="LTR Rent" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="STR Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ComparisonChartCard>

      {/* Expense Breakdown (Stacked) */}
      <ComparisonChartCard title="Monthly Expense Breakdown">
        <BarChart data={expenseData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="Mortgage" stackId="expenses" fill="#ef4444" />
          <Bar dataKey="Tax" stackId="expenses" fill="#f97316" />
          <Bar dataKey="Insurance" stackId="expenses" fill="#eab308" />
          <Bar dataKey="Vacancy" stackId="expenses" fill="#84cc16" />
          <Bar dataKey="Repairs" stackId="expenses" fill="#06b6d4" />
          <Bar dataKey="CapEx" stackId="expenses" fill="#8b5cf6" />
          <Bar dataKey="Management" stackId="expenses" fill="#ec4899" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ComparisonChartCard>

      {/* Tax Savings */}
      <ComparisonChartCard
        title="Tax Savings &amp; Depreciation"
        footer={
          <div className="comparison-dashboard__eff-return">
            {taxSavingsData.map((d, i) => (
              <span key={i} style={{ color: PROPERTY_COLORS[i] }}>
                {d.name}: <strong>{d['Eff. Return'].toFixed(2)}%</strong> eff. return
              </span>
            ))}
          </div>
        }
      >
        <BarChart data={taxSavingsData} barGap={4}>
          {barChartXAxis}
          <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
          <Tooltip content={<ComparisonChartTooltip />} />
          <Legend />
          <Bar dataKey="Depreciation" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Tax Savings" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ComparisonChartCard>
    </div>
  );
}
