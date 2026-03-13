import { useMemo, useState } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceDot,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';
import PropertyDot from './PropertyDot.js';

interface Props {
  properties: PropertyAnalysis[];
}

interface PropertyTrend {
  name: string;
  color: string;
  currentPrice: number;
  change1yr: number | null;
  change5yr: number | null;
  priceCuts: number;
  annualAppreciation: number | null;
  trend: 'appreciating' | 'declining' | 'flat';
  events: Array<{ date: string; price: number; event: string }>;
}

/** Remove outlier prices: entries below 10% of the median are likely non-sale admin events. */
function filterOutliers(history: Array<{ date: string; price: number; event: string }>): Array<{ date: string; price: number; event: string }> {
  const valid = history.filter(h => h.price > 0);
  if (valid.length === 0) return [];
  const prices = valid.map(h => h.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const threshold = median * 0.1;
  return valid.filter(h => h.price >= threshold);
}

/** Merge all properties' history into unified timeline rows keyed by date. */
function buildTimeline(
  properties: PropertyAnalysis[],
): Array<Record<string, any>> {
  const dateMap = new Map<string, Record<string, any>>();

  properties.forEach((p, i) => {
    const history = p.property_data.priceHistory;
    if (!history) return;
    const cleaned = filterOutliers(history);
    for (const h of cleaned) {
      if (!h.date) continue;
      let row = dateMap.get(h.date);
      if (!row) {
        row = { date: h.date, ts: new Date(h.date).getTime() };
        dateMap.set(h.date, row);
      }
      row[`p${i}`] = h.price;
    }
  });

  // Sort chronologically
  const rows = [...dateMap.values()].sort((a, b) => a.ts - b.ts);

  // Forward-fill: carry each property's last known value forward so lines are continuous
  const lastKnown: Record<string, number> = {};
  for (const row of rows) {
    for (let i = 0; i < properties.length; i++) {
      const key = `p${i}`;
      if (row[key] != null) {
        lastKnown[key] = row[key];
      } else if (lastKnown[key] != null) {
        row[key] = lastKnown[key];
      }
    }
  }

  return rows;
}

function computeTrend(
  history: Array<{ date: string; price: number; event: string }>,
  currentPrice: number,
): Omit<PropertyTrend, 'name' | 'color'> {
  const sorted = filterOutliers(history)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const fiveYearsAgo = new Date(now); fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const priceAt = (target: Date): number | null => {
    const eligible = sorted.filter(h => new Date(h.date) <= target);
    return eligible.length > 0 ? eligible[eligible.length - 1].price : null;
  };

  const price1yr = priceAt(oneYearAgo);
  const price5yr = priceAt(fiveYearsAgo);
  const change1yr = price1yr ? ((currentPrice - price1yr) / price1yr) * 100 : null;
  const change5yr = price5yr ? ((currentPrice - price5yr) / price5yr) * 100 : null;

  let priceCuts = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].price < sorted[i - 1].price) priceCuts++;
  }

  const earliest = sorted[0];
  let annualAppreciation: number | null = null;
  if (earliest && earliest.price > 0) {
    const years = (now.getTime() - new Date(earliest.date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (years >= 0.5) {
      annualAppreciation = (Math.pow(currentPrice / earliest.price, 1 / years) - 1) * 100;
    }
  }

  let trend: 'appreciating' | 'declining' | 'flat' = 'flat';
  if (change1yr !== null) {
    if (change1yr > 3) trend = 'appreciating';
    else if (change1yr < -3) trend = 'declining';
  } else if (annualAppreciation !== null) {
    if (annualAppreciation > 2) trend = 'appreciating';
    else if (annualAppreciation < -2) trend = 'declining';
  }

  // Key events for annotations (sales, listings)
  const events = sorted.filter(h =>
    /sold|listed|pending/i.test(h.event),
  );

  return { currentPrice, change1yr, change5yr, priceCuts, annualAppreciation, trend, events };
}

const trendIcons = {
  appreciating: <TrendingUp size={14} />,
  declining: <TrendingDown size={14} />,
  flat: <Minus size={14} />,
};
const trendLabels = {
  appreciating: 'Appreciating',
  declining: 'Declining',
  flat: 'Flat',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="comparison-tooltip">
      <strong>{new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.stroke }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function PriceHistoryTrends({ properties }: Props) {
  const [showEvents, setShowEvents] = useState(true);

  const trendMap = useMemo(() => {
    const map = new Map<number, PropertyTrend>();
    properties.forEach((p, i) => {
      const history = p.property_data.priceHistory;
      if (!history || history.length < 2) return;
      const computed = computeTrend(history, p.property_data.price);
      map.set(i, {
        ...computed,
        name: shortAddr(p.property_data.address),
        color: PROPERTY_COLORS[i],
      });
    });
    return map;
  }, [properties]);

  const timeline = useMemo(
    () => buildTimeline(properties),
    [properties, trendMap],
  );

  if (trendMap.size === 0) {
    return (
      <div className="results__card comparison-dashboard__price-history">
        <h3><TrendingUp size={18} /> Price History Trends</h3>
        <p className="comparison-dashboard__price-history-empty">
          No price history data available for these properties. Price history depends on the data source — not all property listings include historical pricing.
        </p>
      </div>
    );
  }

  // Collect event dots for annotation
  const eventDots: Array<{ date: string; price: number; event: string; color: string; propKey: string }> = [];
  if (showEvents) {
    trendMap.forEach((t, i) => {
      for (const e of t.events) {
        eventDots.push({ date: e.date, price: e.price, event: e.event, color: t.color, propKey: `p${i}` });
      }
    });
  }

  return (
    <div className="results__card comparison-dashboard__price-history">
      <div className="comparison-dashboard__price-history-top">
        <h3><TrendingUp size={18} /> Price History Trends</h3>
        <label className="comparison-dashboard__price-history-toggle">
          <input type="checkbox" checked={showEvents} onChange={e => setShowEvents(e.target.checked)} />
          Show Events
        </label>
      </div>

      {/* Legend */}
      <div className="comparison-dashboard__price-history-legend">
        {[...trendMap.entries()].map(([i, t]) => (
          <div key={i} className="comparison-dashboard__price-history-legend-item">
            <PropertyDot color={t.color} />
            <span>{t.name}</span>
            <span className={`comparison-dashboard__trend-badge comparison-dashboard__trend-badge--${t.trend}`}>
              {trendIcons[t.trend]} {trendLabels[t.trend]}
            </span>
          </div>
        ))}
      </div>

      {/* Full-size chart */}
      <div className="comparison-dashboard__price-history-chart">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={timeline} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={65}
            />
            <Tooltip content={<ChartTooltip />} />
            {[...trendMap.entries()].map(([i, t]) => (
              <Line
                key={i}
                type="monotone"
                dataKey={`p${i}`}
                name={t.name}
                stroke={t.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: t.color }}
                connectNulls
              />
            ))}
            {/* Event annotation dots */}
            {eventDots.map((e, idx) => (
              <ReferenceDot
                key={idx}
                x={e.date}
                y={e.price}
                r={4}
                fill={e.color}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Stats strip */}
      <div className="comparison-dashboard__price-history-stats-strip">
        {[...trendMap.entries()].map(([i, t]) => (
          <div key={i} className="comparison-dashboard__price-history-stat-group" style={{ borderColor: t.color }}>
            <div className="comparison-dashboard__price-history-stat-name">
              <PropertyDot color={t.color} /> {t.name}
            </div>
            <div className="comparison-dashboard__price-history-stat-row">
              <div className="comparison-dashboard__price-history-stat">
                <span>Current</span>
                <strong>{fmt(t.currentPrice)}</strong>
              </div>
              {t.change1yr !== null && (
                <div className="comparison-dashboard__price-history-stat">
                  <span>1-Yr</span>
                  <strong className={t.change1yr >= 0 ? 'text--positive' : 'text--negative'}>
                    {t.change1yr >= 0 ? '+' : ''}{t.change1yr.toFixed(1)}%
                  </strong>
                </div>
              )}
              {t.change5yr !== null && (
                <div className="comparison-dashboard__price-history-stat">
                  <span>5-Yr</span>
                  <strong className={t.change5yr >= 0 ? 'text--positive' : 'text--negative'}>
                    {t.change5yr >= 0 ? '+' : ''}{t.change5yr.toFixed(1)}%
                  </strong>
                </div>
              )}
              {t.annualAppreciation !== null && (
                <div className="comparison-dashboard__price-history-stat">
                  <span>Annual</span>
                  <strong className={t.annualAppreciation >= 0 ? 'text--positive' : 'text--negative'}>
                    {t.annualAppreciation >= 0 ? '+' : ''}{t.annualAppreciation.toFixed(1)}%/yr
                  </strong>
                </div>
              )}
              <div className="comparison-dashboard__price-history-stat">
                <span>Cuts</span>
                <strong>{t.priceCuts}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
