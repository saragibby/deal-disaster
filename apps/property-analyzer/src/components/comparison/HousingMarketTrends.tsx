import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Building2, Clock, BarChart3 } from 'lucide-react';
import { fmt } from '../../utils/comparisonUtils.js';

interface Props {
  properties: PropertyAnalysis[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{new Date(label).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke || p.fill }}>
          Typical Home Value: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function HousingMarketTrends({ properties }: Props) {
  const market = useMemo(() => {
    for (const p of properties) {
      if (p.property_data.housingMarket) return p.property_data.housingMarket;
    }
    return null;
  }, [properties]);

  const propertyPrice = properties[0]?.property_data?.price;

  // ZHVI changes
  const { change1yr, change5yr } = useMemo(() => {
    if (!market?.zhviTimeSeries?.length) return { change1yr: null, change5yr: null };
    const ts = market.zhviTimeSeries;
    const latest = ts[ts.length - 1].value;
    const oneYrAgo = ts.length > 12 ? ts[ts.length - 13].value : null;
    const fiveYrAgo = ts.length > 60 ? ts[ts.length - 61].value : null;
    return {
      change1yr: oneYrAgo ? ((latest - oneYrAgo) / oneYrAgo) * 100 : null,
      change5yr: fiveYrAgo ? ((latest - fiveYrAgo) / fiveYrAgo) * 100 : null,
    };
  }, [market]);

  if (!market) {
    return (
      <div className="results__card housing-market">
        <h3><Building2 size={18} /> Housing Market Trends</h3>
        <p className="housing-market__empty">
          No housing market data available for this area.
        </p>
      </div>
    );
  }

  const ratioColor = market.saleToListRatio >= 1 ? '#ef4444' : market.saleToListRatio >= 0.97 ? '#f59e0b' : '#10b981';

  return (
    <div className="results__card housing-market">
      <h3><Building2 size={18} /> Housing Market — {market.areaName}</h3>

      {/* Key stats row */}
      <div className="housing-market__stats">
        <div className="housing-market__stat">
          <span>Typical Value</span>
          <strong>{fmt(market.typicalHomeValue)}</strong>
        </div>
        <div className="housing-market__stat">
          <span>Median Sale</span>
          <strong>{fmt(market.medianSalePrice)}</strong>
        </div>
        <div className="housing-market__stat">
          <span>Sale/List</span>
          <strong style={{ color: ratioColor }}>{(market.saleToListRatio * 100).toFixed(1)}%</strong>
        </div>
        <div className="housing-market__stat">
          <span><Clock size={10} /> Days to Pending</span>
          <strong>{Math.round(market.medianDaysToPending)}</strong>
        </div>
        <div className="housing-market__stat">
          <span><BarChart3 size={10} /> Inventory</span>
          <strong>{market.forSaleInventory.toLocaleString()}</strong>
        </div>
        {change1yr !== null && (
          <div className="housing-market__stat">
            <span>1-Yr Change</span>
            <strong className={change1yr >= 0 ? 'text--positive' : 'text--negative'}>
              {change1yr >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {change1yr >= 0 ? '+' : ''}{change1yr.toFixed(1)}%
            </strong>
          </div>
        )}
        {change5yr !== null && (
          <div className="housing-market__stat">
            <span>5-Yr Change</span>
            <strong className={change5yr >= 0 ? 'text--positive' : 'text--negative'}>
              {change5yr >= 0 ? '+' : ''}{change5yr.toFixed(1)}%
            </strong>
          </div>
        )}
      </div>

      {/* Sale metrics bar */}
      <div className="housing-market__sale-bar">
        <div className="housing-market__sale-segment housing-market__sale-segment--above" style={{ width: `${market.pctSoldAboveList}%` }}>
          {market.pctSoldAboveList >= 8 && <span>{market.pctSoldAboveList.toFixed(1)}% above</span>}
        </div>
        <div className="housing-market__sale-segment housing-market__sale-segment--at" style={{ width: `${100 - market.pctSoldAboveList - market.pctSoldBelowList}%` }}>
        </div>
        <div className="housing-market__sale-segment housing-market__sale-segment--below" style={{ width: `${market.pctSoldBelowList}%` }}>
          {market.pctSoldBelowList >= 8 && <span>{market.pctSoldBelowList.toFixed(1)}% below</span>}
        </div>
      </div>
      <div className="housing-market__sale-bar-label">
        Sold vs. List Price
      </div>

      {/* ZHVI area chart */}
      {market.zhviTimeSeries.length > 0 && (
        <div className="housing-market__chart">
          <div className="housing-market__chart-label">Zillow Home Value Index (ZHVI)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={market.zhviTimeSeries} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="zhviGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                minTickGap={50}
              />
              <YAxis
                tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                width={55}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<ChartTooltip />} />
              {propertyPrice && (
                <ReferenceLine
                  y={propertyPrice}
                  stroke="#f59e0b"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{ value: 'This Property', fill: '#f59e0b', fontSize: 10, position: 'right' }}
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#zhviGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
