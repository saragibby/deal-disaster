/**
 * AirDNA Service
 *
 * Fetches real short-term rental (STR) market data from the AirDNA API
 * available on RapidAPI at airdna1.p.rapidapi.com.
 *
 * Uses the same RAPIDAPI_KEY as propertyDataService since both are on
 * RapidAPI — only the host header differs.
 *
 * Data returned: average daily rate (ADR), occupancy rate, revenue,
 * comparable STR listings, and seasonality data.
 *
 * The service maps AirDNA's response to our STREstimate interface so
 * the rest of the codebase is provider-agnostic.
 */

import type { PropertyData, STREstimate } from '@deal-platform/shared-types';

// ---------- configuration ----------

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const AIRDNA_HOST = 'airdna1.p.rapidapi.com';

function headers() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': AIRDNA_HOST,
  };
}

// ---------- cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — STR metrics change infrequently

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- types for AirDNA responses ----------

/** Shape of AirDNA's property/market data — flexible to handle variations */
interface AirDnaPropertyData {
  // Property-level Rentalizer data
  adr?: number;                    // Average Daily Rate
  average_daily_rate?: number;
  occupancy?: number;              // 0-100 or 0-1
  occupancy_rate?: number;
  revenue?: number;                // Annual or monthly revenue
  monthly_revenue?: number;
  annual_revenue?: number;

  // Nested structure variant
  stats?: {
    adr?: { value?: number; ltm?: number };
    occupancy?: { value?: number; ltm?: number };
    revenue?: { value?: number; ltm?: number };
  };

  // Rental estimate variant
  rental_estimate?: {
    adr?: number;
    occupancy?: number;
    revenue?: number;
    revenue_potential?: number;
  };

  // Market-level fallback
  market_stats?: {
    adr?: number;
    occupancy?: number;
    revenue?: number;
  };
}

// ---------- public API ----------

/**
 * Check if AirDNA is configured (shares RAPIDAPI_KEY with Zillow).
 */
export function isConfigured(): boolean {
  return RAPIDAPI_KEY().length > 0;
}

/**
 * Fetch STR performance data from AirDNA for a specific property.
 *
 * Tries the Rentalizer-style endpoint first (property-level estimate),
 * then falls back to market-level stats.
 *
 * Returns null if the API key is missing or all calls fail.
 */
export async function getSTREstimate(
  property: PropertyData,
): Promise<STREstimate | null> {
  if (!isConfigured()) return null;

  const cacheKey = `airdna:str:${property.zpid}`;
  const cached = getCached<STREstimate>(cacheKey);
  if (cached) return cached;

  // Try property-level estimate first
  const estimate = await fetchPropertyEstimate(property);
  if (estimate) {
    setCache(cacheKey, estimate);
    return estimate;
  }

  // Fall back to market-level stats by zip
  const marketEstimate = await fetchMarketStats(property);
  if (marketEstimate) {
    setCache(cacheKey, marketEstimate);
    return marketEstimate;
  }

  return null;
}

// ---------- internal API calls ----------

/**
 * Try the property-level Rentalizer estimate (most accurate).
 */
async function fetchPropertyEstimate(property: PropertyData): Promise<STREstimate | null> {
  try {
    const address = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;
    const params = new URLSearchParams({
      address,
    });

    if (property.bedrooms) params.set('bedrooms', String(property.bedrooms));
    if (property.bathrooms) params.set('bathrooms', String(property.bathrooms));

    const res = await fetch(
      `https://${AIRDNA_HOST}/v1/rentalizer?${params}`,
      { headers: headers() },
    );

    if (!res.ok) {
      // Try alternate endpoint path
      const res2 = await fetch(
        `https://${AIRDNA_HOST}/properties?${params}`,
        { headers: headers() },
      );
      if (!res2.ok) {
        console.warn(`[AirDNA] Property estimate failed: ${res.status}, alt: ${res2.status}`);
        return null;
      }
      const data = await res2.json() as AirDnaPropertyData;
      return parseResponse(data, property, 'high');
    }

    const data = await res.json() as AirDnaPropertyData;
    return parseResponse(data, property, 'high');
  } catch (err: any) {
    console.warn('[AirDNA] Property estimate error:', err.message);
    return null;
  }
}

