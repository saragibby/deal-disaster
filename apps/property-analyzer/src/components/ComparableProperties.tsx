import { useState } from 'react';
import type { ComparableProperty, PropertyData } from '@deal-platform/shared-types';
import { TrendingUp, TrendingDown, Minus, MapPin, Map as MapIcon, Table2, ExternalLink } from 'lucide-react';
import MapView from './MapView';
import { buildPropertyLayers } from './mapLayers/propertyMapLayer';

interface Props {
  comparables: ComparableProperty[];
  subject: PropertyData;
  subjectRent: number;
}

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

  if (!comparables || comparables.length === 0) return null;

  // Check if any properties have coordinates for the map
  const hasCoordinates = subject.latitude || comparables.some(c => c.latitude && c.longitude);

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

  // ── Rent bar chart: top 10 comps + subject ────────────────────────────
  const chartComps = comparables
    .filter(c => c.estimatedRent > 0)
    .sort((a, b) => b.estimatedRent - a.estimatedRent)
    .slice(0, 10);

  const maxRent = Math.max(subjectRent, ...chartComps.map(c => c.estimatedRent));

  return (
    <div className="results__card comps">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--indigo">🏘️</span>
        Comparable Properties
        <span className="comps__count">{comparables.length} found</span>
      </h3>

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

      {/* Map View */}
      {viewMode === 'map' && (
        <MapView
          layers={buildPropertyLayers(subject, comparables, subjectRent)}
          height={480}
        />
      )}

      {/* Table View: Rent Comparison Bar Chart */}
      {viewMode === 'table' && chartComps.length > 0 && (
        <div className="comps__chart">
          <h4 className="comps__chart-title">Estimated Rent Comparison</h4>

          {/* Subject property bar */}
          <div className="comps__bar-row comps__bar-row--subject">
            <div className="comps__bar-label">
              <strong>Your Property</strong>
            </div>
            <div className="comps__bar-track">
              <div
                className="comps__bar-fill comps__bar-fill--subject"
                style={{ width: `${(subjectRent / maxRent) * 100}%` }}
              />
            </div>
            <div className="comps__bar-value">{fmt(subjectRent)}</div>
          </div>

          {/* Comp bars */}
          {chartComps.map((comp, i) => (
            <div className="comps__bar-row" key={comp.zpid || i}>
              <div className="comps__bar-label" title={`${comp.address}, ${comp.city}`}>
                {comp.address
                  ? comp.address.length > 22
                    ? comp.address.slice(0, 22) + '…'
                    : comp.address
                  : `Comp ${i + 1}`}
              </div>
              <div className="comps__bar-track">
                <div
                  className="comps__bar-fill"
                  style={{ width: `${(comp.estimatedRent / maxRent) * 100}%` }}
                />
              </div>
              <div className="comps__bar-value">{fmt(comp.estimatedRent)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Comps Table */}
      {viewMode === 'table' && (
      <div className="comps__table-wrap">
        <table className="comps__table">
          <thead>
            <tr>
              <th></th>
              <th>Address</th>
              <th>Price</th>
              <th>Beds</th>
              <th>Baths</th>
              <th>Sq Ft</th>
              <th>$/Sq Ft</th>
              <th>Est. Rent</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Subject property row — highlighted */}
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
            </tr>

            {comparables.map((comp, i) => (
              <tr key={comp.zpid || i}>
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
                  {comp.zillowUrl ? (
                    <a
                      href={comp.zillowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="comps__zillow-link"
                    >
                      <div className="comps__address">{comp.address || '—'} <ExternalLink size={11} /></div>
                      <div className="comps__city">{[comp.city, comp.state].filter(Boolean).join(', ')}</div>
                    </a>
                  ) : (
                    <>
                      <div className="comps__address">{comp.address || '—'}</div>
                      <div className="comps__city">{[comp.city, comp.state].filter(Boolean).join(', ')}</div>
                    </>
                  )}
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
              </tr>
            ))}
          </tbody>
        </table>
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
