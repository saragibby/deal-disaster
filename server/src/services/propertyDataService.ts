/**
 * Property Data Service
 *
 * Reusable service for fetching and normalizing property data from the
 * private-zillow RapidAPI provider.
 *
 * Available endpoints on private-zillow.p.rapidapi.com:
 *   GET /byzpid?zpid=<zpid>
 *   GET /byaddress?propertyaddress=<full address string>
 *   GET /similar?byzpid=<zpid>   — returns ~20 similar properties
 *   GET /nearby?byzpid=<zpid>    — returns ~8 nearby properties
 *   GET /pricehistory?byzpid=<zpid> — returns price history events
 *   GET /taxinfo?byzpid=<zpid>      — returns tax assessment history
 *   GET /rental_market?search_query=<city+state> — returns rental market trends
 *   GET /housing_market?search_query=<city+state> — returns housing market overview + ZHVI
 *
 * This provider does NOT have a rental-comps endpoint. Rental comps come from
 * RentCast / Realtor.com (see rentCastService / realtyInUsService); this service
 * only supplies property details, similar/nearby sales, and market trends.
 */

import type { PropertyData, PropertySummary, ComparableProperty } from '@deal-platform/shared-types';
import { getAreaMarketData } from './areaMarketService.js';
import { hasValidCoordinates } from './geocodingService.js';
import { createProviderFetch, getProviderUsageRequestId, recordProviderCache } from './providerUsageService.js';
const fetch = createProviderFetch('zillow');

// ---------- configuration ----------

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = () => process.env.RAPIDAPI_HOST || 'private-zillow.p.rapidapi.com';

export class PropertyDataProviderError extends Error {
  readonly upstreamStatus: number;

  constructor(upstreamStatus: number, message: string) {
    super(message);
    this.name = 'PropertyDataProviderError';
    this.upstreamStatus = upstreamStatus;
  }
}

function rapidHeaders() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': RAPIDAPI_HOST(),
  };
}

