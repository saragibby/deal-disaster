import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { AnalyzerProviderId, ProviderCachePolicy } from '@deal-platform/shared-types';
import { pool } from '../db/pool.js';
import { getProviderPolicy, getProviderStaleIfErrorMs } from './providerPolicyRegistry.js';

type CacheScope = 'global' | 'platform' | 'tenant' | 'owner';

interface ProviderCacheIdentity {
  providerId: AnalyzerProviderId;
  profile?: string;
  hotProfile?: string;
  key: unknown;
  sourcePlatform?: string;
  tenantId?: string;
  ownerUserId?: string;
  schemaVersion?: number;
}

export interface ProviderCacheReadOptions extends ProviderCacheIdentity {
  allowStaleIfError?: boolean;
}

export interface ProviderCacheWriteOptions<T> extends ProviderCacheIdentity {
  value: T;
}

export interface ProviderCacheHit<T> {
  hit: true;
  value: T;
  stale: boolean;
  fetchedAt: Date;
  expiresAt: Date | null;
}

export interface ProviderCacheMiss {
  hit: false;
}

export type ProviderCacheReadResult<T> = ProviderCacheHit<T> | ProviderCacheMiss;

const DEFAULT_SOURCE_PLATFORM = process.env.ANALYZER_CACHE_PLATFORM || 'asset-dashboard';
const DEFAULT_SCHEMA_VERSION = 1;
const DEFAULT_PROFILE = 'default';
const SENSITIVE_PAYLOAD_KEYS = new Set([
  'credential',
  'credentials',
  'apiKey',
  'api_key',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'userAnalysis',
  'analysisResults',
  'propertyAnalysisId',
]);

interface HotEntry {
  payload: unknown;
  fetchedAt: string;
  expiresAt: string | null;
  staleIfErrorExpiresAt: string | null;
}

const memoryHotCache = new Map<string, HotEntry>();

let redisClientPromise: Promise<unknown | null> | null = null;
let redisUnavailableLogged = false;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function resolveProfilePolicy(policy: ProviderCachePolicy, profile?: string) {
  if (!profile) return policy;
  const profilePolicy = policy.profiles?.[profile];
  if (!profilePolicy) {
    throw new Error(`Provider cache policy does not define freshness profile "${profile}".`);
  }

  return {
    ...policy,
    freshnessMs: profilePolicy.freshnessMs,
    staleIfErrorMs: profilePolicy.staleIfErrorMs ?? policy.staleIfErrorMs,
  };
}

function cacheScopeForPolicy(policy: ProviderCachePolicy): CacheScope {
  if (policy.sharing === 'disabled') return 'global';
  return policy.sharing;
}

function scopeKeyForPolicy(policy: ProviderCachePolicy, identity: ProviderCacheIdentity): string {
  const sourcePlatform = identity.sourcePlatform ?? DEFAULT_SOURCE_PLATFORM;

  switch (policy.sharing) {
    case 'global':
    case 'disabled':
      return 'global';
    case 'platform':
      return `platform:${sourcePlatform}`;
    case 'tenant':
      return `tenant:${identity.tenantId ?? sourcePlatform}`;
    case 'owner':
      return `owner:${identity.ownerUserId ?? identity.tenantId ?? sourcePlatform}`;
  }
}

function identityParts(identity: ProviderCacheIdentity) {
  const basePolicy = getProviderPolicy(identity.providerId);
  const cachePolicy = resolveProfilePolicy(basePolicy.cache, identity.profile);
  const hotCachePolicy = resolveProfilePolicy(basePolicy.cache, identity.hotProfile ?? identity.profile);
  const sourcePlatform = identity.sourcePlatform ?? DEFAULT_SOURCE_PLATFORM;
  const cacheProfile = identity.profile ?? DEFAULT_PROFILE;
  const schemaVersion = identity.schemaVersion ?? DEFAULT_SCHEMA_VERSION;
  const normalizedInput = stableStringify(identity.key);
  const normalizedKey = `${identity.providerId}:${cacheProfile}:${normalizedInput}`;
  const requestHash = sha256(normalizedInput);
  const scopeKey = scopeKeyForPolicy(cachePolicy, identity);

  return {
    basePolicy,
    cachePolicy,
    hotCachePolicy,
    sourcePlatform,
    cacheProfile,
    schemaVersion,
    normalizedKey,
    requestHash,
    cacheScope: cacheScopeForPolicy(cachePolicy),
    scopeKeyHash: sha256(scopeKey),
  };
}

function hotKey(identity: ProviderCacheIdentity): string {
  const parts = identityParts(identity);
  return [
    parts.basePolicy.id,
    parts.sourcePlatform,
    parts.basePolicy.credential.scope,
    parts.cacheScope,
    parts.scopeKeyHash,
    parts.cacheProfile,
    parts.normalizedKey,
    parts.requestHash,
    parts.schemaVersion,
  ].join('|');
}

