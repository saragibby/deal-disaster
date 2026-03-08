import { useState, useMemo, useEffect, useRef } from 'react';
import type { ComparableProperty, PropertyData } from '@deal-platform/shared-types';
import { TrendingUp, TrendingDown, Minus, MapPin, Map as MapIcon, Table2, ExternalLink, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import MapView from './MapView';
import { buildPropertyLayers } from './mapLayers/propertyMapLayer';

interface Props {
  comparables: ComparableProperty[];
  subject: PropertyData;
  subjectRent: number;
}

type SortKey = 'price' | 'bedrooms' | 'bathrooms' | 'sqft' | 'pricePerSqft' | 'estimatedRent';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 8;

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ComparableProperties({ comparables, subject, subjectRent }: Props) {
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [selectedZpid, setSelectedZpid] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── Sorting ───────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return comparables;
    return [...comparables].sort((a, b) => {
      const av = (a[sortKey] as number) || 0;
      const bv = (b[sortKey] as number) || 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [comparables, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  if (!comparables || comparables.length === 0) return null;

  // ── Market position calculations ──────────────────────────────────────
  const avgPrice = comparables.reduce((s, c) => s + c.price, 0) / comparables.length;
  const avgRent = comparables.reduce((s, c) => s + c.estimatedRent, 0) / comparables.length;
  const subjectPricePerSqft = subject.sqft > 0 ? subject.price / subject.sqft : 0;
  const avgPricePerSqft =
    comparables.filter(c => c.pricePerSqft > 0).reduce((s, c) => s + c.pricePerSqft, 0) /
    (comparables.filter(c => c.pricePerSqft > 0).length || 1);

  const priceDiffPct = avgPrice > 0 ? ((subject.price - avgPrice) / avgPrice) * 100 : 0;
  const rentDiffPct = avgRent > 0 ? ((subjectRent - avgRent) / avgRent) * 100 : 0;
  const sqftDiffPct =
    avgPricePerSqft > 0 ? ((subjectPricePerSqft - avgPricePerSqft) / avgPricePerSqft) * 100 : 0;

  // ── Rent chart data: subject + top 10 comps, sorted descending ──────
  const chartData = useMemo(() => {
    const comps = comparables
      .filter(c => c.estimatedRent > 0)
      .sort((a, b) => b.estimatedRent - a.estimatedRent)
      .slice(0, 10)
      .map(c => ({
        zpid: c.zpid,
        name: c.address
          ? c.address.length > 20 ? c.address.slice(0, 20) + '…' : c.address
          : 'Comp',
        rent: c.estimatedRent,
        isSubject: false,
      }));

    const subjectEntry = {
      zpid: '__subject__',
      name: '★ Your Property',
      rent: subjectRent,
      isSubject: true,
    };

    // Insert subject in sorted position
    const all = [...comps, subjectEntry].sort((a, b) => b.rent - a.rent);
    return all;
  }, [comparables, subjectRent]);

  // When a comp is selected, jump to the page that contains it (table view)
  useEffect(() => {
    if (!selectedZpid || selectedZpid === '__subject__') return;
    const idx = sorted.findIndex(c => c.zpid === selectedZpid);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      setPage(targetPage);
    }
  }, [selectedZpid, sorted]);

  return (
    <div className="results__card comps">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--indigo">🏘️</span>
        Comparable Properties
        <span className="comps__count">{comparables.length} found</span>
      </h3>

      {/* Market Position Cards */}
      <div className="comps__position-grid">
        <PositionCard
          label="Price vs Market"
          subject={fmt(subject.price)}
          market={fmt(Math.round(avgPrice))}
          diffPct={priceDiffPct}
          invertColor
        />
        <PositionCard
          label="Est. Rent vs Market"
          subject={fmt(subjectRent)}
          market={fmt(Math.round(avgRent))}
          diffPct={rentDiffPct}
        />
        <PositionCard
          label="$/Sq Ft vs Market"
          subject={fmt(Math.round(subjectPricePerSqft))}
          market={fmt(Math.round(avgPricePerSqft))}
          diffPct={sqftDiffPct}
          invertColor
        />
      </div>

      {/* Rent Comparison Chart — always visible */}
      {chartData.length > 0 && (
        <div className="comps__chart">
          <h4 className="comps__chart-title">Estimated Rent Comparison</h4>
          <div className="comps__chart-wrap">
            <ResponsiveContainer width="100%" height={chartData.length * 38 + 32}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                barCategoryGap="20%"
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={({ x, y, payload }: any) => (
                    <text x={x - 4} y={y} textAnchor="end" fill="var(--text-muted)" fontSize={11} dominantBaseline="central">
                      {payload.value}
                    </text>
                  )}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: any) => [fmt(Number(v)), 'Est. Rent']}
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <ReferenceLine x={subjectRent} stroke="#6366f1" strokeDasharray="3 3" strokeWidth={1.5} />
                <Bar
                  dataKey="rent"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(_data: any, index: number) => {
                    const entry = chartData[index];
                    if (!entry || entry.isSubject) return;
                    setSelectedZpid(prev => prev === entry.zpid ? null : entry.zpid);
                  }}
                >
                  {chartData.map((entry) => {
                    const isSelected = selectedZpid === entry.zpid;
                    let fill = '#94a3b8';
                    let opacity = 0.7;
                    if (entry.isSubject) { fill = '#6366f1'; opacity = 1; }
                    else if (isSelected) { fill = '#f59e0b'; opacity = 1; }
                    return (
                      <Cell
                        key={entry.zpid}
                        fill={fill}
                        fillOpacity={opacity}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="comps__view-toggle">
        <button
          className={`comps__view-btn ${viewMode === 'table' ? 'comps__view-btn--active' : ''}`}
          onClick={() => setViewMode('table')}
        >
          <Table2 size={16} /> Table
        </button>
        <button
          className={`comps__view-btn ${viewMode === 'map' ? 'comps__view-btn--active' : ''}`}
          onClick={() => setViewMode('map')}
        >
          <MapIcon size={16} /> Map
        </button>
      </div>

      {/* Map View */}
      {viewMode === 'map' && (
        <MapView
          layers={buildPropertyLayers(subject, comparables, subjectRent, selectedZpid)}
          height={480}
        />
      )}

      {/* Detailed Comps Table */}
      {viewMode === 'table' && (
      <div className="comps__table-wrap" ref={tableRef}>
        <table className="comps__table">
          <thead>
            <tr>
              <th></th>
              <th>Address</th>
              <SortTh label="Price" sortKey="price" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortTh label="Beds" sortKey="bedrooms" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortTh label="Baths" sortKey="bathrooms" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortTh label="Sq Ft" sortKey="sqft" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortTh label="$/Sq Ft" sortKey="pricePerSqft" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortTh label="Est. Rent" sortKey="estimatedRent" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* Subject property row — highlighted (always on page 1) */}
            {page === 1 && (
            <tr className="comps__row--subject">
              <td>
                <MapPin size={14} />
              </td>
              <td>
                <strong>{subject.address || 'Subject Property'}</strong>
              </td>
              <td><strong>{fmt(subject.price)}</strong></td>
              <td>{subject.bedrooms}</td>
              <td>{subject.bathrooms}</td>
              <td>{subject.sqft?.toLocaleString() || '—'}</td>
              <td>{subjectPricePerSqft > 0 ? fmt(Math.round(subjectPricePerSqft)) : '—'}</td>
              <td><strong>{fmt(subjectRent)}</strong></td>
              <td><span className="comps__status comps__status--subject">Subject</span></td>
              <td></td>
            </tr>
            )}

            {paginated.map((comp, i) => (
              <tr
                key={comp.zpid || i}
                className={selectedZpid === comp.zpid ? 'comps__row--selected' : ''}
                onClick={() => setSelectedZpid(prev => prev === comp.zpid ? null : comp.zpid)}
              >
                <td>
                  {comp.photo ? (
                    <img
                      src={comp.photo}
                      alt=""
                      className="comps__thumb"
                      loading="lazy"
                    />
                  ) : (
                    <div className="comps__thumb-placeholder" />
                  )}
                </td>
                <td>
                  <div className="comps__address">{comp.address || '—'}</div>
                  <div className="comps__city">{[comp.city, comp.state].filter(Boolean).join(', ')}</div>
                </td>
                <td>{fmt(comp.price)}</td>
                <td>{comp.bedrooms || '—'}</td>
                <td>{comp.bathrooms || '—'}</td>
                <td>{comp.sqft?.toLocaleString() || '—'}</td>
                <td>{comp.pricePerSqft > 0 ? fmt(comp.pricePerSqft) : '—'}</td>
                <td>{comp.estimatedRent > 0 ? fmt(comp.estimatedRent) : '—'}</td>
                <td>
                  <StatusBadge status={comp.homeStatus} />
                </td>
                <td>
                  {comp.zillowUrl && (
                    <a
                      href={comp.zillowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="comps__row-link"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="comps__pagination">
            <button
              className="comps__page-btn"
              disabled={page === 1}
              onClick={() => setPage(1)}
              title="First page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              className="comps__page-btn"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Prev
            </button>
            <span className="comps__page-info">
              {page} of {totalPages}
            </span>
            <button
              className="comps__page-btn"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
            <button
              className="comps__page-btn"
              disabled={page === totalPages}
              onClick={() => setPage(totalPages)}
              title="Last page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function PositionCard({
  label,
  subject,
  market,
  diffPct,
  invertColor,
}: {
  label: string;
  subject: string;
  market: string;
  diffPct: number;
  invertColor?: boolean;
}) {
  const isPositive = invertColor ? diffPct < 0 : diffPct > 0;
  const isNeutral = Math.abs(diffPct) < 2;
  const colorClass = isNeutral
    ? 'comps__position--neutral'
    : isPositive
      ? 'comps__position--positive'
      : 'comps__position--negative';

  return (
    <div className={`comps__position-card ${colorClass}`}>
      <div className="comps__position-label">{label}</div>
      <div className="comps__position-values">
        <span className="comps__position-subject">{subject}</span>
        <span className="comps__position-vs">vs</span>
        <span className="comps__position-market">{market}</span>
      </div>
      <div className="comps__position-diff">
        {isNeutral ? (
          <Minus size={14} />
        ) : diffPct > 0 ? (
          <TrendingUp size={14} />
        ) : (
          <TrendingDown size={14} />
        )}
        {Math.abs(diffPct).toFixed(1)}% {diffPct > 0 ? 'above' : 'below'} market
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="comps__status">—</span>;

  const normalized = status.toUpperCase().replace(/_/g, ' ');
  let cls = '';
  if (normalized.includes('FOR SALE') || normalized.includes('SALE'))
    cls = 'comps__status--sale';
  else if (normalized.includes('SOLD') || normalized.includes('RECENTLY'))
    cls = 'comps__status--sold';
  else if (normalized.includes('PENDING'))
    cls = 'comps__status--pending';

  return <span className={`comps__status ${cls}`}>{normalized}</span>;
}

function SortTh({
  label,
  sortKey: key,
  currentKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey | null;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = currentKey === key;
  return (
    <th className="comps__sortable-th" onClick={() => onSort(key)}>
      {label}
      <span className={`comps__sort-icon ${active ? 'comps__sort-icon--active' : ''}`}>
        {active ? (dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} />}
      </span>
    </th>
  );
}
