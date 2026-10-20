import { test, expect } from '@playwright/test';
import { getSimilarProperties, getSimilarPropertiesWithStatus } from '../server/src/services/propertyDataService';
import {
  getProviderUsageRequestId, withProviderUsage, type ProviderUsageSummary,
} from '../server/src/services/providerUsageService';

const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalRetryDelay = process.env.SIMILAR_PROPERTIES_RETRY_DELAY_MS;
let logs: unknown[][];
let sequence = 0;
const listing = {
  zpid: 123, price: 350000, livingArea: 1800, bedrooms: 3, bathrooms: 2,
  latitude: 33.19, longitude: -96.74,
  address: { streetAddress: 'Fixture Private Address', city: 'Example', state: 'TX', zipcode: '75070' },
};
test.beforeEach(() => {
  logs = [];
  process.env.SIMILAR_PROPERTIES_RETRY_DELAY_MS = '0';
  console.info = (...args) => { logs.push(args); };
  console.warn = (...args) => { logs.push(args); };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalInfo;
  console.warn = originalWarn;
  if (originalRetryDelay === undefined) delete process.env.SIMILAR_PROPERTIES_RETRY_DELAY_MS;
  else process.env.SIMILAR_PROPERTIES_RETRY_DELAY_MS = originalRetryDelay;
});
function diagnostic() {
  const entries = logs.filter(entry => entry[0] === '[similar:diagnostic]');
  return entries.map(entry => JSON.parse(String(entry[1])));
}
function key() { return `similar-diagnostic-fixture-${++sequence}`; }

test('correct byzpid request maps all 20 inventory results and correlates diagnostic with usage', async () => {
  const id = key();
  let calls = 0;
  const reports: ProviderUsageSummary[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    expect(url.pathname).toBe('/similar');
    expect([...url.searchParams]).toEqual([['byzpid', id]]);
    calls++;
    return Response.json({ message: '200: Success', similar_properties: {
      propertyDetails: Array.from({ length: 20 }, (_, i) => ({ ...listing, zpid: 123 + i })),
    } });
  };
  expect(getProviderUsageRequestId()).toBeUndefined();
  const comps = await withProviderUsage('analysis', async () => {
    expect(getProviderUsageRequestId()).toEqual(expect.any(String));
    return getSimilarProperties(id);
  }, report => reports.push(report));
  expect(comps).toHaveLength(20);
  expect(comps.every(comp => comp.coordinateSource === 'zillow')).toBe(true);
  expect(diagnostic()).toEqual([{
    requestId: reports[0].requestId, outcome: 'success', rawCount: 20,
    returnedCount: 20, rejectedCount: 0, invalidRecord: 0, invalidPrice: 0, invalidSqft: 0,
    withCoordinates: 20,
  }]);
  expect(reports[0].attempts).toBe(1);
  comps[0].latitude = 10;
  expect((await getSimilarProperties(id))[0].latitude).toBe(listing.latitude);
  expect(calls).toBe(1);
  expect(diagnostic()[1]).toMatchObject({ outcome: 'cache-hit', returnedCount: 20 });
  expect(JSON.stringify(logs)).not.toContain('Fixture Private Address');
  expect(JSON.stringify(logs)).not.toContain(id);
  expect(getProviderUsageRequestId()).toBeUndefined();
});

for (const [payload, retried] of [
  [{ ErrorMessage: 'fixture-secret-provider-error' }, true],
  [{ message: 'Error: Region Not Found' }, false],
  [{ error: 'fixture-secret-provider-error' }, true],
  [{ success: false }, true],
] as const) {
  test(`HTTP 200 provider failure ${Object.keys(payload)[0]} is explicit and not cached`, async () => {
    const id = key();
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json(calls === 1 ? payload : { similar_properties: { propertyDetails: [listing] } });
    };
    if (retried) {
      expect(await getSimilarProperties(id)).toHaveLength(1);
      expect(diagnostic()[1]).toMatchObject({ outcome: 'success', attempt: 2 });
    } else {
      expect(await getSimilarProperties(id)).toEqual([]);
      expect(await getSimilarProperties(id)).toHaveLength(1);
    }
    expect(calls).toBe(2);
    expect(diagnostic()[0]).toMatchObject({ outcome: 'provider-error', httpStatus: 200 });
    expect(diagnostic()[0].willRetry).toBe(retried ? true : undefined);
    expect(diagnostic()[0].providerError.field).toBe(Object.keys(payload)[0]);
    expect(JSON.stringify(logs)).not.toMatch(/fixture-secret|Region Not Found/);
  });
}

