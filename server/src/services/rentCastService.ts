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
import { getProviderFreshnessMs, readProviderCredential } from './providerPolicyRegistry.js';

// ---------- configuration ----------

const RENTCAST_API_KEY = () => readProviderCredential('rentcast');
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
const CACHE_TTL_MS = getProviderFreshnessMs('rentcast', 'rentalComps') ?? 0;
const MARKET_CACHE_TTL_MS = getProviderFreshnessMs('rentcast', 'marketStatistics') ?? 0;

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

export interface MarketStatistics {
  medianRent: number;
  averageRent: number;
  rentGrowthPct: number;        // YoY percentage e.g. 3.5 = 3.5%
  totalListings: number;
  avgDaysOnMarket: number;
  rentTrend: 'rising' | 'stable' | 'declining';
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

/**
 * Fetch market-level rental statistics for a ZIP code from RentCast.
 * Cached for 7 days (market-level data is slow-moving).
 */
export async function getMarketStatistics(
  zip: string,
): Promise<MarketStatistics | null> {
  if (!isConfigured() || !zip) return null;

  const cacheKey = `rentcast:market:${zip}`;
  const cached = getCached<MarketStatistics>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      zipCode: zip,
      historyRange: '12',
    });

    const res = await fetch(`${BASE_URL}/markets?${params}`, {
      headers: headers(),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Market stats failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as Record<string, any>;

    const medianRent = data.medianRent ?? data.averageRent ?? 0;
    const averageRent = data.averageRent ?? data.medianRent ?? 0;

    // Compute rent growth from history if available
    let rentGrowthPct = 0;
    if (data.history && Array.isArray(data.history) && data.history.length >= 2) {
      const latest = data.history[data.history.length - 1];
      const oldest = data.history[0];
      const latestRent = latest?.medianRent ?? latest?.averageRent ?? 0;
      const oldestRent = oldest?.medianRent ?? oldest?.averageRent ?? 0;
      if (oldestRent > 0) {
        rentGrowthPct = Math.round(((latestRent - oldestRent) / oldestRent) * 1000) / 10;
      }
    } else if (data.rentGrowth != null) {
      rentGrowthPct = typeof data.rentGrowth === 'number'
        ? Math.round(data.rentGrowth * (Math.abs(data.rentGrowth) < 1 ? 1000 : 10)) / 10
        : 0;
    }

    // Determine trend
    let rentTrend: 'rising' | 'stable' | 'declining';
    if (rentGrowthPct > 2) rentTrend = 'rising';
    else if (rentGrowthPct < -2) rentTrend = 'declining';
    else rentTrend = 'stable';

    const result: MarketStatistics = {
      medianRent: Math.round(medianRent),
      averageRent: Math.round(averageRent),
      rentGrowthPct,
      totalListings: data.totalListings ?? data.count ?? 0,
      avgDaysOnMarket: data.averageDaysOnMarket ?? data.avgDaysOnMarket ?? 0,
      rentTrend,
    };

    // Cache with longer TTL for market stats
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + MARKET_CACHE_TTL_MS });
    console.log(`[RentCast] Market stats for ${zip}: median=${result.medianRent}, trend=${result.rentTrend}`);
    return result;
  } catch (err: any) {
    console.warn('[RentCast] Market stats error:', err.message);
    return null;
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
