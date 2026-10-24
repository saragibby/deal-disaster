import { test, expect } from '@playwright/test';
import type { PropertyData } from '@deal-platform/shared-types';
import { getRentalComps } from '../server/src/services/rentCastService';
import { getLongTermRentalEstimate } from '../server/src/services/longTermRentalService';
import { getPropertyByAddress, getPropertyByZpid } from '../server/src/services/propertyDataService';
import { isPlausibleMonthlyRent, rentalCompRejectionReason } from '../server/src/services/rentalEstimationService';
import { withProviderUsage } from '../server/src/services/providerUsageService';
import { recordAnalyzerDiagnostic } from '../server/src/services/analyzerDiagnostics';

const property: PropertyData = {
  zpid: 'diagnostic-fixture', address: 'private-address', city: '', state: '', zip: 'diagnostics',
  price: 100000, bedrooms: 8, bathrooms: 4, sqft: 3000, yearBuilt: 2000,
};
const originalFetch = globalThis.fetch;
const originalDebug = console.debug;
let originalNodeEnv: string | undefined;
let originalKey: string | undefined;
let originalShared: string | undefined;
let logs: unknown[][];

test.beforeEach(() => {
  logs = [];
  console.debug = (...args: unknown[]) => { logs.push(args); };
  originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  originalKey = process.env.RENTCAST_API_KEY;
  originalShared = process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  process.env.RENTCAST_API_KEY = 'diagnostic-fixture-key';
  process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = 'false';
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  console.debug = originalDebug;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalKey === undefined) delete process.env.RENTCAST_API_KEY;
  else process.env.RENTCAST_API_KEY = originalKey;
  if (originalShared === undefined) delete process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED;
  else process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED = originalShared;
});

function diagnostic(label: string): Record<string, unknown> {
  const kinds: Record<string, string> = {
    '[rentcast:listings-response]': 'listings-response',
    '[rentcast:listings-query]': 'listings-query',
    '[rentcast:comp-selection]': 'comp-selection',
    '[property:type-schema]': 'property-type-schema',
  };
  const row = logs.find(args => JSON.parse(String(args[1])).kind === kinds[label]);
  expect(row).toBeDefined();
  const { kind: _kind, ...fields } = JSON.parse(String(row![1]));
  return fields;
}

for (const nodeEnv of ['production', 'test', undefined]) {
  test(`new diagnostics are silent when NODE_ENV is ${nodeEnv}`, async () => {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    for (const kind of ['listings-query', 'listings-response', 'comp-selection', 'property-type-schema'] as const) {
      recordAnalyzerDiagnostic(kind, { count: 1 });
    }
    expect(logs).toEqual([]);
  });
}

for (const [name, payload, expected] of [
  ['empty', [], { outcome: 'valid', rawRowCount: 0, positivePriceRowCount: 0, excludedPriceRowCount: 0 }],
  ['no-positive-prices', [{ price: null }, { price: 0 }, { price: -1 }],
    { outcome: 'valid', rawRowCount: 3, positivePriceRowCount: 0, excludedPriceRowCount: 3 }],
  ['mixed', [{ price: 1800, formattedAddress: 'private-provider-address' }, { price: 0 }],
    { outcome: 'valid', rawRowCount: 2, positivePriceRowCount: 1, excludedPriceRowCount: 1 }],
  ['invalid', [{ price: 'private-invalid-value' }, { price: 1800 }],
    { outcome: 'invalid-schema', rawRowCount: 2, invalidRowCount: 1 }],
  ['nonarray', { secret: 'private-payload' },
    { outcome: 'invalid-schema', rawRowCount: null, invalidRowCount: null }],
] as const) {
  test(`listings diagnostics distinguish ${name} without exposing payloads`, async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json(payload); };
    await withProviderUsage('analysis', async () => {
      const result = await getRentalComps({ ...property, zip: `diagnostics-${name}` });
      expect(result).toHaveLength(name === 'mixed' ? 1 : 0);
    }, () => {});
    expect(calls).toBe(1);
    expect(diagnostic('[rentcast:listings-response]')).toEqual({
      requestId: expect.any(String), ...expected,
    });
    const output = JSON.stringify(logs);
    for (const secret of ['private-address', 'private-provider-address', 'private-invalid-value',
      'private-payload', 'diagnostic-fixture-key', 'api.rentcast.io']) {
      expect(output).not.toContain(secret);
    }
  });
}

