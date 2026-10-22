import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { OwnerContext } from '@deal-platform/shared-types';
import { pool } from '../server/src/db/pool';
import { createPropertyAnalyzerRouter } from '../server/src/routes/propertyAnalyzer';
import { authenticateToken } from '../server/src/middleware/auth';
import { providerUsageMiddleware, type ProviderUsageSummary } from '../server/src/services/providerUsageService';
import { getProximityBoost, applyMtrProximity, estimateMTR } from '../server/src/services/mtrEstimationService';
import { mtrAnalysis } from './fixtures/mtr-analysis';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express') as typeof import('express');
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
const originalFetch = globalThis.fetch;
const originalQuery = pool.query;
const env: Record<string, string | undefined> = {};
test.beforeEach(() => {
  for (const [key, value] of Object.entries({
    GOOGLE_GEOCODING_API_KEY: 'fixture-nearby-key', JWT_SECRET: 'fixture-nearby-auth',
    RAPIDAPI_KEY: 'fixture-rapid-key', FF_MTR_DISABLED: 'true',
    RENTCAST_SHARED_MARKET_CACHE_ENABLED: 'false', RENTCAST_SHARED_PROPERTY_CACHE_ENABLED: 'false',
  })) {
    env[key] = process.env[key];
    process.env[key] = value;
  }
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(pool, 'query', { value: originalQuery, configurable: true, writable: true });
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('nearby searches are single-flight, cached, and failures remain retryable', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return Response.json({ status: 'OK', results: [{ name: 'Fixture Hospital', geometry: { location: { lat: 35.4, lng: -80.4 } } }] });
  };
  const [first, second] = await Promise.all([getProximityBoost(35.4, -80.4), getProximityBoost(35.4, -80.4)]);
  expect(calls).toBe(5);
  expect(first).toEqual(second);
  expect(first.boost).toBe(15);
  expect(await getProximityBoost(35.4, -80.4)).toEqual(first);
  expect(calls).toBe(5);
  globalThis.fetch = async () => { calls++; return Response.json({ status: 'REQUEST_DENIED' }); };
  await expect(getProximityBoost(35.5, -80.5)).rejects.toThrow('Nearby places lookup failed');
  expect(calls).toBe(10);
  globalThis.fetch = async () => { calls++; return Response.json({ status: 'ZERO_RESULTS', results: [] }); };
  expect(await getProximityBoost(35.5, -80.5)).toEqual({ boost: 0, nearby: [] });
  expect(calls).toBe(15);
  await getProximityBoost(35.5, -80.5);
  expect(calls).toBe(15);
});

test('proximity updates demand and financial figures without losing furnished data or stacking boosts', () => {
  const a = mtrAnalysis();
  const estimate = estimateMTR(a.property_data, a.analysis_results.rentalEstimate, 0, {
    monthlyRate: 2400, low: 2200, high: 2600, sampleSize: 10,
    totalListings: 12, radiusMiles: 10, comps: [],
  });
  const proximity = { boost: 15, nearby: [{ name: 'Fixture Hospital', emoji: 'H', miles: 1 }] };
  const updated = applyMtrProximity(a.property_data, estimate, proximity);
  expect(updated.occupancyRate).toBe(Math.min(0.97, estimate.occupancyRate + 0.02));
  expect(updated.demandFactors.nearbyInstitutions).toEqual(proximity.nearby);
  expect(updated.grossMonthlyRevenue).toBe(Math.round(updated.monthlyRate * updated.occupancyRate));
  expect(updated.netMonthlyRevenue - estimate.netMonthlyRevenue).toBe(updated.grossMonthlyRevenue - estimate.grossMonthlyRevenue);
  expect(updated.source).toBe(estimate.source);
  expect(updated.marketComps).toEqual(estimate.marketComps);
  expect(updated.seasonality).toHaveLength(12);
  expect(applyMtrProximity(a.property_data, updated, proximity)).toEqual(updated);
  expect(estimate.demandFactors.nearbyInstitutions).toBeUndefined();
  const baseline = estimateMTR(a.property_data, a.analysis_results.rentalEstimate);
  const previous = estimateMTR(a.property_data, a.analysis_results.rentalEstimate, 15);
  const lazy = applyMtrProximity(a.property_data, baseline, proximity);
  expect(lazy).toEqual({ ...previous, demandFactors: { ...previous.demandFactors, nearbyInstitutions: proximity.nearby } });
});

