import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import {
  createProviderFetch, recordProviderCache, recordProviderFallback,
  withProviderUsage, providerUsageMiddleware, type ProviderUsageSummary,
} from '../server/src/services/providerUsageService';
import { createAnalyzerBackendRouter } from '../server/src/analyzer/backend';
import { getMarketStatistics, getRentalComps } from '../server/src/services/rentCastService';
import { getLongTermRentalEstimate } from '../server/src/services/longTermRentalService';

const express = createRequire(new URL('../server/package.json', import.meta.url))('express') as typeof import('express');
const { Router } = express;
const originalFetch = globalThis.fetch;
let originalKey: string | undefined;
let originalSharedCache: string | undefined;
let originalSharedPropertyCache: string | undefined;
let originalRentCastRate: string | undefined;
test.beforeEach(() => {
  originalKey = process.env.RENTCAST_API_KEY;
  originalSharedCache = process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED;
  originalSharedPropertyCache = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  originalRentCastRate = process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST;
  process.env.RENTCAST_API_KEY = 'fixture-not-a-credential';
  process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED = 'false';
  process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'false';
  delete process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST;
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RENTCAST_API_KEY;
  else process.env.RENTCAST_API_KEY = originalKey;
  if (originalSharedCache === undefined) delete process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED;
  else process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED = originalSharedCache;
  if (originalSharedPropertyCache === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalSharedPropertyCache;
  if (originalRentCastRate === undefined) delete process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST;
  else process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST = originalRentCastRate;
});

test('accounts for every data-provider attempt without leaking input or payload data', async () => {
  const reports: ProviderUsageSummary[] = [];
  globalThis.fetch = async () => Response.json({ private: 'fixture-body-secret' });
  await withProviderUsage('analysis', async () => {
    await Promise.all([
      createProviderFetch('zillow')('https://fixture.invalid/byzpid?address=fixture-private&key=fixture-secret', {
        headers: { authorization: 'fixture-auth-secret' },
      }),
      createProviderFetch('airdna')('https://fixture.invalid/rentalizer'),
      createProviderFetch('rentcast')('https://fixture.invalid/v1/markets'),
      createProviderFetch('google')('https://fixture.invalid/maps/api/geocode/json?key=fixture-google-secret'),
      createProviderFetch('google')('https://fixture.invalid/maps/api/place/nearbysearch/json'),
      createProviderFetch('census')('https://fixture.invalid/geocoder'),
      createProviderFetch('nominatim')('https://fixture.invalid/search'),
      createProviderFetch('realtor')('https://fixture.invalid/properties/v3/list'),
      createProviderFetch('furnished-finder')('https://fixture.invalid/graphql'),
      createProviderFetch('xome')('https://fixture.invalid/auctions/listing/v1/listing/search'),
    ]);
    recordProviderCache('rentcast', 'markets', 'postgres', 'hit');
    recordProviderFallback('airdna', 'market-statistics', 'no-usable-data');
  }, summary => reports.push(summary));
  const report = reports[0];
  expect(report.attempts).toBe(10);
  expect(report.estimatedCostUsd).toBe(0.057);
  expect(report.unknownCostAttempts).toBe(3);
  expect(report.endpoints.find(row => row.provider === 'rentcast')).toMatchObject({
    rentCastBillableCandidates: 1, cache: { 'postgres:hit': 1 },
  });
  expect(report.endpoints.find(row => row.operation === 'market-statistics')).toMatchObject({
    fallbacks: { 'no-usable-data': 1 }, attempts: 0,
  });
  expect(JSON.stringify(report)).not.toMatch(/fixture|authorization|address=|private/);
});

test('keeps overlapping analysis ledgers isolated through async and parallel work', async () => {
  globalThis.fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json({});
  };
  const reports: ProviderUsageSummary[] = [];
  await Promise.all([
    withProviderUsage('analysis', async () => {
      await createProviderFetch('google')('https://fixture.invalid/maps/api/geocode/json');
      recordProviderCache('geocoding', 'coordinates', 'coordinates', 'hit', 20);
    }, report => reports.push(report)),
    withProviderUsage('reanalysis', async () => {
      await Promise.all(Array.from({ length: 3 }, () => createProviderFetch('rentcast')('https://fixture.invalid/v1/markets')));
    }, report => reports.push(report)),
  ]);
  expect(reports.find(row => row.workflow === 'analysis')).toMatchObject({ attempts: 1, estimatedCostUsd: 0.005 });
  expect(reports.find(row => row.workflow === 'reanalysis')).toMatchObject({ attempts: 3, estimatedCostUsd: 0 });
  expect(reports[0].requestId).not.toBe(reports[1].requestId);
  expect(reports.every(row => row.durationMs >= 0 && row.endpoints.every(endpoint => endpoint.headerLatencyMs >= 0))).toBe(true);
});

