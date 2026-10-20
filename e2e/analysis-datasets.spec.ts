import { test, expect } from '@playwright/test';
import type { PropertyData } from '@deal-platform/shared-types';
import {
  applyRentalMarketFallback, marketDatasetStatuses, needsZillowRentalMarket, rentalMarketFromRentCast,
} from '../server/src/services/analysisDatasetService';

const property: PropertyData = {
  zpid: '1', address: '1 Fixture St', city: 'Example', state: 'TX', zip: '75070',
  price: 300000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
};

test('RentCast fallback is a labeled ZIP summary without fabricated Zillow-only fields', () => {
  expect(rentalMarketFromRentCast({ medianRent: 2100.4, rentGrowthPct: 5, totalListings: 42 }, ' 75070 ')).toEqual({
    areaName: 'ZIP 75070', medianRent: 2100, monthlyChange: 0, yearlyChange: 100,
    availableRentals: 42, marketTemperature: 'UNKNOWN', source: 'rentcast', yearlyChangePct: 5,
  });
  const noGrowth = rentalMarketFromRentCast({ medianRent: 1800 }, '75070');
  expect(noGrowth).toMatchObject({ yearlyChange: 0, availableRentals: 0, source: 'rentcast' });
  expect(noGrowth).not.toHaveProperty('yearlyChangePct');
  for (const stats of [null, undefined, {}, { medianRent: 0 }, { medianRent: Number.NaN }]) {
    expect(rentalMarketFromRentCast(stats, '75070')).toBeUndefined();
  }
});

test('fallback never replaces Zillow data and a RentCast summary still counts as missing Zillow data', () => {
  const zillow = { ...property, rentalMarketTrends: {
    areaName: 'Example', medianRent: 1900, monthlyChange: 5, yearlyChange: 50,
    availableRentals: 10, marketTemperature: 'WARM',
  } };
  applyRentalMarketFallback(zillow, { medianRent: 2500 });
  expect(zillow.rentalMarketTrends.medianRent).toBe(1900);
  expect(needsZillowRentalMarket(zillow)).toBe(false);

  const missing: PropertyData = { ...property };
  applyRentalMarketFallback(missing, { medianRent: 2500 });
  expect(missing.rentalMarketTrends?.source).toBe('rentcast');
  expect(needsZillowRentalMarket(missing)).toBe(true);
});

test('market statuses report missing data only when a lookup was possible', () => {
  expect(marketDatasetStatuses({ ...property })).toEqual({ housingMarket: 'unavailable', rentalMarket: 'unavailable' });
  expect(marketDatasetStatuses({ ...property, city: '' })).toEqual({
    housingMarket: 'not-applicable', rentalMarket: 'not-applicable',
  });
});
