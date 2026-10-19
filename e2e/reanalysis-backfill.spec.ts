import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response as ExpressResponse } from 'express';
import type { OwnerContext, PropertyData } from '@deal-platform/shared-types';
import { pool } from '../server/src/db/pool';
import { createPropertyAnalyzerRouter } from '../server/src/routes/propertyAnalyzer';
import { providerUsageMiddleware, type ProviderUsageSummary } from '../server/src/services/providerUsageService';

const express = createRequire(new URL('../server/package.json', import.meta.url))('express') as typeof import('express');
const originalFetch = globalThis.fetch;
const originalQuery = pool.query;
const savedEnv: Record<string, string | undefined> = {};
const ENV = {
  RAPIDAPI_KEY: 'fixture-not-a-credential',
  FF_MTR_DISABLED: 'true',
  SIMILAR_PROPERTIES_RETRY_DELAY_MS: '0',
};
let sequence = 0;

const owner: OwnerContext = {
  actorUserId: '1', ownerUserId: '1', tenantId: 'asset-dashboard', platform: 'asset-dashboard',
  permissions: [], roles: [],
};
const comparable = {
  zpid: 900, price: 300000, livingArea: 1600, bedrooms: 3, bathrooms: 2,
  latitude: 43.33, longitude: -83.73,
  address: { streetAddress: 'Fixture Comp', city: 'Example', state: 'MI', zipcode: '48734' },
};

