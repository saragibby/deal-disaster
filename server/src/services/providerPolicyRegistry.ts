import type {
  AnalyzerProviderId,
  AnalyzerProviderPolicy,
  ProviderCredentialReference,
} from '@deal-platform/shared-types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function envCredential(
  credentialId: string,
  envVar: string,
  scope: ProviderCredentialReference['scope'] = 'platform',
): ProviderCredentialReference {
  return { kind: 'env', credentialId, envVar, scope };
}

const noCredentials = {
  scope: 'none',
  references: [],
} as const;

export const PROVIDER_POLICY_REGISTRY = {
  'private-zillow': {
    id: 'private-zillow',
    displayName: 'Private Zillow via RapidAPI',
    category: 'property-data',
    credential: {
      scope: 'platform',
      references: [envCredential('rapidapi-platform-key', 'RAPIDAPI_KEY')],
    },
    cache: {
      sharing: 'global',
      freshnessMs: DAY_MS,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'allowed',
      cacheKeyIncludes: ['provider', 'input'],
      profiles: {
        property: { freshnessMs: DAY_MS, notes: 'Property detail lookups.' },
        similarProperties: { freshnessMs: DAY_MS, notes: 'Comparable sale/property lookups.' },
        areaMarket: { freshnessMs: 7 * DAY_MS, notes: 'PostgreSQL area-market snapshots.' },
        areaMarketHot: { freshnessMs: HOUR_MS, notes: 'In-memory area-market hot cache.' },
      },
      notes: 'Current behavior shares Zillow-derived property and market data across users.',
    },
  },
  rentcast: {
    id: 'rentcast',
    displayName: 'RentCast',
    category: 'rental-comps',
    credential: {
      scope: 'platform',
      references: [envCredential('rentcast-platform-key', 'RENTCAST_API_KEY')],
    },
    cache: {
      sharing: 'platform',
      freshnessMs: DAY_MS,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'forbidden',
      cacheKeyIncludes: ['provider', 'platform', 'credential-scope', 'input'],
      profiles: {
        rentEstimate: { freshnessMs: DAY_MS },
        rentalComps: { freshnessMs: DAY_MS },
        marketStatistics: { freshnessMs: 7 * DAY_MS },
      },
      notes: 'RentCast data should not be reused by unrelated products unless a tenant policy explicitly allows it.',
    },
  },
  'realty-in-us': {
    id: 'realty-in-us',
    displayName: 'Realty in US via RapidAPI',
    category: 'rental-comps',
    credential: {
      scope: 'platform',
      references: [envCredential('rapidapi-platform-key', 'RAPIDAPI_KEY')],
    },
    cache: {
      sharing: 'platform',
      freshnessMs: DAY_MS,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'forbidden',
      cacheKeyIncludes: ['provider', 'platform', 'credential-scope', 'input'],
      notes: 'Active rental listings are product-scoped and time-sensitive.',
    },
  },
  airdna: {
    id: 'airdna',
    displayName: 'AirDNA via RapidAPI',
    category: 'str-market',
    credential: {
      scope: 'platform',
      references: [envCredential('rapidapi-platform-key', 'RAPIDAPI_KEY')],
    },
    cache: {
      sharing: 'platform',
      freshnessMs: DAY_MS,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'forbidden',
      cacheKeyIncludes: ['provider', 'platform', 'credential-scope', 'input'],
      notes: 'STR performance data is explicitly product-scoped for future durable caches.',
    },
  },
  'furnished-finder': {
    id: 'furnished-finder',
    displayName: 'Furnished Finder public GraphQL',
    category: 'mtr-market',
    credential: noCredentials,
    cache: {
      sharing: 'disabled',
      freshnessMs: DAY_MS,
      durableCacheAllowed: false,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'forbidden',
      cacheKeyIncludes: ['provider', 'input'],
      notes: 'Undocumented marketplace endpoint; keep cache local to the running analyzer process.',
    },
  },
  'google-geocoding': {
    id: 'google-geocoding',
    displayName: 'Google Geocoding',
    category: 'geocoding',
    credential: {
      scope: 'platform',
      references: [envCredential('google-maps-platform-key', 'GOOGLE_GEOCODING_API_KEY')],
    },
    cache: {
      sharing: 'global',
      freshnessMs: null,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: false,
      crossProductReuse: 'allowed',
      cacheKeyIncludes: ['provider', 'input'],
      notes: 'Address coordinate results are treated as stable and safe to reuse.',
    },
  },
  'google-places': {
    id: 'google-places',
    displayName: 'Google Places',
    category: 'proximity',
    credential: {
      scope: 'platform',
      references: [envCredential('google-maps-platform-key', 'GOOGLE_GEOCODING_API_KEY')],
    },
    cache: {
      sharing: 'platform',
      freshnessMs: 7 * DAY_MS,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: true,
      crossProductReuse: 'forbidden',
      cacheKeyIncludes: ['provider', 'platform', 'credential-scope', 'input'],
      notes: 'Nearby demand-driver searches are product-scoped.',
    },
  },
  'us-census-geocoding': {
    id: 'us-census-geocoding',
    displayName: 'US Census Geocoder',
    category: 'geocoding',
    credential: noCredentials,
    cache: {
      sharing: 'global',
      freshnessMs: null,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: false,
      crossProductReuse: 'allowed',
      cacheKeyIncludes: ['provider', 'input'],
    },
  },
  'nominatim-geocoding': {
    id: 'nominatim-geocoding',
    displayName: 'OpenStreetMap Nominatim',
    category: 'geocoding',
    credential: noCredentials,
    cache: {
      sharing: 'global',
      freshnessMs: null,
      durableCacheAllowed: true,
      inMemoryCacheAllowed: false,
      crossProductReuse: 'allowed',
      cacheKeyIncludes: ['provider', 'input'],
      notes: 'Callers must continue to respect the provider rate limit.',
    },
  },
} as const satisfies Record<AnalyzerProviderId, AnalyzerProviderPolicy>;

export function getProviderPolicy(providerId: AnalyzerProviderId): AnalyzerProviderPolicy {
  return PROVIDER_POLICY_REGISTRY[providerId];
}

export function getProviderFreshnessMs(providerId: AnalyzerProviderId, profile?: string): number | null {
  const policy = getProviderPolicy(providerId).cache;
  if (profile) {
    const profilePolicy = policy.profiles?.[profile];
    if (!profilePolicy) {
      throw new Error(`Provider policy ${providerId} does not define freshness profile "${profile}".`);
    }
    return profilePolicy.freshnessMs;
  }
  return policy.freshnessMs;
}

export function getProviderCredentialEnvVars(providerId: AnalyzerProviderId): string[] {
  return getProviderPolicy(providerId).credential.references.map((reference) => reference.envVar);
}

export function readProviderCredential(providerId: AnalyzerProviderId): string {
  const [envVar] = getProviderCredentialEnvVars(providerId);
  return envVar ? process.env[envVar] || '' : '';
}
