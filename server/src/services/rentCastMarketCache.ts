import type { Pool } from 'pg';
import type { MarketStatistics } from '@deal-platform/shared-types';
import {
  createPostgresProviderCacheStore, createSharedProviderCache,
  type ProviderCacheSnapshot, type ProviderCacheStore, type ProviderCacheDependencies,
} from './sharedProviderCache.js';

export const MARKET_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const POLICY_VERSION = 'rentcast-api-2026-10-17-7d';
export type MarketCacheSnapshot = ProviderCacheSnapshot<MarketStatistics>;
export type MarketCacheStore = ProviderCacheStore<MarketStatistics>;

export function isMarketStatistics(value: unknown): value is MarketStatistics {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const metrics = ['medianRent', 'averageRent', 'totalListings', 'avgDaysOnMarket'] as const;
  const allowed = new Set<string>([...metrics, 'rentGrowthPct', 'rentTrend']);
  if (Object.keys(data).some(key => !allowed.has(key))) return false;
  if (!metrics.some(key => data[key] !== undefined)) return false;
  for (const key of metrics) {
    const number = data[key];
    if (number === undefined) continue;
    if (typeof number !== 'number' || !Number.isFinite(number) ||
      number < 0 || ((key === 'medianRent' || key === 'averageRent') && number === 0)) return false;
  }
  const growth = data.rentGrowthPct;
  if (growth === undefined) return data.rentTrend === undefined;
  if (typeof growth !== 'number' || !Number.isFinite(growth)) return false;
  return data.rentTrend === (growth > 2 ? 'rising' : growth < -2 ? 'declining' : 'stable');
}

export function marketCacheKey(zip: string): string {
  return `rentcast:markets:v3:${POLICY_VERSION}:dataType=All:historyRange=13:zipCode=${zip}`;
}

export function createPostgresMarketCacheStore(db: Pick<Pool, 'query'>): MarketCacheStore {
  return createPostgresProviderCacheStore(db, {
    table: 'rentcast_market_cache', validate: isMarketStatistics,
    freshMs: MARKET_FRESH_MS, maxPayloadBytes: 4096,
  });
}

export function createRentCastMarketCache(deps: ProviderCacheDependencies<MarketStatistics>) {
  const cache = createSharedProviderCache({
    ...deps, key: marketCacheKey, validate: isMarketStatistics,
    freshMs: MARKET_FRESH_MS, provider: 'rentcast', operation: 'markets',
  });
  return {
    get(zipInput: string) {
      const zip = zipInput.trim();
      if (!/^\d{5}$/.test(zip)) {
        console.warn('[RentCast:market-cache] Invalid ZIP; lookup skipped');
        return Promise.resolve(null);
      }
      return cache.get(zip);
    },
  };
}