test('selection reasons preserve filter boundaries, fallback behavior and privacy', async () => {
  const rents = [NaN, Infinity, 299, 50001, 3001, 300, 3000];
  expect(rents.map(rent => rentalCompRejectionReason(rent, property))).toEqual([
    'invalid-rent', 'invalid-rent', 'below-minimum', 'above-maximum', 'above-price-ratio', null, null,
  ]);
  expect(rents.map(rent => isPlausibleMonthlyRent(rent, property)))
    .toEqual([false, false, false, false, false, true, true]);
  expect(isPlausibleMonthlyRent(50000)).toBe(true);
  expect(isPlausibleMonthlyRent(1800, { ...property, price: 0 })).toBe(true);
  const calls: string[] = [];
  const result = await withProviderUsage('analysis', () => getLongTermRentalEstimate(property, {
    rentCastComps: async () => rents.map(rent => ({ rent, address: 'private-comp', source: 'api' })),
    realtorComps: async () => { calls.push('realtor'); return []; },
    rentCastEstimate: async () => { calls.push('avm'); return null; },
  }), () => {});
  expect(result.rentalEstimate.comps?.map(comp => comp.rent)).toEqual([300, 3000]);
  expect(calls).toEqual([]);
  expect(diagnostic('[rentcast:comp-selection]')).toEqual({
    requestId: expect.any(String), stage: 'listings', inputCount: 7, acceptedCount: 2,
    invalidRentCount: 2, belowMinimumCount: 1, aboveMaximumCount: 1, abovePriceRatioCount: 1,
    propertyTypePresent: false, sixPlusBedrooms: true, sixPlusBathrooms: false,
  });
  expect(JSON.stringify(logs)).not.toContain('private-');
});

test('query diagnostics preserve missing-type filters and confirmed multifamily omission on cache hits', async () => {
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    requests.push(new URL(String(input)));
    return Response.json([]);
  };
  for (const propertyType of [undefined, 'Multi-Family']) {
    const subject = { ...property, zip: 'diagnostic-query', propertyType, latitude: 35, longitude: -78 };
    for (let repeat = 0; repeat < 2; repeat++) {
      logs = [];
      await getRentalComps(subject);
      expect(diagnostic('[rentcast:listings-query]')).toMatchObject({
        locationMode: 'coordinates', propertyTypePresent: propertyType !== undefined,
        recognizedPropertyType: propertyType !== undefined,
        bedroomFilterApplied: propertyType === undefined, bathroomFilterApplied: propertyType === undefined,
      });
      expect(JSON.stringify(logs)).not.toContain('private-address');
    }
  }
  expect(requests).toHaveLength(2);
  expect(requests[0].searchParams.get('bedrooms')).toBe('8');
  expect(requests[0].searchParams.get('bathrooms')).toBe('4');
  expect(requests[1].searchParams.has('bedrooms')).toBe(false);
  expect(requests[1].searchParams.has('bathrooms')).toBe(false);
});

for (const method of ['address', 'zpid'] as const) {
  test(`${method} property lookup diagnoses existing type fields without inventing aliases`, async () => {
    let typeFields: Record<string, unknown> = {};
    globalThis.fetch = async () => Response.json({
      PropertyAddress: { streetAddress: 'private-address' }, Price: 100000,
      Bedrooms: 8, Bathrooms: 4, PropertyType: 'unverified-alias',
      priceHistory: [{ date: '2026-01-01', price: 100000 }], ...typeFields,
    });
    for (const [index, fields] of [{}, { homeType: 'MULTI_FAMILY' }, { propertyType: 'Duplex' }].entries()) {
      typeFields = fields;
      logs = [];
      const result = await withProviderUsage('analysis', () => method === 'address'
        ? getPropertyByAddress('private-address')
        : getPropertyByZpid(`diagnostics-type-${index}`), () => {});
      expect(result.propertyType).toBe(fields.homeType || fields.propertyType || undefined);
      expect(diagnostic('[property:type-schema]')).toEqual({
        requestId: expect.any(String),
        homeTypePresent: 'homeType' in fields, homeTypeIsString: 'homeType' in fields,
        propertyTypePresent: 'propertyType' in fields, propertyTypeIsString: 'propertyType' in fields,
        resolvedTypePresent: index > 0,
      });
      expect(JSON.stringify(logs)).not.toMatch(/private-address|MULTI_FAMILY|Duplex|unverified-alias/);
    }
  });
}
