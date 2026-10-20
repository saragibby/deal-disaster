import { test, expect } from '@playwright/test';
import { createGooglePlacesService, GOOGLE_PLACES_FIELD_MASK } from '../server/src/services/googlePlacesService';
import { withProviderUsage, type ProviderUsageSummary } from '../server/src/services/providerUsageService';
import { Pool } from 'pg';
import { createPostgresGeocodingCache } from '../server/src/services/geocodingCache';

test('OSM geocoding cache only reads approved provider sources and performs no historical cleanup', async () => {
  const db = new Pool({ host: '/fixture/never-connect' });
  const calls: string[] = [];
  Object.defineProperty(db, 'query', { value: async (sql: string) => {
    calls.push(sql);
    return { rows: [{
      address_key: 'osm:v1:fixture', latitude: 0, longitude: 0,
      provider: 'census', created_at: new Date('2026-10-01T00:00:00Z'),
    }] };
  } });
  try {
    expect(await createPostgresGeocodingCache(db).lookup(['fixture'])).toEqual(new Map([
      ['fixture', {
        lat: 0, lng: 0, coordinateSource: 'census', coordinatesObservedAt: '2026-10-01T00:00:00.000Z',
      }],
    ]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("provider IN ('census', 'nominatim')");
    expect(calls[0]).not.toMatch(/DELETE|UPDATE|INSERT|provider = 'google'/);
  } finally {
    await db.end();
  }
});

test('empty geocoding operations do not query the database and read failures remain explicit', async () => {
  const db = new Pool({ host: '/fixture/never-connect' });
  let calls = 0;
  Object.defineProperty(db, 'query', { value: async (sql: string) => {
    calls++;
    if (sql.includes('SELECT address_key')) throw new Error('fixture-read-failure');
    return { rows: [] };
  } });
  try {
    const cache = createPostgresGeocodingCache(db);
    expect(await cache.lookup([])).toEqual(new Map());
    await cache.store([]);
    expect(calls).toBe(0);
    await expect(cache.lookup(['fixture'])).rejects.toThrow('fixture-read-failure');
    expect(calls).toBe(1);
  } finally {
    await db.end();
  }
});

const place = {
  id: 'fixture-place', displayName: { text: 'Fixture Hospital' },
  location: { latitude: 35, longitude: -80 }, types: ['hospital'],
  attributions: [{ provider: 'Fixture Data', providerUri: 'https://fixture.invalid/attribution' }],
};

test('Places New uses two Nearby and three Text searches with explicit Pro field masks', async () => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const service = createGooglePlacesService({
    apiKey: () => 'fixture-key',
    fetch: async (input, init) => {
      calls.push({ url: new URL(String(input)), init: init! });
      return Response.json({ places: [place] });
    },
  });
  const result = await service.search(35, -80);
  expect(result.status).toBe('complete');
  expect(calls).toHaveLength(5);
  expect(calls.filter(call => call.url.pathname.endsWith('searchNearby'))).toHaveLength(2);
  expect(calls.filter(call => call.url.pathname.endsWith('searchText'))).toHaveLength(3);
  for (const { url, init } of calls) {
    expect(url.origin).toBe('https://places.googleapis.com');
    expect(url.search).toBe('');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect(headers.get('X-Goog-Api-Key')).toBe('fixture-key');
    expect(headers.get('X-Goog-FieldMask')).toBe(GOOGLE_PLACES_FIELD_MASK);
    expect(GOOGLE_PLACES_FIELD_MASK).not.toMatch(/\*|rating|photos|openingHours|websiteUri/);
  }
  expect(JSON.parse(String(calls[0].init.body))).toEqual({
    includedTypes: ['hospital'], maxResultCount: 20, rankPreference: 'POPULARITY',
    locationRestriction: { circle: { center: { latitude: 35, longitude: -80 }, radius: 16000 } },
  });
  expect(JSON.parse(String(calls[2].init.body)).includedTypes).toEqual(['university']);
  expect(calls.filter(call => call.url.pathname.endsWith('searchText'))
    .map(call => JSON.parse(String(call.init.body)).textQuery))
    .toEqual(['military base', 'corporate office park', 'government building']);
  expect(result.categories[0].places[0]).toEqual({
    id: place.id, name: place.displayName.text, ...place.location, types: place.types,
    attributions: place.attributions,
  });
});

test('Places New keeps exact concurrent searches single-flight but retains no result cache', async () => {
  let calls = 0;
  const service = createGooglePlacesService({
    apiKey: () => 'fixture-key',
    fetch: async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ places: [place] });
    },
  });
  const [first, second] = await Promise.all([service.search(35, -80), service.search(35, -80)]);
  expect(calls).toBe(5);
  first.categories[0].places[0].name = 'mutated';
  expect(second.categories[0].places[0].name).toBe('Fixture Hospital');
  await service.search(35, -80);
  expect(calls).toBe(10);
  await Promise.all([service.search(35, -80), service.search(35.0001, -80)]);
  expect(calls).toBe(20);
});

