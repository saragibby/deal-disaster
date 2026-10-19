/**
 * Realty-in-US Service (realtor.com data via RapidAPI)
 *
 * Provides REAL rental comps sourced from active for-rent listings on
 * realtor.com. This is a fallback when RentCast has no usable rental comps.
 *
 * Endpoint: POST /properties/v3/list
 *   body: { limit, offset, postal_code, status: ['for_rent'], sort }
 *   result path: data.home_search.results[]
 *     - list_price              → monthly rent
 *     - location.address        → line / city / state_code / postal_code / coordinate
 *     - description.{beds,baths,sqft,type}
 *
 * Auth: shared RapidAPI key (RAPIDAPI_KEY) + per-API host header.
 */

import type { PropertyData, RentalComp } from '@deal-platform/shared-types';
import { filterPlausibleRentalComps } from './rentalEstimationService.js';
import { createProviderFetch, recordProviderCache } from './providerUsageService.js';
import { hasValidCoordinates } from './geocodingService.js';
const fetch = createProviderFetch('realtor');

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const HOST = 'realty-in-us.p.rapidapi.com';

function headers() {
  return {
    'content-type': 'application/json',
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': HOST,
  };
}

// ---------- cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<RentalComp[]>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — rental listings change slowly

/** Check if the RapidAPI key is configured. */
export function isConfigured(): boolean {
  return RAPIDAPI_KEY().length > 0;
}

