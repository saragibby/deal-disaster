import { pool } from '../db/pool.js';
import type { CoordinateProvenance } from '@deal-platform/shared-types';
import { createPostgresGeocodingCache, type GeocodingProvider, type GeocodingCacheWrite } from './geocodingCache.js';
import { createProviderFetch, recordProviderCache, recordProviderFallback } from './providerUsageService.js';
const geocodingFetch = {
  google: createProviderFetch('google'),
  census: createProviderFetch('census'),
  nominatim: createProviderFetch('nominatim'),
};

export interface Geocoordinates extends CoordinateProvenance {
  lat: number;
  lng: number;
}

export interface AddressInput extends CoordinateProvenance {
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
}

type Provider = GeocodingProvider;
type CacheWrite = GeocodingCacheWrite;

export interface GeocodingAccounting {
  inputCount: number;
  reusedCoordinates: number;
  cacheHits: number;
  inFlightHits: number;
  providerAttempts: Record<Provider, number>;
  resolved: number;
  unresolved: number;
}

interface Dependencies {
  lookup(keys: string[]): Promise<Map<string, Geocoordinates>>;
  store(entries: CacheWrite[]): Promise<void>;
  fetch: typeof fetch;
  googleApiKey(): string;
  providers?: readonly Provider[];
  report(accounting: GeocodingAccounting): void;
}

export function hasValidCoordinates(
  value: { latitude?: unknown; longitude?: unknown },
): value is { latitude: number; longitude: number } {
  return typeof value.latitude === 'number' && Number.isFinite(value.latitude) &&
    value.latitude >= -90 && value.latitude <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) &&
    value.longitude >= -180 && value.longitude <= 180;
}

export function normalizeAddressKey(address: string, city: string, state: string, zip: string): string {
  return [address, city, `${state} ${zip}`]
    .map(part => part.trim().replace(/\s+/g, ' ').toUpperCase())
    .filter(Boolean)
    .join(', ');
}

function parseCoordinates(lat: unknown, lng: unknown): Geocoordinates | null {
  const value = { latitude: lat, longitude: lng };
  return hasValidCoordinates(value)
    ? { lat: value.latitude, lng: value.longitude }
    : null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? record(value[0]) : undefined;
}

// No addresses, URLs, provider messages, or exception messages enter these logs.
function warn(operation: string, provider?: Provider, status?: number): void {
  console.warn('[geocoding]', { operation, provider, status });
}

