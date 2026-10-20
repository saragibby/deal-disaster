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
import {
  createPostgresProviderCacheStore, createSharedProviderCache, type ProviderCacheStore,
} from '../server/src/services/sharedProviderCache';
import { RENTCAST_MARKET_CACHE_SCHEMA } from '../server/src/db/rentCastMarketCacheSchema';
import { withProviderUsage, type ProviderUsageSummary } from '../server/src/services/providerUsageService';
import { PROVIDER_DATA_CACHE_SCHEMA } from '../server/src/db/providerDataCacheSchema';
import { createPostgresGeocodingCache } from '../server/src/services/geocodingCache';
import {
  rentCastPropertyCacheKey, isRentEstimateProjection, isRentalCompProjection,
  RENTCAST_PROPERTY_FRESH_MS, createRentCastPropertyCache, type RentEstimateProjection,
} from '../server/src/services/rentCastPropertyCache';

test('property keys are hashed, query-order independent and endpoint/input specific', () => {
  const query = 'address=10+Fixture+St+Unit+2&bedrooms=0&limit=10';
  const key = rentCastPropertyCacheKey('rent-avm', query);
  expect(key).not.toMatch(/Fixture|Unit|address=|bedrooms=/);
  expect(key).toBe(rentCastPropertyCacheKey('rent-avm', 'limit=10&bedrooms=0&address=10+Fixture+St+Unit+2'));
  for (const changed of [
    `${query}&bathrooms=2`, query.replace('Unit+2', 'Unit+3'),
    query.replace('bedrooms=0', 'bedrooms=1'), query.replace('limit=10', 'limit=20'),
    `${query}&radius=3`, `${query}&latitude=0&longitude=0`, `${query}&status=Active`,
    `${query}&propertyType=Condo`, `${query}&squareFootage=1200`,
  ]) expect(rentCastPropertyCacheKey('rent-avm', changed)).not.toBe(key);
  expect(rentCastPropertyCacheKey('rental-listings', query)).not.toBe(key);
});

test('property projections reject private/raw fields, malformed and nonfinite values', () => {
  expect(isRentEstimateProjection({ mid: 2000, low: 1800, high: 2200 })).toBe(true);
  expect(isRentEstimateProjection({ mid: Infinity, low: 1800, high: 2200 })).toBe(false);
  expect(isRentEstimateProjection({ mid: 2000, low: 1800, high: 2200, owner: {} })).toBe(false);
  expect(isRentalCompProjection([])).toBe(true);
  expect(isRentalCompProjection([{ rent: 2000, bedrooms: 0, source: 'api' }])).toBe(true);
  expect(isRentalCompProjection([{ rent: 2000, ownerNames: ['private'], source: 'api' }])).toBe(false);
  expect(isRentalCompProjection([{ rent: -1, source: 'api' }])).toBe(false);
  expect(isRentalCompProjection([{ rent: 2000, bedrooms: NaN, source: 'api' }])).toBe(false);
});

test('property cache keeps 24-hour local expiry, deduplicates and separates mode switches', async () => {
  let time = 1000;
  let shared = false;
  let calls = 0;
  const store: ProviderCacheStore<RentEstimateProjection> = {
    read: async () => null, acquire: async () => true, save: async () => true,
    release: async () => {}, prune: async () => {},
  };
  const cache = createSharedProviderCache({
    store, enabled: () => shared, now: () => time, freshMs: RENTCAST_PROPERTY_FRESH_MS,
    key: query => rentCastPropertyCacheKey('rent-avm', query),
    validate: isRentEstimateProjection, provider: 'rentcast', operation: 'rent-avm',
    load: async () => { calls++; return { mid: 2000, low: 1800, high: 2200 }; },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => cache.get('address=fixture')));
  expect(calls).toBe(1);
  results[0]!.mid = 1;
  expect((await cache.get('address=fixture'))?.mid).toBe(2000);
  time += RENTCAST_PROPERTY_FRESH_MS;
  await cache.get('address=fixture');
  expect(calls).toBe(2);
  shared = true;
  await cache.get('address=fixture');
  expect(calls).toBe(3);
});

