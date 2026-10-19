import { hasValidCoordinates } from './geocodingService.js';
import { createProviderFetch } from './providerUsageService.js';

const RADIUS_METERS = 16000;
export const GOOGLE_PLACES_FIELD_MASK =
  'places.id,places.displayName,places.location,places.types,places.attributions';

const searches = [
  { category: 'hospital', type: 'hospital' },
  { category: 'military', query: 'military base' },
  { category: 'university', type: 'university' },
  { category: 'corporate', query: 'corporate office park' },
  { category: 'government', query: 'government building' },
] as const;

export interface GooglePlaceObservation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  types: string[];
  attributions: { provider: string; providerUri?: string }[];
}

export interface GooglePlacesCategory {
  category: typeof searches[number]['category'];
  operation: 'places-nearby-new' | 'places-text-new';
  status: 'ok' | 'unavailable';
  places: GooglePlaceObservation[];
}

export interface GooglePlacesResult {
  status: 'complete' | 'partial' | 'unavailable' | 'unconfigured';
  categories: GooglePlacesCategory[];
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function safeUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parsePlace(value: unknown): GooglePlaceObservation | null {
  const place = object(value);
  if (!place) return null;
  const display = object(place.displayName);
  const location = object(place.location);
  if (typeof place.id !== 'string' || !place.id || typeof display?.text !== 'string' ||
    !display.text || !location || !hasValidCoordinates(location) ||
    !Array.isArray(place.types) || !place.types.every(type => typeof type === 'string')) return null;
  const attributions: GooglePlaceObservation['attributions'] = [];
  if (place.attributions !== undefined) {
    if (!Array.isArray(place.attributions)) return null;
    for (const value of place.attributions) {
      const attribution = object(value);
      if (!attribution || typeof attribution.provider !== 'string' ||
        (attribution.providerUri !== undefined && !safeUri(attribution.providerUri))) return null;
      attributions.push({
        provider: attribution.provider,
        ...(typeof attribution.providerUri === 'string' ? { providerUri: attribution.providerUri } : {}),
      });
    }
  }
  return {
    id: place.id, name: display.text,
    latitude: location.latitude, longitude: location.longitude,
    types: place.types, attributions,
  };
}

function withinRadius(lat: number, lng: number, place: GooglePlaceObservation): boolean {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(place.latitude - lat) / 2) ** 2 +
    Math.cos(radians(lat)) * Math.cos(radians(place.latitude)) *
    Math.sin(radians(place.longitude - lng) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, a))) <= RADIUS_METERS;
}

// Transport preparation only: production scoring/storage/display integration is policy-gated.
export function createGooglePlacesService(deps: {
  apiKey(): string;
  fetch?: typeof fetch;
  report?: (operation: GooglePlacesCategory['operation'], reason: 'http' | 'payload' | 'network', status?: number) => void;
}) {
  const transport = deps.fetch ?? createProviderFetch('google');
  const report = deps.report ?? ((operation, reason, status) =>
    console.warn('[google:places]', { operation, reason, status }));
  const inFlight = new Map<string, Promise<GooglePlacesResult>>();

  async function search(lat: number, lng: number, key: string): Promise<GooglePlacesResult> {
    const center = { latitude: lat, longitude: lng };
    const categories = await Promise.all(searches.map(async search => {
      const nearby = 'type' in search;
      const operation: GooglePlacesCategory['operation'] = nearby ? 'places-nearby-new' : 'places-text-new';
      const unavailable: GooglePlacesCategory = {
        category: search.category, operation, status: 'unavailable', places: [],
      };
      const body = nearby ? {
        includedTypes: [search.type], maxResultCount: 20, rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center, radius: RADIUS_METERS } },
      } : {
        textQuery: search.query, pageSize: 20,
        locationBias: { circle: { center, radius: RADIUS_METERS } },
      };
      try {
        const response = await transport(
          `https://places.googleapis.com/v1/places:${nearby ? 'searchNearby' : 'searchText'}`, {
            method: 'POST', signal: AbortSignal.timeout(15000),
            headers: {
              'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
              'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
            },
            body: JSON.stringify(body),
          },
        );
        if (!response.ok) {
          report(operation, 'http', response.status);
          return unavailable;
        }
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          report(operation, 'payload');
          return unavailable;
        }
        const data = object(payload);
        if (!data || data.error !== undefined ||
          (data.places !== undefined && !Array.isArray(data.places))) {
          report(operation, 'payload');
          return unavailable;
        }
        const raw: unknown[] = Array.isArray(data.places) ? data.places : [];
        const places = raw.map(parsePlace);
        if (places.some(place => place === null)) {
          report(operation, 'payload');
          return unavailable;
        }
        const unique = new Map<string, GooglePlaceObservation>();
        for (const place of places) {
          // Text Search locationBias is not a hard restriction.
          if (place && withinRadius(lat, lng, place)) unique.set(place.id, place);
        }
        return { category: search.category, operation, status: 'ok', places: [...unique.values()] } satisfies GooglePlacesCategory;
      } catch {
        report(operation, 'network');
        return unavailable;
      }
    }));
    const successes = categories.filter(category => category.status === 'ok').length;
    return {
      status: successes === searches.length ? 'complete' : successes === 0 ? 'unavailable' : 'partial',
      categories,
    };
  }

  return {
    async search(lat: number, lng: number): Promise<GooglePlacesResult> {
      if (!hasValidCoordinates({ latitude: lat, longitude: lng })) throw new RangeError('Invalid Places search coordinates');
      const key = deps.apiKey();
      if (!key) return { status: 'unconfigured', categories: [] };
      const identity = JSON.stringify([lat, lng, key]);
      let pending = inFlight.get(identity);
      if (!pending) {
        pending = search(lat, lng, key).finally(() => inFlight.delete(identity));
        inFlight.set(identity, pending);
      }
      return structuredClone(await pending);
    },
  };
}
