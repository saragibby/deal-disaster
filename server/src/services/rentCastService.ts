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

import type { RentalComp, PropertyData, PropertyRecords, MarketStatistics } from '@deal-platform/shared-types';
import { hasValidCoordinates } from './geocodingService.js';
import { pool } from '../db/pool.js';
import { Pool } from 'pg';
import { createPostgresMarketCacheStore, createRentCastMarketCache } from './rentCastMarketCache.js';
import { createProviderFetch, recordProviderCache } from './providerUsageService.js';
import {
  createRentCastPropertyCache, isRentEstimateProjection, isRentalCompProjection,
  type RentEstimateProjection,
} from './rentCastPropertyCache.js';
const fetch = createProviderFetch('rentcast');
export type { MarketStatistics } from '@deal-platform/shared-types';

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

const cache = new Map<string, CacheEntry<PropertyRecords>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getCached(key: string): PropertyRecords | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    recordProviderCache('rentcast', 'property-records', 'memory', 'hit');
    return entry.data;
  }
  recordProviderCache('rentcast', 'property-records', 'memory', entry ? 'stale' : 'miss');
  cache.delete(key);
  return null;
}

function setCache(key: string, data: PropertyRecords): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- types for RentCast responses ----------

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

function isRentCastListing(listing: unknown): listing is RentCastListing {
  return isObject(listing) &&
    Object.prototype.hasOwnProperty.call(listing, 'price') &&
    (listing.price == null || (typeof listing.price === 'number' && Number.isFinite(listing.price))) &&
    ['formattedAddress', 'addressLine1'].every(key => listing[key] == null || typeof listing[key] === 'string') &&
    ['bedrooms', 'bathrooms', 'squareFootage'].every(key =>
      listing[key] == null || (typeof listing[key] === 'number' && Number.isFinite(listing[key]) && listing[key] >= 0));
}

// ---------- public API ----------

interface RentCastPropertyRecord {
  owner?: {
    names?: string[];
    type?: string;
    mailingAddress?: {
      formattedAddress?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      zipCode?: string;
    };
  };
  ownerOccupied?: boolean;
  history?: Record<string, { date?: string; price?: number; event?: string }>;
  lastSaleDate?: string;
  lastSalePrice?: number;
}

export class PropertyRecordsUnavailableError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isPropertyRecord(value: unknown): value is RentCastPropertyRecord {
  if (!isObject(value)) return false;
  const optionalString = (v: unknown) => v == null || typeof v === 'string';
  const optionalNumber = (v: unknown) => v == null || (typeof v === 'number' && Number.isFinite(v));
  if (!optionalString(value.lastSaleDate) || !optionalNumber(value.lastSalePrice)) return false;
  if (value.ownerOccupied != null && typeof value.ownerOccupied !== 'boolean') return false;
  if (value.owner != null) {
    if (!isObject(value.owner) || !optionalString(value.owner.type)) return false;
    if (value.owner.names != null && (
      !Array.isArray(value.owner.names) || !value.owner.names.every(name => typeof name === 'string')
    )) return false;
    if (value.owner.mailingAddress != null) {
      const mailing = value.owner.mailingAddress;
      if (!isObject(mailing) || ![
        mailing.formattedAddress, mailing.addressLine1, mailing.addressLine2,
        mailing.city, mailing.state, mailing.zipCode,
      ].every(optionalString)) return false;
    }
  }
  if (value.history != null) {
    if (!isObject(value.history) || !Object.values(value.history).every(sale =>
      isObject(sale) && optionalString(sale.date) && optionalString(sale.event) && optionalNumber(sale.price)
    )) return false;
  }
  return true;
}

