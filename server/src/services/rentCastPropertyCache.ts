import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { RentalComp } from '@deal-platform/shared-types';
import { createPostgresProviderCacheStore, createSharedProviderCache } from './sharedProviderCache.js';

export const RENTCAST_PROPERTY_FRESH_MS = 24 * 60 * 60 * 1000;
export type RentEstimateProjection = { mid: number; low: number; high: number };
type Operation = 'rent-avm' | 'rental-listings';

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

export function isRentalCompProjection(value: unknown): value is RentalComp[] {
  const allowed = new Set(['address', 'rent', 'bedrooms', 'bathrooms', 'sqft', 'source']);
  return Array.isArray(value) && value.length <= 500 && value.every(comp => {
    if (!isObject(comp) || Object.keys(comp).some(key => !allowed.has(key))) return false;
    if (!positive(comp.rent) || comp.source !== 'api') return false;
    if (comp.address !== undefined && typeof comp.address !== 'string') return false;
    return ['bedrooms', 'bathrooms', 'sqft'].every(key =>
      comp[key] === undefined || (typeof comp[key] === 'number' && Number.isFinite(comp[key]) && comp[key] >= 0));
  });
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
    provider: 'rentcast', operation, key: query => rentCastPropertyCacheKey(operation, query),
    freshMs: RENTCAST_PROPERTY_FRESH_MS, validate: withinLimit, load,
  });
}