test('retains HTTP and network failures without claiming they are free or changing thrown errors', async () => {
  const reports: ProviderUsageSummary[] = [];
  const error = new Error('fixture-private-error');
  globalThis.fetch = async input => {
    if (String(input).includes('/throw')) throw error;
    return new Response('', { status: 429 });
  };
  await expect(withProviderUsage('analysis', async () => {
    await createProviderFetch('rentcast')('https://fixture.invalid/v1/markets');
    await createProviderFetch('google')('https://fixture.invalid/maps/api/geocode/json');
    await createProviderFetch('zillow')('https://fixture.invalid/throw?key=fixture-secret');
  }, report => reports.push(report))).rejects.toBe(error);
  expect(reports[0]).toMatchObject({ attempts: 3, outcome: 'failed', unknownCostAttempts: 2 });
  expect(reports[0].endpoints.find(row => row.provider === 'rentcast')).toMatchObject({
    httpResponses: { '429': 1 }, rentCastBillableCandidates: 0, unknownCostAttempts: 0,
  });
  expect(JSON.stringify(reports)).not.toContain('fixture');
});

test('unknown endpoint paths are replaced by a fixed label and cache-only runs cost zero', async () => {
  const reports: ProviderUsageSummary[] = [];
  globalThis.fetch = async () => Response.json({});
  await withProviderUsage('saved-view', async () => {
    recordProviderCache('zillow', 'fixture-private-path', 'memory', 'hit');
    recordProviderCache('rentcast', 'markets', 'in-flight', 'hit');
  }, report => reports.push(report));
  expect(reports[0]).toMatchObject({ attempts: 0, estimatedCostUsd: 0, unknownCostAttempts: 0 });
  expect(reports[0].endpoints[0].operation).toBe('other');
  expect(JSON.stringify(reports)).not.toContain('fixture-private-path');
});

test('models a supplied RentCast marginal rate without assuming the subscription is free', async () => {
  globalThis.fetch = async () => Response.json({ rent: 2100 });
  const reports: ProviderUsageSummary[] = [];
  process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST = '0.02';
  await withProviderUsage('analysis', async () => {
    const response = await createProviderFetch('rentcast')('https://fixture.invalid/v1/markets');
    expect(await response.json()).toEqual({ rent: 2100 });
  }, report => reports.push(report));
  expect(reports[0]).toMatchObject({ estimatedCostUsd: 0.02, unknownCostAttempts: 0 });
  process.env.RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST = '';
  await withProviderUsage('analysis', async () => {
    await createProviderFetch('rentcast')('https://fixture.invalid/v1/markets');
  }, report => reports.push(report));
  expect(reports[1]).toMatchObject({ estimatedCostUsd: 0, unknownCostAttempts: 1 });
});

test('ledger arithmetic matches the historical 37-call cold-cost example without live traffic', async () => {
  globalThis.fetch = async () => Response.json({});
  const reports: ProviderUsageSummary[] = [];
  await withProviderUsage('analysis', async () => {
    const scenario = [
      { provider: 'zillow', path: '/byzpid', count: 4 },
      { provider: 'google', path: '/maps/api/geocode/json', count: 21 },
      { provider: 'google', path: '/maps/api/place/nearbysearch/json', count: 5 },
      { provider: 'rentcast', path: '/v1/markets', count: 3 },
      { provider: 'airdna', path: '/rentalizer', count: 1 },
      { provider: 'furnished-finder', path: '/graphql', count: 1 },
      { provider: 'xome', path: '/auctions/listing/v1/listing/search', count: 2 },
    ] as const;
    await Promise.all(scenario.flatMap(({ provider, path, count }) => Array.from({ length: count },
      () => createProviderFetch(provider)(`https://fixture.invalid${path}`))));
  }, report => reports.push(report));
  expect(reports[0]).toMatchObject({ attempts: 37, estimatedCostUsd: 0.315, unknownCostAttempts: 4, pendingAttempts: 0 });
});

