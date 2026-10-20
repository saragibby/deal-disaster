import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { RentalComp } from '@deal-platform/shared-types';
import { createPostgresProviderCacheStore, createSharedProviderCache } from './sharedProviderCache.js';

export const RENTCAST_PROPERTY_FRESH_MS = 24 * 60 * 60 * 1000;
export type RentEstimateProjection = { mid: number; low: number; high: number };
export type RentEstimateBundleProjection = { estimate: RentEstimateProjection; comps: RentalComp[] };
type Operation = 'rent-avm' | 'rental-listings' | 'rent-avm-bundle';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isRentEstimateProjection(value: unknown): value is RentEstimateProjection {
  return isObject(value) && Object.keys(value).length === 3 &&
    positive(value.mid) && positive(value.low) && positive(value.high);
}

const LISTING_COMP_KEYS = ['address', 'rent', 'bedrooms', 'bathrooms', 'sqft', 'source'];
const BUNDLE_COMP_KEYS = [
  ...LISTING_COMP_KEYS, 'distance', 'status', 'daysOld', 'correlation', 'latitude', 'longitude',
];

function isNonnegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCompArray(value: unknown, keys: string[]): value is RentalComp[] {
  const allowed = new Set(keys);
  return Array.isArray(value) && value.length <= 500 && value.every(comp => {
    if (!isObject(comp) || Object.keys(comp).some(key => !allowed.has(key))) return false;
    if (!positive(comp.rent) || comp.source !== 'api') return false;
    if (comp.address !== undefined && typeof comp.address !== 'string') return false;
    if (comp.status !== undefined && comp.status !== 'active' && comp.status !== 'inactive') return false;
    if (['latitude', 'longitude'].some(key => comp[key] !== undefined &&
      !(typeof comp[key] === 'number' && Number.isFinite(comp[key])))) return false;
    return ['bedrooms', 'bathrooms', 'sqft', 'distance', 'daysOld', 'correlation'].every(key =>
      comp[key] === undefined || isNonnegative(comp[key]));
  });
}

export function isRentalCompProjection(value: unknown): value is RentalComp[] {
  return isCompArray(value, LISTING_COMP_KEYS);
}

export function isRentEstimateBundleProjection(value: unknown): value is RentEstimateBundleProjection {
  return isObject(value) && Object.keys(value).length === 2 &&
    isRentEstimateProjection(value.estimate) && isCompArray(value.comps, BUNDLE_COMP_KEYS);
}

export function rentCastPropertyCacheKey(operation: Operation, query: string): string {
  const params = new URLSearchParams(query);
  params.sort();
  const hash = createHash('sha256').update(params.toString()).digest('hex');
  return `rentcast:${operation}:projection-v1:policy-2026-10-17-24h:${hash}`;
}

export function createRentCastPropertyCache<T>(
  db: Pick<Pool, 'query'>, operation: Operation,
  validate: (value: unknown) => value is T, load: (query: string) => Promise<T | null>,
) {
  const withinLimit = (value: unknown): value is T =>
    validate(value) && Buffer.byteLength(JSON.stringify(value)) <= 256 * 1024;
  return createSharedProviderCache({
    store: createPostgresProviderCacheStore(db, {
      table: 'provider_data_cache', validate: withinLimit,
      freshMs: RENTCAST_PROPERTY_FRESH_MS, maxPayloadBytes: 256 * 1024,
    }),
    enabled: () => process.env.RENTCAST_SHARED_PROPERTY_CACHE_ENABLED === 'true',
    // The bundle is the same billable /avm/rent/long-term endpoint, so it shares the accounting label.
    provider: 'rentcast', operation: operation === 'rent-avm-bundle' ? 'rent-avm' : operation, key: query => rentCastPropertyCacheKey(operation, query),
    freshMs: RENTCAST_PROPERTY_FRESH_MS, validate: withinLimit, load,
  });
}
