/**
 * Geocoding Service
 *
 * Converts street addresses to lat/lng coordinates with a PostgreSQL-backed
 * cache so each unique address is geocoded at most once.
 *
 * Provider priority:
 *   1. DB cache (instant, free)
 *   2. Google Geocoding API (if GOOGLE_GEOCODING_API_KEY is set and working)
 *   3. OpenStreetMap Nominatim fallback (free, no key, 1 req/sec rate limit)
 *
 * Cache table: geocoding_cache  (see migrations/add_geocoding_cache.sql)
 */

import { pool } from '../db/pool.js';

// ---------- configuration ----------

function getApiKey(): string {
  return process.env.GOOGLE_GEOCODING_API_KEY || '';
}

const GOOGLE_GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const CENSUS_GEOCODE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// ---------- address normalization ----------

/**
 * Build a deterministic cache key from address components.
 * Uppercased, trimmed, single-spaced, comma-separated.
 *
 *   "123 Main St", "Springfield", "IL", "62704"
 *   → "123 MAIN ST, SPRINGFIELD, IL 62704"
 */
export function normalizeAddressKey(
  address: string,
  city: string,
  state: string,
  zip: string,
): string {
  const parts = [address, city, `${state} ${zip}`]
    .map(p => p.trim().replace(/\s+/g, ' ').toUpperCase())
    .filter(Boolean);
  return parts.join(', ');
}

// ---------- types ----------

export interface Geocoordinates {
  lat: number;
  lng: number;
}

interface AddressInput {
  address: string;
  city: string;
  state: string;
  zip: string;
}

// ---------- single geocode ----------

/**
 * Geocode a single address. Returns cached result if available,
 * otherwise calls Google Geocoding API and caches the result.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<Geocoordinates | null> {
  const key = normalizeAddressKey(address, city, state, zip);
  if (!key) return null;

  // 1. Check DB cache
  try {
    const cached = await pool.query(
      'SELECT latitude, longitude FROM geocoding_cache WHERE address_key = $1',
      [key],
    );
    if (cached.rows.length > 0) {
      return { lat: cached.rows[0].latitude, lng: cached.rows[0].longitude };
    }
  } catch (err: any) {
    // Cache table might not exist yet — log and continue to API
    console.warn('[geocoding] Cache lookup failed:', err.message);
  }

  // 2. Try providers in order: Google → Census → Nominatim
  const fullAddress = `${address}, ${city}, ${state} ${zip}`;
  let coords: Geocoordinates | null = null;
  let provider = '';

  // 2a. Google (fastest, best quality — requires working API key)
  coords = await geocodeViaGoogle(fullAddress);
  if (coords) provider = 'google';

  // 2b. US Census Geocoder (free, no key, great US coverage, no rate limit)
  if (!coords) {
    coords = await geocodeViaCensus(fullAddress);
    if (coords) provider = 'census';
  }

  // 2c. Nominatim fallback (free, no key, 1 req/sec, incomplete US coverage)
  if (!coords) {
    coords = await geocodeViaNominatim(fullAddress);
    if (coords) provider = 'nominatim';
  }

  if (!coords) {
    console.warn(`[geocoding] All providers failed for "${fullAddress}"`);
    return null;
  }

  // 3. Store in cache
  try {
    await pool.query(
      `INSERT INTO geocoding_cache (address_key, latitude, longitude, formatted_address, provider)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (address_key) DO NOTHING`,
      [key, coords.lat, coords.lng, fullAddress, provider],
    );
  } catch (err: any) {
    console.warn('[geocoding] Failed to cache result:', err.message);
  }

  return coords;
}

// ---------- provider: Google ----------

async function geocodeViaGoogle(fullAddress: string): Promise<Geocoordinates | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json() as any;
    if (data.status !== 'OK' || !data.results?.length) {
      if (data.status === 'REQUEST_DENIED') {
        console.warn('[geocoding:google] REQUEST_DENIED — falling back to Nominatim.', data.error_message || '');
      }
      return null;
    }

    const location = data.results[0].geometry?.location;
    if (!location?.lat || !location?.lng) return null;
    return { lat: location.lat, lng: location.lng };
  } catch {
    return null;
  }
}

// ---------- provider: Nominatim (OSM) ----------

/** Rate limiter: 1 request per second for Nominatim's usage policy */
let lastNominatimCall = 0;

