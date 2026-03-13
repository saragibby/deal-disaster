import { useMemo } from 'react';
import type { PropertyAnalysis } from '@deal-platform/shared-types';
import { MapPin } from 'lucide-react';
import MapView from '../MapView.js';
import type { MapLayer } from '../MapView.js';
import { fmt, shortAddr } from '../../utils/comparisonUtils.js';
import { PROPERTY_COLORS } from '../ComparisonSelector.js';

interface Props {
  properties: PropertyAnalysis[];
}

export default function ComparisonMap({ properties }: Props) {
  const mapLayers: MapLayer[] = useMemo(() => [{
    id: 'comparison',
    name: 'Compared Properties',
    markers: properties
      .filter(p => p.property_data.latitude && p.property_data.longitude)
      .map((p, i) => ({
        lat: p.property_data.latitude!,
        lng: p.property_data.longitude!,
        color: PROPERTY_COLORS[i],
        size: 'lg' as const,
        shape: 'star' as const,
        label: shortAddr(p.property_data.address),
        popupContent: (
          <div>
            <strong>{p.property_data.address}</strong>
            <br />{fmt(p.property_data.price)} · {p.property_data.bedrooms}bd/{p.property_data.bathrooms}ba
          </div>
        ),
      })),
  }], [properties]);

  if (mapLayers[0].markers.length === 0) return null;

  return (
    <div className="results__card comparison-dashboard__map-card">
      <h3><MapPin size={18} /> Property Locations</h3>
      <MapView layers={mapLayers} height={400} />
    </div>
  );
}
