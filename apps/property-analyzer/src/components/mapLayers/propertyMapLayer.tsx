/**
 * Property Map Layer Builder
 *
 * Converts a subject property and its comparables into MapLayer objects
 * for rendering in MapView. Each comp popup includes a "View on Zillow" link.
 *
 * This is the first layer builder. Future builders (flood zones, schools,
 * transit, crime heatmaps, etc.) follow the same pattern: accept data,
 * return MapLayer[].
 */

import type { ReactNode } from 'react';
import type { ComparableProperty, PropertyData } from '@deal-platform/shared-types';
import type { MapLayer, MapMarker } from '../MapView';
import { ExternalLink } from 'lucide-react';

// ---------- helpers ----------

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function SubjectPopup({ property, rent }: { property: PropertyData; rent: number }) {
  return (
    <div className="map-popup__content">
      <div className="map-popup__title">📍 Your Property</div>
      <div className="map-popup__address">{property.address}</div>
      <div className="map-popup__detail">{property.city}, {property.state} {property.zip}</div>
      <div className="map-popup__stats">
        <span>{fmt(property.price)}</span>
        <span>{property.bedrooms}bd / {property.bathrooms}ba</span>
        <span>{property.sqft?.toLocaleString()} sqft</span>
      </div>
      {rent > 0 && (
        <div className="map-popup__rent">Est. Rent: {fmt(rent)}/mo</div>
      )}
      {property.zillowUrl && (
        <a
          href={property.zillowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="map-popup__zillow-link"
        >
          View on Zillow <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

function CompPopup({ comp }: { comp: ComparableProperty }) {
  return (
    <div className="map-popup__content">
      <div className="map-popup__address">{comp.address}</div>
      <div className="map-popup__detail">{comp.city}, {comp.state} {comp.zip}</div>
      <div className="map-popup__stats">
        <span>{fmt(comp.price)}</span>
        <span>{comp.bedrooms}bd / {comp.bathrooms}ba</span>
        <span>{comp.sqft?.toLocaleString()} sqft</span>
      </div>
      {comp.estimatedRent > 0 && (
        <div className="map-popup__rent">Est. Rent: {fmt(comp.estimatedRent)}/mo</div>
      )}
      {comp.homeStatus && (
        <div className="map-popup__status">{comp.homeStatus}</div>
      )}
      {comp.zillowUrl && (
        <a
          href={comp.zillowUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="map-popup__zillow-link"
        >
          View on Zillow <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

// ---------- layer builder ----------

/**
 * Build MapLayer objects for a subject property and its comparables.
 *
 * Subject property: large, prominent blue marker (lg size).
 * Comparables: smaller muted markers (sm size, gray-purple).
 *
 * Properties missing lat/lng are silently skipped.
 */
export function buildPropertyLayers(
  subject: PropertyData,
  comparables: ComparableProperty[],
  subjectRent: number = 0,
  selectedZpid: string | null = null,
): MapLayer[] {
  const layers: MapLayer[] = [];

  // Comparable properties layer (rendered first → behind the subject)
  const compMarkers: MapMarker[] = comparables
    .filter(c => c.latitude && c.longitude)
    .map(comp => {
      const isSelected = comp.zpid === selectedZpid;
      return {
        lat: comp.latitude!,
        lng: comp.longitude!,
        color: isSelected ? '#f59e0b' : '#7c3aed',   // amber if selected, vivid purple otherwise
        size: (isSelected ? 'lg' : 'md') as 'sm' | 'md' | 'lg',
        shape: 'circle' as const,
        label: comp.address,
        popupContent: <CompPopup comp={comp} /> as ReactNode,
      };
    });

  if (compMarkers.length > 0) {
    layers.push({
      id: 'comparables',
      name: 'Comparable Properties',
      markers: compMarkers,
      visible: true,
    });
  }

  // Subject property layer (rendered last → on top)
  if (subject.latitude && subject.longitude) {
    layers.push({
      id: 'subject',
      name: 'Subject Property',
      markers: [
        {
          lat: subject.latitude,
          lng: subject.longitude,
          color: '#2563eb',   // bright blue
          size: 'lg' as const,
          shape: 'star' as const,
          label: subject.address,
          popupContent: <SubjectPopup property={subject} rent={subjectRent} /> as ReactNode,
        },
      ],
      visible: true,
    });
  }

  return layers;
}
