/**
 * RentCast Service
 *
 * Fetches real rental comps and rent estimates from the RentCast API.
 * Docs: https://developers.rentcast.io/reference
 *
 * Endpoints used:
 *   GET /v1/avm/rent/long-term     — algorithmic rent estimate by address
 *   GET /v1/listings/rental/long-term — nearby active rental listings (comps)
 *
 * Auth: X-Api-Key header
 *
 * Rate limit: depends on plan (typically 1000 calls/mo on Essentials).
 * We cache aggressively to stay well within limits.
 */

import type { RentalComp, PropertyData } from '@deal-platform/shared-types';

// ---------- configuration ----------

const RENTCAST_API_KEY = () => process.env.RENTCAST_API_KEY || '';
const BASE_URL = 'https://api.rentcast.io/v1';

function headers() {
  return {
    'X-Api-Key': RENTCAST_API_KEY(),
    'Accept': 'application/json',
  };
}

// ---------- cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — rental data changes infrequently

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- types for RentCast responses ----------

interface RentCastRentEstimate {
  rent: number;
  rentRangeLow: number;
  rentRangeHigh: number;
  latitude?: number;
  longitude?: number;
}

interface RentCastListing {
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  latitude?: number;
  longitude?: number;
  daysOnMarket?: number;
}

// ---------- public API ----------

/**
 * Check if the RentCast API key is configured.
 */
export function isConfigured(): boolean {
  return RENTCAST_API_KEY().length > 0;
}

/**
 * Get a rent estimate from RentCast's AVM (Automated Valuation Model).
 * Returns null if the key is missing or the call fails.
 */
export async function getRentEstimate(
  property: PropertyData,
): Promise<{ mid: number; low: number; high: number } | null> {
  if (!isConfigured()) return null;

  const address = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
  const cacheKey = `rentcast:estimate:${address}`;
  const cached = getCached<{ mid: number; low: number; high: number }>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      address,
      propertyType: mapPropertyType(property.propertyType),
      bedrooms: String(property.bedrooms || 3),
      bathrooms: String(property.bathrooms || 2),
      squareFootage: String(property.sqft || 1500),
    });

    const res = await fetch(`${BASE_URL}/avm/rent/long-term?${params}`, {
      headers: headers(),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Rent estimate failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as RentCastRentEstimate;

    if (!data.rent) return null;

    const result = {
      mid: Math.round(data.rent),
      low: Math.round(data.rentRangeLow || data.rent * 0.9),
      high: Math.round(data.rentRangeHigh || data.rent * 1.1),
    };

    setCache(cacheKey, result);
    return result;
  } catch (err: any) {
    console.warn('[RentCast] Rent estimate error:', err.message);
    return null;
  }
}

/**
 * Fetch nearby rental listings as comps from RentCast.
 * Returns an array of RentalComp objects suitable for combineEstimates().
 */
export async function getRentalComps(
  property: PropertyData,
  radiusMiles: number = 2,
  limit: number = 10,
): Promise<RentalComp[]> {
  if (!isConfigured()) return [];

  const address = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
  const cacheKey = `rentcast:comps:${address}:${radiusMiles}`;
  const cached = getCached<RentalComp[]>(cacheKey);
  if (cached) return cached;

  try {
    // Prefer lat/lng for radius search; fall back to address
    const params = new URLSearchParams({
      bedrooms: String(property.bedrooms || 3),
      bathrooms: String(property.bathrooms || 2),
      status: 'Active',
      limit: String(limit),
    });

    if (property.latitude && property.longitude) {
      params.set('latitude', String(property.latitude));
      params.set('longitude', String(property.longitude));
      params.set('radius', String(radiusMiles));
    } else {
      params.set('city', property.city);
      params.set('state', property.state);
      params.set('zipCode', property.zip);
    }

    const res = await fetch(`${BASE_URL}/listings/rental/long-term?${params}`, {
      headers: headers(),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Rental comps failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const listings = await res.json() as RentCastListing[];

    if (!Array.isArray(listings)) return [];

    const comps: RentalComp[] = listings
      .filter(l => l.price && l.price > 0)
      .map(l => ({
        address: l.formattedAddress || l.addressLine1,
        rent: l.price!,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.squareFootage,
        source: 'api' as const,
      }));

    setCache(cacheKey, comps);
    console.log(`[RentCast] Found ${comps.length} rental comps for ${address}`);
    return comps;
  } catch (err: any) {
    console.warn('[RentCast] Rental comps error:', err.message);
    return [];
  }
}

// ---------- helpers ----------

/** Map our propertyType strings to RentCast's expected values */
function mapPropertyType(type?: string): string {
  if (!type) return 'Single Family';
  const t = type.toLowerCase();
  if (t.includes('condo')) return 'Condo';
  if (t.includes('townhouse') || t.includes('town')) return 'Townhouse';
  if (t.includes('multi') || t.includes('duplex') || t.includes('triplex')) return 'Multi-Family';
  if (t.includes('apartment')) return 'Apartment';
  return 'Single Family';
}