export function createGeocodingService(deps: Dependencies) {
  const providers: readonly Provider[] = deps.providers ?? ['census'];
  const allowsGoogle = providers.includes('google');
  const reusable = (item: AddressInput): item is AddressInput & { latitude: number; longitude: number } =>
    hasValidCoordinates(item) && (allowsGoogle || item.coordinateSource !== 'google');
  const inFlight = new Map<string, Promise<Geocoordinates | null>>();
  let nextNominatimStart = 0;

  async function request(
    provider: Provider,
    address: string,
    accounting: GeocodingAccounting,
  ): Promise<Geocoordinates | null> {
    const apiKey = provider === 'google' ? deps.googleApiKey() : '';
    if (provider === 'google' && !apiKey) return null;
    if (provider === 'nominatim') {
      const start = Math.max(Date.now(), nextNominatimStart);
      nextNominatimStart = start + 1000;
      const wait = start - Date.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    }

    const url = provider === 'google'
      ? `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address, key: apiKey })}`
      : provider === 'census'
        ? `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({
          address, benchmark: 'Public_AR_Current', format: 'json',
        })}`
        : `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
          q: address, format: 'json', limit: '1', countrycodes: 'us',
        })}`;

    accounting.providerAttempts[provider]++;
    try {
      const response = await deps.fetch(url, {
        signal: AbortSignal.timeout(15000),
        ...(provider === 'nominatim'
          ? { headers: { 'User-Agent': 'DealPlatform-PropertyAnalyzer/1.0' } }
          : {}),
      });
      if (!response.ok) {
        warn('http-failure', provider, response.status);
        return null;
      }
      const data: unknown = await response.json();
      if (provider === 'google') {
        const payload = record(data);
        if (payload?.status !== 'OK') {
          warn('no-valid-result', provider);
          return null;
        }
        const first = firstRecord(payload.results);
        const location = record(record(first?.geometry)?.location);
        const coords = parseCoordinates(location?.lat, location?.lng);
        if (!coords) warn('no-valid-result', provider);
        return coords ? { ...coords, coordinateSource: provider, coordinatesObservedAt: new Date().toISOString() } : null;
      }
      if (provider === 'census') {
        const first = firstRecord(record(record(data)?.result)?.addressMatches);
        const location = record(first?.coordinates);
        const coords = parseCoordinates(location?.y, location?.x);
        if (!coords) warn('no-valid-result', provider);
        return coords ? { ...coords, coordinateSource: provider, coordinatesObservedAt: new Date().toISOString() } : null;
      }
      const first = firstRecord(data);
      const coords = typeof first?.lat === 'string' && first.lat.trim() &&
        typeof first.lon === 'string' && first.lon.trim()
        ? parseCoordinates(Number(first.lat), Number(first.lon))
        : null;
      if (!coords) warn('no-valid-result', provider);
      return coords ? { ...coords, coordinateSource: provider, coordinatesObservedAt: new Date().toISOString() } : null;
    } catch {
      warn('request-failure', provider);
      return null;
    }
  }

  async function geocodeMultiple(items: AddressInput[]): Promise<Map<string, Geocoordinates>> {
    const result = new Map<string, Geocoordinates>();
    const accounting: GeocodingAccounting = {
      inputCount: items.length, reusedCoordinates: 0, cacheHits: 0, inFlightHits: 0,
      providerAttempts: { google: 0, census: 0, nominatim: 0 },
      resolved: 0, unresolved: 0,
    };
    const unique = new Map<string, AddressInput>();
    for (const item of items) {
      const key = normalizeAddressKey(item.address, item.city, item.state, item.zip);
      if (reusable(item)) {
        result.set(key, {
          lat: item.latitude, lng: item.longitude,
          ...(item.coordinateSource ? { coordinateSource: item.coordinateSource } : {}),
          ...(item.coordinatesObservedAt ? { coordinatesObservedAt: item.coordinatesObservedAt } : {}),
        });
        accounting.reusedCoordinates++;
      }
      if (!item.address.trim()) {
        if (!hasValidCoordinates(item)) warn('missing-street-address');
        continue;
      }
      unique.set(key, item);
    }

    const waiting = new Map<string, Promise<Geocoordinates | null>>();
    const owned: Array<{
      key: string;
      item: AddressInput;
      resolve(coords: Geocoordinates | null): void;
    }> = [];
    for (const [key, item] of unique) {
      if (result.has(key)) continue;
      let pending = inFlight.get(key);
      if (pending) {
        accounting.inFlightHits++;
      } else {
        // Reserve before the first await so overlapping batches share cache reads and requests.
        pending = new Promise(resolve => owned.push({ key, item, resolve }));
        inFlight.set(key, pending);
      }
      waiting.set(key, pending);
    }

    const writes: CacheWrite[] = [];
    const outcomes = new Map<string, Geocoordinates | null>();
    try {
      let cached = new Map<string, Geocoordinates>();
      if (owned.length > 0) {
        try {
          cached = await deps.lookup(owned.map(entry => entry.key));
        } catch {
          warn('cache-lookup-failure');
          recordProviderCache('geocoding', 'coordinates', 'postgres', 'error');
        }
      }
      for (let i = 0; i < owned.length; i += 5) {
        await Promise.all(owned.slice(i, i + 5).map(async ({ key, item }) => {
          const hit = cached.get(key);
          if (hit && (allowsGoogle || hit.coordinateSource !== 'google') && parseCoordinates(hit.lat, hit.lng)) {
            recordProviderCache('geocoding', 'coordinates', 'postgres', 'hit');
            accounting.cacheHits++;
            outcomes.set(key, hit);
            return;
          }
          recordProviderCache('geocoding', 'coordinates', 'postgres', 'miss');
          const address = `${item.address}, ${item.city}, ${item.state} ${item.zip}`;
          for (const [index, provider] of providers.entries()) {
            if (index > 0) recordProviderFallback(provider, 'geocoding', 'no-usable-data');
            const coords = await request(provider, address, accounting);
            if (coords) {
              outcomes.set(key, coords);
              writes.push({ key, coords, address, provider });
              return;
            }
          }
          outcomes.set(key, null);
          warn('all-providers-failed');
        }));
      }
      if (writes.length > 0) {
        try {
          await deps.store(writes);
        } catch {
          warn('cache-store-failure');
          recordProviderCache('geocoding', 'coordinates', 'postgres', 'error');
        }
      }
    } finally {
      for (const entry of owned) {
        entry.resolve(outcomes.get(entry.key) ?? null);
        inFlight.delete(entry.key);
      }
    }
    await Promise.all([...waiting].map(async ([key, pending]) => {
      const coords = await pending;
      if (coords) result.set(key, coords);
    }));
    accounting.resolved = result.size;
    recordProviderCache('geocoding', 'coordinates', 'coordinates', 'hit', accounting.reusedCoordinates);
    recordProviderCache('geocoding', 'coordinates', 'in-flight', 'hit', accounting.inFlightHits);
    accounting.unresolved = new Set(items
      .map(item => normalizeAddressKey(item.address, item.city, item.state, item.zip))
      .filter(key => !result.has(key))).size;
    deps.report(accounting);
    return result;
  }

  function createSession() {
    const completed = new Map<string, Geocoordinates | null>();
    return {
      async geocodeProperties(items: AddressInput[]): Promise<void> {
        for (const item of items) {
          if (!allowsGoogle && item.coordinateSource === 'google') {
            delete item.latitude;
            delete item.longitude;
            delete item.coordinateSource;
            delete item.coordinatesObservedAt;
            warn('incompatible-coordinate-source', 'google');
          }
        }
        const located = items.filter((item): item is AddressInput & {
          latitude: number; longitude: number;
        } => hasValidCoordinates(item) && item.address.trim().length > 0);
        for (const item of located) {
          completed.set(normalizeAddressKey(item.address, item.city, item.state, item.zip), {
            lat: item.latitude, lng: item.longitude,
            ...(item.coordinateSource ? { coordinateSource: item.coordinateSource } : {}),
            ...(item.coordinatesObservedAt ? { coordinatesObservedAt: item.coordinatesObservedAt } : {}),
          });
        }
        const unresolved = items.filter(item => !hasValidCoordinates(item));
        const missing = unresolved.filter(item =>
          !completed.has(normalizeAddressKey(item.address, item.city, item.state, item.zip)));
        recordProviderCache('geocoding', 'coordinates', 'session', 'hit', unresolved.length - missing.length);
        const results = await geocodeMultiple([...located, ...missing]);
        for (const item of missing) {
          const key = normalizeAddressKey(item.address, item.city, item.state, item.zip);
          completed.set(key, results.get(key) ?? null);
        }
        for (const item of unresolved) {
          const coords = completed.get(normalizeAddressKey(item.address, item.city, item.state, item.zip));
          if (coords) {
            item.latitude = coords.lat;
            item.longitude = coords.lng;
            if (coords.coordinateSource) item.coordinateSource = coords.coordinateSource;
            if (coords.coordinatesObservedAt) item.coordinatesObservedAt = coords.coordinatesObservedAt;
          }
        }
      },
    };
  }

  return {
    geocodeMultiple,
    createSession,
    async geocodeAddress(address: string, city: string, state: string, zip: string) {
      const result = await geocodeMultiple([{ address, city, state, zip }]);
      return result.get(normalizeAddressKey(address, city, state, zip)) ?? null;
    },
  };
}

const service = createGeocodingService({
  ...createPostgresGeocodingCache(pool),
  providers: ['census'],
  fetch: (input, init) => {
    const host = new URL(String(input)).hostname;
    return geocodingFetch[host === 'maps.googleapis.com' ? 'google'
      : host === 'geocoding.geo.census.gov' ? 'census' : 'nominatim'](input, init);
  },
  googleApiKey: () => '',
  report: accounting => console.info('[geocoding:usage]', accounting),
});

export const geocodeAddress = service.geocodeAddress;
export const geocodeMultiple = service.geocodeMultiple;
export const createGeocodingSession = service.createSession;