test('Places New locally enforces radius and removes duplicate IDs within each category', async () => {
  const service = createGooglePlacesService({
    apiKey: () => 'fixture-key',
    fetch: async () => Response.json({ places: [
      place, place,
      { ...place, id: 'outside', location: { latitude: 36, longitude: -80 } },
      { ...place, id: 'nearby', location: { latitude: 35.01, longitude: -80 } },
    ] }),
  });
  const result = await service.search(35, -80);
  expect(result.categories.every(category => category.places.length === 2)).toBe(true);
  expect(result.categories[1].places.map(place => place.id)).toEqual(['fixture-place', 'nearby']);
});

test('missing key makes zero calls and invalid coordinates fail explicitly', async () => {
  let calls = 0;
  const service = createGooglePlacesService({
    apiKey: () => '', fetch: async () => { calls++; throw new Error('Unexpected fetch'); },
  });
  expect(await service.search(0, 0)).toEqual({ status: 'unconfigured', categories: [] });
  await expect(service.search(NaN, 0)).rejects.toThrow(RangeError);
  await expect(service.search(91, 0)).rejects.toThrow(RangeError);
  expect(calls).toBe(0);
});

for (const failure of ['http', 'network', 'invalid-json', 'api-error', 'bad-container', 'bad-place', 'unsafe-attribution'] as const) {
  test(`Places New ${failure} is unavailable, sanitized and not retried through Legacy`, async () => {
    let calls = 0;
    const reports: unknown[] = [];
    const service = createGooglePlacesService({
      apiKey: () => 'fixture-key-secret',
      report: (...args) => reports.push(args),
      fetch: async input => {
        calls++;
        expect(String(input)).toContain('places.googleapis.com');
        if (failure === 'network') throw new Error('fixture-private-upstream-message');
        if (failure === 'http') return new Response('fixture-private-body', { status: 403 });
        if (failure === 'invalid-json') return new Response('fixture-private-malformed-json');
        if (failure === 'api-error') return Response.json({ error: { message: 'fixture-private-error' } });
        if (failure === 'bad-container') return Response.json({ places: {} });
        if (failure === 'bad-place') return Response.json({ places: [{ ...place, location: { latitude: 999, longitude: 0 } }] });
        return Response.json({ places: [{ ...place, attributions: [{ provider: 'Fixture', providerUri: 'javascript:alert(1)' }] }] });
      },
    });
    expect((await service.search(35, -80)).status).toBe('unavailable');
    expect(calls).toBe(5);
    expect(reports).toHaveLength(5);
    expect(JSON.stringify(reports)).not.toMatch(/fixture|private|key|address/i);
  });
}

test('Places New distinguishes valid empty responses from partially unavailable categories', async () => {
  const reports: unknown[] = [];
  const service = createGooglePlacesService({
    apiKey: () => 'fixture-key', report: (...args) => reports.push(args),
    fetch: async input => String(input).endsWith('searchText')
      ? new Response('', { status: 429 }) : Response.json({}),
  });
  const result = await service.search(35, -80);
  expect(result.status).toBe('partial');
  expect(result.categories.filter(category => category.status === 'ok')).toHaveLength(2);
  expect(result.categories.every(category => category.places.length === 0)).toBe(true);
  expect(reports).toHaveLength(3);
});

test('Places New transport accounting separates Nearby Pro and Text Pro without private inputs', async () => {
  const originalFetch = globalThis.fetch;
  const reports: ProviderUsageSummary[] = [];
  globalThis.fetch = async () => Response.json({ places: [place] });
  try {
    const service = createGooglePlacesService({ apiKey: () => 'fixture-key-secret' });
    await withProviderUsage('analysis', async () => {
      await service.search(35, -80);
    }, report => reports.push(report));
    expect(reports[0]).toMatchObject({
      pricingVersion: '2026-10-16-scenario-v2', attempts: 5, estimatedCostUsd: 0.16, unknownCostAttempts: 0,
    });
    expect(reports[0].endpoints).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'places-nearby-new', attempts: 2, estimatedCostUsd: 0.064 }),
      expect.objectContaining({ operation: 'places-text-new', attempts: 3, estimatedCostUsd: 0.096 }),
    ]));
    expect(JSON.stringify(reports)).not.toMatch(/fixture|latitude|secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
