import { randomUUID } from 'crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { MarketStatistics } from '@deal-platform/shared-types';
import { recordProviderCache } from './providerUsageService.js';

export const MARKET_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const HOT_TTL_MS = 5 * 60 * 1000;
const LEASE_MS = 60_000;
const WAIT_MS = 18_000;
const RETRY_MS = 30_000;
const MAX_HOT_ENTRIES = 500;
const MAX_PAYLOAD_BYTES = 4096;
const POLICY_VERSION = 'rentcast-api-2026-10-17-7d';

export interface MarketCacheSnapshot {
  data: MarketStatistics;
  expiresAt: number;
}

export interface MarketCacheStore {
  read(key: string): Promise<MarketCacheSnapshot | null>;
  acquire(key: string, owner: string): Promise<boolean>;
  save(key: string, owner: string, data: MarketStatistics): Promise<boolean>;
  release(key: string, owner: string, failed: boolean): Promise<void>;
  prune(): Promise<void>;
}

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
  async function query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    // The outer deadline also covers waiting for a connection from the shared pool.
    const config = { text, values, query_timeout: 2000 };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        db.query<Row>(config),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Market cache database deadline exceeded')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    async read(key) {
      const { rows } = await query<{ payload: unknown; expires_at: Date }>(
        `SELECT payload, expires_at FROM rentcast_market_cache
         WHERE cache_key = $1 AND expires_at > clock_timestamp()`,
        [key],
      );
      const row = rows[0];
      if (!row) return null;
      if (!isMarketStatistics(row.payload)) {
        console.warn('[RentCast:market-cache] Invalid persisted metrics; invalidating');
        await query(
          `UPDATE rentcast_market_cache SET payload = NULL, fetched_at = NULL, expires_at = NULL
           WHERE cache_key = $1 AND payload = $2::jsonb`,
          [key, JSON.stringify(row.payload)],
        );
        return null;
      }
      return { data: row.payload, expiresAt: row.expires_at.getTime() };
    },
    async acquire(key, owner) {
      const { rowCount } = await query(
        `INSERT INTO rentcast_market_cache (cache_key, lease_owner, lease_expires_at)
         VALUES ($1, $2, clock_timestamp() + $3 * interval '1 millisecond')
         ON CONFLICT (cache_key) DO UPDATE
         SET lease_owner = EXCLUDED.lease_owner, lease_expires_at = EXCLUDED.lease_expires_at
         WHERE (rentcast_market_cache.expires_at IS NULL OR rentcast_market_cache.expires_at <= clock_timestamp())
           AND (rentcast_market_cache.lease_expires_at IS NULL OR rentcast_market_cache.lease_expires_at <= clock_timestamp())
           AND (rentcast_market_cache.retry_after IS NULL OR rentcast_market_cache.retry_after <= clock_timestamp())`,
        [key, owner, LEASE_MS],
      );
      return rowCount === 1;
    },
    async save(key, owner, data) {
      if (!isMarketStatistics(data) || Buffer.byteLength(JSON.stringify(data)) > MAX_PAYLOAD_BYTES) {
        throw new Error('Invalid RentCast market cache payload');
      }
      const { rowCount } = await query(
        `UPDATE rentcast_market_cache
         SET payload = $3::jsonb, fetched_at = clock_timestamp(),
             expires_at = clock_timestamp() + $4 * interval '1 millisecond', retry_after = NULL
         WHERE cache_key = $1 AND lease_owner = $2 AND lease_expires_at > clock_timestamp()`,
        [key, owner, JSON.stringify(data), MARKET_FRESH_MS],
      );
      return rowCount === 1;
    },
    async release(key, owner, failed) {
      await query(
        `UPDATE rentcast_market_cache SET lease_owner = NULL, lease_expires_at = NULL,
           retry_after = CASE WHEN $3 THEN clock_timestamp() + $4 * interval '1 millisecond' ELSE NULL END
         WHERE cache_key = $1 AND lease_owner = $2`,
        [key, owner, failed, RETRY_MS],
      );
    },
    async prune() {
      await query(
        `DELETE FROM rentcast_market_cache WHERE cache_key IN (
           SELECT cache_key FROM rentcast_market_cache
           WHERE COALESCE(expires_at, '-infinity'::timestamptz) <= clock_timestamp()
             AND COALESCE(lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp()
             AND COALESCE(retry_after, '-infinity'::timestamptz) <= clock_timestamp()
           ORDER BY expires_at NULLS FIRST LIMIT 100
           FOR UPDATE SKIP LOCKED
         )`,
      );
    },
  };
}

