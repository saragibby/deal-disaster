/**
 * MapView — Extensible map component built on Leaflet (react-leaflet).
 *
 * Renders one or more "layers", each containing a list of colored markers.
 * This layer-based architecture makes it straightforward to add future
 * overlays (flood zones, school districts, transit, crime, etc.)
 * without modifying MapView internals.
 *
 * Usage:
 *   <MapView layers={[subjectLayer, compsLayer]} height={420} />
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ---------- public types ----------

export interface MapMarker {
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
  /** CSS color string for the marker dot (e.g. '#2563eb', 'gray') */
  color: string;
  /** Optional short label shown next to the marker */
  label?: string;
  /** Rich content rendered inside the popup on click */
  popupContent?: ReactNode;
  /** Marker size: sm = 10px, md = 14px, lg = 20px */
  size?: 'sm' | 'md' | 'lg';
  /** Marker shape: circle (default) or star */
  shape?: 'circle' | 'star';
}

export interface MapLayer {
  /** Unique identifier for this layer */
  id: string;
  /** Human-readable name (for future layer toggle UI) */
  name: string;
  /** Array of markers to render */
  markers: MapMarker[];
  /** Whether the layer is currently visible (default true) */
  visible?: boolean;
}

interface MapViewProps {
  /** Ordered list of layers to render. Rendered bottom-to-top (last = on top). */
  layers: MapLayer[];
  /** Map container height in pixels (default 420) */
  height?: number;
}

// ---------- marker icon factory ----------

const SIZE_MAP = { sm: 12, md: 16, lg: 28 } as const;

function createStarSvg(color: string, px: number): string {
  // 5-point star SVG — scaled to px size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
  </svg>`;
}

function createMarkerIcon(color: string, size: 'sm' | 'md' | 'lg' = 'md', shape: 'circle' | 'star' = 'circle'): L.DivIcon {
  const px = SIZE_MAP[size];

  if (shape === 'star') {
    return L.divIcon({
      className: 'map-marker-icon',
      html: `<div class="map-marker-star">${createStarSvg(color, px)}</div>`,
      iconSize: [px, px],
      iconAnchor: [px / 2, px / 2],
      popupAnchor: [0, -(px / 2 + 4)],
    });
  }

  return L.divIcon({
    className: 'map-marker-icon',
    html: `<div style="
      width: ${px}px;
      height: ${px}px;
      border-radius: 50%;
      background: ${color};
      border: 2.5px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [px, px],
    iconAnchor: [px / 2, px / 2],
    popupAnchor: [0, -(px / 2 + 2)],
  });
}

// ---------- auto-fit bounds sub-component ----------

function FitBounds({ markers }: { markers: Array<{ lat: number; lng: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) return;

    if (markers.length === 1) {
      map.setView([markers[0].lat, markers[0].lng], 14);
      return;
    }

    const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [markers, map]);

  return null;
}

// ---------- MapView component ----------

export default function MapView({ layers, height = 420 }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Collect all visible markers for bounds-fitting
  const allVisibleMarkers = useMemo(() => {
    return layers
      .filter(l => l.visible !== false)
      .flatMap(l => l.markers)
      .filter(m => m.lat && m.lng);
  }, [layers]);

  if (allVisibleMarkers.length === 0) {
    return (
      <div className="map-empty">
        <p>No location data available for map display.</p>
        <p className="map-empty__hint">
          Coordinates will be available for newly analyzed properties.
        </p>
      </div>
    );
  }

  // Default center on first marker
  const center: [number, number] = [allVisibleMarkers[0].lat, allVisibleMarkers[0].lng];

  return (
    <div className="map-container" style={{ height: `${height}px` }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-sm, 12px)' }}
        ref={mapRef}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds markers={allVisibleMarkers} />

        {layers
          .filter(l => l.visible !== false)
          .map(layer =>
            layer.markers
              .filter(m => m.lat && m.lng)
              .map((marker, i) => (
                <Marker
                  key={`${layer.id}-${i}`}
                  position={[marker.lat, marker.lng]}
                  icon={createMarkerIcon(marker.color, marker.size, marker.shape)}
                >
                  {marker.popupContent && (
                    <Popup className="map-popup">
                      {marker.popupContent}
                    </Popup>
                  )}
                </Marker>
              )),
          )}
      </MapContainer>
    </div>
  );
}