async function throwProviderError(res: Response, operation: string): Promise<never> {
  await res.body?.cancel();
  console.error(`[propertyDataService] ${operation} failed with upstream status ${res.status}`);

  if (res.status === 402) {
    throw new PropertyDataProviderError(
      res.status,
      'Property lookup is temporarily unavailable because the property data provider rejected the account billing or credit status. Please contact support if this continues.',
    );
  }

  if (res.status === 429) {
    throw new PropertyDataProviderError(
      res.status,
      'Property lookup is temporarily unavailable due to provider rate limiting. Please try again shortly.',
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new PropertyDataProviderError(
      res.status,
      'Property lookup is temporarily unavailable because the property data provider is not configured correctly.',
    );
  }

  throw new PropertyDataProviderError(
    res.status,
    'Property lookup is temporarily unavailable. Please try again later.',
  );
}

// ---------- simple in-memory cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — property data rarely changes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  const operation = key.startsWith('similar:') ? 'similar' : 'property-cache';
  if (!entry) {
    recordProviderCache('zillow', operation, 'memory', 'miss');
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    recordProviderCache('zillow', operation, 'memory', 'stale');
    return null;
  }
  recordProviderCache('zillow', operation, 'memory', 'hit');
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- public API ----------

/**
 * Extract the Zillow ZPID from a variety of Zillow URL formats.
 *
 * Supports:
 *   https://www.zillow.com/homedetails/123-Main-St/12345678_zpid/
 *   https://www.zillow.com/homes/12345678_zpid/
 *   Plain numeric ZPID string
 */
export function parseZillowUrl(url: string): string {
  // Already a plain zpid number?
  if (/^\d+$/.test(url.trim())) return url.trim();

  const match = url.match(/(\d+)_zpid/);
  if (match) return match[1];

  throw new Error('Could not extract ZPID from the provided Zillow URL. Make sure the URL contains a valid property ID.');
}

/**
 * Fetch full property details by ZPID.
 * Uses: GET /byzpid?zpid=<zpid>
 */
export async function getPropertyByZpid(zpid: string): Promise<PropertyData> {
  const cacheKey = `property:${zpid}`;
  const cached = getCached<PropertyData>(cacheKey);
  if (cached) return cached;

  const host = RAPIDAPI_HOST();
  const url = `https://${host}/byzpid?zpid=${zpid}`;
  const res = await fetch(url, { headers: rapidHeaders() });

  if (!res.ok) {
    await throwProviderError(res, 'ZPID lookup');
  }

  const raw = await res.json() as any;

  // Check for API-level success
  if (raw.message && !raw.message.includes('200')) {
    throw new Error(`Property lookup failed: ${raw.message}`);
  }

  const property = normalizePropertyData(raw, zpid);

  // Verify we got meaningful data back
  if (!property.address && !property.price) {
    throw new Error('Property not found. Please check the Zillow URL and try again.');
  }

  // Enrich with price history from dedicated endpoint (if not already present)
  if (!property.priceHistory) {
    property.priceHistory = await fetchPriceHistory(zpid);
  }

  // Enrich with area market data (DB-cached, shared across users, weekly refresh)
  if ((!property.rentalMarketTrends || !property.housingMarket) && property.city && property.state) {
    const areaData = await getAreaMarketData(property.city, property.state, property.zip);
    if (!property.rentalMarketTrends) property.rentalMarketTrends = areaData.rentalMarket;
    if (!property.housingMarket) property.housingMarket = areaData.housingMarket;
  }

  setCache(cacheKey, property);
  return property;
}

/**
 * Fetch price history for a property via the dedicated /pricehistory endpoint.
 * Uses: GET /pricehistory?byzpid=<zpid>
 *
 * Returns null if the endpoint fails or no data is available (non-blocking).
 */
async function fetchPriceHistory(zpid: string): Promise<Array<{ date: string; price: number; event: string }> | undefined> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/pricehistory?byzpid=${encodeURIComponent(zpid)}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) return undefined;

    const data = await res.json() as any;
    const hist = data.priceHistory;

    if (!Array.isArray(hist) || hist.length === 0) return undefined;

    const parsed = hist
      .filter((h: any) => h.price != null && h.price > 0)
      .map((h: any) => ({
        date: String(h.date || ''),
        price: Number(h.price),
        event: String(h.event || 'Unknown'),
      }))
      .filter((h: { date: string; price: number }) => h.date && h.price > 0);

    if (parsed.length === 0) return undefined;

    // Remove outliers: entries with prices below 10% of the median are likely
    // administrative/non-sale events (tax entries, placeholder prices, etc.)
    const prices = parsed.map((h: { price: number }) => h.price).sort((a: number, b: number) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const threshold = median * 0.1;
    const filtered = parsed.filter((h: { price: number }) => h.price >= threshold);

    return filtered.length > 0 ? filtered : undefined;
  } catch (err) {
    console.warn(`[propertyDataService] Failed to fetch price history for zpid ${zpid}:`, (err as Error).message);
    return undefined;
  }
}

/**
 * Fetch property details by address.
 * Uses: GET /byaddress?propertyaddress=<full address>
 */
