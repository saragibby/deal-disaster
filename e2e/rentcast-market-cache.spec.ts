import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  createPostgresMarketCacheStore, createRentCastMarketCache, marketCacheKey,
  MARKET_FRESH_MS, isMarketStatistics, type MarketCacheStore,
} from '../server/src/services/rentCastMarketCache';
import { RENTCAST_MARKET_CACHE_SCHEMA } from '../server/src/db/rentCastMarketCacheSchema';
import { withProviderUsage, type ProviderUsageSummary } from '../server/src/services/providerUsageService';

function fakeStore(): MarketCacheStore {
  return {
    read: async () => null, acquire: async () => true, save: async () => true,
    release: async () => {}, prune: async () => {},
  };
}

test('process-only mode deduplicates misses, expires after seven days, and never touches DB', async () => {
  let time = 1000;
  let calls = 0;
  const forbidden = async () => { throw new Error('Unexpected database operation'); };
  const cache = createRentCastMarketCache({
    store: { read: forbidden, acquire: forbidden, save: forbidden, release: forbidden, prune: forbidden },
    enabled: () => false, now: () => time,
    load: async () => { calls++; return { medianRent: 2200 }; },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => cache.get('27500')));
  expect(calls).toBe(1);
  results[0]!.medianRent = 1;
  expect(await cache.get(' 27500 ')).toEqual({ medianRent: 2200 });
  time += MARKET_FRESH_MS;
  await cache.get('27500');
  expect(calls).toBe(2);
});

test('DB outage fails closed with no paid call and recovers on a later request', async () => {
  const store = fakeStore();
  let broken = true;
  store.read = async () => {
    if (broken) throw new Error('fixture database outage');
    return null;
  };
  let calls = 0;
  const cache = createRentCastMarketCache({
    store, enabled: () => true,
    load: async () => { calls++; return { medianRent: 2200 }; },
  });
  expect(await cache.get('27500')).toBeNull();
  expect(calls).toBe(0);
  broken = false;
  expect(await cache.get('27500')).toEqual({ medianRent: 2200 });
  expect(calls).toBe(1);
});

test('successful provider results survive persistence failure without a repeated paid call', async () => {
  const store = fakeStore();
  store.save = async () => { throw new Error('fixture write outage'); };
  const releases: boolean[] = [];
  store.release = async (_key, _owner, failed) => { releases.push(failed); };
  let calls = 0;
  const cache = createRentCastMarketCache({
    store, enabled: () => true, load: async () => { calls++; return { averageRent: 2000 }; },
  });
  expect(await cache.get('27500')).toEqual({ averageRent: 2000 });
  expect(await cache.get('27500')).toEqual({ averageRent: 2000 });
  expect(calls).toBe(1);
  expect(releases).toEqual([true]);
});

test('contention waits are bounded and never bypass the shared lease', async () => {
  const store = fakeStore();
  store.acquire = async () => false;
  let time = 1000;
  let calls = 0;
  const cache = createRentCastMarketCache({
    store, enabled: () => true, now: () => time,
    sleep: async ms => { time += ms; },
    load: async () => { calls++; return { medianRent: 2200 }; },
  });
  expect(await cache.get('27500')).toBeNull();
  expect(time).toBe(19000);
  expect(calls).toBe(0);
});

test('invalid ZIPs and payloads never become shared successful results', async () => {
  const store = fakeStore();
  let saves = 0;
  let calls = 0;
  store.save = async () => { saves++; return true; };
  const cache = createRentCastMarketCache({
    store, enabled: () => true, load: async () => { calls++; return {}; },
  });
  expect(await cache.get('27500-1234')).toBeNull();
  expect(calls).toBe(0);
  expect(await cache.get('27500')).toBeNull();
  expect(saves).toBe(0);
  expect(isMarketStatistics({ medianRent: 2200, ownerNames: [] })).toBe(false);
  expect(isMarketStatistics({ medianRent: 2200, rentGrowthPct: 3, rentTrend: 'stable' })).toBe(false);
});

test('rechecks shared state after lease acquisition and respects stored expiry in hot cache', async () => {
  let reads = 0;
  let time = 1000;
  let calls = 0;
  const store = fakeStore();
  store.read = async () => ++reads === 1 ? null : { data: { medianRent: 2200 }, expiresAt: 1100 };
  const cache = createRentCastMarketCache({
    store, enabled: () => true, now: () => time,
    load: async () => { calls++; return { medianRent: 2300 }; },
  });
  expect(await cache.get('27500')).toEqual({ medianRent: 2200 });
  expect(calls).toBe(0);
  time = 1101;
  store.read = async () => null;
  expect(await cache.get('27500')).toEqual({ medianRent: 2300 });
  expect(calls).toBe(1);
});