/** Fetch only public-record fields, independently of saved/public analyses. */
export async function getPropertyRecords(
  property: PropertyData,
  options: { refresh?: boolean } = {},
): Promise<PropertyRecords> {
  if (!isConfigured()) {
    throw new PropertyRecordsUnavailableError('Property records are not configured. Please contact support.');
  }
  const address = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
  const cacheKey = `rentcast:records:${address}`;
  const cached = options.refresh ? null : getCached(cacheKey);
  if (cached) return cached;

  const response = await fetch(`${BASE_URL}/properties?${new URLSearchParams({ address, limit: '1' })}`, {
    headers: headers(),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok && response.status !== 404) {
    console.warn(`[RentCast] Property records failed: ${response.status}`);
    const messages: Record<number, string> = {
      400: 'RentCast could not process this property lookup (400). Check the saved property address before trying again.',
      401: 'RentCast rejected the property records API key (401). Please contact support to verify the server API key.',
      403: 'RentCast denied access to property records (403). Please contact support to check API key restrictions, the active subscription, and billing.',
      429: 'RentCast request rate limit reached (429). Wait a moment before loading property records again.',
    };
    throw new PropertyRecordsUnavailableError(
      messages[response.status] ??
      `RentCast property records are temporarily unavailable (${response.status}). Please try again later.`,
    );
  }
  // RentCast returns 404, rather than an empty array, for some no-match queries.
  const data: unknown = response.status === 404 ? [] : await response.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid property records response from RentCast.');
  }
  const first: unknown = data[0];
  if (data.length > 0 && !isPropertyRecord(first)) {
    throw new Error('Invalid property records response from RentCast.');
  }
  const record = isPropertyRecord(first) ? first : undefined;
  const mailing = record?.owner?.mailingAddress;
  const sales = Object.entries(record?.history ?? {}).map(([date, sale]) => ({
    date: sale.date ?? date,
    price: typeof sale.price === 'number' && Number.isFinite(sale.price) && sale.price > 0 ? sale.price : null,
    event: sale.event ?? 'Sale',
  }));
  if (record?.lastSaleDate && !sales.some(sale => sale.date.slice(0, 10) === record.lastSaleDate?.slice(0, 10))) {
    sales.push({
      date: record.lastSaleDate,
      price: typeof record.lastSalePrice === 'number' && Number.isFinite(record.lastSalePrice) && record.lastSalePrice > 0
        ? record.lastSalePrice : null,
      event: 'Sale',
    });
  }
  sales.sort((a, b) => b.date.localeCompare(a.date));
  const result: PropertyRecords = {
    source: 'rentcast',
    retrievedAt: new Date().toISOString(),
    found: !!record,
    ownerNames: record?.owner?.names ?? [],
    ownerType: record?.owner?.type ?? null,
    mailingAddress: mailing?.formattedAddress || (
      mailing ? [mailing.addressLine1, mailing.addressLine2, mailing.city, mailing.state, mailing.zipCode]
        .filter(Boolean).join(', ') || null : null
    ),
    ownerOccupied: typeof record?.ownerOccupied === 'boolean' ? record.ownerOccupied : null,
    sales,
  };
  setCache(cacheKey, result);
  return result;
}

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
  const params = propertySearchParams(property);
  params.set('address', address);
  return rentEstimateCache.get(params.toString());
}