export async function getPropertyByAddress(
  address: string,
  cityStateZip?: string,
): Promise<PropertyData> {
  const host = RAPIDAPI_HOST();
  const fullAddress = cityStateZip ? `${address} ${cityStateZip}` : address;
  const url = `https://${host}/byaddress?propertyaddress=${encodeURIComponent(fullAddress)}`;

  const res = await fetch(url, { headers: rapidHeaders() });
  if (!res.ok) {
    await throwProviderError(res, 'address lookup');
  }

  const raw = await res.json() as any;

  if (raw.message && !raw.message.includes('200')) {
    throw new Error(`Address search failed: ${raw.message}`);
  }

  const zpid = raw.PropertyZPID ? String(raw.PropertyZPID) : '';
  const property = normalizePropertyData(raw, zpid);

  if (!property.address && !property.price) {
    throw new Error('No properties found for the provided address.');
  }

  // Enrich with price history from dedicated endpoint
  if (!property.priceHistory && zpid) {
    property.priceHistory = await fetchPriceHistory(zpid);
  }

  // Enrich with area market data (DB-cached, shared across users, weekly refresh)
  if ((!property.rentalMarketTrends || !property.housingMarket) && property.city && property.state) {
    const areaData = await getAreaMarketData(property.city, property.state, property.zip);
    if (!property.rentalMarketTrends) property.rentalMarketTrends = areaData.rentalMarket;
    if (!property.housingMarket) property.housingMarket = areaData.housingMarket;
  }

  return property;
}

/**
 * Lightweight property search returning summaries (for autocomplete / browse).
 * Uses the /byaddress endpoint since that's what this provider supports.
 */
