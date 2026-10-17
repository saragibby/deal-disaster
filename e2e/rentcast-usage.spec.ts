import { test, expect } from '@playwright/test';
import type { PropertyData, RentalComp } from '@deal-platform/shared-types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StrategyComparison from '../packages/property-analyzer-core/dist/components/StrategyComparison.js';
import { estimateSTR } from '../server/src/services/strEstimationService';
import {
  getMarketStatistics, normalizeMarketStatistics, getRentalComps, getRentEstimate,
} from '../server/src/services/rentCastService';
import { getLongTermRentalEstimate } from '../server/src/services/longTermRentalService';
import {
  estimateRent, combineEstimates, applyZillowMarketRent, calibrateEstimate,
} from '../server/src/services/rentalEstimationService';

const property: PropertyData = {
  zpid: 'fixture', address: '10 Usage Fixture St', city: 'Example', state: 'NC', zip: '27500',
  price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
};
const comp: RentalComp = { rent: 1800, source: 'api' };

function providers(rentcast: RentalComp[], realtor: RentalComp[] = [], avm = { mid: 2200, low: 2000, high: 2400 }) {
  const calls: string[] = [];
  return {
    calls,
    sources: {
      rentCastComps: async () => { calls.push('listings'); return rentcast; },
      realtorComps: async () => { calls.push('realtor'); return realtor; },
      rentCastEstimate: async () => { calls.push('avm'); return avm; },
    },
  };
}

test('usable RentCast comps skip Realtor and AVM while preserving existing estimate', async () => {
  const h = providers([comp, { ...comp, rent: 1900 }, { ...comp, rent: 2000 }]);
  const result = await getLongTermRentalEstimate(property, h.sources);
  expect(h.calls).toEqual(['listings']);
  expect(result.compSource).toBe('rentcast');
  expect(result.usedAvm).toBe(false);
  expect(result.rentalEstimate).toEqual(combineEstimates(
    [comp, { ...comp, rent: 1900 }, { ...comp, rent: 2000 }], estimateRent(property), property,
  ));
});

test('one plausible comp is enough to avoid the unused AVM request', async () => {
  const h = providers([comp]);
  expect((await getLongTermRentalEstimate(property, h.sources)).rentalEstimate.confidence).toBe('medium');
  expect(h.calls).toEqual(['listings']);
});

test('filters implausible RentCast comps before Realtor fallback and skips AVM with Realtor comps', async () => {
  const h = providers([{ ...comp, rent: 50000 }, { ...comp, rent: NaN }], [comp]);
  const result = await getLongTermRentalEstimate(property, h.sources);
  expect(h.calls).toEqual(['listings', 'realtor']);
  expect(result.compSource).toBe('realtor');
  expect(result.rentalEstimate.comps).toEqual([comp]);
});

test('no usable comps retains exactly one AVM call and the existing blend', async () => {
  const h = providers([], [{ ...comp, rent: 10 }]);
  const result = await getLongTermRentalEstimate(property, h.sources);
  const algo = estimateRent(property);
  expect(h.calls).toEqual(['listings', 'realtor', 'avm']);
  expect(result.rentalEstimate).toEqual({
    mid: Math.round((algo.mid + 2200) / 2),
    low: Math.round((algo.low + 2000) / 2),
    high: Math.round((algo.high + 2400) / 2),
    confidence: 'medium',
  });
  expect(result.compSource).toBeNull();
  expect(result.usedAvm).toBe(true);
});

test('unavailable AVM preserves algorithm and Zillow fallback behavior', async () => {
  const h = providers([]);
  const subject = { ...property, rentalMarketTrends: {
    areaName: 'Example', medianRent: 2000, monthlyChange: 0, yearlyChange: 0,
    availableRentals: 10, marketTemperature: 'Warm',
  } };
  const result = await getLongTermRentalEstimate(subject, {
    ...h.sources, rentCastEstimate: async () => null,
  });
  expect(result.usedZillowRent).toBe(true);
  expect(result.usedAvm).toBe(false);
  expect(result.rentalEstimate).toEqual(applyZillowMarketRent(
    { ...estimateRent(subject), confidence: 'low' }, subject.rentalMarketTrends,
  ));
  const noMarket = await getLongTermRentalEstimate(property, {
    ...h.sources, rentCastEstimate: async () => null,
  });
  expect(noMarket.rentalEstimate).toEqual({ ...estimateRent(property), confidence: 'low' });
});