/**
 * Fall back to market-level ZIP stats (less accurate but broader coverage).
 */
async function fetchMarketStats(property: PropertyData): Promise<STREstimate | null> {
  try {
    const params = new URLSearchParams({
      zipcode: property.zip,
    });

    if (property.bedrooms) params.set('bedrooms', String(property.bedrooms));

    const res = await fetch(
      `https://${AIRDNA_HOST}/v1/market/statistics?${params}`,
      { headers: headers() },
    );

    if (!res.ok) {
      console.warn(`[AirDNA] Market stats failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as AirDnaPropertyData;
    return parseResponse(data, property, 'medium');
  } catch (err: any) {
    console.warn('[AirDNA] Market stats error:', err.message);
    return null;
  }
}

// ---------- response parser ----------

/**
 * Parse AirDNA's response into our STREstimate interface.
 * Handles multiple response shapes since the RapidAPI wrapper
 * may structure data differently than the native AirDNA API.
 */
function parseResponse(
  raw: AirDnaPropertyData,
  property: PropertyData,
  confidence: 'medium' | 'high',
): STREstimate | null {
  // Log raw shape for debugging during initial integration
  console.log('[AirDNA] Raw response keys:', Object.keys(raw));

  // Extract ADR (nightly rate) — try every known location
  const adr =
    raw.adr ??
    raw.average_daily_rate ??
    raw.stats?.adr?.ltm ??
    raw.stats?.adr?.value ??
    raw.rental_estimate?.adr ??
    raw.market_stats?.adr ??
    null;

  // Extract occupancy (0-1 range) — normalize if 0-100
  let occupancy =
    raw.occupancy ??
    raw.occupancy_rate ??
    raw.stats?.occupancy?.ltm ??
    raw.stats?.occupancy?.value ??
    raw.rental_estimate?.occupancy ??
    raw.market_stats?.occupancy ??
    null;

  if (occupancy !== null && occupancy > 1) {
    occupancy = occupancy / 100; // normalize percentage to decimal
  }

  // Extract revenue (prefer monthly)
  const annualRevenue =
    raw.annual_revenue ??
    raw.revenue ??
    raw.stats?.revenue?.ltm ??
    raw.stats?.revenue?.value ??
    raw.rental_estimate?.revenue ??
    raw.rental_estimate?.revenue_potential ??
    raw.market_stats?.revenue ??
    null;

  const monthlyRevenue = raw.monthly_revenue ?? (annualRevenue ? annualRevenue / 12 : null);

  // Need at least ADR or revenue to produce a useful estimate
  if (adr === null && monthlyRevenue === null) {
    console.warn('[AirDNA] Response missing both ADR and revenue — cannot produce estimate');
    return null;
  }

  // Compute derived values
  const nightlyRate = Math.round(adr ?? (monthlyRevenue! / 30 / (occupancy ?? 0.55)));
  const occupancyRate = occupancy ?? 0.55;
  const grossMonthlyRevenue = Math.round(
    monthlyRevenue ?? nightlyRate * 30 * occupancyRate,
  );

  // Estimate costs (AirDNA doesn't provide these)
  const bedrooms = property.bedrooms || 2;
  const cleaningPerTurn = bedrooms <= 1 ? 75 : bedrooms <= 3 ? 120 : 175;
  const avgStayNights = 3.5;
  const turnoversPerMonth = Math.round((30 * occupancyRate) / avgStayNights);
  const cleaningCosts = cleaningPerTurn * turnoversPerMonth;
  const platformFees = Math.round(grossMonthlyRevenue * 0.03);

  const netMonthlyRevenue = grossMonthlyRevenue - cleaningCosts - platformFees;

  const estimate: STREstimate = {
    nightlyRate,
    occupancyRate: Math.round(occupancyRate * 100) / 100,
    grossMonthlyRevenue,
    cleaningCosts,
    platformFees,
    netMonthlyRevenue,
    confidence,
    source: 'airdna',
  };

  console.log(`[AirDNA] STR estimate: $${nightlyRate}/night, ${Math.round(occupancyRate * 100)}% occ, $${grossMonthlyRevenue}/mo gross`);
  return estimate;
}