test('explicit background scope summarizes a prewarm separately from analysis traffic', async () => {
  globalThis.fetch = async () => Response.json({});
  const reports: ProviderUsageSummary[] = [];
  await withProviderUsage('xome-prewarm', async () => {
    await createProviderFetch('xome')('https://fixture.invalid/auctions/listing/v1/listing/search');
  }, report => reports.push(report));
  expect(reports[0]).toMatchObject({ workflow: 'xome-prewarm', attempts: 1, estimatedCostUsd: 0 });
});

test('actual RentCast service records cold requests and warm reuse with no global fetch patching by the implementation', async () => {
  const reports: ProviderUsageSummary[] = [];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ rentalData: { medianRent: 2200 } }); };
  await withProviderUsage('analysis', async () => {
    expect(await getMarketStatistics('27991')).toEqual({ medianRent: 2200 });
  }, report => reports.push(report));
  await withProviderUsage('analysis', async () => {
    expect(await getMarketStatistics('27991')).toEqual({ medianRent: 2200 });
  }, report => reports.push(report));
  expect(calls).toBe(1);
  expect(reports[0]).toMatchObject({ attempts: 1, unknownCostAttempts: 1 });
  expect(reports[1]).toMatchObject({ attempts: 0, unknownCostAttempts: 0 });
  expect(reports[1].endpoints[0].cache).toEqual({ 'memory:hit': 1 });
});

test('existing comp fallback decisions appear alongside attempts and cached comps', async () => {
  const reports: ProviderUsageSummary[] = [];
  const property = {
    zpid: 'usage-fixture', address: 'Usage Fixture', city: 'Example', state: 'NC', zip: '27992',
    price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
  };
  globalThis.fetch = async () => Response.json([{ price: 1800 }]);
  await withProviderUsage('analysis', async () => {
    await getRentalComps(property);
    await getRentalComps(property);
    await getLongTermRentalEstimate(property, {
      rentCastComps: async () => [], realtorComps: async () => [], rentCastEstimate: async () => null,
    });
  }, report => reports.push(report));
  expect(reports[0].attempts).toBe(1);
  expect(reports[0].endpoints.find(row => row.operation === 'rental-listings')?.cache)
    .toEqual({ 'memory:miss': 1, 'memory:hit': 1 });
  expect(reports[0].endpoints.find(row => row.operation === 'rent-avm')?.fallbacks)
    .toEqual({ 'no-usable-data': 1 });
});

test('request middleware classifies workflows, validates correlation and reports failures exactly once', async () => {
  const reports: ProviderUsageSummary[] = [];
  const app = express();
  app.use(providerUsageMiddleware(report => reports.push(report)));
  app.use(async (_req, res) => {
    await createProviderFetch('google')('https://fixture.invalid/maps/api/geocode/json');
    res.status(503).json({ error: 'fixture' });
  });
  let server: Server | undefined;
  globalThis.fetch = async () => Response.json({});
  try {
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const parent = '11111111-1111-4111-8111-111111111111';
    const first = await originalFetch(`http://127.0.0.1:${address.port}/analyzer/run`, {
      method: 'POST', headers: { 'X-Analysis-Request-Id': parent },
    });
    expect(first.headers.get('X-Provider-Request-Id')).toMatch(/^[a-f0-9-]{36}$/);
    await first.text();
    const second = await originalFetch(`http://127.0.0.1:${address.port}/xome/market-trends?address=fixture-private`, {
      headers: { 'X-Analysis-Request-Id': 'fixture-secret' },
    });
    await second.text();
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ workflow: 'analysis', parentRequestId: parent, outcome: 'failed', attempts: 1 });
    expect(reports[1]).toMatchObject({ workflow: 'xome-widget', outcome: 'failed', attempts: 1 });
    expect(reports[1]).not.toHaveProperty('parentRequestId');
    expect(JSON.stringify(reports)).not.toContain('fixture-private');
  } finally {
    await new Promise<void>((resolve, reject) => server ? server.close(error => error ? reject(error) : resolve()) : resolve());
  }
});

