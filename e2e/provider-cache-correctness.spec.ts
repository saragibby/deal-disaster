import { test, expect } from '@playwright/test';
import type { PropertyData } from '@deal-platform/shared-types';
import { pool } from '../server/src/db/pool';
import { getAreaMarketData } from '../server/src/services/areaMarketService';
import { getSTREstimate } from '../server/src/services/airDnaService';
import { getMtrMarketData } from '../server/src/services/furnishedFinderService';
import { getRentalComps, getForSaleProperty } from '../server/src/services/realtyInUsService';

const originalFetch = globalThis.fetch;
const originalQuery = pool.query;
let originalKey: string | undefined;
let originalDisabled: string | undefined;
let sequence = 0;
const property: PropertyData = {
  zpid: '', address: '10 Fixture St', city: 'Example', state: 'NC', zip: '27500',
  price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
  latitude: 35, longitude: -80,
};
function freshProperty(): PropertyData {
  return { ...property, address: `${++sequence} Fixture St`, zip: String(28000 + sequence), latitude: 35 + sequence / 100 };
}
test.beforeEach(() => {
  originalKey = process.env.RAPIDAPI_KEY;
  originalDisabled = process.env.FF_MTR_DISABLED;
  process.env.RAPIDAPI_KEY = 'fixture-not-a-credential';
  process.env.FF_MTR_DISABLED = 'false';
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(pool, 'query', { value: originalQuery, configurable: true, writable: true });
  if (originalKey === undefined) delete process.env.RAPIDAPI_KEY;
  else process.env.RAPIDAPI_KEY = originalKey;
  if (originalDisabled === undefined) delete process.env.FF_MTR_DISABLED;
  else process.env.FF_MTR_DISABLED = originalDisabled;
});

function areaResponse(input: Parameters<typeof fetch>[0]): Response {
  return Response.json(String(input).includes('housing_market')
    ? { market_overview: { typical_home_values: 250000 } }
    : { rental_market_trends: { summary: { medianRent: 1800 } } });
}

for (const failure of ['read', 'write'] as const) {
  test(`Zillow ${failure} outage fetches each endpoint once and keeps successful data hot`, async () => {
    const calls: string[] = [];
    Object.defineProperty(pool, 'query', {
      configurable: true, writable: true,
      value: async (sql: string) => {
        if ((failure === 'read' && !sql.includes('INSERT')) || sql.includes('INSERT')) throw new Error('fixture cache outage');
        return { rows: [] };
      },
    });
    globalThis.fetch = async input => { calls.push(String(input)); return areaResponse(input); };
    const city = `Fixture ${++sequence}`;
    const result = await getAreaMarketData(city, 'NC', '27500');
    expect(result.housingMarket?.typicalHomeValue).toBe(250000);
    expect(result.rentalMarket?.medianRent).toBe(1800);
    expect(await getAreaMarketData(city, 'NC', '27500')).toEqual(result);
    expect(calls).toHaveLength(2);
  });
}

test('Zillow keeps stale partial data if a fresh snapshot cannot be written', async () => {
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true,
    value: async (sql: string) => {
      if (sql.includes('INSERT')) throw new Error('fixture write outage');
      return { rows: sql.includes('SELECT') ? [{
        housing_market: { typicalHomeValue: 190000 }, rental_market: null,
        fetched_at: new Date(0),
      }] : [] };
    },
  });
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    return String(input).includes('housing_market') ? Response.json({}) : areaResponse(input);
  };
  const result = await getAreaMarketData(`Partial ${++sequence}`, 'NC', '27500');
  expect(result.housingMarket?.typicalHomeValue).toBe(190000);
  expect(result.rentalMarket?.medianRent).toBe(1800);
  // City pair plus one ZIP retry for the missing housing dataset only.
  expect(calls).toBe(3);
});