async function fetchRentEstimate(query: string): Promise<RentEstimateProjection | null> {
  try {
    const res = await fetch(`${BASE_URL}/avm/rent/long-term?${query}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Rent estimate failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: unknown = await res.json();
    if (!isObject(data) || typeof data.rent !== 'number' || !positiveRent(data.rent) ||
      (data.rentRangeLow != null && !positiveRent(data.rentRangeLow)) ||
      (data.rentRangeHigh != null && !positiveRent(data.rentRangeHigh))) {
      console.warn('[RentCast] Invalid rent estimate; not caching');
      return null;
    }

    const result = {
      mid: Math.round(data.rent),
      low: Math.round(typeof data.rentRangeLow === 'number' ? data.rentRangeLow : data.rent * 0.9),
      high: Math.round(typeof data.rentRangeHigh === 'number' ? data.rentRangeHigh : data.rent * 1.1),
    };

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

  const params = propertySearchParams(property);
  params.delete('propertyType');
  params.delete('squareFootage');
  params.set('status', 'Active');
  params.set('limit', String(limit));
  if (hasValidCoordinates(property)) {
    params.set('latitude', String(property.latitude));
    params.set('longitude', String(property.longitude));
    params.set('radius', String(radiusMiles));
  } else {
    params.set('city', property.city);
    params.set('state', property.state);
    params.set('zipCode', property.zip);
  }
  return await rentalCompsCache.get(params.toString()) ?? [];
}

async function fetchRentalComps(query: string): Promise<RentalComp[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/listings/rental/long-term?${query}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Rental comps failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: unknown = await res.json();
    if (!Array.isArray(data) || !data.every(isRentCastListing)) {
      console.warn('[RentCast] Invalid rental listings; not caching');
      return null;
    }
    const listings = data;

    const comps: RentalComp[] = listings
      .filter(l => l.price && l.price > 0)
      .map(l => ({
        address: l.formattedAddress || l.addressLine1 || undefined,
        rent: l.price!,
        bedrooms: l.bedrooms ?? undefined,
        bathrooms: l.bathrooms ?? undefined,
        sqft: l.squareFootage ?? undefined,
        source: 'api' as const,
      }));

    console.log(`[RentCast] Found ${comps.length} rental comps`);
    return comps;
  } catch (err: any) {
    console.warn('[RentCast] Rental comps error:', err.message);
    return null;
  }
}

/**
 * Fetch market-level rental statistics for a ZIP code from RentCast.
 * Seven-day cache; PostgreSQL sharing is opt-in after deploying the cache schema.
 */
export async function getMarketStatistics(
  zip: string,
): Promise<MarketStatistics | null> {
  if (!isConfigured() || !zip) return null;
  return marketCache.get(zip);
}

const marketCachePool = new Pool({
  ...pool.options,
  max: 2,
  connectionTimeoutMillis: 2000,
  statement_timeout: 2000,
  query_timeout: 2000,
  allowExitOnIdle: true,
});
marketCachePool.on('error', () => {
  console.warn('[RentCast:market-cache] Idle database connection failed');
});

const marketCache = createRentCastMarketCache({
  store: createPostgresMarketCacheStore(marketCachePool),
  enabled: () => process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED === 'true',
  load: fetchMarketStatistics,
});

const rentEstimateCache = createRentCastPropertyCache(
  marketCachePool, 'rent-avm', isRentEstimateProjection, fetchRentEstimate,
);
const rentalCompsCache = createRentCastPropertyCache(
  marketCachePool, 'rental-listings', isRentalCompProjection, fetchRentalComps,
);

async function fetchMarketStatistics(zip: string): Promise<MarketStatistics | null> {
  try {
    const params = new URLSearchParams({
      zipCode: zip,
      historyRange: '13',
      dataType: 'All',
    });

    const res = await fetch(`${BASE_URL}/markets?${params}`, {
      headers: headers(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[RentCast] Market stats failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data: unknown = await res.json();
    const result = normalizeMarketStatistics(data);
    if (!result) {
      console.warn('[RentCast] Rental market statistics unavailable or invalid');
      return null;
    }

    return result;
  } catch {
    console.warn('[RentCast] Market stats request failed');
    return null;
  }
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveRent(value: unknown): number | undefined {
  const number = nonnegativeNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

export function normalizeMarketStatistics(data: unknown): MarketStatistics | null {
  if (!isObject(data) || !isObject(data.rentalData)) return null;
  const rental = data.rentalData;
  const medianRent = positiveRent(rental.medianRent);
  const averageRent = positiveRent(rental.averageRent);
  const totalListings = nonnegativeNumber(rental.totalListings);
  const avgDaysOnMarket = nonnegativeNumber(rental.averageDaysOnMarket);
  if ([medianRent, averageRent, totalListings, avgDaysOnMarket].every(value => value === undefined)) {
    return null;
  }

  let rentGrowthPct: number | undefined;
  if (isObject(rental.history)) {
    const months = Object.keys(rental.history).filter(key => /^\d{4}-(0[1-9]|1[0-2])$/.test(key)).sort();
    const latestMonth = months[months.length - 1];
    if (latestMonth) {
      const previousMonth = `${Number(latestMonth.slice(0, 4)) - 1}-${latestMonth.slice(5)}`;
      const latest = rental.history[latestMonth];
      const previous = rental.history[previousMonth];
      if (isObject(latest) && isObject(previous)) {
        // Compare the same statistic across exactly twelve months, never median to average.
        for (const metric of ['medianRent', 'averageRent'] as const) {
          const currentRent = positiveRent(latest[metric]);
          const previousRent = positiveRent(previous[metric]);
          if (currentRent !== undefined && previousRent !== undefined) {
            rentGrowthPct = Math.round(((currentRent - previousRent) / previousRent) * 1000) / 10;
            break;
          }
        }
      }
    }
  }
  return {
    ...(medianRent !== undefined ? { medianRent: Math.round(medianRent) } : {}),
    ...(averageRent !== undefined ? { averageRent: Math.round(averageRent) } : {}),
    ...(totalListings !== undefined ? { totalListings } : {}),
    ...(avgDaysOnMarket !== undefined ? { avgDaysOnMarket } : {}),
    ...(rentGrowthPct !== undefined ? {
      rentGrowthPct,
      rentTrend: rentGrowthPct > 2 ? 'rising' : rentGrowthPct < -2 ? 'declining' : 'stable',
    } : {}),
  };
}

// ---------- helpers ----------

/** Map our propertyType strings to RentCast's expected values */
function mapPropertyType(type?: string): string | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (t.includes('condo')) return 'Condo';
  if (t.includes('townhouse') || t.includes('town')) return 'Townhouse';
  if (t.includes('multi') || t.includes('duplex') || t.includes('triplex')) return 'Multi-Family';
  if (t.includes('apartment')) return 'Apartment';
  if (t.includes('single') || t === 'house') return 'Single Family';
  if (t.includes('manufactured') || t.includes('mobile')) return 'Manufactured';
  return undefined;
}

function propertySearchParams(property: PropertyData): URLSearchParams {
  const params = new URLSearchParams();
  const type = mapPropertyType(property.propertyType);
  if (type) params.set('propertyType', type);
  // Whole-building attributes must not masquerade as per-unit rental filters.
  if (type !== 'Multi-Family') {
    if (Number.isInteger(property.bedrooms) && property.bedrooms >= 0) {
      params.set('bedrooms', String(property.bedrooms));
    }
    if (Number.isFinite(property.bathrooms) && property.bathrooms > 0) {
      params.set('bathrooms', String(property.bathrooms));
    }
    if (Number.isFinite(property.sqft) && property.sqft > 0) {
      params.set('squareFootage', String(property.sqft));
    }
  }
  return params;
}
