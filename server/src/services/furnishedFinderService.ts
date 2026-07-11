/**
 * Furnished Finder Service
 *
 * Fetches real mid-term-rental (MTR) furnished comps from Furnished Finder's
 * public GraphQL endpoint and reduces them to a market rate the MTR estimator
 * can calibrate against.
 *
 * ⚠️ This is an UNDOCUMENTED, private/internal API (the one Furnished Finder's
 * own web app calls). There is no published contract or ToS grant, no SLA, and
 * the schema can change without notice. Treat it as strictly best-effort:
 *   • every call is wrapped in try/catch and time-boxed,
 *   • results are cached aggressively (24h),
 *   • on ANY failure we return null so callers fall back to the algorithm.
 *
 * MONITORING TODO: when observability is built out, add a canary that runs a
 * minimal `search { results { rentAmount { amount } } }` query on a schedule and
 * alerts on errors / empty results / shape drift, so a silent schema change is
 * caught before MTR data goes stale.
 *
 * Verified schema (2026-06):
 *   query { search(location: { viewport: { min: {latitude,longitude},
 *                                          max: {latitude,longitude} } },
 *                  searchSessionId: "<uuid>") {
 *     results { listingId bedroomCount bathroomCount propertyType
 *               rentAmount { amount currency }
 *               approxLocation { latitude longitude } } } }
 *   `rentAmount.amount` is a STRING monthly rate in USD (e.g. "1950.00").
 *   The geo-only `search` field needs ONLY a viewport — no regionId/auth.
 */

import { randomUUID } from 'node:crypto';
import type { PropertyData, MTRComp } from '@deal-platform/shared-types';

// ---------- configuration ----------

const FF_ENDPOINT = 'https://api-public.prod.furnishedfinder.com/graphql';
const REQUEST_TIMEOUT_MS = 8000;

/** Bedroom window: comps within ±1 bedroom of the subject are "comparable". */
const BEDROOM_TOLERANCE = 1;
/** Minimum comparable comps required to trust the market rate. */
const MIN_COMPARABLE = 3;
/** Max comps retained for display (keeps the stored analysis JSON small). */
const MAX_DISPLAY_COMPS = 15;
/** Primary and fallback search radii (miles). Thin markets get a wider box. */
const PRIMARY_RADIUS_MILES = 6;
const WIDE_RADIUS_MILES = 15;

const SEARCH_QUERY =
  'query FFGeoSearch($location: SearchRequestLocation!, $sid: String!) {' +
  '  search(location: $location, searchSessionId: $sid) {' +
  '    results {' +
  '      listingId bedroomCount bathroomCount propertyType' +
  '      rentAmount { amount currency }' +
  '      approxLocation { latitude longitude }' +
  '    }' +
  '  }' +
  '}';

// ---------- cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<MTRMarketData | null>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — furnished inventory moves slowly

function getCached(key: string): { hit: boolean; value: MTRMarketData | null } {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return { hit: true, value: entry.data };
  cache.delete(key);
  return { hit: false, value: null };
}

function setCache(key: string, data: MTRMarketData | null): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- types ----------

/** Reduced, provider-agnostic market signal handed to the MTR estimator. */
export interface MTRMarketData {
  /** Median (p50) furnished monthly rate of comparable comps, USD. */
  monthlyRate: number;
  /** 25th percentile furnished monthly rate, USD. */
  low: number;
  /** 75th percentile furnished monthly rate, USD. */
  high: number;
  /** Number of bedroom-matched comps used to derive the rate. */
  sampleSize: number;
  /** Total furnished listings returned in the searched area. */
  totalListings: number;
  /** Search radius (miles) the comps were pulled from. */
  radiusMiles: number;
  /** The comparable furnished listings (capped for display). */
  comps: MTRComp[];
}

interface FFListing {
  listingId: string;
  bedroomCount: number | null;
  bathroomCount: number | null;
  propertyType: string | null;
  rentAmount: { amount: string | null; currency: string | null } | null;
  approxLocation: { latitude: number; longitude: number } | null;
}

// ---------- geo helpers ----------

/** Build a lat/lng bounding box of roughly `miles` half-width around a point. */
function viewportFromRadius(lat: number, lng: number, miles: number) {
  const dLat = miles / 69; // ~69 miles per degree of latitude
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = miles / (69 * (Math.abs(cos) < 0.01 ? 0.01 : cos));
  return {
    viewport: {
      min: { latitude: lat - dLat, longitude: lng - Math.abs(dLng) },
      max: { latitude: lat + dLat, longitude: lng + Math.abs(dLng) },
    },
  };
}