test('Zillow rental "Region Not Found" for the city retries only rental by ZIP', async () => {
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true, value: async () => ({ rows: [] }),
  });
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}:${url.searchParams.get('search_query')}`);
    if (url.pathname === '/rental_market' && url.searchParams.get('search_query') !== '27500') {
      return Response.json({ message: 'Error: Region Not Found' });
    }
    return areaResponse(input);
  };
  const city = `Rental Gap ${++sequence}`;
  const result = await getAreaMarketData(city, 'NC', '27500');
  expect(result.housingMarket?.typicalHomeValue).toBe(250000);
  expect(result.rentalMarket?.medianRent).toBe(1800);
  expect(calls).toEqual([
    `/housing_market:${city} NC`, `/rental_market:${city} NC`, '/rental_market:27500',
  ]);
});

test('Zillow area lookup without a ZIP does not retry', async () => {
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true, value: async () => ({ rows: [] }),
  });
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    return String(input).includes('rental_market') ? Response.json({ message: 'Error: Region Not Found' }) : areaResponse(input);
  };
  const result = await getAreaMarketData(`No Zip ${++sequence}`, 'NC');
  expect(result.rentalMarket).toBeUndefined();
  expect(calls).toBe(2);
});

test('Zillow city miss permits one ZIP fallback without repeating it on write failure', async () => {
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true,
    value: async (sql: string) => {
      if (sql.includes('INSERT')) throw new Error('fixture write outage');
      return { rows: [] };
    },
  });
  const calls: string[] = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    return new URL(String(input)).searchParams.get('search_query') === '27500'
      ? areaResponse(input) : Response.json({});
  };
  const result = await getAreaMarketData(`Zip ${++sequence}`, 'NC', '27500');
  expect(result.rentalMarket?.medianRent).toBe(1800);
  expect(calls).toHaveLength(4);
});

test('Zillow empty area result is held for minutes, not an hour, while real data stays hot', async () => {
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true, value: async () => ({ rows: [] }),
  });
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    let outage = true;
    let calls = 0;
    globalThis.fetch = async input => { calls++; return outage ? Response.json({}) : areaResponse(input); };
    const city = `Outage ${++sequence}`;
    expect(await getAreaMarketData(city, 'NC', '27500')).toEqual({ housingMarket: undefined, rentalMarket: undefined });
    expect(calls).toBe(4);
    await getAreaMarketData(city, 'NC', '27500');
    expect(calls).toBe(4);

    outage = false;
    now += 6 * 60 * 1000;
    const recovered = await getAreaMarketData(city, 'NC', '27500');
    expect(recovered.rentalMarket?.medianRent).toBe(1800);
    expect(calls).toBe(6);
    now += 30 * 60 * 1000;
    expect(await getAreaMarketData(city, 'NC', '27500')).toEqual(recovered);
    expect(calls).toBe(6);
  } finally {
    Date.now = originalNow;
  }
});

test('AirDNA keys follow effective address/unit, beds and baths rather than missing or stale ZPIDs', async () => {
  const subject = freshProperty();
  const calls: string[] = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    return Response.json({ adr: 150, occupancy: 0.6 });
  };
  const first = await getSTREstimate(subject);
  expect(first?.nightlyRate).toBe(150);
  expect(await getSTREstimate({ ...subject, zpid: 'new-alias' })).toEqual(first);
  expect(calls).toHaveLength(1);
  for (const change of [
    { address: `${subject.address} Unit 2` }, { bedrooms: 5 }, { bathrooms: 3 },
    { city: 'Different' }, { state: 'SC' }, { zip: '29999' },
  ]) await getSTREstimate({ ...subject, ...change });
  expect(calls).toHaveLength(7);
  expect(new URL(calls[2]).searchParams.get('bedrooms')).toBe('5');
});

test('AirDNA fallback estimates remain subject-specific and successful results reuse cache', async () => {
  const subject = freshProperty();
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    return Response.json(String(input).includes('/rentalizer') ? {} : { adr: 100, occupancy: 0.5 });
  };
  const first = await getSTREstimate(subject);
  expect(await getSTREstimate(subject)).toEqual(first);
  const second = await getSTREstimate({ ...subject, bedrooms: 5 });
  expect(second?.cleaningCosts).not.toBe(first?.cleaningCosts);
  expect(calls).toBe(4);
});

const furnishedListings = Array.from({ length: 3 }, (_, index) => ({
  listingId: String(index), bedroomCount: 3, bathroomCount: 2, propertyType: 'house',
  rentAmount: { amount: String(2000 + index * 100), currency: 'USD' }, approxLocation: null,
}));
for (const failure of ['http', 'network', 'graphql', 'malformed', 'null-row', 'malformed-row'] as const) {
  test(`Furnished Finder ${failure} failure is not widened or cached as an empty market`, async () => {
    const subject = freshProperty();
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (failure === 'network') throw new Error('fixture network outage');
      if (failure === 'http') return new Response('', { status: 503 });
      if (failure === 'graphql') return Response.json({ errors: [{ message: 'fixture error' }] });
      if (failure === 'null-row') return Response.json({ data: { search: { results: [null] } } });
      if (failure === 'malformed-row') return Response.json({ data: { search: { results: [{}] } } });
      return Response.json({ data: {} });
    };
    expect(await getMtrMarketData(subject)).toBeNull();
    expect(calls).toBe(1);
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ data: { search: { results: furnishedListings } } });
    };
    expect((await getMtrMarketData(subject))?.monthlyRate).toBe(2100);
    await getMtrMarketData(subject);
    expect(calls).toBe(2);
  });
}

test('Furnished Finder valid empty searches widen once and cache the verified thin market', async () => {
  let calls = 0;
  const subject = freshProperty();
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { search: { results: [] } } });
  };
  expect(await getMtrMarketData(subject)).toBeNull();
  expect(await getMtrMarketData(subject)).toBeNull();
  expect(calls).toBe(2);
});

test('Furnished Finder failed wider search is not negative-cached', async () => {
  const subject = freshProperty();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 2 ? new Response('', { status: 429 }) : Response.json({ data: { search: { results: [] } } });
  };
  expect(await getMtrMarketData(subject)).toBeNull();
  expect(await getMtrMarketData(subject)).toBeNull();
  expect(calls).toBe(4);
});

test('Realty-in-US shares query observations but filters price, bedrooms and studios per subject', async () => {
  const subject = freshProperty();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { home_search: { results: [
      { list_price: 2000, description: { beds: 3 } },
      { list_price: 5000, description: { beds: 5 } },
      { list_price: 1000, description: { beds: 0 } },
    ] } } });
  };
  expect((await getRentalComps(subject)).map(comp => comp.rent)).toEqual([2000]);
  expect((await getRentalComps({ ...subject, bedrooms: 5 })).map(comp => comp.rent)).toEqual([5000]);
  expect((await getRentalComps({ ...subject, price: 100000, bedrooms: 5 })).map(comp => comp.rent)).toEqual([2000, 1000]);
  expect((await getRentalComps({ ...subject, bedrooms: 0 })).map(comp => comp.rent)).toEqual([1000]);
  expect(calls).toBe(1);
  await getRentalComps(subject, 40);
  expect(calls).toBe(2);
});

test('Realty-in-US malformed responses are not cached and both entitled fallbacks remain enabled', async () => {
  const subject = freshProperty();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({});
  };
  await getRentalComps(subject);
  await getRentalComps(subject);
  expect(calls).toBe(2);
  globalThis.fetch = async () => Response.json({ data: { home_search: { results: [{
    list_price: 200000, location: { address: {
      line: subject.address, city: subject.city, state_code: subject.state, postal_code: subject.zip,
      coordinate: { lat: 0, lon: -78 },
    } }, description: { beds: 3, baths: 2 },
  }] } } });
  expect(await getForSaleProperty(`${subject.address}, ${subject.city}, NC ${subject.zip}`)).toMatchObject({
    address: subject.address, latitude: 0, longitude: -78,
    coordinateSource: 'realtor', coordinatesObservedAt: expect.any(String),
  });
});
