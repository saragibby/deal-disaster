import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { Home, TrendingUp, TrendingDown, Thermometer } from 'lucide-react';
import { fmt } from '../../utils/comparisonUtils.js';

interface Props {
  properties: PropertyAnalysis[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tempColor(temp: string): string {
  switch (temp.toUpperCase()) {
    case 'HOT': return '#ef4444';
    case 'WARM': return '#f59e0b';
    case 'COOL': return '#3b82f6';
    case 'COLD': return '#6366f1';
    default: return '#94a3b8';
  }
}

function RentTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{label}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke || p.fill }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

function HistogramTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{fmt(d.price)}/mo</strong>
      <div>{d.count.toLocaleString()} listings</div>
    </div>
  );
}

export default function RentalMarketTrends({ properties }: Props) {
  // Use first property's rental market data (they share a city)
  const trends = useMemo(() => {
    for (const p of properties) {
      if (p.property_data.rentalMarketTrends) return p.property_data.rentalMarketTrends;
    }
    return null;
  }, [properties]);

  if (!trends) {
    return (
      <div className="results__card rental-market">
        <h3><Home size={18} /> Rental Market Trends</h3>
        <p className="rental-market__empty">
          No rental market data available for this area.
        </p>
      </div>
    );
  }

  // Build the rent-over-time line chart data
  const rentTimeline = useMemo(() => {
    if (!trends.medianRentOverTime) return [];
    const rows: Array<{ month: string; current?: number; previous?: number }> = [];
    for (const m of MONTHS_SHORT) {
      const curr = trends.medianRentOverTime.currentYear.find(r => r.month === m);
      const prev = trends.medianRentOverTime.prevYear.find(r => r.month === m);
      if (curr || prev) {
        rows.push({
          month: m,
          current: curr ? Math.round(curr.price) : undefined,
          previous: prev ? Math.round(prev.price) : undefined,
        });
      }
    }
    return rows;
  }, [trends]);

  // Build histogram data (cap at $5k for readability)
  const histogram = useMemo(() => {
    if (!trends.rentHistogram) return [];
    return trends.rentHistogram
      .filter(h => h.price <= 5000 && h.count > 0)
      .map(h => ({ price: h.price, count: h.count }));
  }, [trends]);

  // Property's own estimated rent for the reference line
  const propertyRent = properties[0]?.analysis_results?.rentalEstimate?.mid;

  const changeSign = trends.yearlyChange >= 0 ? '+' : '';
  const monthSign = trends.monthlyChange >= 0 ? '+' : '';

  return (
    <div className="results__card rental-market">
      <h3><Home size={18} /> Rental Market — {trends.areaName}</h3>

      {/* Summary stats row */}
      <div className="rental-market__stats">
        <div className="rental-market__stat">
          <span>Median Rent</span>
          <strong>{fmt(trends.medianRent)}/mo</strong>
        </div>
        <div className="rental-market__stat">
          <span>YoY Change</span>
          <strong className={trends.yearlyChange >= 0 ? 'text--positive' : 'text--negative'}>
            {trends.yearlyChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {changeSign}{fmt(trends.yearlyChange)}
          </strong>
        </div>
        <div className="rental-market__stat">
          <span>Monthly</span>
          <strong className={trends.monthlyChange >= 0 ? 'text--positive' : 'text--negative'}>
            {monthSign}{fmt(trends.monthlyChange)}
          </strong>
        </div>
        <div className="rental-market__stat">
          <span>Market</span>
          <strong style={{ color: tempColor(trends.marketTemperature) }}>
            <Thermometer size={12} /> {trends.marketTemperature}
          </strong>
        </div>
        <div className="rental-market__stat">
          <span>Listings</span>
          <strong>{trends.availableRentals.toLocaleString()}</strong>
        </div>
        {trends.nationalMedianRent && (
          <div className="rental-market__stat">
            <span>US Median</span>
            <strong>{fmt(trends.nationalMedianRent)}/mo</strong>
          </div>
        )}
      </div>

      {/* Median rent over time — line chart */}
      {rentTimeline.length > 0 && (
        <div className="rental-market__chart">
          <div className="rental-market__chart-label">Median Rent Over Time</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rentTimeline} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={50}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<RentTooltip />} />
              {propertyRent && (
                <ReferenceLine y={propertyRent} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: 'Your Rent', fill: '#f59e0b', fontSize: 10, position: 'right' }} />
              )}
              <Line type="monotone" dataKey="previous" name="Last Year" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
              <Line type="monotone" dataKey="current" name="This Year" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3, fill: '#6366f1' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div className="rental-market__legend">
            <span><span className="rental-market__legend-line rental-market__legend-line--current" /> This Year</span>
            <span><span className="rental-market__legend-line rental-market__legend-line--previous" /> Last Year</span>
            {propertyRent && <span><span className="rental-market__legend-line rental-market__legend-line--yours" /> Your Est. Rent</span>}
          </div>
        </div>
      )}

      {/* Rent distribution histogram */}
      {histogram.length > 0 && (
        <div className="rental-market__chart">
          <div className="rental-market__chart-label">Rent Distribution ({trends.availableRentals.toLocaleString()} listings)</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={histogram} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <XAxis
                dataKey="price"
                tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }}
                interval={4}
              />
              <YAxis hide />
              <Tooltip content={<HistogramTooltip />} />
              {propertyRent && (
                <ReferenceLine x={Math.round(propertyRent / 100) * 100} stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" />
              )}
              <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
