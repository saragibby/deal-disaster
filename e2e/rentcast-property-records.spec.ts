import { test, expect } from '@playwright/test';
import type { PropertyData } from '@deal-platform/shared-types';
import { getPropertyRecords, PropertyRecordsUnavailableError } from '../server/src/services/rentCastService';

const property = (address: string): PropertyData => ({
  zpid: 'fixture', address, city: 'Example City', state: 'MI', zip: '48000',
  price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 1990,
});

test.describe('RentCast property record mapping', () => {
  const originalFetch = globalThis.fetch;
  let originalKey: string | undefined;

  test.beforeEach(() => {
    originalKey = process.env.RENTCAST_API_KEY;
    process.env.RENTCAST_API_KEY = 'fixture-key-not-a-real-credential';
  });

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey == null) delete process.env.RENTCAST_API_KEY;
    else process.env.RENTCAST_API_KEY = originalKey;
  });

  test('maps owners, sorts sales, preserves missing prices, and caches retrieval time', async () => {
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls++;
      expect(String(input)).toContain('/properties?address=');
      return Response.json([{
        owner: { names: ['Fixture LLC'], type: 'Organization', mailingAddress: {
          addressLine1: '10 Example St', city: 'Example City', state: 'MI', zipCode: '48000',
        } },
        ownerOccupied: false,
        history: {
          '2020-01-01': { event: 'Sale', price: 0 },
          '2025-01-01': { date: '2025-01-01T00:00:00.000Z', price: 180000 },
          '2022-01-01': { event: 'Sale' },
        },
        lastSaleDate: '2025-01-01', lastSalePrice: 180000,
      }]);
    };
    const subject = property('100 Mapping Fixture St');
    const result = await getPropertyRecords(subject);
    expect(result.ownerNames).toEqual(['Fixture LLC']);
    expect(result.mailingAddress).toBe('10 Example St, Example City, MI, 48000');
    expect(result.ownerOccupied).toBe(false);
    expect(result.sales).toEqual([
      { date: '2025-01-01T00:00:00.000Z', price: 180000, event: 'Sale' },
      { date: '2022-01-01', price: null, event: 'Sale' },
      { date: '2020-01-01', price: null, event: 'Sale' },
    ]);
    expect(result.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await getPropertyRecords(subject)).toEqual(result);
    expect(calls).toBe(1);
  });

  test('uses last sale fields when history is unavailable', async () => {
    globalThis.fetch = async () => Response.json([{ lastSaleDate: '2025-03-01', lastSalePrice: 123000 }]);
    const result = await getPropertyRecords(property('200 Last Sale Fixture St'));
    expect(result.sales).toEqual([{ date: '2025-03-01', price: 123000, event: 'Sale' }]);
    expect(result.ownerNames).toEqual([]);
    expect(result.ownerOccupied).toBeNull();
  });

  test('refresh bypasses the memory cache and retains successful cache data after failure', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 3) return new Response('', { status: 500 });
      return Response.json([{ owner: { names: [calls === 1 ? 'Original Fixture LLC' : 'Updated Fixture LLC'] } }]);
    };
    const subject = property('900 Refresh Fixture St');
    const original = await getPropertyRecords(subject);
    expect(await getPropertyRecords(subject)).toEqual(original);
    const refreshed = await getPropertyRecords(subject, { refresh: true });
    expect(refreshed.ownerNames).toEqual(['Updated Fixture LLC']);
    await expect(getPropertyRecords(subject, { refresh: true })).rejects.toThrow('temporarily unavailable');
    expect(await getPropertyRecords(subject)).toEqual(refreshed);
    expect(calls).toBe(3);
  });

  test('distinguishes no record from provider and configuration failures', async () => {
    globalThis.fetch = async () => Response.json([]);
    const result = await getPropertyRecords(property('300 Empty Fixture St'));
    expect(result.found).toBe(false);
    expect(result.sales).toEqual([]);

    globalThis.fetch = async () => new Response('', { status: 429 });
    await expect(getPropertyRecords(property('400 Error Fixture St'))).rejects.toBeInstanceOf(PropertyRecordsUnavailableError);
    delete process.env.RENTCAST_API_KEY;
    await expect(getPropertyRecords(property('500 Configuration Fixture St'))).rejects.toThrow('not configured');
  });

  test('rejects malformed provider responses rather than showing empty success', async () => {
    globalThis.fetch = async () => Response.json({ error: 'unexpected response' });
    await expect(getPropertyRecords(property('600 Malformed Fixture St'))).rejects.toThrow('Invalid property records response');
    globalThis.fetch = async () => Response.json([{ owner: { names: 'not an array' } }]);
    await expect(getPropertyRecords(property('700 Malformed Owner Fixture St'))).rejects.toThrow('Invalid property records response');
  });

  test('treats documented provider 404 responses as no matching records', async () => {
    globalThis.fetch = async () => Response.json({ error: 'resource/not-found' }, { status: 404 });
    const result = await getPropertyRecords(property('800 No Match Fixture St'));
    expect(result.found).toBe(false);
    expect(result.ownerNames).toEqual([]);
    expect(result.sales).toEqual([]);
  });

  for (const [status, message] of [
    [400, 'Check the saved property address'],
    [401, 'verify the server API key'],
    [403, 'restrictions, the active subscription, and billing'],
    [429, 'rate limit reached'],
    [500, 'temporarily unavailable'],
  ] as const) {
    test(`reports actionable provider error for ${status}`, async () => {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        return new Response('', { status });
      };
      const subject = property(`${status} Provider Error Fixture St`);
      await expect(getPropertyRecords(subject)).rejects.toThrow(message);
      await expect(getPropertyRecords(subject)).rejects.toThrow(`(${status})`);
      expect(calls).toBe(2);
    });
  }
});