test('maps nested rental metrics and compares the same month twelve months apart', async () => {
  const stats = normalizeMarketStatistics({
    medianRent: 99999,
    saleData: { medianPrice: 400000, totalListings: 900 },
    rentalData: {
      medianRent: 2200, averageRent: 2300, totalListings: 42, averageDaysOnMarket: 21.5,
      history: {
        '2026-08': { medianRent: 2200 },
        '2025-09': { medianRent: 2100 },
        '2025-08': { medianRent: 2000 },
        '2024-08': { medianRent: 1000 },
      },
    },
  });
  expect(stats).toEqual({
    medianRent: 2200, averageRent: 2300, totalListings: 42, avgDaysOnMarket: 21.5,
    rentGrowthPct: 10, rentTrend: 'rising',
  });
  const algo = estimateRent(property);
  expect(calibrateEstimate(algo, property.sqft, {
    marketStats: stats, subjectProperty: property,
  }).mid).toBe(2200);
});

test('missing prior-year month does not become zero growth or a stable trend', async () => {
  const stats = normalizeMarketStatistics({ rentalData: {
    medianRent: 2200,
    history: { '2026-08': { medianRent: 2200 }, '2025-09': { medianRent: 2000 } },
  } });
  expect(stats).toEqual({ medianRent: 2200 });
});

test('never substitutes an average as median or compares unlike history metrics', async () => {
  expect(normalizeMarketStatistics({ rentalData: {
    averageRent: 2000,
    history: { '2026-08': { medianRent: 2200 }, '2025-08': { averageRent: 2000 } },
  } })).toEqual({ averageRent: 2000 });
  expect(normalizeMarketStatistics({ rentalData: {
    averageRent: 1900,
    history: { '2026-08': { averageRent: 1900 }, '2025-08': { averageRent: 2000 } },
  } })).toEqual({ averageRent: 1900, rentGrowthPct: -5, rentTrend: 'declining' });
});

test('rejects absent or malformed rental sections without manufacturing zero-dollar stats', async () => {
  for (const payload of [
    null, [], {}, { saleData: { medianPrice: 400000 } },
    { rentalData: [] }, { rentalData: { medianRent: '2000' } },
    { rentalData: { medianRent: -10, averageRent: 0, totalListings: -1 } },
  ]) expect(normalizeMarketStatistics(payload)).toBeNull();
  expect(normalizeMarketStatistics({ rentalData: {
    medianRent: 2000, totalListings: 0, averageDaysOnMarket: 0,
    history: { '2026-08': { medianRent: 2000 }, '2025-08': { medianRent: 2000 } },
  } })).toEqual({
    medianRent: 2000, totalListings: 0, avgDaysOnMarket: 0, rentGrowthPct: 0, rentTrend: 'stable',
  });
});

test('renders average-only market data without a fabricated median, stable trend, or YoY', async () => {
  const markup = renderToStaticMarkup(createElement(StrategyComparison, {
    ltrRent: 2000, bedrooms: 3, readOnly: true,
    strEstimate: estimateSTR(property, estimateRent(property)),
    marketStatistics: { averageRent: 2100 },
    strategyComparison: { strategies: [], bestKey: 'LTR', bestNetCashFlow: 500 },
  }));
  expect(markup).toContain('Trend unavailable');
  expect(markup).toContain('Average: $2,100/mo');
  expect(markup).not.toContain('Median:');
  expect(markup).not.toContain('% YoY');
  expect(markup).not.toContain('stable');
});