test('shared hot cache is bounded and expires without forcing another paid fill', async () => {
  const store = fakeStore();
  let reads = 0;
  let calls = 0;
  let time = 1000;
  store.read = async () => {
    reads++;
    return { data: { averageRent: 2100 }, expiresAt: time + MARKET_FRESH_MS };
  };
  const cache = createRentCastMarketCache({
    store, enabled: () => true, now: () => time,
    load: async () => { calls++; return { averageRent: 2200 }; },
  });
  for (let i = 10000; i < 10501; i++) await cache.get(String(i));
  const initialReads = reads;
  await cache.get('10000');
  expect(reads).toBe(initialReads + 1);
  await cache.get('10500');
  expect(reads).toBe(initialReads + 1);
  time += 5 * 60 * 1000;
  await cache.get('10500');
  expect(reads).toBe(initialReads + 2);
  expect(calls).toBe(0);
});

test('failed provider lookups release owned leases and do not persist empty success', async () => {
  const store = fakeStore();
  const releases: boolean[] = [];
  let saves = 0;
  store.release = async (_key, _owner, failed) => { releases.push(failed); };
  store.save = async () => { saves++; return true; };
  const cache = createRentCastMarketCache({ store, enabled: () => true, load: async () => null });
  expect(await cache.get('27500')).toBeNull();
  expect(saves).toBe(0);
  expect(releases).toEqual([true]);
});