function dateFromMsOffset(now: Date, ms: number | null): Date | null {
  if (ms == null) return null;
  return new Date(now.getTime() + ms);
}

function resolveHotTtlMs(freshnessMs: number | null, durableExpiresAt?: Date | null): number | null {
  const durableTtlMs = durableExpiresAt ? durableExpiresAt.getTime() - Date.now() : null;
  if (freshnessMs == null) return durableTtlMs;
  if (durableTtlMs == null) return freshnessMs;
  return Math.max(1, Math.min(freshnessMs, durableTtlMs));
}

function hasSensitiveTopLevelKey(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value as Record<string, unknown>).some((key) => SENSITIVE_PAYLOAD_KEYS.has(key));
}

function hotEntryIsUsable(entry: HotEntry, allowStaleIfError: boolean): { usable: boolean; stale: boolean } {
  const now = Date.now();
  const expiresAt = entry.expiresAt ? Date.parse(entry.expiresAt) : null;
  if (expiresAt == null || expiresAt > now) return { usable: true, stale: false };

  const staleUntil = entry.staleIfErrorExpiresAt ? Date.parse(entry.staleIfErrorExpiresAt) : null;
  if (allowStaleIfError && staleUntil != null && staleUntil > now) return { usable: true, stale: true };
  return { usable: false, stale: false };
}

async function getRedisClient(): Promise<any | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const require = createRequire(import.meta.url);
        const redis = require('redis') as { createClient?: (options: { url: string }) => any };
        if (!redis.createClient) throw new Error('redis module does not expose createClient');

        const client = redis.createClient({ url: redisUrl });
        client.on?.('error', (err: Error) => {
          console.warn('[provider-cache] Redis hot cache error:', err.message);
        });
        await client.connect();
        return client;
      } catch (err) {
        if (!redisUnavailableLogged) {
          console.warn('[provider-cache] Redis hot cache disabled:', (err as Error).message);
          redisUnavailableLogged = true;
        }
        return null;
      }
    })();
  }

  return redisClientPromise;
}

async function readHotEntry(key: string): Promise<HotEntry | null> {
  const memoryEntry = memoryHotCache.get(key);
  if (memoryEntry) return memoryEntry;

  const client = await getRedisClient();
  if (!client) return null;

  const raw = await client.get(`provider-cache:${key}`);
  if (!raw) return null;
  return JSON.parse(raw) as HotEntry;
}

async function writeHotEntry(key: string, entry: HotEntry, ttlMs: number | null): Promise<void> {
  memoryHotCache.set(key, entry);

  const client = await getRedisClient();
  if (!client) return;

  const redisKey = `provider-cache:${key}`;
  const serialized = JSON.stringify(entry);
  if (ttlMs == null) {
    await client.set(redisKey, serialized);
  } else {
    await client.set(redisKey, serialized, { PX: Math.max(1, ttlMs) });
  }
}

export async function readProviderCache<T>(
  options: ProviderCacheReadOptions,
): Promise<ProviderCacheReadResult<T>> {
  const parts = identityParts(options);

  if (parts.cachePolicy.sharing === 'disabled' && !parts.cachePolicy.inMemoryCacheAllowed) {
    return { hit: false };
  }

  if (parts.cachePolicy.inMemoryCacheAllowed) {
    const entry = await readHotEntry(hotKey(options));
    if (entry) {
      const usability = hotEntryIsUsable(entry, options.allowStaleIfError === true);
      if (usability.usable) {
        return {
          hit: true,
          value: entry.payload as T,
          stale: usability.stale,
          fetchedAt: new Date(entry.fetchedAt),
          expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
        };
      }
      memoryHotCache.delete(hotKey(options));
    }
  }

  if (!parts.cachePolicy.durableCacheAllowed || parts.cachePolicy.sharing === 'disabled') {
    return { hit: false };
  }

  const freshnessPredicate = options.allowStaleIfError
    ? `(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP OR stale_if_error_expires_at > CURRENT_TIMESTAMP)`
    : `(expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`;

  const { rows } = await pool.query<{
    payload: T;
    fetched_at: Date;
    expires_at: Date | null;
    stale_if_error_expires_at: Date | null;
  }>(
    `SELECT payload, fetched_at, expires_at, stale_if_error_expires_at
       FROM provider_cache_entries
      WHERE provider = $1
        AND source_platform = $2
        AND credential_scope = $3
        AND cache_scope = $4
        AND scope_key_hash = $5
        AND cache_profile = $6
        AND normalized_key = $7
        AND request_hash = $8
        AND schema_version = $9
        AND ${freshnessPredicate}
      ORDER BY fetched_at DESC
      LIMIT 1`,
    [
      options.providerId,
      parts.sourcePlatform,
      parts.basePolicy.credential.scope,
      parts.cacheScope,
      parts.scopeKeyHash,
      parts.cacheProfile,
      parts.normalizedKey,
      parts.requestHash,
      parts.schemaVersion,
    ],
  );

  const row = rows[0];
  if (!row) return { hit: false };

  const stale = row.expires_at != null && row.expires_at.getTime() <= Date.now();
  if (!stale && parts.cachePolicy.inMemoryCacheAllowed) {
    await writeHotEntry(
      hotKey(options),
      {
        payload: row.payload,
        fetchedAt: row.fetched_at.toISOString(),
        expiresAt: dateFromMsOffset(new Date(), resolveHotTtlMs(parts.hotCachePolicy.freshnessMs, row.expires_at))?.toISOString() ?? null,
        staleIfErrorExpiresAt: row.stale_if_error_expires_at?.toISOString() ?? null,
      },
      resolveHotTtlMs(parts.hotCachePolicy.freshnessMs, row.expires_at),
    );
  }

  return {
    hit: true,
    value: row.payload,
    stale,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  };
}