test.describe('RentCast HTTP queries and cache behavior', () => {
  const originalFetch = globalThis.fetch;
  let originalKey: string | undefined;
  let originalSharedCache: string | undefined;
  let originalSharedPropertyCache: string | undefined;
  test.beforeEach(() => {
    originalKey = process.env.RENTCAST_API_KEY;
    originalSharedCache = process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED;
    originalSharedPropertyCache = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    process.env.RENTCAST_API_KEY = 'fixture-key-not-a-real-credential';
    process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED = 'false';
    process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'false';
  });
  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RENTCAST_API_KEY;
    else process.env.RENTCAST_API_KEY = originalKey;
    if (originalSharedCache === undefined) delete process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED;
    else process.env.RENTCAST_SHARED_MARKET_CACHE_ENABLED = originalSharedCache;
    if (originalSharedPropertyCache === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
    else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalSharedPropertyCache;
  });

  test('one ZIP request fetches thirteen history months and caches the corrected metrics', async () => {
    let calls = 0;
    globalThis.fetch = async input => {
      calls++;
      const url = new URL(String(input));
      expect(url.pathname).toBe('/v1/markets');
      expect(url.searchParams.get('historyRange')).toBe('13');
      return Response.json({ rentalData: { medianRent: 2100 } });
    };
    expect(await getMarketStatistics('27101')).toEqual({ medianRent: 2100 });
    expect(await getMarketStatistics('27101')).toEqual({ medianRent: 2100 });
    expect(calls).toBe(1);
  });

  test('default rental orchestration makes only the listings HTTP request when comps are usable', async () => {
    const paths: string[] = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      expect(url.pathname).toBe('/v1/listings/rental/long-term');
      return Response.json([{ price: 1800, bedrooms: 3, bathrooms: 2 }]);
    };
    const result = await getLongTermRentalEstimate({
      ...property, latitude: 35.123, longitude: -78.123,
    });
    expect(paths).toEqual(['/v1/listings/rental/long-term']);
    expect(result.usedAvm).toBe(false);
    expect(result.compSource).toBe('rentcast');
  });

  test('missing data and HTTP failures are not cached as successful market statistics', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return Response.json({ saleData: {} });
      if (calls === 2) return new Response('', { status: 429 });
      return Response.json({ rentalData: { averageRent: 2000 } });
    };
    expect(await getMarketStatistics('27102')).toBeNull();
    expect(await getMarketStatistics('27102')).toBeNull();
    expect(await getMarketStatistics('27102')).toEqual({ averageRent: 2000 });
    expect(calls).toBe(3);
  });

  test('retains studio bedrooms and zero coordinates and keys comps by the actual query', async () => {
    const urls: URL[] = [];
    globalThis.fetch = async input => {
      urls.push(new URL(String(input)));
      return Response.json([{ price: 1800, bedrooms: 0 }]);
    };
    const studio = { ...property, latitude: 0, longitude: 0, bedrooms: 0, bathrooms: 0, sqft: 0 };
    await getRentalComps(studio, 2, 10);
    await getRentalComps(studio, 2, 10);
    await getRentalComps(studio, 2, 5);
    await getRentalComps({ ...studio, bedrooms: 1 }, 2, 5);
    expect(urls).toHaveLength(3);
    expect(urls[0].searchParams.get('bedrooms')).toBe('0');
    expect(urls[0].searchParams.get('latitude')).toBe('0');
    expect(urls[0].searchParams.get('longitude')).toBe('0');
    expect(urls[0].searchParams.has('bathrooms')).toBe(false);
    expect(urls[1].searchParams.get('limit')).toBe('5');
    expect(urls[2].searchParams.get('bedrooms')).toBe('1');
  });

  test('AVM query omits invented attributes and avoids reuse across changed property inputs', async () => {
    const urls: URL[] = [];
    globalThis.fetch = async input => {
      urls.push(new URL(String(input)));
      return Response.json({ rent: 2000, rentRangeLow: 1800, rentRangeHigh: 2200 });
    };
    const studio = { ...property, bedrooms: 0, bathrooms: 0, sqft: 0 };
    await getRentEstimate(studio);
    await getRentEstimate(studio);
    await getRentEstimate({ ...studio, bedrooms: 1 });
    await getRentEstimate({ ...studio, propertyType: 'Multi-Family', bedrooms: 8, sqft: 5000 });
    expect(urls).toHaveLength(3);
    expect(urls[0].searchParams.get('bedrooms')).toBe('0');
    for (const key of ['bathrooms', 'squareFootage', 'propertyType']) {
      expect(urls[0].searchParams.has(key)).toBe(false);
    }
    expect(urls[2].searchParams.get('propertyType')).toBe('Multi-Family');
    for (const key of ['bedrooms', 'bathrooms', 'squareFootage']) {
      expect(urls[2].searchParams.has(key)).toBe(false);
    }
  });

  test('concurrent identical listings calls fill once and valid empty results stay cached', async () => {
    const subject = { ...property, zip: '27401' };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json([]);
    };
    expect(await Promise.all(Array.from({ length: 5 }, () => getRentalComps(subject)))).toEqual([[], [], [], [], []]);
    await getRentalComps(subject);
    expect(calls).toBe(1);
  });

  test('listings failures and malformed rows do not become cached successful empty arrays', async () => {
    const subject = { ...property, zip: '27402' };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 429 });
      if (calls === 2) return Response.json([null]);
      if (calls === 3) return Response.json([{ price: '1800' }]);
      if (calls === 4) return Response.json([{}]);
      return Response.json([{ price: 1800, bedrooms: null, ownerNames: ['discarded'] }]);
    };
    for (let index = 0; index < 4; index++) expect(await getRentalComps(subject)).toEqual([]);
    const result = await getRentalComps(subject);
    expect(result).toEqual([{
      address: undefined, rent: 1800, bedrooms: undefined, bathrooms: undefined, sqft: undefined, source: 'api',
    }]);
    expect(await getRentalComps(subject)).toEqual(result);
    expect(calls).toBe(5);
  });

  test('AVM malformed values are not cached and missing ranges retain existing estimates', async () => {
    const subject = { ...property, address: '24 AVM Fixture St' };
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return Response.json({ rent: '2000' });
      if (calls === 2) return Response.json({ rent: 2000, rentRangeLow: -1 });
      return Response.json({ rent: 2000, ownerNames: ['discarded'] });
    };
    expect(await getRentEstimate(subject)).toBeNull();
    expect(await getRentEstimate(subject)).toBeNull();
    expect(await getRentEstimate(subject)).toEqual({ mid: 2000, low: 1800, high: 2200 });
    await getRentEstimate(subject);
    expect(calls).toBe(3);
  });
});
