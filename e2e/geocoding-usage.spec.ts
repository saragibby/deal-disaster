import { test, expect } from '@playwright/test';
import {
  createGeocodingService,
  hasValidCoordinates,
  normalizeAddressKey,
  type AddressInput,
  type GeocodingAccounting,
  type Geocoordinates,
} from '../server/src/services/geocodingService';
import { getPropertyByAddress, getSimilarProperties } from '../server/src/services/propertyDataService';

function address(index: number): AddressInput {
  return { address: `${index} Fixture St`, city: 'Example', state: 'NC', zip: '27500' };
}

function harness(options: {
  fetch?: typeof fetch;
  lookup?: () => Promise<Map<string, Geocoordinates>>;
  store?: () => Promise<void>;
} = {}) {
  const requests: string[] = [];
  const reports: GeocodingAccounting[] = [];
  let reads = 0;
  let writes = 0;
  const service = createGeocodingService({
    googleApiKey: () => 'fixture-key-not-a-credential',
    fetch: async (...args) => {
      requests.push(new URL(String(args[0])).hostname);
      return options.fetch
        ? options.fetch(...args)
        : Response.json({ status: 'OK', results: [{ geometry: { location: { lat: 35, lng: -78 } } }] });
    },
    lookup: async () => {
      reads++;
      return options.lookup ? options.lookup() : new Map();
    },
    store: async () => { writes++; await options.store?.(); },
    report: report => reports.push(report),
  });
  return { service, requests, reports, reads: () => reads, writes: () => writes };
}

test('reuses subject plus 20 located comps without cache reads or provider requests', async () => {
  const h = harness();
  const items = Array.from({ length: 21 }, (_, i) => ({
    ...address(i), latitude: 35 + i / 100, longitude: -78,
  }));
  const before = structuredClone(items);
  await h.service.createSession().geocodeProperties(items);
  expect(items).toEqual(before);
  expect(h.requests).toHaveLength(0);
  expect(h.reads()).toBe(0);
  expect(h.writes()).toBe(0);
  expect(h.reports[0]).toMatchObject({ reusedCoordinates: 21, unresolved: 0 });
});

test('requests exactly three unique missing locations and fills duplicate addresses', async () => {
  const h = harness();
  const items: AddressInput[] = Array.from({ length: 21 }, (_, i) => ({
    ...address(i), latitude: 35, longitude: -78,
  }));
  for (const i of [3, 9, 17]) {
    delete items[i].latitude;
    delete items[i].longitude;
  }
  items.push({ ...items[3], address: '  3   fixture st  ' });
  await h.service.createSession().geocodeProperties(items);
  expect(h.requests).toEqual(Array(3).fill('maps.googleapis.com'));
  expect(items.every(hasValidCoordinates)).toBe(true);
  expect(h.reads()).toBe(1);
  expect(h.writes()).toBe(1);
  expect(h.reports[0].providerAttempts).toEqual({ google: 3, census: 0, nominatim: 0 });
});

test('deduplicates overlapping single and batch requests before cache lookup completes', async () => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const h = harness({ lookup: async () => { await barrier; return new Map(); } });
  const item = address(40);
  const first = h.service.geocodeMultiple([item, item]);
  const second = h.service.geocodeAddress(item.address, item.city, item.state, item.zip);
  const third = h.service.geocodeMultiple([item]);
  release();
  const [batch, single, other] = await Promise.all([first, second, third]);
  expect(h.requests).toHaveLength(1);
  expect(h.reads()).toBe(1);
  expect(h.writes()).toBe(1);
  expect(single).toEqual({ lat: 35, lng: -78 });
  expect([...batch]).toEqual([...other]);
  expect(h.reports.reduce((sum, report) => sum + report.inFlightHits, 0)).toBe(2);
});

