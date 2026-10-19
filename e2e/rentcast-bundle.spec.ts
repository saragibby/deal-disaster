import { test, expect } from '@playwright/test';
import type { PropertyData, RentalComp } from '@deal-platform/shared-types';
import {
  BUNDLE_MAX_DAYS_OLD, getRentEstimateBundle, parseRentEstimateBundle, rentCastRentMode,
} from '../server/src/services/rentCastService';
import { getLongTermRentalEstimate } from '../server/src/services/longTermRentalService';
import { combineEstimates, estimateRent } from '../server/src/services/rentalEstimationService';
import { isRentEstimateBundleProjection } from '../server/src/services/rentCastPropertyCache';
import { withProviderUsage, type ProviderUsageSummary } from '../server/src/services/providerUsageService';

const property: PropertyData = {
  zpid: 'bundle-fixture', address: '10 Bundle Fixture St', city: 'Example', state: 'NC', zip: '27600',
  price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
};
const comp = (rent: number, address?: string): RentalComp => ({
  rent, source: 'api', ...(address ? { address } : {}),
});
const estimate = { mid: 2200, low: 2000, high: 2400 };

function bundleProviders(
  bundle: { estimate: typeof estimate; comps: RentalComp[] } | null,
  listings: RentalComp[] = [],
  realtor: RentalComp[] = [],
  mode: 'bundle' | 'compatibility' = 'bundle',
) {
  const calls: string[] = [];
  return {
    calls,
    sources: {
      rentCastBundle: async () => { calls.push('bundle'); return bundle; },
      rentCastComps: async () => { calls.push('listings'); return listings; },
      realtorComps: async () => { calls.push('realtor'); return realtor; },
      rentCastEstimate: async () => { calls.push('avm'); return estimate; },
      mode: () => mode,
    },
  };
}

test.describe('bundle orchestration', () => {
  test('sufficient bundle comps use one estimate request and the existing comp blend', async () => {
    const comps = [comp(1800, 'A'), comp(1900, 'B'), comp(2000, 'C')];
    const h = bundleProviders({ estimate, comps });
    const result = await getLongTermRentalEstimate(property, h.sources);
    expect(h.calls).toEqual(['bundle']);
    expect(result.compSource).toBe('rentcast');
    expect(result.usedAvm).toBe(false);
    expect(result.rentalEstimate).toEqual(combineEstimates(comps, estimateRent(property), property));
  });

  test('fewer than three plausible comps add one listings request and merge without duplicates', async () => {
    const h = bundleProviders(
      { estimate, comps: [comp(1800, '1 Main St, Example, NC'), comp(90000, 'Implausible')] },
      [comp(1850, '1 MAIN ST,  Example NC'), comp(1950, '2 Main St'), comp(2050)],
    );
    const result = await getLongTermRentalEstimate(property, h.sources);
    expect(h.calls).toEqual(['bundle', 'listings']);
    expect(result.rentalEstimate.comps?.map(c => c.rent)).toEqual([1800, 1950, 2050]);
    expect(result.usedAvm).toBe(false);
  });

  test('no comps anywhere reuses the bundle estimate without a second estimate request', async () => {
    const h = bundleProviders({ estimate, comps: [] }, [], [comp(10)]);
    const result = await getLongTermRentalEstimate(property, h.sources);
    const algo = estimateRent(property);
    expect(h.calls).toEqual(['bundle', 'listings', 'realtor']);
    expect(result.usedAvm).toBe(true);
    expect(result.compSource).toBeNull();
    expect(result.rentalEstimate).toEqual({
      mid: Math.round((algo.mid + estimate.mid) / 2),
      low: Math.round((algo.low + estimate.low) / 2),
      high: Math.round((algo.high + estimate.high) / 2),
      confidence: 'medium',
    });
  });

  test('a failed bundle request falls back to listings and never retries the estimate', async () => {
    const withListings = bundleProviders(null, [comp(1800)]);
    const listed = await getLongTermRentalEstimate(property, withListings.sources);
    expect(withListings.calls).toEqual(['bundle', 'listings']);
    expect(listed.compSource).toBe('rentcast');

    const empty = bundleProviders(null);
    const result = await getLongTermRentalEstimate(property, empty.sources);
    expect(empty.calls).toEqual(['bundle', 'listings', 'realtor']);
    expect(result.usedAvm).toBe(false);
    expect(result.rentalEstimate).toEqual({ ...estimateRent(property), confidence: 'low' });
  });

  test('compatibility mode never calls the bundle', async () => {
    const h = bundleProviders({ estimate, comps: [comp(1800)] }, [comp(1900)], [], 'compatibility');
    await getLongTermRentalEstimate(property, h.sources);
    expect(h.calls).toEqual(['listings']);
  });

  test('mode defaults to compatibility and only an explicit bundle value enables bundle mode', () => {
    const original = process.env.RENTCAST_RENT_MODE;
    try {
      for (const [value, expected] of [
        [undefined, 'compatibility'], ['', 'compatibility'], ['true', 'compatibility'],
        ['compatibility', 'compatibility'], [' Bundle ', 'bundle'],
      ] as const) {
        if (value === undefined) delete process.env.RENTCAST_RENT_MODE;
        else process.env.RENTCAST_RENT_MODE = value;
        expect(rentCastRentMode()).toBe(expected);
      }
    } finally {
      if (original === undefined) delete process.env.RENTCAST_RENT_MODE;
      else process.env.RENTCAST_RENT_MODE = original;
    }
  });
});