export async function writeProviderCache<T>(options: ProviderCacheWriteOptions<T>): Promise<void> {
  const parts = identityParts(options);
  const now = new Date();
  const expiresAt = dateFromMsOffset(now, parts.cachePolicy.freshnessMs);
  const hotExpiresAt = dateFromMsOffset(now, resolveHotTtlMs(parts.hotCachePolicy.freshnessMs, expiresAt));
  const staleIfErrorMs = getProviderStaleIfErrorMs(options.providerId, options.profile);
  const staleIfErrorExpiresAt = expiresAt && staleIfErrorMs != null
    ? new Date(expiresAt.getTime() + staleIfErrorMs)
    : null;

  if (hasSensitiveTopLevelKey(options.value)) {
    throw new Error(`Refusing to cache ${options.providerId} payload with sensitive top-level keys.`);
  }

  if (parts.cachePolicy.inMemoryCacheAllowed) {
    await writeHotEntry(
      hotKey(options),
      {
        payload: options.value,
        fetchedAt: now.toISOString(),
        expiresAt: hotExpiresAt?.toISOString() ?? null,
        staleIfErrorExpiresAt: staleIfErrorExpiresAt?.toISOString() ?? null,
      },
      hotExpiresAt ? hotExpiresAt.getTime() - now.getTime() : null,
    );
  }

  if (!parts.cachePolicy.durableCacheAllowed || parts.cachePolicy.sharing === 'disabled') {
    return;
  }

  await pool.query(
    `INSERT INTO provider_cache_entries (
       provider,
       cache_profile,
       normalized_key,
       request_hash,
       payload,
       fetched_at,
       expires_at,
       stale_if_error_expires_at,
       freshness_ms,
       stale_if_error_ms,
       schema_version,
       source_platform,
       credential_scope,
       cache_scope,
       scope_key_hash,
       cache_sharing,
       cross_product_reuse,
       durable_cache_allowed,
       terms_reuse_allowed
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (
       provider,
       source_platform,
       credential_scope,
       cache_scope,
       scope_key_hash,
       cache_profile,
       normalized_key,
       request_hash,
       schema_version
     )
     DO UPDATE SET
       payload = EXCLUDED.payload,
       fetched_at = EXCLUDED.fetched_at,
       expires_at = EXCLUDED.expires_at,
       stale_if_error_expires_at = EXCLUDED.stale_if_error_expires_at,
       freshness_ms = EXCLUDED.freshness_ms,
       stale_if_error_ms = EXCLUDED.stale_if_error_ms,
       cache_sharing = EXCLUDED.cache_sharing,
       cross_product_reuse = EXCLUDED.cross_product_reuse,
       durable_cache_allowed = EXCLUDED.durable_cache_allowed,
       terms_reuse_allowed = EXCLUDED.terms_reuse_allowed,
       updated_at = CURRENT_TIMESTAMP`,
    [
      options.providerId,
      parts.cacheProfile,
      parts.normalizedKey,
      parts.requestHash,
      JSON.stringify(options.value),
      now,
      expiresAt,
      staleIfErrorExpiresAt,
      parts.cachePolicy.freshnessMs,
      staleIfErrorMs,
      parts.schemaVersion,
      parts.sourcePlatform,
      parts.basePolicy.credential.scope,
      parts.cacheScope,
      parts.scopeKeyHash,
      parts.cachePolicy.sharing,
      parts.cachePolicy.crossProductReuse,
      parts.cachePolicy.durableCacheAllowed,
      parts.cachePolicy.crossProductReuse === 'allowed',
    ],
  );
}