test('preserves distinct units and accepts zero while rejecting invalid coordinate pairs', async () => {
  const h = harness();
  expect(hasValidCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  for (const item of [
    { latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 }, { latitude: 0 },
    { latitude: '35', longitude: -78 }, { latitude: Infinity, longitude: 0 },
  ]) expect(hasValidCoordinates(item)).toBe(false);
  const zero = { ...address(1), latitude: 0, longitude: 0 };
  const items: AddressInput[] = [
    zero,
    { ...address(2), address: '2 Fixture St Apt 1' },
    { ...address(2), address: '2 Fixture St Apt 2' },
    { ...address(3), latitude: 91, longitude: -78 },
  ];
  await h.service.createSession().geocodeProperties(items);
  expect(h.requests).toHaveLength(3);
  expect(zero).toMatchObject({ latitude: 0, longitude: 0 });
  expect(items.every(hasValidCoordinates)).toBe(true);
});

test('fills partial re-analysis gaps even when other comparables already have coordinates', async () => {
  const h = harness();
  const subject = { ...address(1), latitude: 35, longitude: -78 };
  const located = { ...address(2), latitude: 36, longitude: -79 };
  const partial = { ...address(3), latitude: 35 };
  await h.service.createSession().geocodeProperties([subject, located, partial]);
  expect(h.requests).toHaveLength(1);
  expect(located).toMatchObject({ latitude: 36, longitude: -79 });
  expect(partial).toMatchObject({ latitude: 35, longitude: -78 });
});

test('does not repeat a failed early subject lookup in the later comparable phase', async () => {
  const h = harness({
    fetch: async input => {
      const host = new URL(String(input)).hostname;
      if (host === 'maps.googleapis.com') return Response.json({ status: 'ZERO_RESULTS' });
      if (host === 'geocoding.geo.census.gov') return Response.json({ result: { addressMatches: [] } });
      return Response.json([]);
    },
  });
  const session = h.service.createSession();
  const subject = address(1);
  await session.geocodeProperties([subject]);
  await session.geocodeProperties([subject, { ...subject }]);
  expect(h.requests).toHaveLength(3);
  expect(h.reports.reduce((sum, report) =>
    sum + report.providerAttempts.google, 0)).toBe(1);
  expect(hasValidCoordinates(subject)).toBe(false);
  // A later analysis can retry; failures are not persisted as successful cache entries.
  await h.service.createSession().geocodeProperties([subject]);
  expect(h.requests).toHaveLength(6);
  expect(h.writes()).toBe(0);
});

test('reuses a successful early subject lookup in the later comparable phase', async () => {
  const h = harness();
  const session = h.service.createSession();
  const subject = address(1);
  await session.geocodeProperties([subject]);
  await session.geocodeProperties([subject, address(1), address(2)]);
  expect(h.requests).toHaveLength(2);
  expect(h.reports.map(report => report.providerAttempts.google)).toEqual([1, 1]);
});

test('continues with providers on cache-read failure and releases in-flight work', async () => {
  const h = harness({ lookup: async () => { throw new Error('fixture failure'); } });
  const results = await Promise.all([
    h.service.geocodeMultiple([address(1)]),
    h.service.geocodeMultiple([address(1)]),
  ]);
  expect(results.every(result => result.size === 1)).toBe(true);
  expect(h.requests).toHaveLength(1);
  await h.service.geocodeMultiple([address(1)]);
  expect(h.requests).toHaveLength(2);
});

test('falls back on malformed responses and accepts Nominatim numeric strings', async () => {
  const h = harness({ fetch: async input => {
    const host = new URL(String(input)).hostname;
    return Response.json(host === 'nominatim.openstreetmap.org'
      ? [{ lat: '0', lon: '-78' }]
      : host === 'maps.googleapis.com'
        ? { status: 'OK', results: [null] }
        : { result: { addressMatches: 'invalid' } });
  } });
  const item = address(1);
  await h.service.createSession().geocodeProperties([item]);
  expect(item).toMatchObject({ latitude: 0, longitude: -78 });
  expect(h.requests).toEqual([
    'maps.googleapis.com', 'geocoding.geo.census.gov', 'nominatim.openstreetmap.org',
  ]);
});

test('does not geocode a city-only input and counts it as unresolved', async () => {
  const h = harness();
  await h.service.geocodeMultiple([{ ...address(1), address: '' }]);
  expect(h.requests).toHaveLength(0);
  expect(h.reads()).toBe(0);
  expect(h.reports[0]).toMatchObject({ inputCount: 1, resolved: 0, unresolved: 1 });
});

test('does not transfer coordinates between records without a street identity', async () => {
  const h = harness();
  const missing = { ...address(1), address: '' };
  const located = { ...missing, latitude: 35, longitude: -78 };
  await h.service.createSession().geocodeProperties([missing, located]);
  expect(hasValidCoordinates(missing)).toBe(false);
  expect(located).toMatchObject({ latitude: 35, longitude: -78 });
  expect(h.requests).toHaveLength(0);
});

test('uses validated persistent cache hits and ignores invalid cached coordinates', async () => {
  const first = address(1);
  const second = address(2);
  const key = (item: AddressInput) =>
    normalizeAddressKey(item.address, item.city, item.state, item.zip);
  const h = harness({ lookup: async () => new Map([
    [key(first), { lat: 0, lng: 0 }],
    [key(second), { lat: 200, lng: 0 }],
  ]) });
  await h.service.createSession().geocodeProperties([first, second]);
  expect(first).toMatchObject({ latitude: 0, longitude: 0 });
  expect(h.requests).toHaveLength(1);
  expect(h.reports[0].cacheHits).toBe(1);
});

test('does not repeat successful geocoding after a cache-write failure within an analysis', async () => {
  const h = harness({ store: async () => { throw new Error('fixture cache failure'); } });
  const session = h.service.createSession();
  await session.geocodeProperties([address(1)]);
  const duplicate = address(1);
  await session.geocodeProperties([duplicate]);
  expect(h.requests).toHaveLength(1);
  expect(duplicate).toMatchObject({ latitude: 35, longitude: -78 });
});

test('uses Census after Google failure and reports attempts without addresses or credentials', async () => {
  const h = harness({
    fetch: async input => new URL(String(input)).hostname === 'maps.googleapis.com'
      ? new Response('', { status: 403 })
      : Response.json({ result: { addressMatches: [{ coordinates: { x: 0, y: 0 } }] } }),
  });
  const item = address(77);
  await h.service.createSession().geocodeProperties([item]);
  expect(item).toMatchObject({ latitude: 0, longitude: 0 });
  expect(h.reports[0].providerAttempts).toEqual({ google: 1, census: 1, nominatim: 0 });
  expect(JSON.stringify(h.reports)).not.toContain('fixture-key');
  expect(JSON.stringify(h.reports)).not.toContain(item.address);
});

test('redacts request exception details and recovers through the existing fallback chain', async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  const h = harness({ fetch: async input => {
    if (new URL(String(input)).hostname === 'maps.googleapis.com') {
      throw new Error('fixture-secret-in-error https://example.invalid/?key=fixture-secret-in-error');
    }
    return Response.json({ result: { addressMatches: [{ coordinates: { x: -78, y: 35 } }] } });
  } });
  try {
    const item = address(1);
    await h.service.createSession().geocodeProperties([item]);
    expect(hasValidCoordinates(item)).toBe(true);
    expect(h.requests).toHaveLength(2);
    expect(warnings).toContainEqual([
      '[geocoding]', { operation: 'request-failure', provider: 'google', status: undefined },
    ]);
    expect(JSON.stringify(warnings)).not.toContain('fixture-secret-in-error');
    expect(JSON.stringify(warnings)).not.toContain(item.address);
  } finally {
    console.warn = originalWarn;
  }
});