interface Dependencies {
  store: MarketCacheStore;
  enabled(): boolean;
  load(zip: string): Promise<MarketStatistics | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createRentCastMarketCache(deps: Dependencies) {
  const hot = new Map<string, MarketCacheSnapshot>();
  const inFlight = new Map<string, Promise<MarketStatistics | null>>();
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  let nextPrune = 0;

  function remember(key: string, data: MarketStatistics, expiresAt: number) {
    hot.delete(key);
    if (hot.size >= MAX_HOT_ENTRIES) {
      const first = hot.keys().next().value;
      if (first !== undefined) hot.delete(first);
    }
    hot.set(key, { data: structuredClone(data), expiresAt });
  }

  async function fill(zip: string, key: string, shared: boolean): Promise<MarketStatistics | null> {
    if (!shared) {
      const data = await deps.load(zip);
      if (data && !isMarketStatistics(data)) {
        console.warn('[RentCast:market-cache] Invalid provider projection');
        return null;
      }
      if (data) remember(key, data, now() + MARKET_FRESH_MS);
      return data;
    }
    const owner = randomUUID();
    let acquired = false;
    let waited = false;
    let persisted = false;
    let data: MarketStatistics | null = null;
    try {
      // One bounded cleanup per process per hour; expired data is never served.
      if (now() >= nextPrune) {
        nextPrune = now() + 60 * 60 * 1000;
        await deps.store.prune();
      }
      const deadline = now() + WAIT_MS;
      do {
        const cached = await deps.store.read(key);
        if (cached) {
          recordProviderCache('rentcast', 'markets', 'postgres', 'hit');
          remember(key, cached.data, Math.min(cached.expiresAt, now() + HOT_TTL_MS));
          return cached.data;
        }
        acquired = await deps.store.acquire(key, owner);
        if (acquired) break;
        if (!waited) recordProviderCache('rentcast', 'markets', 'in-flight', 'wait');
        waited = true;
        await sleep(200);
      } while (now() < deadline);
      if (!acquired) {
        recordProviderCache('rentcast', 'markets', 'in-flight', 'wait-timeout');
        console.warn('[RentCast:market-cache] Refresh wait timed out; no duplicate provider call');
        return null;
      }
      const cached = await deps.store.read(key);
      if (cached) {
        recordProviderCache('rentcast', 'markets', 'postgres', 'hit');
        remember(key, cached.data, Math.min(cached.expiresAt, now() + HOT_TTL_MS));
        return cached.data;
      }
      recordProviderCache('rentcast', 'markets', 'postgres', 'miss');
      data = await deps.load(zip);
      if (!data) return null;
      if (!isMarketStatistics(data)) {
        console.warn('[RentCast:market-cache] Invalid provider projection');
        data = null;
        return null;
      }
      remember(key, data, now() + HOT_TTL_MS);
      persisted = await deps.store.save(key, owner, data);
      if (!persisted) {
        console.warn('[RentCast:market-cache] Refresh lease lost; result not persisted');
      }
      return data;
    } catch {
      recordProviderCache('rentcast', 'markets', 'postgres', 'error');
      console.warn('[RentCast:market-cache] Cache operation failed; no uncoordinated provider retry');
      return data;
    } finally {
      if (acquired) {
        try {
          await deps.store.release(key, owner, !persisted);
        } catch {
          recordProviderCache('rentcast', 'markets', 'postgres', 'error');
          console.warn('[RentCast:market-cache] Lease release failed; bounded lease will expire');
        }
      }
    }
  }

  return {
    async get(zipInput: string): Promise<MarketStatistics | null> {
      const zip = zipInput.trim();
      if (!/^\d{5}$/.test(zip)) {
        console.warn('[RentCast:market-cache] Invalid ZIP; lookup skipped');
        return null;
      }
      const shared = deps.enabled();
      // Switching modes cannot serve a process-only result as shared data.
      const key = `${shared ? 'shared' : 'local'}:${marketCacheKey(zip)}`;
      const cached = hot.get(key);
      if (cached && cached.expiresAt > now()) {
        recordProviderCache('rentcast', 'markets', 'memory', 'hit');
        return structuredClone(cached.data);
      }
      recordProviderCache('rentcast', 'markets', 'memory', cached ? 'stale' : 'miss');
      hot.delete(key);
      let pending = inFlight.get(key);
      if (pending) recordProviderCache('rentcast', 'markets', 'in-flight', 'hit');
      if (!pending) {
        pending = fill(zip, key, shared).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const result = await pending;
      return result ? structuredClone(result) : null;
    },
  };
}