test('workflow labels cover saved, refreshed, property and comparison requests', async () => {
  const reports: ProviderUsageSummary[] = [];
  const app = express();
  app.use(providerUsageMiddleware(report => reports.push(report)));
  app.use((_req, res) => res.json({ ok: true }));
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    for (const [path, method, workflow] of [
      ['/ANALYZER/run/', 'POST', 'analysis'],
      ['/analyzer/re-analyze/fixture', 'POST', 'reanalysis'],
      ['/analyzer/history/fixture', 'GET', 'saved-view'],
      ['/analyzer/shared/fixture', 'GET', 'saved-view'],
      ['/analyzer/history/fixture/property-records', 'GET', 'property-records'],
      ['/analyzer/history/fixture/property-records/refresh', 'POST', 'property-records-refresh'],
      ['/property/lookup', 'POST', 'property-lookup'],
      ['/comparisons', 'POST', 'comparison'],
      ['/ai/compare', 'POST', 'comparison'],
    ]) {
      const response = await originalFetch(`http://127.0.0.1:${address.port}${path}`, { method });
      await response.text();
      expect(reports.at(-1)).toMatchObject({ workflow, attempts: 0 });
    }
    expect(reports).toHaveLength(9);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('aborted requests explicitly flag pending attempts rather than claiming a final zero cost', async () => {
  const reports: ProviderUsageSummary[] = [];
  let providerStarted!: () => void;
  let releaseProvider!: (response: Response) => void;
  let reported!: () => void;
  const started = new Promise<void>(resolve => { providerStarted = resolve; });
  const finishedReport = new Promise<void>(resolve => { reported = resolve; });
  const pending = new Promise<Response>(resolve => { releaseProvider = resolve; });
  globalThis.fetch = async () => {
    providerStarted();
    return pending;
  };
  const app = express();
  app.use(providerUsageMiddleware(report => { reports.push(report); reported(); }));
  app.use(async (_req, res) => {
    await createProviderFetch('google')('https://fixture.invalid/maps/api/geocode/json');
    res.json({ ok: true });
  });
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const controller = new AbortController();
    const response = originalFetch(`http://127.0.0.1:${address.port}/analyzer/run`, {
      method: 'POST', signal: controller.signal,
    });
    await started;
    controller.abort();
    await expect(response).rejects.toThrow();
    await finishedReport;
    expect(reports[0]).toMatchObject({ outcome: 'aborted', attempts: 1, pendingAttempts: 1, unknownCostAttempts: 1 });
    releaseProvider(Response.json({}));
    await new Promise(resolve => setImmediate(resolve));
    expect(reports).toHaveLength(1);
    expect(reports[0].pendingAttempts).toBe(1);
  } finally {
    releaseProvider(Response.json({}));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('both backend wrappers install accounting before lazy provider routes', async () => {
  const reports: string[] = [];
  const originalInfo = console.info;
  console.info = (label, value) => { if (label === '[provider:usage]') reports.push(String(value)); };
  const app = express();
  const stub = Router();
  stub.post('/run', async (_req, res) => {
    await createProviderFetch('rentcast')('https://fixture.invalid/v1/markets');
    res.json({ ok: true });
  });
  const empty = () => Router();
  for (const base of ['/api', '/api/investor-lab']) {
    app.use(base, createAnalyzerBackendRouter({
      routes: { analyzer: () => stub, property: empty, comparisons: empty, ai: empty, xome: empty },
    }));
  }
  let server: Server | undefined;
  globalThis.fetch = async () => Response.json({});
  try {
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    for (const base of ['/api', '/api/investor-lab']) {
      const response = await originalFetch(`http://127.0.0.1:${address.port}${base}/analyzer/run`, { method: 'POST' });
      await response.text();
      expect(response.ok).toBe(true);
    }
    expect(reports.map(report => JSON.parse(report))).toEqual([
      expect.objectContaining({ workflow: 'analysis', attempts: 1 }),
      expect.objectContaining({ workflow: 'analysis', attempts: 1 }),
    ]);
  } finally {
    console.info = originalInfo;
    await new Promise<void>((resolve, reject) => server ? server.close(error => error ? reject(error) : resolve()) : resolve());
  }
});