test.describe('bundle response projection', () => {
  const row = {
    id: 'fixture-id', formattedAddress: '7 Comp St, Example, NC 27600', addressLine1: '7 Comp St',
    county: 'Example', stateFips: '37', lotSize: 7000, yearBuilt: 1999, listingType: 'Standard',
    listedDate: '2026-01-01T00:00:00.000Z', ownerNames: ['private'], price: 1700, bedrooms: 3,
    bathrooms: 2, squareFootage: 1600, latitude: 35.1, longitude: -78.1, status: 'Inactive',
    distance: 0.43591, daysOld: 40, correlation: 0.98734,
  };

  test('keeps recent active and inactive comps with only allowlisted fields', () => {
    const result = parseRentEstimateBundle({
      rent: 2000, rentRangeLow: 1900, rentRangeHigh: 2100,
      subjectProperty: { ownerNames: ['private'] },
      comparables: [
        row,
        { ...row, formattedAddress: 'Active St', status: 'Active', daysOld: undefined },
        { ...row, formattedAddress: 'Old St', daysOld: BUNDLE_MAX_DAYS_OLD + 1 },
        { ...row, formattedAddress: 'Unknown Age St', daysOld: undefined },
        { ...row, formattedAddress: 'Free St', price: 0 },
      ],
    });
    expect(result).toEqual({
      estimate: { mid: 2000, low: 1900, high: 2100 },
      comps: [
        {
          address: '7 Comp St, Example, NC 27600', rent: 1700, bedrooms: 3, bathrooms: 2, sqft: 1600,
          source: 'api', status: 'inactive', daysOld: 40, distance: 0.44, correlation: 0.9873,
          latitude: 35.1, longitude: -78.1,
        },
        {
          address: 'Active St', rent: 1700, bedrooms: 3, bathrooms: 2, sqft: 1600, source: 'api',
          status: 'active', distance: 0.44, correlation: 0.9873, latitude: 35.1, longitude: -78.1,
        },
      ],
    });
    expect(isRentEstimateBundleProjection(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  test('missing comparables keep the estimate; malformed rows or estimates are rejected', () => {
    expect(parseRentEstimateBundle({ rent: 2000 })).toEqual({
      estimate: { mid: 2000, low: 1800, high: 2200 }, comps: [],
    });
    expect(parseRentEstimateBundle({ rent: 2000, comparables: {} })).toBeNull();
    expect(parseRentEstimateBundle({ rent: 2000, comparables: [{ ...row, price: '1700' }] })).toBeNull();
    expect(parseRentEstimateBundle({ rent: 2000, comparables: [{ ...row, daysOld: 'recent' }] })).toBeNull();
    expect(parseRentEstimateBundle({ rent: '2000', comparables: [row] })).toBeNull();
  });

  test('cache validator rejects unexpected comp fields', () => {
    expect(isRentEstimateBundleProjection({
      estimate, comps: [{ rent: 1800, source: 'api', ownerNames: ['x'] }],
    })).toBe(false);
    expect(isRentEstimateBundleProjection({
      estimate, comps: [{ rent: 1800, source: 'api', status: 'leased' }],
    })).toBe(false);
  });
});

test.describe('bundle HTTP requests', () => {
  const originalFetch = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  const keys = ['RENTCAST_API_KEY', 'RENTCAST_RENT_MODE', 'RENTCAST_SHARED_PROPERTY_CACHE_ENABLED'];

  test.beforeEach(() => {
    for (const key of keys) saved[key] = process.env[key];
    process.env.RENTCAST_API_KEY = 'fixture-key-not-a-real-credential';
    process.env.RENTCAST_RENT_MODE = 'bundle';
    process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'false';
  });
  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  const recent = (n: number) => Array.from({ length: n }, (_, index) => ({
    formattedAddress: `${index + 1} Recent St`, price: 1800 + index * 50, bedrooms: 3,
    status: index === 0 ? 'Active' : 'Inactive', daysOld: 10 + index,
  }));

  test('sufficient comps make exactly one estimate request with bounded comp parameters', async () => {
    const urls: URL[] = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      urls.push(url);
      return Response.json({ rent: 2000, comparables: recent(3) });
    };
    const subject = { ...property, address: '1 Sufficient St', latitude: 35.5, longitude: -78.5 };
    const result = await getLongTermRentalEstimate(subject);
    expect(urls.map(url => url.pathname)).toEqual(['/v1/avm/rent/long-term']);
    expect(urls[0].searchParams.get('maxRadius')).toBe('2');
    expect(urls[0].searchParams.get('daysOld')).toBe('180');
    expect(urls[0].searchParams.get('compCount')).toBe('15');
    expect(urls[0].searchParams.get('latitude')).toBe('35.5');
    expect(result.rentalEstimate.comps).toHaveLength(3);
    expect(result.rentalEstimate.comps?.[1]).toMatchObject({ status: 'inactive', daysOld: 11 });

    await getRentEstimateBundle(subject);
    expect(urls).toHaveLength(1);
  });

  test('insufficient comps add one active-listings request and the usage ledger labels both', async () => {
    const paths: string[] = [];
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname === '/v1/avm/rent/long-term') return Response.json({ rent: 2000, comparables: recent(1) });
      expect(url.searchParams.get('status')).toBe('Active');
      return Response.json([{ formattedAddress: '9 Listing St', price: 1900 }]);
    };
    const reports: ProviderUsageSummary[] = [];
    const result = await withProviderUsage('analysis',
      () => getLongTermRentalEstimate({ ...property, address: '2 Insufficient St' }),
      summary => reports.push(summary));
    expect(result.rentalEstimate.comps?.map(c => c.address)).toEqual(['1 Recent St', '9 Listing St']);
    expect(paths).toEqual(['/v1/avm/rent/long-term', '/v1/listings/rental/long-term']);
    const rows = reports[0].endpoints.filter(row => row.provider === 'rentcast');
    expect(rows.find(row => row.operation === 'rent-avm')?.attempts).toBe(1);
    expect(rows.find(row => row.operation === 'rental-listings')).toMatchObject({
      attempts: 1, fallbacks: { 'insufficient-comps': 1 },
    });
  });
});