test('analysis and saved views make zero Places calls; owner MTR endpoint alone fetches nearby data', async () => {
  const a = mtrAnalysis();
  let places = 0;
  let providerError = false;
  const writes: string[] = [];
  Object.defineProperty(pool, 'query', { configurable: true, writable: true,
    value: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('INSERT INTO property_analyses')) {
        writes.push(sql);
        return { rows: [{ slug: a.slug, created_at: a.created_at, public_share_id: null }] };
      }
      if (sql.includes('FROM property_analyses')) {
        expect(values.slice(0, 3)).toEqual(['asset-dashboard', 'asset-dashboard', 7]);
        return { rows: values[3] === 'missing' ? [] : [{
          ...a, property_data: { ...a.property_data, ...(values[3] === 'no-coordinates'
            ? { latitude: undefined, longitude: undefined } : values[3] === 'provider-error'
              ? { latitude: 35.601, longitude: -80.601 } : {}) },
        }] };
      }
      return { rows: [] };
    },
  });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'maps.googleapis.com') {
      places++;
      return Response.json({ status: providerError ? 'OVER_QUERY_LIMIT' : 'ZERO_RESULTS', results: [] });
    }
    if (url.pathname === '/byzpid') return Response.json({
      PropertyAddress: { streetAddress: a.property_data.address, city: 'Example', state: 'NC', zipcode: '27500' },
      Price: 200000, Bedrooms: 3, Bathrooms: 2, 'Area(sqft)': 1500, yearBuilt: 2000,
      latitude: 35.112, longitude: -80.112,
    });
    if (url.pathname === '/similar') return Response.json({ similar_properties: { propertyDetails: [] } });
    return Response.json({});
  };
  const owner: OwnerContext = { actorUserId: '7', ownerUserId: '7', platform: 'asset-dashboard',
    tenantId: 'asset-dashboard', roles: [], permissions: [] };
  const reports: ProviderUsageSummary[] = [];
  const app = express();
  app.use(express.json());
  app.use(providerUsageMiddleware(row => reports.push(row)));
  app.use('/analyzer', createPropertyAnalyzerRouter({
    auth: { requireAuth: authenticateToken, optionalAuth: authenticateToken, buildOwnerContext: async () => owner },
    config: { platform: 'asset-dashboard', tenantId: 'asset-dashboard' },
  }));
  const server: Server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const root = `http://127.0.0.1:${address.port}/analyzer`;
    const headers = { Authorization: `Bearer ${jwt.sign({ userId: 7 }, 'fixture-nearby-auth')}`, 'Content-Type': 'application/json' };
    const run = await originalFetch(`${root}/run`, { method: 'POST', headers, body: JSON.stringify({ url: a.zillow_url }) });
    expect(run.status, await run.text()).toBe(200);
    expect(writes).toHaveLength(1);
    expect(places).toBe(0);
    const saved = await originalFetch(`${root}/history/${a.slug}`, { headers });
    expect(saved.status).toBe(200);
    expect(places).toBe(0);
    expect((await originalFetch(`${root}/history/${a.slug}/mtr-nearby`, { method: 'POST' })).status).toBe(401);
    expect((await originalFetch(`${root}/history/missing/mtr-nearby`, { method: 'POST', headers })).status).toBe(404);
    expect((await originalFetch(`${root}/history/no-coordinates/mtr-nearby`, { method: 'POST', headers })).status).toBe(422);
    expect(places).toBe(0);
    const response = await originalFetch(`${root}/history/${a.slug}/mtr-nearby`, { method: 'POST', headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).demandFactors.nearbyInstitutions).toEqual([]);
    expect(places).toBe(5);
    expect(writes).toHaveLength(1);
    expect(reports.find(row => row.workflow === 'mtr-nearby' && row.outcome === 'complete')?.attempts).toBe(5);
    providerError = true;
    const failed = await originalFetch(`${root}/history/provider-error/mtr-nearby`, { method: 'POST', headers });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: 'Nearby places are unavailable. Please retry.' });
    expect(places).toBe(10);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