async function geocodeViaNominatim(fullAddress: string): Promise<Geocoordinates | null> {
  try {
    // Respect 1 req/sec rate limit
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - lastNominatimCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastNominatimCall = Date.now();

    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(fullAddress)}&format=json&limit=1&countrycodes=us`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DealPlatform-PropertyAnalyzer/1.0' },
    });

    if (!res.ok) {
      console.warn(`[geocoding:nominatim] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as any[];
    if (!data?.length || !data[0].lat || !data[0].lon) {
      console.warn(`[geocoding:nominatim] No results for "${fullAddress}"`);
      return null;
    }

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err: any) {
    console.warn('[geocoding:nominatim] Failed:', err.message);
    return null;
  }
}

// ---------- provider: US Census Geocoder ----------

async function geocodeViaCensus(fullAddress: string): Promise<Geocoordinates | null> {
  try {
    const url = `${CENSUS_GEOCODE_URL}?address=${encodeURIComponent(fullAddress)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn(`[geocoding:census] HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const matches = data?.result?.addressMatches;

    if (!matches?.length) {
      console.warn(`[geocoding:census] No results for "${fullAddress}"`);
      return null;
    }

    const coords = matches[0].coordinates;
    if (!coords?.x || !coords?.y) return null;

    // Census returns x=longitude, y=latitude
    return { lat: coords.y, lng: coords.x };
  } catch (err: any) {
    console.warn('[geocoding:census] Failed:', err.message);
    return null;
  }
}

// ---------- batch geocode ----------

/**
 * Geocode multiple addresses efficiently:
 *   1. Batch-query the DB for all address keys at once
 *   2. Only call the Google API for cache misses
 *   3. Bulk-insert new results
 *
 * Returns a Map keyed by normalized address key → coordinates.
 */
export async function geocodeMultiple(
  items: AddressInput[],
): Promise<Map<string, Geocoordinates>> {
  const result = new Map<string, Geocoordinates>();
  if (items.length === 0) return result;

  // Build normalized keys
  const keyed = items.map(item => ({
    ...item,
    key: normalizeAddressKey(item.address, item.city, item.state, item.zip),
  }));

  // Deduplicate
  const uniqueKeys = [...new Set(keyed.map(k => k.key).filter(Boolean))];
  if (uniqueKeys.length === 0) return result;

  // 1. Batch DB lookup
  try {
    const placeholders = uniqueKeys.map((_, i) => `$${i + 1}`).join(', ');
    const cached = await pool.query(
      `SELECT address_key, latitude, longitude FROM geocoding_cache WHERE address_key IN (${placeholders})`,
      uniqueKeys,
    );
    for (const row of cached.rows) {
      result.set(row.address_key, { lat: row.latitude, lng: row.longitude });
    }
  } catch (err: any) {
    console.warn('[geocoding] Batch cache lookup failed:', err.message);
  }

  // 2. Identify misses
  const misses = keyed.filter(k => k.key && !result.has(k.key));
  if (misses.length === 0) return result;

  console.log(`[geocoding] ${result.size} cache hits, ${misses.length} misses — geocoding...`);

  // 3. Geocode misses with concurrency limit (Google → Census → Nominatim)
  const CONCURRENCY = 5;
  const toInsert: Array<{ key: string; lat: number; lng: number; formatted: string; provider: string }> = [];

  for (let i = 0; i < misses.length; i += CONCURRENCY) {
    const batch = misses.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (item) => {
      try {
        const fullAddress = `${item.address}, ${item.city}, ${item.state} ${item.zip}`;

        // Try Google → Census → Nominatim
        let coords = await geocodeViaGoogle(fullAddress);
        let provider = 'google';
        if (!coords) {
          coords = await geocodeViaCensus(fullAddress);
          provider = 'census';
        }
        if (!coords) {
          coords = await geocodeViaNominatim(fullAddress);
          provider = 'nominatim';
        }

        if (!coords) return;

        result.set(item.key, coords);
        toInsert.push({
          key: item.key,
          lat: coords.lat,
          lng: coords.lng,
          formatted: fullAddress,
          provider,
        });
      } catch (err: any) {
        console.warn(`[geocoding] Failed for "${item.address}":`, err.message);
      }
    });

    await Promise.all(promises);
  }

  console.log(`[geocoding] Resolved ${toInsert.length}/${misses.length} addresses`);

  // 4. Bulk insert new cache entries
  if (toInsert.length > 0) {
    try {
      // Build a multi-row INSERT
      const values: any[] = [];
      const placeholders = toInsert.map((entry, i) => {
        const base = i * 5;
        values.push(entry.key, entry.lat, entry.lng, entry.formatted, entry.provider);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });

      await pool.query(
        `INSERT INTO geocoding_cache (address_key, latitude, longitude, formatted_address, provider)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (address_key) DO NOTHING`,
        values,
      );
    } catch (err: any) {
      console.warn('[geocoding] Bulk cache insert failed:', err.message);
    }
  }

  return result;
}