// ---------- stats helpers ----------

/** Nearest-rank percentile (p in 0..1) of an ascending-sortable number array. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil(p * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return sortedAsc[idx];
}

function parseRent(listing: FFListing): number | null {
  const raw = listing.rentAmount?.amount;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

// ---------- network ----------

async function fetchListings(location: { viewport: unknown }): Promise<FFListing[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(FF_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'ff-origin': 'FF-Web',
      },
      body: JSON.stringify({
        operationName: 'FFGeoSearch',
        query: SEARCH_QUERY,
        variables: { location, sid: randomUUID() },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[FurnishedFinder] Search failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as {
      data?: { search?: { results?: FFListing[] } };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      console.warn('[FurnishedFinder] GraphQL error:', json.errors[0].message);
      return null;
    }

    return json.data?.search?.results ?? [];
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[FurnishedFinder] Search timed out');
    } else {
      console.warn('[FurnishedFinder] Search error:', err?.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reduce raw listings to a market signal for a subject with `bedrooms`. */
function reduceToMarketData(
  listings: FFListing[],
  bedrooms: number,
  radiusMiles: number,
): MTRMarketData | null {
  const priced = listings
    .map((l) => ({ listing: l, rent: parseRent(l) }))
    .filter((l): l is { listing: FFListing; rent: number } => l.rent != null);

  if (priced.length === 0) return null;

  const comparable = priced.filter(
    (l) =>
      l.listing.bedroomCount != null &&
      Math.abs(l.listing.bedroomCount - bedrooms) <= BEDROOM_TOLERANCE,
  );

  if (comparable.length < MIN_COMPARABLE) return null;

  const rents = comparable.map((l) => l.rent).sort((a, b) => a - b);

  const comps: MTRComp[] = comparable
    .map((l) => ({
      bedrooms: l.listing.bedroomCount,
      bathrooms: l.listing.bathroomCount,
      propertyType: l.listing.propertyType,
      monthlyRate: l.rent,
    }))
    .sort((a, b) => a.monthlyRate - b.monthlyRate)
    .slice(0, MAX_DISPLAY_COMPS);

  return {
    monthlyRate: percentile(rents, 0.5),
    low: percentile(rents, 0.25),
    high: percentile(rents, 0.75),
    sampleSize: comparable.length,
    totalListings: priced.length,
    radiusMiles,
    comps,
  };
}

// ---------- public API ----------

/**
 * Is the Furnished Finder MTR provider enabled? (Set FF_MTR_DISABLED=true to
 * turn it off without a code change — e.g. if the endpoint starts misbehaving.)
 */
export function isEnabled(): boolean {
  return process.env.FF_MTR_DISABLED !== 'true';
}

/**
 * Fetch a real furnished-rental market rate for the area around a property.
 *
 * Searches a ~6-mile box first; if too few comparable comps are found, widens
 * to ~15 miles once. Returns null (never throws) when disabled, when the
 * property has no coordinates, on any API failure, or when the comparable
 * sample is too small to trust — callers should fall back to the algorithm.
 */
export async function getMtrMarketData(property: PropertyData): Promise<MTRMarketData | null> {
  if (!isEnabled()) return null;

  const { latitude, longitude, bedrooms } = property;
  if (latitude == null || longitude == null) return null;

  const beds = Number.isFinite(bedrooms) ? (bedrooms as number) : 2;
  const cacheKey = `ff:mtr:${latitude.toFixed(3)}:${longitude.toFixed(3)}:${beds}`;
  const cached = getCached(cacheKey);
  if (cached.hit) return cached.value;

  // Primary (~6mi) box.
  let listings = await fetchListings(viewportFromRadius(latitude, longitude, PRIMARY_RADIUS_MILES));
  let market = listings ? reduceToMarketData(listings, beds, PRIMARY_RADIUS_MILES) : null;

  // Thin market? Widen the box once (~15mi).
  if (!market) {
    listings = await fetchListings(viewportFromRadius(latitude, longitude, WIDE_RADIUS_MILES));
    market = listings ? reduceToMarketData(listings, beds, WIDE_RADIUS_MILES) : null;
  }

  setCache(cacheKey, market);
  return market;
}