for (const [message, category] of [
  ['Too many requests: rate limit', 'rate-or-quota'],
  ['API key unauthorized', 'access-or-billing'],
  ['Invalid byzpid parameter', 'invalid-input'],
  ['No similar properties found', 'not-found'],
  ['Temporarily unavailable, try again', 'upstream-unavailable'],
  ['fixture-private-unknown-error', 'unspecified'],
]) {
  test(`classifies ${category} without logging provider text`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ ErrorMessage: message }); };
    expect(await getSimilarProperties(key())).toEqual([]);
    const transient = category === 'upstream-unavailable' || category === 'unspecified';
    expect(calls).toBe(transient ? 2 : 1);
    expect(diagnostic()).toHaveLength(calls);
    expect(diagnostic()[0].providerError).toEqual({ field: 'ErrorMessage', category });
    if (transient) expect(diagnostic()[1]).toMatchObject({ outcome: 'provider-error', attempt: 2 });
    expect(diagnostic().at(-1).willRetry).toBeUndefined();
    expect(JSON.stringify(logs)).not.toContain(message);
  });
}

for (const [label, payload] of [
  ['missing container', {}],
  ['wrong container', { similar_properties: { propertyDetails: {} } }],
  ['null payload', null],
  ['array payload', []],
] as const) {
  test(`malformed response (${label}) is not reported as zero local inventory`, async () => {
    globalThis.fetch = async () => Response.json(payload);
    expect(await getSimilarProperties(key())).toEqual([]);
    expect(diagnostic()).toEqual([{ outcome: 'invalid-envelope' }]);
  });
}

test('explicit empty list is distinct from malformed or failed response', async () => {
  globalThis.fetch = async () => Response.json({ similar_properties: { propertyDetails: [] } });
  expect(await getSimilarProperties(key())).toEqual([]);
  expect(diagnostic()).toEqual([{ outcome: 'empty-response', rawCount: 0, returnedCount: 0 }]);
});

test('reports exact filter losses without dropping valid rows after a malformed entry', async () => {
  globalThis.fetch = async () => Response.json({ similar_properties: { propertyDetails: [
    null, { ...listing, price: 0 }, { ...listing, livingArea: '' },
    { ...listing, price: 'invalid', livingArea: -1 },
    { ...listing, price: '350000', livingArea: '1800' }, listing,
  ] } });
  const comps = await getSimilarProperties(key());
  expect(comps).toHaveLength(2);
  expect(comps[0]).toMatchObject({ price: 350000, sqft: 1800 });
  expect(diagnostic()).toEqual([{
    outcome: 'success', rawCount: 6, returnedCount: 2, rejectedCount: 4,
    invalidRecord: 1, invalidPrice: 2, invalidSqft: 2, withCoordinates: 2,
  }]);
});

test('all-filtered responses do not poison the cache for 24 hours', async () => {
  const id = key();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ similar_properties: { propertyDetails: [
      { ...listing, price: calls === 1 ? 'not-numeric' : 350000 },
    ] } });
  };
  expect(await getSimilarProperties(id)).toEqual([]);
  expect(await getSimilarProperties(id)).toHaveLength(1);
  expect(calls).toBe(2);
  expect(diagnostic()[0]).toMatchObject({
    outcome: 'all-filtered', rawCount: 1, returnedCount: 0, invalidPrice: 1,
  });
});

test('documented camel-case envelope remains supported', async () => {
  globalThis.fetch = async () => Response.json({ similarProperties: { propertyDetails: [listing] } });
  expect(await getSimilarProperties(key())).toHaveLength(1);
});