test('reuses a located duplicate without replacing valid coordinates or fetching', async () => {
  const h = harness();
  const missing = address(1);
  const located = { ...address(1), latitude: 0, longitude: -78 };
  await h.service.createSession().geocodeProperties([missing, located]);
  expect(missing).toMatchObject({ latitude: 0, longitude: -78 });
  expect(h.requests).toHaveLength(0);
});

test('preserves canonical numeric coordinates during property and comparable normalization', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/byaddress') return Response.json({
      PropertyAddress: { streetAddress: '1 Fixture St' },
      latitude: 0, longitude: -78,
      priceHistory: [{ date: '2025-01-01', price: 100000, event: 'Listed' }],
    });
    expect(url.pathname).toBe('/similar');
    return Response.json({ similar_properties: { propertyDetails: [
      { zpid: '1', price: 100000, livingArea: 1000, latitude: 35, longitude: -78 },
      { zpid: '2', price: 100000, livingArea: 1000, latitude: 91, longitude: -78 },
    ] } });
  };
  try {
    expect(await getPropertyByAddress('1 Fixture St')).toMatchObject({ latitude: 0, longitude: -78 });
    const comps = await getSimilarProperties('coordinate-normalization-fixture');
    expect(comps[0]).toMatchObject({ latitude: 35, longitude: -78 });
    expect(comps[1]).not.toHaveProperty('latitude');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
