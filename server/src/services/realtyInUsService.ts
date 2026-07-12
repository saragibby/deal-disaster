/**
 * Realty-in-US Service (realtor.com data via RapidAPI)
 *
 * Provides REAL rental comps sourced from active for-rent listings on
 * realtor.com. This is our primary source of property-level rent comps
 * (we don't use RentCast).
 *
 * Endpoint: POST /properties/v3/list
 *   body: { limit, offset, postal_code, status: ['for_rent'], sort }
 *   result path: data.home_search.results[]
 *     - list_price              → monthly rent
 *     - location.address        → line / city / state_code / postal_code / coordinate
 *     - description.{beds,baths,sqft,type}
 *
 * Auth: shared RapidAPI key (RAPIDAPI_KEY) + per-API host header.
 */

import type { PropertyData, RentalComp } from '@deal-platform/shared-types';
import { filterPlausibleRentalComps } from './rentalEstimationService.js';
import { readProviderCredential } from './providerPolicyRegistry.js';
import { readProviderCache, writeProviderCache } from './providerCacheAdapter.js';

const RAPIDAPI_KEY = () => readProviderCredential('realty-in-us');
const HOST = 'realty-in-us.p.rapidapi.com';

function headers() {
  return {
    'content-type': 'application/json',
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': HOST,
  };
}

/** Check if the RapidAPI key is configured. */
export function isConfigured(): boolean {
  return RAPIDAPI_KEY().length > 0;
}

/**
 * Fetch real active for-rent listings as rental comps for the subject's ZIP.
 *
 * Results are softly filtered to within ±1 bedroom of the subject (when known)
 * to keep them comparable, falling back to all comps in thin markets.
 * Returns [] on any failure so callers fall back to the algorithmic estimator.
 */
export async function getRentalComps(
  property: PropertyData,
  limit: number = 20,
): Promise<RentalComp[]> {
  if (!isConfigured() || !property.zip) return [];

  const cacheKey = {
    endpoint: 'properties/v3/list',
    zip: property.zip,
    bedrooms: property.bedrooms || '',
  };
  const cached = await readProviderCache<RentalComp[]>({
    providerId: 'realty-in-us',
    key: cacheKey,
  });
  if (cached.hit) return cached.value;

  try {
    const body = {
      limit,
      offset: 0,
      postal_code: property.zip,
      status: ['for_rent'],
      sort: { direction: 'desc', field: 'list_date' },
    };

    const res = await fetch(`https://${HOST}/properties/v3/list`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[Realty-in-US] Rental comps failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as any;
    const results: any[] = data?.data?.home_search?.results || [];
    if (!Array.isArray(results)) return [];

    const comps: RentalComp[] = results
      .filter((r) => r?.list_price && r.list_price > 0)
      .map((r) => {
        const addr = r.location?.address || {};
        const desc = r.description || {};
        return {
          address: addr.line ? `${addr.line}, ${addr.city || ''}`.replace(/,\s*$/, '') : undefined,
          rent: Number(r.list_price),
          bedrooms: desc.beds != null ? Number(desc.beds) : undefined,
          bathrooms: desc.baths != null ? Number(desc.baths) : undefined,
          sqft: desc.sqft != null ? Number(desc.sqft) : undefined,
          source: 'api' as const,
        };
      });
    const plausibleComps = filterPlausibleRentalComps(comps, property);

    // Keep comps comparable: prefer those within ±1 bedroom of the subject,
    // but never filter down to zero in sparse markets.
    let relevant = plausibleComps;
    if (property.bedrooms) {
      const filtered = plausibleComps.filter(
        (c) => c.bedrooms == null || Math.abs((c.bedrooms || 0) - property.bedrooms) <= 1,
      );
      if (filtered.length >= 1) relevant = filtered;
    }

    await writeProviderCache({
      providerId: 'realty-in-us',
      key: cacheKey,
      value: relevant,
    });
    console.log(`[Realty-in-US] Found ${relevant.length} rental comps for ${property.zip}`);
    return relevant;
  } catch (err: any) {
    console.warn('[Realty-in-US] Rental comps error:', err.message);
    return [];
  }
}