for (const mode of ['http', 'json', 'transport'] as const) {
  test(`${mode} failure has a sanitized diagnostic and bounded retry`, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (mode === 'transport') throw new Error('fixture-secret https://fixture.invalid/?key=private');
      if (mode === 'json') return new Response('not-json');
      return Response.json({ error: 'fixture-secret' }, { status: 429 });
    };
    expect(await getSimilarProperties(key())).toEqual([]);
    expect(calls).toBe(mode === 'transport' ? 2 : 1);
    expect(diagnostic()[0].outcome).toBe({
      http: 'http-error', json: 'invalid-json', transport: 'request-failed',
    }[mode]);
    if (mode === 'http') expect(diagnostic()[0].httpStatus).toBe(429);
    expect(JSON.stringify(logs)).not.toMatch(/fixture-secret|private|fixture.invalid/);
  });
}

for (const status of [500, 503, 408]) {
  test(`HTTP ${status} is retried once and a recovered result is cached`, async () => {
    const id = key();
    let calls = 0;
    const reports: ProviderUsageSummary[] = [];
    globalThis.fetch = async () => {
      calls++;
      return calls === 1 ? new Response('fixture-secret', { status })
        : Response.json({ similar_properties: { propertyDetails: [listing] } });
    };
    const comps = await withProviderUsage('analysis', () => getSimilarProperties(id), r => reports.push(r));
    expect(comps).toHaveLength(1);
    expect(reports[0].attempts).toBe(2);
    expect(await getSimilarProperties(id)).toHaveLength(1);
    expect(calls).toBe(2);
    expect(diagnostic().map(d => d.outcome)).toEqual(['http-error', 'success', 'cache-hit']);
    expect(diagnostic()[0]).toMatchObject({ httpStatus: status, willRetry: true });
  });
}

for (const status of [400, 401, 402, 403, 404, 429]) {
  test(`HTTP ${status} is not retried`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status }); };
    expect(await getSimilarProperties(key())).toEqual([]);
    expect(calls).toBe(1);
    expect(diagnostic()[0].willRetry).toBeUndefined();
  });
}

test('persistent transient failure stops after two attempts and is not cached', async () => {
  const id = key();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ErrorMessage: 'fixture-secret' }); };
  expect(await getSimilarProperties(id)).toEqual([]);
  expect(calls).toBe(2);
  expect(await getSimilarProperties(id)).toEqual([]);
  expect(calls).toBe(4);
});

test('explicit empty, all-filtered and malformed responses are never retried', async () => {
  for (const payload of [
    { similar_properties: { propertyDetails: [] } },
    { similar_properties: { propertyDetails: [{ ...listing, price: 0 }] } },
    { unexpected: true },
  ]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json(payload); };
    expect(await getSimilarProperties(key())).toEqual([]);
    expect(calls).toBe(1);
  }
});

test('missing ZPID explicitly explains a skipped lookup without any paid request', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  expect(await getSimilarProperties('')).toEqual([]);
  expect(calls).toBe(0);
  expect(diagnostic()).toEqual([{ outcome: 'missing-zpid' }]);
});

test('status distinguishes provider failures from genuinely empty results', async () => {
  const cases: Array<[unknown, number, string]> = [
    [{ similar_properties: { propertyDetails: [listing] } }, 200, 'ok'],
    [{ similar_properties: { propertyDetails: [] } }, 200, 'none-found'],
    [{ similar_properties: { propertyDetails: [{ ...listing, price: 0 }] } }, 200, 'none-found'],
    [{ ErrorMessage: 'No similar properties found' }, 200, 'none-found'],
    [{ ErrorMessage: 'Temporarily unavailable' }, 200, 'unavailable'],
    [{ ErrorMessage: 'Too many requests' }, 200, 'unavailable'],
    [{ unexpected: true }, 200, 'unavailable'],
    [{}, 503, 'unavailable'],
  ];
  for (const [payload, status, expected] of cases) {
    globalThis.fetch = async () => Response.json(payload, { status });
    expect((await getSimilarPropertiesWithStatus(key())).status).toBe(expected);
  }
  expect((await getSimilarPropertiesWithStatus('')).status).toBe('not-applicable');
  const id = key();
  globalThis.fetch = async () => Response.json({ similar_properties: { propertyDetails: [listing] } });
  await getSimilarPropertiesWithStatus(id);
  expect(await getSimilarPropertiesWithStatus(id)).toMatchObject({ status: 'ok', comps: [expect.any(Object)] });
});