test.beforeEach(() => {
  for (const [name, value] of Object.entries(ENV)) {
    savedEnv[name] = process.env[name];
    process.env[name] = value;
  }
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(pool, 'query', { value: originalQuery, configurable: true, writable: true });
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

interface CallOptions {
  path?: string;
  results?: Record<string, unknown>;
  rentalRegionNotFound?: boolean;
}

function savedRow(property: PropertyData, comparables: unknown[], extraResults: Record<string, unknown> = {}) {
  return {
    slug: 'fixture-slug', zpid: property.zpid, zillow_url: null, source_url: null, source_type: 'zillow',
    public_share_id: null, user_overrides: null, created_at: new Date(0).toISOString(),
    property_data: property,
    analysis_params: {},
    analysis_results: {
      comparables,
      dataSources: { rental: 'rentcast', hoa: 'none', tax: 'estimate', insurance: 'estimate' },
      strEstimate: { source: 'algorithm' },
      ...extraResults,
    },
    rental_comps: [{ address: 'Fixture Rental', rent: 1700, bedrooms: 3, bathrooms: 2, sqft: 1500, distance: 1 }],
  };
}

async function reanalyze(property: PropertyData, comparables: unknown[], options: CallOptions = {}) {
  const updates: unknown[][] = [];
  const updateSql: string[] = [];
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true,
    value: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT *') && sql.includes('property_analyses')) {
        return { rows: [savedRow(property, comparables, options.results)] };
      }
      if (sql.includes('UPDATE property_analyses')) {
        updates.push(params);
        updateSql.push(sql);
        return {
          rowCount: 1,
          rows: [{ slug: 'fixture-slug', public_share_id: null, created_at: new Date(0).toISOString() }],
        };
      }
      if (sql.includes('SELECT') && sql.includes('property_analyses') && updates.length) {
        return { rows: [{
          slug: 'fixture-slug',
          property_data: JSON.parse(String(updates[0][3])),
          analysis_results: JSON.parse(String(updates[0][4])),
        }] };
      }
      return { rows: [] };
    },
  });
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/similar') {
      return Response.json(calls.filter(path => path === '/similar').length === 1
        ? { ErrorMessage: 'fixture-intermittent' }
        : { similar_properties: { propertyDetails: [comparable] } });
    }
    if (url.pathname === '/housing_market') return Response.json({ market_overview: { typical_home_values: 250000 } });
    if (url.pathname === '/rental_market') {
      return Response.json(options.rentalRegionNotFound
        ? { message: 'Error: Region Not Found' }
        : { rental_market_trends: { summary: { medianRent: 1800 } } });
    }
    return Response.json({});
  };

  const reports: ProviderUsageSummary[] = [];
  const app = express();
  app.use(express.json());
  app.use(providerUsageMiddleware(report => reports.push(report)));
  app.use('/analyzer', createPropertyAnalyzerRouter({
    auth: {
      requireAuth: (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
      optionalAuth: (_req: Request, _res: ExpressResponse, next: NextFunction) => next(),
      buildOwnerContext: async () => owner,
    },
    config: { platform: 'asset-dashboard', tenantId: 'asset-dashboard' },
  } as Parameters<typeof createPropertyAnalyzerRouter>[0]));
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const response = await originalFetch(`http://127.0.0.1:${address.port}${options.path ?? '/analyzer/re-analyze/fixture-slug'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params: {} }),
    });
    const body = await response.json() as any;
    for (let wait = 0; reports.length === 0 && wait < 50; wait++) await new Promise(resolve => setTimeout(resolve, 10));
    return { status: response.status, body, calls, updates, updateSql, reports };
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function subject(overrides: Partial<PropertyData> = {}): PropertyData {
  const n = ++sequence;
  return {
    zpid: `backfill-fixture-${n}`, address: `${n} Fixture Ave`, city: `Backfill ${n}`, state: 'MI',
    zip: '48734', price: 280000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 1990,
    latitude: 43.33, longitude: -83.73,
    housingMarket: { typicalHomeValue: 240000 } as PropertyData['housingMarket'],
    rentalMarketTrends: { medianRent: 1750 } as PropertyData['rentalMarketTrends'],
    ...overrides,
  };
}

test('re-analysis refetches only missing comparables, recovering from one transient provider error', async () => {
  const { status, body, calls, updates, reports } = await reanalyze(subject(), []);
  expect(status).toBe(200);
  expect(calls.filter(path => path === '/similar')).toHaveLength(2);
  expect(calls.filter(path => path === '/housing_market' || path === '/rental_market')).toHaveLength(0);
  expect(body.analysis_results.comparables).toHaveLength(1);
  expect(body.analysis_results.comparables[0]).toMatchObject({ zpid: '900', rentSource: 'market-calibrated' });
  expect(body.analysis_results.comparables[0].estimatedRent).toBeGreaterThan(0);
  expect(JSON.parse(String(updates[0][5])).comparables).toHaveLength(1);
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ workflow: 'reanalysis' });
  expect(reports[0].endpoints.find(row => row.provider === 'zillow' && row.operation === 'similar'))
    .toMatchObject({ attempts: 2 });
});

test('re-analysis keeps stored comparables and makes no Zillow comparable call', async () => {
  const stored = [{ zpid: '1', address: 'Stored', price: 1, sqft: 1, estimatedRent: 1 }];
  const { status, body, calls } = await reanalyze(subject(), stored);
  expect(status).toBe(200);
  expect(calls).not.toContain('/similar');
  expect(body.analysis_results.comparables).toEqual(stored);
});

test('re-analysis without a ZPID skips the comparable refetch', async () => {
  const { status, calls } = await reanalyze(subject({ zpid: '' }), []);
  expect(status).toBe(200);
  expect(calls).not.toContain('/similar');
});

test('re-analysis backfills missing area market data and persists it on the property', async () => {
  const property = subject({ housingMarket: undefined, rentalMarketTrends: undefined });
  const stored = [{ zpid: '1', address: 'Stored', price: 1, sqft: 1, estimatedRent: 1 }];
  const { status, body, calls, updates } = await reanalyze(property, stored);
  expect(status).toBe(200);
  expect(calls.filter(path => path === '/housing_market')).toHaveLength(1);
  expect(calls.filter(path => path === '/rental_market')).toHaveLength(1);
  expect(body.property_data.housingMarket.typicalHomeValue).toBe(250000);
  expect(body.property_data.rentalMarketTrends.medianRent).toBe(1800);
  expect(JSON.parse(String(updates[0][3])).housingMarket.typicalHomeValue).toBe(250000);
});

test('re-analysis records dataset status and skips a provider-confirmed empty comparable set', async () => {
  const recovered = await reanalyze(subject(), []);
  expect(recovered.body.analysis_results.datasetStatus).toEqual({
    comparables: 'ok', housingMarket: 'ok', rentalMarket: 'ok',
  });
  const confirmedEmpty = await reanalyze(subject(), [], { results: { datasetStatus: { comparables: 'none-found' } } });
  expect(confirmedEmpty.calls).not.toContain('/similar');
  expect(confirmedEmpty.body.analysis_results.datasetStatus.comparables).toBe('none-found');
});

test('re-analysis uses the RentCast ZIP summary for display only, never as Zillow rent', async () => {
  const property = subject({ rentalMarketTrends: undefined });
  const stored = [{ zpid: '1', address: 'Stored', price: 1, sqft: 1, estimatedRent: 1 }];
  const { status, body, calls } = await reanalyze(property, stored, {
    rentalRegionNotFound: true,
    results: { marketStatistics: { medianRent: 2222, rentGrowthPct: 4, totalListings: 30 } },
  });
  expect(status).toBe(200);
  expect(calls.filter(path => path === '/rental_market')).toHaveLength(2);
  expect(body.property_data.rentalMarketTrends).toMatchObject({ source: 'rentcast', medianRent: 2222, areaName: 'ZIP 48734' });
  expect(body.analysis_results.dataSources.rental).not.toBe('zillow');
  expect(body.analysis_results.datasetStatus.rentalMarket).toBe('ok');
});

test('refresh-missing refetches only missing datasets and leaves financial results untouched', async () => {
  const property = subject({ housingMarket: undefined });
  const financial = { cashFlow: { monthlyCashFlow: 123 }, rentalEstimate: { mid: 1700, low: 1500, high: 1900 } };
  const { status, body, calls, updates, updateSql, reports } = await reanalyze(property, [], {
    path: '/analyzer/history/fixture-slug/refresh-missing',
    results: { ...financial, datasetStatus: { comparables: 'unavailable', housingMarket: 'unavailable', rentalMarket: 'ok' } },
  });
  expect(status).toBe(200);
  expect(calls.filter(path => path === '/similar')).toHaveLength(2);
  expect(calls.filter(path => path === '/housing_market')).toHaveLength(1);
  // Area market data is one shared housing+rental snapshot; rental stays as stored.
  expect(calls.filter(path => path === '/rental_market')).toHaveLength(1);
  expect(calls.filter(path => !['/similar', '/housing_market', '/rental_market'].includes(path))).toEqual([]);
  expect(updates).toHaveLength(1);
  expect(updateSql[0]).not.toMatch(/analysis_params|rental_comps|created_at|user_overrides/);
  const analysis = body.analysis;
  expect(analysis.analysis_results.cashFlow).toEqual(financial.cashFlow);
  expect(analysis.analysis_results.comparables).toHaveLength(1);
  expect(analysis.analysis_results.datasetStatus).toEqual({
    comparables: 'ok', housingMarket: 'ok', rentalMarket: 'ok',
  });
  expect(analysis.property_data.housingMarket.typicalHomeValue).toBe(250000);
  expect(analysis.property_data.rentalMarketTrends.medianRent).toBe(1750);
  expect(reports[0]).toMatchObject({ workflow: 'dataset-refresh' });
});

test('refresh-missing with nothing missing makes no provider call', async () => {
  const stored = [{ zpid: '1', address: 'Stored', price: 1, sqft: 1, estimatedRent: 1 }];
  const { status, calls } = await reanalyze(subject(), stored, {
    path: '/analyzer/history/fixture-slug/refresh-missing',
    results: { rentalEstimate: { mid: 1700 } },
  });
  expect(status).toBe(200);
  expect(calls).toEqual([]);
});