test.describe('isolated real PostgreSQL market cache', () => {
  const exec = promisify(execFile);
  let directory: string;
  let socket: string;
  let db: Pool;
  let started = false;

  test.beforeAll(async () => {
    test.setTimeout(60000);
    directory = await mkdtemp(path.join(tmpdir(), 'rentcast-cache-test-'));
    socket = path.join(directory, 'socket');
    await mkdir(socket);
    // This cluster is created solely for these tests; no configured application DB is used.
    await exec('initdb', ['-D', path.join(directory, 'data'), '-U', 'cache_test', '--auth=trust', '--no-locale']);
    await exec('pg_ctl', [
      '-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'),
      '-o', `-k ${socket} -c listen_addresses='' -p 5432`, '-w', 'start',
    ]);
    started = true;
    db = new Pool({
      host: socket, user: 'cache_test', database: 'postgres', port: 5432,
      connectionTimeoutMillis: 2000, statement_timeout: 2000,
    });
    const migration = await readFile(path.join(process.cwd(),
      'server/src/db/migrations/add_rentcast_market_cache.sql'), 'utf8');
    await db.query(migration);
    await db.query(RENTCAST_MARKET_CACHE_SCHEMA);
  });
  test.beforeEach(async () => { await db.query('TRUNCATE rentcast_market_cache'); });
  test.afterAll(async () => {
    await db?.end();
    if (started) await exec('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('two independent Node processes share one provider fill, then a restarted client reuses it', async () => {
    let providerCalls = 0;
    const children = Array.from({ length: 2 }, () => fork(
      fileURLToPath(new URL('./fixtures/rentcast-cache-worker.ts', import.meta.url)),
      [], {
        execArgv: ['--import', 'tsx'],
        env: {
          PATH: process.env.PATH,
          DATABASE_URL: `postgresql://cache_test@localhost/postgres?host=${encodeURIComponent(socket)}&port=5432`,
          RENTCAST_API_KEY: 'fixture-key-not-a-real-credential',
          RENTCAST_SHARED_MARKET_CACHE_ENABLED: 'true',
        },
        silent: true,
      },
    ));
    try {
      const ready = children.map(child => new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => { if (code) reject(new Error(`Worker exited: ${code}`)); });
        child.on('message', message => {
          if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'ready') resolve();
        });
      }));
      const results = children.map(child => new Promise<unknown>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => { if (code) reject(new Error(`Worker exited: ${code}`)); });
        child.on('message', message => {
          if (typeof message !== 'object' || message === null || !('type' in message)) return;
          if (message.type === 'provider') providerCalls++;
          if (message.type === 'result' && 'result' in message) resolve(message.result);
          if (message.type === 'error') reject(new Error('Worker cache error'));
        });
      }));
      await Promise.all(ready);
      children.forEach(child => child.send('start'));
      expect(await Promise.all(results)).toEqual([{ medianRent: 2200 }, { medianRent: 2200 }]);
      expect(providerCalls).toBe(1);
      const restarted = createRentCastMarketCache({
        store: createPostgresMarketCacheStore(db), enabled: () => true,
        load: async () => { throw new Error('Unexpected provider request after restart'); },
      });
      const reports: ProviderUsageSummary[] = [];
      await withProviderUsage('analysis', async () => {
        expect(await restarted.get('27500')).toEqual({ medianRent: 2200 });
      }, report => reports.push(report));
      expect(reports[0]).toMatchObject({ attempts: 0, estimatedCostUsd: 0 });
      expect(reports[0].endpoints[0].cache).toEqual({ 'memory:miss': 1, 'postgres:hit': 1 });
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill();
    }
  });

  test('atomic leases have expiry and ownership protection; changed identities cannot collide', async () => {
    const store = createPostgresMarketCacheStore(db);
    const key = marketCacheKey('27500');
    const first = randomUUID();
    const second = randomUUID();
    expect(await store.acquire(key, first)).toBe(true);
    expect(await store.acquire(key, second)).toBe(false);
    expect(await store.acquire(marketCacheKey('27501'), second)).toBe(true);
    expect(await store.acquire(`${key}:different-history`, second)).toBe(true);
    expect(await store.save(key, second, { medianRent: 1 })).toBe(false);
    await store.release(key, second, false);
    expect(await store.acquire(key, second)).toBe(false);
    await db.query(`UPDATE rentcast_market_cache SET lease_expires_at = clock_timestamp() - interval '1 second'
      WHERE cache_key = $1`, [key]);
    expect(await store.acquire(key, second)).toBe(true);
    expect(await store.save(key, first, { medianRent: 1 })).toBe(false);
    expect(await store.save(key, second, { medianRent: 2200 })).toBe(true);
    await store.release(key, first, true);
    await store.release(key, second, false);
    expect((await store.read(key))?.data).toEqual({ medianRent: 2200 });
    expect(await store.acquire(key, first)).toBe(false);
  });

  test('database lock waits are bounded instead of hanging an optional market lookup', async () => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE rentcast_market_cache IN ACCESS EXCLUSIVE MODE');
      const startedAt = Date.now();
      await expect(createPostgresMarketCacheStore(db).read('locked')).rejects.toThrow();
      expect(Date.now() - startedAt).toBeLessThan(5000);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  test('failed refresh keeps prior data but never serves expired data and shares a cooldown', async () => {
    const store = createPostgresMarketCacheStore(db);
    const key = marketCacheKey('27500');
    const owner = randomUUID();
    await store.acquire(key, owner);
    await store.save(key, owner, { medianRent: 2200 });
    await store.release(key, owner, false);
    await db.query(`UPDATE rentcast_market_cache SET fetched_at = clock_timestamp() - interval '8 days',
      expires_at = clock_timestamp() - interval '1 day' WHERE cache_key = $1`, [key]);
    expect(await store.read(key)).toBeNull();
    const next = randomUUID();
    expect(await store.acquire(key, next)).toBe(true);
    await store.release(key, next, true);
    expect(await store.acquire(key, randomUUID())).toBe(false);
    const { rows } = await db.query('SELECT payload FROM rentcast_market_cache WHERE cache_key = $1', [key]);
    expect(rows[0].payload).toEqual({ medianRent: 2200 });
    await db.query(`UPDATE rentcast_market_cache SET retry_after = clock_timestamp() - interval '1 second'
      WHERE cache_key = $1`, [key]);
    expect(await store.acquire(key, randomUUID())).toBe(true);
  });

  test('corrupt projections are invalidated and bounded pruning preserves live leases and fresh entries', async () => {
    const store = createPostgresMarketCacheStore(db);
    await db.query(`INSERT INTO rentcast_market_cache(cache_key, payload, fetched_at, expires_at)
      VALUES ('corrupt', '{"ownerNames":["not-permitted"]}', clock_timestamp(), clock_timestamp() + interval '1 day')`);
    expect(await store.read('corrupt')).toBeNull();
    await db.query(`INSERT INTO rentcast_market_cache(cache_key)
      SELECT 'expired-' || n FROM generate_series(1, 150) n`);
    await store.acquire('leased', randomUUID());
    const owner = randomUUID();
    await store.acquire('fresh', owner);
    await store.save('fresh', owner, { averageRent: 2100 });
    await store.release('fresh', owner, false);
    await store.prune();
    expect((await db.query('SELECT count(*)::int AS count FROM rentcast_market_cache')).rows[0].count).toBe(53);
    await store.prune();
    expect((await db.query('SELECT cache_key FROM rentcast_market_cache ORDER BY cache_key')).rows)
      .toEqual([{ cache_key: 'fresh' }, { cache_key: 'leased' }]);
  });
});