function normalizeAddress(value: string): string {
  return decodeURIComponent(value)
    .toLowerCase()
    .replace(/https?:\/\/[^/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:street|st)\b/g, 'st')
    .replace(/\b(?:avenue|ave)\b/g, 'ave')
    .replace(/\b(?:road|rd)\b/g, 'rd')
    .replace(/\b(?:drive|dr)\b/g, 'dr')
    .replace(/\b(?:lane|ln)\b/g, 'ln')
    .replace(/\b(?:boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(?:court|ct)\b/g, 'ct')
    .replace(/\b(?:circle|cir)\b/g, 'cir')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPostalCode(input: string): string | null {
  const match = decodeURIComponent(input).match(/\b\d{5}(?:-\d{4})?\b/);
  return match?.[0].slice(0, 5) || null;
}

function normalizeForSaleProperty(result: any, sourceInput: string): PropertyData | null {
  const address = result?.location?.address || {};
  const description = result?.description || {};
  const price = Number(result?.list_price) || 0;
  const streetAddress = String(address.line || '');

  if (!streetAddress || !price) return null;

  const photos = [
    result?.primary_photo?.href,
    ...(Array.isArray(result?.photos) ? result.photos.map((photo: any) => photo?.href) : []),
  ].filter((photo): photo is string => typeof photo === 'string' && photo.length > 0);

  const rawCoordinates = address.coordinate;
  const coordinates = {
    latitude: rawCoordinates?.lat != null && String(rawCoordinates.lat).trim()
      ? Number(rawCoordinates.lat) : undefined,
    longitude: rawCoordinates?.lon != null && String(rawCoordinates.lon).trim()
      ? Number(rawCoordinates.lon) : undefined,
  };

  return {
    zpid: '',
    address: streetAddress,
    city: String(address.city || ''),
    state: String(address.state_code || ''),
    zip: String(address.postal_code || ''),
    price,
    bedrooms: Number(description.beds) || 0,
    bathrooms: Number(description.baths) || 0,
    sqft: Number(description.sqft) || 0,
    lotSize: Number(description.lot_sqft) || undefined,
    yearBuilt: Number(description.year_built) || 0,
    propertyType: description.type ? String(description.type) : undefined,
    description: result?.description?.text ? String(result.description.text) : undefined,
    photos: [...new Set(photos)],
    homeStatus: result?.status ? String(result.status) : undefined,
    ...(hasValidCoordinates(coordinates) ? {
      ...coordinates, coordinateSource: 'realtor', coordinatesObservedAt: new Date().toISOString(),
    } : {}),
    zillowUrl: sourceInput.toLowerCase().includes('zillow.com') ? sourceInput : undefined,
  };
}

/**
 * Resolve an exact active for-sale listing through Realty In US.
 *
 * This is intentionally strict: the caller must provide a ZIP code and the
 * returned listing's street address must appear in the original input.
 */
export async function getForSaleProperty(input: string): Promise<PropertyData | null> {
  if (!isConfigured()) return null;

  const postalCode = extractPostalCode(input);
  if (!postalCode) return null;

  try {
    const res = await fetch(`https://${HOST}/properties/v3/list`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        limit: 200,
        offset: 0,
        postal_code: postalCode,
        status: ['for_sale'],
        sort: { direction: 'desc', field: 'list_date' },
      }),
    });

    if (!res.ok) {
      console.warn(`[Realty-in-US] For-sale fallback failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as any;
    const results: any[] = data?.data?.home_search?.results || [];
    if (!Array.isArray(results)) return null;

    const normalizedInput = normalizeAddress(input);
    const exactMatch = results.find((result) => {
      const streetAddress = normalizeAddress(String(result?.location?.address?.line || ''));
      return streetAddress.length > 0 && normalizedInput.includes(streetAddress);
    });

    if (!exactMatch) return null;

    const property = normalizeForSaleProperty(exactMatch, input);
    if (property) {
      console.warn(`[Realty-in-US] Using for-sale fallback for ${property.address}, ${property.zip}`);
    }
    return property;
  } catch (err: any) {
    console.warn('[Realty-in-US] For-sale fallback error:', err.message);
    return null;
  }
}

/**
 * Fetch real active for-rent listings as rental comps for the subject's ZIP.
 *
 * Results are softly filtered to within ±1 bedroom of the subject (when known)
 * to keep them comparable, falling back to all comps in thin markets.
 * Returns [] on any failure so callers fall back to the algorithmic estimator.
 */
export async function getRentalComps(
  property: PropertyData,
  limit: number = 20,
): Promise<RentalComp[]> {
  if (!isConfigured() || !property.zip) return [];

  const body = {
    limit,
    offset: 0,
    postal_code: property.zip,
    status: ['for_rent'],
    sort: { direction: 'desc', field: 'list_date' },
  };
  const cacheKey = `realty:rent:v2:${JSON.stringify(body)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    recordProviderCache('realtor', 'listings', 'memory', 'hit');
    return selectRentalComps(cached.data, property);
  }
  recordProviderCache('realtor', 'listings', 'memory', cached ? 'stale' : 'miss');

  try {
    const res = await fetch(`https://${HOST}/properties/v3/list`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[Realty-in-US] Rental comps failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as any;
    const results: any[] = data?.data?.home_search?.results;
    if (!Array.isArray(results)) {
      console.warn('[Realty-in-US] Invalid rental results; not caching failure');
      return [];
    }

    const comps: RentalComp[] = results
      .filter((r) => r?.list_price && r.list_price > 0)
      .map((r) => {
        const addr = r.location?.address || {};
        const desc = r.description || {};
        return {
          address: addr.line ? `${addr.line}, ${addr.city || ''}`.replace(/,\s*$/, '') : undefined,
          rent: Number(r.list_price),
          bedrooms: desc.beds != null ? Number(desc.beds) : undefined,
          bathrooms: desc.baths != null ? Number(desc.baths) : undefined,
          sqft: desc.sqft != null ? Number(desc.sqft) : undefined,
          source: 'api' as const,
        };
      });
    const relevant = selectRentalComps(comps, property);
    cache.set(cacheKey, { data: comps, expiresAt: Date.now() + CACHE_TTL_MS });
    console.log(`[Realty-in-US] Found ${relevant.length} rental comps for ${property.zip}`);
    return relevant;
  } catch (err: any) {
    console.warn('[Realty-in-US] Rental comps error:', err.message);
    return [];
  }

  function selectRentalComps(comps: RentalComp[], property: PropertyData): RentalComp[] {
    const plausible = filterPlausibleRentalComps(comps, property);
    if (!Number.isFinite(property.bedrooms)) return plausible;
    const matched = plausible.filter(comp =>
      comp.bedrooms == null || Math.abs(comp.bedrooms - property.bedrooms) <= 1);
    return matched.length > 0 ? matched : plausible;
  }
}
