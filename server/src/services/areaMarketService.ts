/**
 * Area Market Data Service
 *
 * Caches housing market & rental market data through the shared provider cache
 * adapter so snapshots survive restarts and follow provider reuse policy.
 *
 * Refresh policy: data older than 7 days triggers a fresh API call.
 * Optional hot cache avoids hitting PostgreSQL on every property analysis.
 */

import type { HousingMarket, RentalMarketTrends } from '@deal-platform/shared-types';
import { readProviderCredential } from './providerPolicyRegistry.js';
import { readProviderCache, writeProviderCache } from './providerCacheAdapter.js';

// ── configuration ──────────────────────────────────────────────────────

const RAPIDAPI_KEY = () => readProviderCredential('private-zillow');
const RAPIDAPI_HOST = () => process.env.RAPIDAPI_HOST || 'private-zillow.p.rapidapi.com';

function rapidHeaders() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': RAPIDAPI_HOST(),
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function normalizeAreaKey(city: string, state: string): string {
  return `${city.trim().toLowerCase()}, ${state.trim().toLowerCase()}`;
}

// ── API fetchers (pure — no caching logic) ─────────────────────────────

async function fetchHousingMarketFromApi(searchQuery: string): Promise<HousingMarket | null> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/housing_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) {
      console.warn(`[areaMarketService] housing_market HTTP ${res.status} for "${searchQuery}"`);
      return null;
    }

    const data = await res.json() as any;

    // API returns 200 with error messages for unknown regions
    if (data.message && data.message.toLowerCase().includes('error')) {
      console.warn(`[areaMarketService] housing_market API error for "${searchQuery}": ${data.message}`);
      return null;
    }

    const overview = data.market_overview;
    const analytics = data.market_analytics;
    if (!overview || Object.keys(overview).length === 0) return null;

    const zhviTimeSeries: Array<{ date: string; value: number }> = [];
    if (Array.isArray(analytics?.zhviRange)) {
      for (const entry of analytics.zhviRange) {
        if (entry.timePeriodEnd && entry.dataValue > 0) {
          zhviTimeSeries.push({ date: entry.timePeriodEnd, value: Math.round(entry.dataValue) });
        }
      }
      zhviTimeSeries.reverse(); // chronological
    }

    const result: HousingMarket = {
      areaName: data.search_query || searchQuery,
      typicalHomeValue: Number(overview.typical_home_values) || 0,
      medianSalePrice: Number(overview.median_sale_price) || 0,
      medianListPrice: Number(overview.median_list_price) || 0,
      saleToListRatio: Number(overview.market_saletolist_ratio) || 0,
      pctSoldAboveList: Number(overview.percent_ofsales_over_list_price) || 0,
      pctSoldBelowList: Number(overview.percent_ofsales_under_list_price) || 0,
      medianDaysToPending: Number(overview.median_days_to_pending) || 0,
      forSaleInventory: Number(overview.for_sale_inventory) || 0,
      newListings: Number(overview.new_listings) || 0,
      zhviTimeSeries,
    };

    return result.typicalHomeValue > 0 ? result : null;
  } catch (err) {
    console.warn(`[areaMarketService] housing_market API failed for "${searchQuery}":`, (err as Error).message);
    return null;
  }
}

