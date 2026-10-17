import { randomUUID } from 'crypto';
import type { Pool, QueryResultRow } from 'pg';
import { recordProviderCache, type DataProvider } from './providerUsageService.js';

const HOT_TTL_MS = 5 * 60 * 1000;
const LEASE_MS = 60_000;
const WAIT_MS = 18_000;
const RETRY_MS = 30_000;
const MAX_HOT_ENTRIES = 500;

export interface ProviderCacheSnapshot<T> {
  data: T;
  expiresAt: number;
}

export interface ProviderCacheStore<T> {
  read(key: string): Promise<ProviderCacheSnapshot<T> | null>;
  acquire(key: string, owner: string): Promise<boolean>;
  save(key: string, owner: string, data: T): Promise<boolean>;
  release(key: string, owner: string, failed: boolean): Promise<void>;
  prune(): Promise<void>;
}

interface StorePolicy<T> {
  table: 'rentcast_market_cache' | 'provider_data_cache';
  validate(value: unknown): value is T;
  freshMs: number;
  maxPayloadBytes: number;
}

export function createPostgresProviderCacheStore<T>(
  db: Pick<Pool, 'query'>, policy: StorePolicy<T>,
): ProviderCacheStore<T> {
  const table = policy.table;
  if (table !== 'rentcast_market_cache' && table !== 'provider_data_cache') {
    throw new Error('Unsupported provider cache table');
  }
  async function query<Row extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    // The outer deadline also covers waiting for a connection from the shared pool.
    const config = { text, values, query_timeout: 2000 };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        db.query<Row>(config),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Provider cache database deadline exceeded')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    async read(key) {
      const { rows } = await query<{ payload: unknown; expires_at: Date }>(
        `SELECT payload, expires_at FROM ${table}
         WHERE cache_key = $1 AND expires_at > clock_timestamp()`,
        [key],
      );
      const row = rows[0];
      if (!row) return null;
      if (!policy.validate(row.payload) || Buffer.byteLength(JSON.stringify(row.payload)) > policy.maxPayloadBytes) {
        console.warn('[provider:cache] Invalid persisted projection; invalidating');
        await query(
          `UPDATE ${table} SET payload = NULL, fetched_at = NULL, expires_at = NULL
           WHERE cache_key = $1 AND payload = $2::jsonb`,
          [key, JSON.stringify(row.payload)],
        );
        return null;
      }
      return { data: row.payload, expiresAt: row.expires_at.getTime() };
    },
    async acquire(key, owner) {
      const { rowCount } = await query(
        `INSERT INTO ${table} (cache_key, lease_owner, lease_expires_at)
         VALUES ($1, $2, clock_timestamp() + $3 * interval '1 millisecond')
         ON CONFLICT (cache_key) DO UPDATE
         SET lease_owner = EXCLUDED.lease_owner, lease_expires_at = EXCLUDED.lease_expires_at
         WHERE (${table}.expires_at IS NULL OR ${table}.expires_at <= clock_timestamp())
           AND (${table}.lease_expires_at IS NULL OR ${table}.lease_expires_at <= clock_timestamp())
           AND (${table}.retry_after IS NULL OR ${table}.retry_after <= clock_timestamp())`,
        [key, owner, LEASE_MS],
      );
      return rowCount === 1;
    },
    async save(key, owner, data) {
      if (!policy.validate(data) || Buffer.byteLength(JSON.stringify(data)) > policy.maxPayloadBytes) {
        throw new Error('Invalid provider cache payload');
      }
      const { rowCount } = await query(
        `UPDATE ${table}
         SET payload = $3::jsonb, fetched_at = clock_timestamp(),
             expires_at = clock_timestamp() + $4 * interval '1 millisecond', retry_after = NULL
         WHERE cache_key = $1 AND lease_owner = $2 AND lease_expires_at > clock_timestamp()`,
        [key, owner, JSON.stringify(data), policy.freshMs],
      );
      return rowCount === 1;
    },
    async release(key, owner, failed) {
      await query(
        `UPDATE ${table} SET lease_owner = NULL, lease_expires_at = NULL,
           retry_after = CASE WHEN $3 THEN clock_timestamp() + $4 * interval '1 millisecond' ELSE NULL END
         WHERE cache_key = $1 AND lease_owner = $2`,
        [key, owner, failed, RETRY_MS],
      );
    },
    async prune() {
      await query(
        `DELETE FROM ${table} WHERE cache_key IN (
           SELECT cache_key FROM ${table}
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

export interface ProviderCacheDependencies<T> {
  store: ProviderCacheStore<T>;
  enabled(): boolean;
  load(input: string): Promise<T | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function createSharedProviderCache<T>(deps: ProviderCacheDependencies<T> & {
  key(input: string): string;
  validate(value: unknown): value is T;
  freshMs: number;
  provider: DataProvider;
  operation: string;
}) {
  const hot = new Map<string, ProviderCacheSnapshot<T>>();
  const inFlight = new Map<string, Promise<T | null>>();
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  let nextPrune = 0;

  function record(layer: Parameters<typeof recordProviderCache>[2], outcome: Parameters<typeof recordProviderCache>[3]) {
    recordProviderCache(deps.provider, deps.operation, layer, outcome);
  }

  function remember(key: string, data: T, expiresAt: number) {
    hot.delete(key);
    if (hot.size >= MAX_HOT_ENTRIES) {
      const first = hot.keys().next().value;
      if (first !== undefined) hot.delete(first);
    }
    hot.set(key, { data: structuredClone(data), expiresAt });
  }

  async function fill(input: string, key: string, shared: boolean): Promise<T | null> {
    if (!shared) {
      const data = await deps.load(input);
      if (data !== null && !deps.validate(data)) {
        console.warn('[provider:cache] Invalid provider projection');
        return null;
      }
      if (data !== null) remember(key, data, now() + deps.freshMs);
      return data;
    }
    const owner = randomUUID();
    let acquired = false;
    let waited = false;
    let persisted = false;
    let data: T | null = null;
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
          record('postgres', 'hit');
          remember(key, cached.data, Math.min(cached.expiresAt, now() + HOT_TTL_MS));
          return cached.data;
        }
        acquired = await deps.store.acquire(key, owner);
        if (acquired) break;
        if (!waited) record('in-flight', 'wait');
        waited = true;
        await sleep(200);
      } while (now() < deadline);
      if (!acquired) {
        record('in-flight', 'wait-timeout');
        console.warn('[provider:cache] Refresh wait timed out; no duplicate provider call');
        return null;
      }
      const cached = await deps.store.read(key);
      if (cached) {
        record('postgres', 'hit');
        remember(key, cached.data, Math.min(cached.expiresAt, now() + HOT_TTL_MS));
        return cached.data;
      }
      record('postgres', 'miss');
      data = await deps.load(input);
      if (data === null) return null;
      if (!deps.validate(data)) {
        console.warn('[provider:cache] Invalid provider projection');
        data = null;
        return null;
      }
      remember(key, data, now() + HOT_TTL_MS);
      persisted = await deps.store.save(key, owner, data);
      if (!persisted) {
        console.warn('[provider:cache] Refresh lease lost; result not persisted');
      }
      return data;
    } catch {
      record('postgres', 'error');
      console.warn('[provider:cache] Cache operation failed; no uncoordinated provider retry');
      return data;
    } finally {
      if (acquired) {
        try {
          await deps.store.release(key, owner, !persisted);
        } catch {
          record('postgres', 'error');
          console.warn('[provider:cache] Lease release failed; bounded lease will expire');
        }
      }
    }
  }

  return {
    async get(input: string): Promise<T | null> {
      const shared = deps.enabled();
      // Switching modes cannot serve a process-only result as shared data.
      const key = `${shared ? 'shared' : 'local'}:${deps.key(input)}`;
      const cached = hot.get(key);
      if (cached && cached.expiresAt > now()) {
        record('memory', 'hit');
        return structuredClone(cached.data);
      }
      record('memory', cached ? 'stale' : 'miss');
      hot.delete(key);
      let pending = inFlight.get(key);
      if (pending) record('in-flight', 'hit');
      if (!pending) {
        pending = fill(input, key, shared).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const result = await pending;
      return result !== null ? structuredClone(result) : null;
    },
  };
}