export async function searchProperties(query: string): Promise<PropertySummary[]> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/byaddress?propertyaddress=${encodeURIComponent(query)}`;

    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) return [];

    const raw = await res.json() as any;
    if (!raw.PropertyAddress) return [];

    // This API returns a single result, so wrap it in an array
    return [{
      zpid: String(raw.PropertyZPID || ''),
      address: raw.PropertyAddress?.streetAddress || '',
      city: raw.PropertyAddress?.city || '',
      state: raw.PropertyAddress?.state || '',
      zip: String(raw.PropertyAddress?.zipcode || ''),
      price: Number(raw.Price || raw.zestimate) || 0,
      bedrooms: Number(raw.Bedrooms) || 0,
      bathrooms: Number(raw.Bathrooms) || 0,
      sqft: Number(raw['Area(sqft)']) || 0,
      photo: undefined,
    }];
  } catch {
    return [];
  }
}

/**
 * Fetch similar properties for a given ZPID.
 * Uses: GET /similar?byzpid=<zpid>
 *
 * Returns up to ~20 similar properties with price, beds, baths, sqft, etc.
 * Successful nonempty results are cached for 24 hours.
 */
export async function getSimilarProperties(zpid: string): Promise<ComparableProperty[]> {
  const diagnose = (
    outcome: 'cache-hit' | 'missing-zpid' | 'http-error' | 'provider-error' | 'invalid-envelope'
      | 'empty-response' | 'all-filtered' | 'success' | 'request-failed' | 'invalid-json' | 'normalization-failed',
    counts: Record<string, number> = {},
    providerError?: { field: string; category: string },
  ) => {
    const report = {
      requestId: getProviderUsageRequestId(), outcome, ...counts,
      ...(providerError ? { providerError } : {}),
    };
    if (outcome === 'success' || outcome === 'cache-hit' || outcome === 'empty-response') {
      console.info('[similar:diagnostic]', JSON.stringify(report));
    } else {
      console.warn('[similar:diagnostic]', JSON.stringify(report));
    }
  };
  if (!zpid.trim()) {
    diagnose('missing-zpid');
    return [];
  }
  const cacheKey = `similar:${zpid}`;
  const cached = getCached<ComparableProperty[]>(cacheKey);
  if (cached) {
    diagnose('cache-hit', { returnedCount: cached.length });
    return structuredClone(cached);
  }

  let phase: 'request' | 'json' | 'normalize' = 'request';
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/similar?byzpid=${encodeURIComponent(zpid)}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) {
      diagnose('http-error', { httpStatus: res.status });
      return [];
    }

    phase = 'json';
    const raw: unknown = await res.json();
    phase = 'normalize';
    const envelope = asRecord(raw);
    if (!envelope) {
      diagnose('invalid-envelope');
      return [];
    }
    const errorField = envelope.ErrorMessage ? 'ErrorMessage' : envelope.error ? 'error'
      : envelope.success === false ? 'success'
        : typeof envelope.message === 'string' &&
          /error|not found|denied|limit|quota|unauthori|forbidden|failed/i.test(envelope.message) ? 'message' : undefined;
    if (errorField) {
      const errorValue = envelope[errorField];
      const text = typeof errorValue === 'string' ? errorValue
        : stringValue(asRecord(errorValue)?.message);
      const category = /rate|quota|too many|limit|throttl/i.test(text) ? 'rate-or-quota'
        : /unauthori|forbidden|subscri|api.?key|access denied|billing|credit/i.test(text) ? 'access-or-billing'
          : /invalid|missing|required|parameter|zpid/i.test(text) ? 'invalid-input'
            : /not found|no similar|no propert|no result/i.test(text) ? 'not-found'
              : /timeout|timed out|temporar|try again|unavailable|internal server/i.test(text) ? 'upstream-unavailable'
                : 'unspecified';
      diagnose('provider-error', { httpStatus: res.status }, { field: errorField, category });
      return [];
    }

    // Response shape: { similar_properties: { propertyDetails: [...] } }
    const details = asRecord(envelope.similar_properties)?.propertyDetails ??
      asRecord(envelope.similarProperties)?.propertyDetails;
    if (!Array.isArray(details)) {
      diagnose('invalid-envelope');
      return [];
    }
    if (details.length === 0) {
      diagnose('empty-response', { rawCount: 0, returnedCount: 0 });
      return [];
    }
    const comps: ComparableProperty[] = [];
    const rejected = { invalidRecord: 0, invalidPrice: 0, invalidSqft: 0 };
    for (const entry of details) {
      const d = asRecord(entry);
      if (!d) { rejected.invalidRecord++; continue; }
      const price = positiveNumber(d.price);
      const sqft = positiveNumber(d.livingArea);
      if (price === undefined || sqft === undefined) {
        if (price === undefined) rejected.invalidPrice++;
        if (sqft === undefined) rejected.invalidSqft++;
        continue;
      }
      const addr = asRecord(d.address);
      const compZpid = stringValue(d.zpid);
      const photos = Array.isArray(d.miniCardPhotos) ? d.miniCardPhotos : [];
      comps.push({
        zpid: compZpid,
        address: stringValue(addr?.streetAddress),
        city: stringValue(addr?.city),
        state: stringValue(addr?.state),
        zip: stringValue(addr?.zipcode),
        price,
        bedrooms: Number(d.bedrooms) || 0,
        bathrooms: Number(d.bathrooms) || 0,
        sqft,
        ...(hasValidCoordinates(d) ? {
          latitude: d.latitude, longitude: d.longitude,
          coordinateSource: 'zillow' as const, coordinatesObservedAt: new Date().toISOString(),
        } : {}),
        lotSize: positiveNumber(d.lotSize),
        yearBuilt: positiveNumber(d.yearBuilt),
        homeStatus: stringValue(d.homeStatus) || undefined,
        homeType: stringValue(d.homeType) || undefined,
        photo: stringValue(asRecord(photos[0])?.url) || stringValue(d.imgSrc) || undefined,
        estimatedRent: 0,   // will be enriched by the route
        pricePerSqft: Math.round(price / sqft),
        rentPerSqft: 0,     // will be enriched by the route
        zillowUrl: compZpid ? `https://www.zillow.com/homedetails/${compZpid}_zpid/` : undefined,
      });
    }
    diagnose(comps.length ? 'success' : 'all-filtered', {
      rawCount: details.length, returnedCount: comps.length, rejectedCount: details.length - comps.length,
      ...rejected, withCoordinates: comps.filter(hasValidCoordinates).length,
    });
    if (comps.length > 0) setCache(cacheKey, structuredClone(comps));
    return comps;
  } catch {
    diagnose(phase === 'request' ? 'request-failed'
      : phase === 'json' ? 'invalid-json' : 'normalization-failed');
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

// ---------- normalizer ----------

/**
 * Normalize tax history from varying API response shapes.
 */
function normalizeTaxHistory(raw: any): Array<{ year: number; amount: number }> | undefined {
  const hist = raw.taxHistory || raw.tax_history || raw.TaxHistory;
  if (!Array.isArray(hist) || hist.length === 0) return undefined;
  const parsed = hist
    .map((h: any) => ({ year: Number(h.year || h.time), amount: Number(h.amount || h.value || h.taxPaid) || 0 }))
    .filter((h: { year: number }) => h.year > 0);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Normalize price history from varying API response shapes.
 */
function normalizePriceHistory(raw: any): Array<{ date: string; price: number; event: string }> | undefined {
  const hist = raw.priceHistory || raw.price_history || raw.PriceHistory;
  if (!Array.isArray(hist) || hist.length === 0) return undefined;
  const parsed = hist
    .map((h: any) => ({
      date: String(h.date || h.time || ''),
      price: Number(h.price || h.amount || h.value) || 0,
      event: String(h.event || h.type || h.priceChangeRate || 'Unknown'),
    }))
    .filter((h: { date: string; price: number }) => h.date && h.price > 0);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Normalize the flat response from private-zillow into our PropertyData shape.
 *
 * Response shape:
 * {
 *   message, Source,
 *   PropertyAddress: { streetAddress, city, state, zipcode, neighborhood, community, subdivision },
 *   zestimate, Bedrooms, Bathrooms, "Area(sqft)",
 *   PropertyZPID, Price, yearBuilt, daysOnZillow, PropertyZillowURL
 * }
 */
function normalizePropertyData(raw: any, zpid: string): PropertyData {
  const addr = raw.PropertyAddress || {};
  const resolvedZpid = zpid || String(raw.PropertyZPID || '');

  // Extract photos from all known response fields
  const photos: string[] = [];
  if (raw.imgSrc) photos.push(raw.imgSrc);
  if (raw.hiResImageLink) photos.push(raw.hiResImageLink);
  if (raw.image) photos.push(raw.image);
  if (Array.isArray(raw.miniCardPhotos)) {
    for (const p of raw.miniCardPhotos) {
      if (p?.url) photos.push(p.url);
    }
  }
  if (Array.isArray(raw.photos)) {
    for (const p of raw.photos) {
      const url = typeof p === 'string' ? p : p?.url || p?.href;
      if (url) photos.push(url);
    }
  }
  // Deduplicate
  const uniquePhotos = [...new Set(photos)];

  return {
    zpid: resolvedZpid,
    address: addr.streetAddress || '',
    city: addr.city || '',
    state: addr.state || '',
    zip: String(addr.zipcode || ''),
    price: Number(raw.Price || raw.zestimate) || 0,
    zestimate: raw.zestimate ? Number(raw.zestimate) : undefined,
    rentZestimate: undefined, // Not available from this provider
    bedrooms: Number(raw.Bedrooms) || 0,
    bathrooms: Number(raw.Bathrooms) || 0,
    sqft: Number(raw['Area(sqft)']) || 0,
    lotSize: undefined,
    yearBuilt: Number(raw.yearBuilt) || 0,
    propertyType: raw.homeType || raw.propertyType || undefined,
    description: undefined,
    photos: uniquePhotos,
    ...(hasValidCoordinates(raw) ? {
      latitude: raw.latitude, longitude: raw.longitude,
      coordinateSource: 'zillow', coordinatesObservedAt: new Date().toISOString(),
    } : {}),
    taxHistory: normalizeTaxHistory(raw),
    priceHistory: normalizePriceHistory(raw),
    homeStatus: raw.daysOnZillow != null ? `${raw.daysOnZillow} days on Zillow` : undefined,
    hoaFee: raw.monthlyHoaFee ? Number(raw.monthlyHoaFee) : undefined,
    zillowUrl: raw.PropertyZillowURL || (resolvedZpid ? `https://www.zillow.com/homedetails/${resolvedZpid}_zpid/` : undefined),
  };
}