async function fetchRentalMarketFromApi(searchQuery: string): Promise<RentalMarketTrends | null> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/rental_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) {
      console.warn(`[areaMarketService] rental_market HTTP ${res.status} for "${searchQuery}"`);
      return null;
    }

    const data = await res.json() as any;

    // API returns 200 with error messages for unknown regions
    if (data.message && data.message.toLowerCase().includes('error')) {
      console.warn(`[areaMarketService] rental_market API error for "${searchQuery}": ${data.message}`);
      return null;
    }

    const trends = data.rental_market_trends;
    if (!trends?.summary) return null;

    const result: RentalMarketTrends = {
      areaName: trends.areaName || searchQuery,
      medianRent: Number(trends.summary.medianRent) || 0,
      monthlyChange: Number(trends.summary.monthlyChange) || 0,
      yearlyChange: Number(trends.summary.yearlyChange) || 0,
      availableRentals: Number(trends.summary.availableRentals) || 0,
      marketTemperature: trends.marketTemperature?.temperature || 'UNKNOWN',
      rentHistogram: Array.isArray(trends.rentHistogram?.priceAndCount)
        ? trends.rentHistogram.priceAndCount
            .filter((h: any) => h.price > 0 && h.count > 0)
            .map((h: any) => ({ price: Number(h.price), count: Number(h.count) }))
        : undefined,
      medianRentOverTime: trends.medianRentPriceOverTime ? {
        currentYear: (trends.medianRentPriceOverTime.currentYear || []).map((m: any) => ({
          month: String(m.month), year: String(m.year), price: Number(m.price) || 0,
        })),
        prevYear: (trends.medianRentPriceOverTime.prevYear || []).map((m: any) => ({
          month: String(m.month), year: String(m.year), price: Number(m.price) || 0,
        })),
      } : undefined,
      nationalMedianRent: trends.rentCompare?.medianRent ? Number(trends.rentCompare.medianRent) : undefined,
    };

    return result.medianRent > 0 ? result : null;
  } catch (err) {
    console.warn(`[areaMarketService] rental_market API failed for "${searchQuery}":`, (err as Error).message);
    return null;
  }
}

// ── public API ─────────────────────────────────────────────────────────

export interface AreaMarketData {
  housingMarket: HousingMarket | undefined;
  rentalMarket: RentalMarketTrends | undefined;
}

/**
 * Get housing + rental market data for an area.
 *
 * Resolution order:
 *   1. In-memory hot cache (1 hour TTL)
 *   2. PostgreSQL (latest row for this area_key)
 *   3. RapidAPI — only if no row exists or row is >7 days old
 *
 * New API results are inserted as a new row (snapshot) so historical
 * data accumulates for long-term analysis.
 */
export async function getAreaMarketData(city: string, state: string, zip?: string): Promise<AreaMarketData> {
  const areaKey = normalizeAreaKey(city, state);
  const searchQuery = `${city} ${state}`;
  const cacheKey = { endpoint: 'area-market', areaKey };

  const freshHit = await readProviderCache<AreaMarketData>({
    providerId: 'private-zillow',
    profile: 'areaMarket',
    hotProfile: 'areaMarketHot',
    key: cacheKey,
  });
  if (freshHit.hit) return freshHit.value;

  const staleHit = await readProviderCache<AreaMarketData>({
    providerId: 'private-zillow',
    profile: 'areaMarket',
    hotProfile: 'areaMarketHot',
    key: cacheKey,
    allowStaleIfError: true,
  });

  let [housing, rental] = await Promise.all([
    fetchHousingMarketFromApi(searchQuery),
    fetchRentalMarketFromApi(searchQuery),
  ]);

  // If city+state failed and we have a ZIP, retry with ZIP as search query.
  if (!housing && !rental && zip) {
    [housing, rental] = await Promise.all([
      fetchHousingMarketFromApi(zip),
      fetchRentalMarketFromApi(zip),
    ]);
  }

  const result: AreaMarketData = {
    housingMarket: housing ?? (staleHit.hit ? staleHit.value.housingMarket : undefined),
    rentalMarket: rental ?? (staleHit.hit ? staleHit.value.rentalMarket : undefined),
  };

  if (housing || rental) {
    await writeProviderCache({
      providerId: 'private-zillow',
      profile: 'areaMarket',
      hotProfile: 'areaMarketHot',
      key: cacheKey,
      value: {
        housingMarket: housing ?? undefined,
        rentalMarket: rental ?? undefined,
      },
    });
  }

  return result;
}