test('property adapter defaults to local-only operation and fails closed on a shared DB outage', async () => {
  const originalEnabled = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  let databaseCalls = 0;
  let providerCalls = 0;
  const db = new Pool({ host: '/fixture/never-connect' });
  const query = db.query;
  Object.defineProperty(db, 'query', { configurable: true, value: async () => {
    databaseCalls++;
    throw new Error('fixture cache outage');
  } });
  const cache = createRentCastPropertyCache(db, 'rent-avm', isRentEstimateProjection, async () => {
    providerCalls++;
    return { mid: 2000, low: 1800, high: 2200 };
  });
  try {
    delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    expect((await cache.get('address=fixture'))?.mid).toBe(2000);
    expect(databaseCalls).toBe(0);
    process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'true';
    expect(await cache.get('address=fixture')).toBeNull();
    expect(databaseCalls).toBe(1);
    expect(providerCalls).toBe(1);
  } finally {
    Object.defineProperty(db, 'query', { value: query });
    await db.end();
    if (originalEnabled === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalEnabled;
  }
});

test('oversized property projections are rejected before entering the process cache', async () => {
  const originalEnabled = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  const db = new Pool({ host: '/fixture/never-connect' });
  let calls = 0;
  const cache = createRentCastPropertyCache(db, 'rental-listings', isRentalCompProjection, async () => {
    calls++;
    return [{ rent: 2000, source: 'api', address: 'x'.repeat(256 * 1024) }];
  });
  try {
    expect(await cache.get('city=fixture')).toBeNull();
    expect(await cache.get('city=fixture')).toBeNull();
    expect(calls).toBe(2);
  } finally {
    await db.end();
    if (originalEnabled === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalEnabled;
  }
});

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
    await db.query(await readFile(path.join(process.cwd(),
      'server/src/db/migrations/add_provider_data_cache.sql'), 'utf8'));
    await db.query(PROVIDER_DATA_CACHE_SCHEMA);
    await db.query(await readFile(path.join(process.cwd(),
      'server/src/db/migrations/add_geocoding_cache.sql'), 'utf8'));
  });
  test.beforeEach(async () => { await db.query('TRUNCATE rentcast_market_cache, provider_data_cache, geocoding_cache'); });
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

  test('OSM cache excludes Google regardless of age and preserves all historical rows', async () => {
    const cache = createPostgresGeocodingCache(db);
    for (const [key, provider, age] of [
      ['fresh', 'google', "clock_timestamp() - interval '29 days'"],
      ['expired', 'google', "clock_timestamp() - interval '30 days'"],
      ['undated', 'google', 'NULL'],
      ['future', 'google', "clock_timestamp() + interval '1 day'"],
      ['unknown', 'unverified', 'clock_timestamp()'],
      ['census', 'census', "clock_timestamp() - interval '365 days'"],
      ['nominatim', 'nominatim', "clock_timestamp() - interval '365 days'"],
    ]) {
      await db.query(`INSERT INTO geocoding_cache(address_key, latitude, longitude, provider, created_at)
        VALUES ($1, 35, -80, $2, ${age})`, [key, provider]);
    }
    const before = (await db.query('SELECT * FROM geocoding_cache ORDER BY id')).rows;
    const result = await cache.lookup(['fresh', 'expired', 'undated', 'future', 'unknown', 'census', 'nominatim']);
    expect([...result.keys()].sort()).toEqual(['census', 'nominatim']);
    expect(result.get('census')).toMatchObject({ lat: 35, lng: -80, coordinateSource: 'census' });
    expect(result.get('census')?.coordinatesObservedAt).toEqual(expect.any(String));
    expect((await cache.lookup(['fresh'])).size).toBe(0);
    await expect(cache.store([{
      key: 'expired', coords: { lat: 0, lng: 0 }, provider: 'google', address: 'Fixture Unit 1',
    }])).rejects.toThrow('disabled for OpenStreetMap');
    expect((await db.query('SELECT * FROM geocoding_cache ORDER BY id')).rows).toEqual(before);
    await cache.store([{
      key: 'unknown', coords: { lat: 36, lng: -81 }, provider: 'census', address: 'Fixture Unit 2',
    }]);
    const replacement = (await db.query("SELECT provider, latitude FROM geocoding_cache WHERE address_key = 'osm:v1:unknown'")).rows[0];
    expect(replacement).toMatchObject({ provider: 'census', latitude: 36 });
    expect((await cache.lookup(['unknown'])).get('unknown')).toMatchObject({ lat: 36, lng: -81, coordinateSource: 'census' });
    expect((await db.query("SELECT * FROM geocoding_cache WHERE address_key NOT LIKE 'osm:v1:%' ORDER BY id")).rows).toEqual(before);
  });

  test('new Census cache namespace preserves Google history and refreshes only its own entries', async () => {
    await db.query(`INSERT INTO geocoding_cache(address_key, latitude, longitude, provider, created_at)
      SELECT 'old-' || n, 35, -80, 'google', clock_timestamp() - interval '31 days'
      FROM generate_series(1, 125) n`);
    const cache = createPostgresGeocodingCache(db);
    expect((await cache.lookup(Array.from({ length: 125 }, (_, n) => `old-${n + 1}`))).size).toBe(0);
    const before = (await db.query('SELECT * FROM geocoding_cache ORDER BY id')).rows;
    for (const lat of [0, 36]) {
      await cache.store([{
        key: 'old-1', coords: { lat, lng: -81 }, provider: 'census', address: 'Fixture Unit 1',
      }]);
      const hit = (await cache.lookup(['old-1'])).get('old-1');
      expect(hit).toMatchObject({ lat, lng: -81, coordinateSource: 'census' });
      expect(hit?.coordinatesObservedAt).toEqual(expect.any(String));
    }
    expect((await db.query("SELECT * FROM geocoding_cache WHERE provider = 'google' ORDER BY id")).rows).toEqual(before);
    expect((await db.query('SELECT * FROM geocoding_cache')).rowCount).toBe(126);
    await db.query(`INSERT INTO geocoding_cache(address_key, latitude, longitude, provider)
      VALUES ('old-1', 35, -80, 'census')
      ON CONFLICT(address_key) DO UPDATE SET provider = 'census'`);
    expect((await cache.lookup(['old-1'])).get('old-1')).toMatchObject({ lat: 36, lng: -81 });
  });

  for (const operation of ['avm', 'listings', 'empty'] as const) {
    test(`actual RentCast ${operation} requests share one fill across processes and a restarted service`, async () => {
      let providerCalls = 0;
      const children: ReturnType<typeof fork>[] = [];
      async function worker() {
        const child = fork(fileURLToPath(new URL('./fixtures/rentcast-cache-worker.ts', import.meta.url)),
          [operation], {
            execArgv: ['--import', 'tsx'],
            env: {
              PATH: process.env.PATH,
              DATABASE_URL: `postgresql://cache_test@localhost/postgres?host=${encodeURIComponent(socket)}&port=5432`,
              RENTCAST_API_KEY: 'fixture-key-not-a-real-credential',
              RENTCAST_SHARED_PROPERTY_CACHE_ENABLED: 'true',
            }, silent: true,
          });
        children.push(child);
        let ready!: () => void;
        const readiness = new Promise<void>(resolve => { ready = resolve; });
        const result = new Promise<unknown>((resolve, reject) => {
          child.once('error', reject);
          child.once('exit', code => reject(new Error(`Property worker exited without result: ${code}`)));
          child.on('message', message => {
            if (typeof message !== 'object' || message === null || !('type' in message)) return;
            if (message.type === 'provider') providerCalls++;
            if (message.type === 'ready') ready();
            if (message.type === 'result' && 'result' in message) resolve(message.result);
            if (message.type === 'error') reject(new Error('Property cache worker failed'));
          });
        });
        // Propagate startup failure rather than waiting indefinitely for ready.
        await Promise.race([readiness, result.then(() => {})]);
        return { child, result };
      }
      try {
        const workers = await Promise.all([worker(), worker()]);
        workers.forEach(({ child }) => child.send('start'));
        const expected = operation === 'empty' ? [] : operation === 'avm' ? { mid: 2200, low: 2000, high: 2400 }
          : [{ rent: 2100, bedrooms: 3, source: 'api' }];
        expect(await Promise.all(workers.map(({ result }) => result))).toEqual([expected, expected]);
        expect(providerCalls).toBe(1);
        const restarted = await worker();
        restarted.child.send('start');
        expect(await restarted.result).toEqual(expected);
        expect(providerCalls).toBe(1);
        const { rows } = await db.query('SELECT cache_key, payload, fetched_at, expires_at FROM provider_data_cache');
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows)).not.toMatch(/not-for-cache|owner|Fixture|address=/);
        expect(rows[0].expires_at.getTime() - rows[0].fetched_at.getTime()).toBe(RENTCAST_PROPERTY_FRESH_MS);
      } finally {
        for (const child of children) if (child.exitCode === null) child.kill();
      }
    });
  }

  test('property store protects ownership, expiry, payloads and persisted reuse accounting', async () => {
    const store = createPostgresProviderCacheStore(db, {
      table: 'provider_data_cache', validate: isRentEstimateProjection,
      freshMs: RENTCAST_PROPERTY_FRESH_MS, maxPayloadBytes: 4096,
    });
    const key = `shared:${rentCastPropertyCacheKey('rent-avm', 'address=fixture')}`;
    const owner = randomUUID();
    const other = randomUUID();
    expect(await store.acquire(key, owner)).toBe(true);
    expect(await store.acquire(key, other)).toBe(false);
    expect(await store.save(key, other, { mid: 1, low: 1, high: 1 })).toBe(false);
    expect(await store.save(key, owner, { mid: 2000, low: 1800, high: 2200 })).toBe(true);
    await store.release(key, owner, false);
    const originalEnabled = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'true';
    try {
      const reports: ProviderUsageSummary[] = [];
      const cache = createRentCastPropertyCache(db, 'rent-avm', isRentEstimateProjection,
        async () => { throw new Error('Unexpected provider after persisted hit'); });
      await withProviderUsage('analysis', async () => {
        expect((await cache.get('address=fixture'))?.mid).toBe(2000);
      }, report => reports.push(report));
      expect(reports[0]).toMatchObject({ attempts: 0, unknownCostAttempts: 0 });
      expect(reports[0].endpoints[0]).toMatchObject({ operation: 'rent-avm', cache: { 'memory:miss': 1, 'postgres:hit': 1 } });
    } finally {
      if (originalEnabled === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
      else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalEnabled;
    }
    await db.query(`UPDATE provider_data_cache SET fetched_at = clock_timestamp() - interval '2 days',
      expires_at = clock_timestamp() - interval '1 day' WHERE cache_key = $1`, [key]);
    expect(await store.read(key)).toBeNull();
    expect(await store.acquire(key, other)).toBe(true);
    expect(await store.save(key, owner, { mid: 1, low: 1, high: 1 })).toBe(false);
    await store.release(key, other, true);
    expect(await store.acquire(key, owner)).toBe(false);
  });

  test('property persistence invalidates private fields and rejects oversized payloads', async () => {
    const store = createPostgresProviderCacheStore(db, {
      table: 'provider_data_cache', validate: isRentalCompProjection,
      freshMs: RENTCAST_PROPERTY_FRESH_MS, maxPayloadBytes: 1024,
    });
    await db.query(`INSERT INTO provider_data_cache(cache_key, payload, fetched_at, expires_at)
      VALUES ('corrupt-property', '{"ownerNames":["private"]}', clock_timestamp(), clock_timestamp() + interval '1 day')`);
    expect(await store.read('corrupt-property')).toBeNull();
    const owner = randomUUID();
    await store.acquire('large', owner);
    await expect(store.save('large', owner, [{ rent: 2000, source: 'api', address: 'x'.repeat(2048) }])).rejects.toThrow();
    await store.release('large', owner, true);
    await store.prune();
    expect((await db.query("SELECT * FROM provider_data_cache WHERE cache_key = 'corrupt-property'")).rowCount).toBe(0);
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
