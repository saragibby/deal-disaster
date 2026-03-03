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
 *
 * This provider does NOT have a rental-comps endpoint, so getRentalComps
 * always returns [] and callers should rely on the algorithmic estimator
 * or derive comps from the /similar endpoint.
 */

import type { PropertyData, PropertySummary, RentalComp, ComparableProperty } from '@deal-platform/shared-types';

// ---------- configuration ----------

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = () => process.env.RAPIDAPI_HOST || 'private-zillow.p.rapidapi.com';

function rapidHeaders() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': RAPIDAPI_HOST(),
  };
}

// ---------- simple in-memory cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
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
    const body = await res.text();
    throw new Error(`Property lookup failed (${res.status}): ${body}`);
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

  setCache(cacheKey, property);
  return property;
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
    throw new Error(`Address search failed (${res.status})`);
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
 * Fetch API-sourced rental comps for a given ZPID.
 *
 * The private-zillow provider does NOT have a rental comps endpoint.
 * Always returns [] — callers should fall back to the algorithmic estimator.
 */
export async function getRentalComps(_zpid: string): Promise<RentalComp[]> {
  // No rental comps endpoint on private-zillow.p.rapidapi.com
  return [];
}

/**
 * Fetch similar properties for a given ZPID.
 * Uses: GET /similar?byzpid=<zpid>
 *
 * Returns up to ~20 similar properties with price, beds, baths, sqft, etc.
 * Results are cached for 30 minutes to minimise API calls.
 */
export async function getSimilarProperties(zpid: string): Promise<ComparableProperty[]> {
  const cacheKey = `similar:${zpid}`;
  const cached = getCached<ComparableProperty[]>(cacheKey);
  if (cached) return cached;

  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/similar?byzpid=${zpid}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) {
      console.warn(`[similar] HTTP ${res.status} for zpid ${zpid}`);
      return [];
    }

    const raw = await res.json() as any;

    // Response shape: { similar_properties: { propertyDetails: [...] } }
    const details: any[] =
      raw?.similar_properties?.propertyDetails ||
      raw?.similarProperties?.propertyDetails ||
      [];

    if (!Array.isArray(details) || details.length === 0) return [];

    const comps: ComparableProperty[] = details
      .filter((d: any) => d.price && d.livingArea)
      .map((d: any) => {
        const addr = d.address || {};
        const price = Number(d.price) || 0;
        const sqft = Number(d.livingArea) || 0;

        const compZpid = String(d.zpid || '');
        return {
          zpid: compZpid,
          address: addr.streetAddress || '',
          city: addr.city || '',
          state: addr.state || '',
          zip: String(addr.zipcode || ''),
          price,
          bedrooms: Number(d.bedrooms) || 0,
          bathrooms: Number(d.bathrooms) || 0,
          sqft,
          lotSize: d.lotSize ? Number(d.lotSize) : undefined,
          homeStatus: d.homeStatus || undefined,
          homeType: d.homeType || undefined,
          photo: d.miniCardPhotos?.[0]?.url || d.imgSrc || undefined,
          estimatedRent: 0,   // will be enriched by the route
          pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
          rentPerSqft: 0,     // will be enriched by the route
          zillowUrl: compZpid ? `https://www.zillow.com/homedetails/${compZpid}_zpid/` : undefined,
        };
      });

    setCache(cacheKey, comps);
    return comps;
  } catch (err: any) {
    console.warn('[similar] Failed to fetch similar properties:', err.message);
    return [];
  }
}

// ---------- normalizer ----------

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
    propertyType: undefined, // Not available from this provider
    description: undefined,
    photos: [],
    taxHistory: undefined,
    priceHistory: undefined,
    homeStatus: raw.daysOnZillow != null ? `${raw.daysOnZillow} days on Zillow` : undefined,
    zillowUrl: raw.PropertyZillowURL || (resolvedZpid ? `https://www.zillow.com/homedetails/${resolvedZpid}_zpid/` : undefined),
  };
}
