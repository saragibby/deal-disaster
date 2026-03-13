/**
 * Property Data Service
 *
 * Reusable service for fetching and normalizing property data from the
 * private-zillow RapidAPI provider.
 *
 * Available endpoints on private-zillow.p.rapidapi.com:
 *   GET /byzpid?zpid=<zpid>
 *   GET /byaddress?propertyaddress=<full address string>
 *   GET /similar?byzpid=<zpid>   — returns ~20 similar properties
 *   GET /nearby?byzpid=<zpid>    — returns ~8 nearby properties
 *   GET /pricehistory?byzpid=<zpid> — returns price history events
 *   GET /taxinfo?byzpid=<zpid>      — returns tax assessment history
 *   GET /rental_market?search_query=<city+state> — returns rental market trends
 *   GET /housing_market?search_query=<city+state> — returns housing market overview + ZHVI
 *
 * This provider does NOT have a rental-comps endpoint, so getRentalComps
 * always returns [] and callers should rely on the algorithmic estimator
 * or derive comps from the /similar endpoint.
 */

import type { PropertyData, PropertySummary, RentalComp, ComparableProperty, RentalMarketTrends, HousingMarket } from '@deal-platform/shared-types';

// ---------- configuration ----------

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = () => process.env.RAPIDAPI_HOST || 'private-zillow.p.rapidapi.com';

function rapidHeaders() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': RAPIDAPI_HOST(),
  };
}

// ---------- simple in-memory cache ----------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — property data rarely changes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------- public API ----------

/**
 * Extract the Zillow ZPID from a variety of Zillow URL formats.
 *
 * Supports:
 *   https://www.zillow.com/homedetails/123-Main-St/12345678_zpid/
 *   https://www.zillow.com/homes/12345678_zpid/
 *   Plain numeric ZPID string
 */
export function parseZillowUrl(url: string): string {
  // Already a plain zpid number?
  if (/^\d+$/.test(url.trim())) return url.trim();

  const match = url.match(/(\d+)_zpid/);
  if (match) return match[1];

  throw new Error('Could not extract ZPID from the provided Zillow URL. Make sure the URL contains a valid property ID.');
}

/**
 * Fetch full property details by ZPID.
 * Uses: GET /byzpid?zpid=<zpid>
 */
export async function getPropertyByZpid(zpid: string): Promise<PropertyData> {
  const cacheKey = `property:${zpid}`;
  const cached = getCached<PropertyData>(cacheKey);
  if (cached) return cached;

  const host = RAPIDAPI_HOST();
  const url = `https://${host}/byzpid?zpid=${zpid}`;
  const res = await fetch(url, { headers: rapidHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Property lookup failed (${res.status}): ${body}`);
  }

  const raw = await res.json() as any;

  // Check for API-level success
  if (raw.message && !raw.message.includes('200')) {
    throw new Error(`Property lookup failed: ${raw.message}`);
  }

  const property = normalizePropertyData(raw, zpid);

  // Verify we got meaningful data back
  if (!property.address && !property.price) {
    throw new Error('Property not found. Please check the Zillow URL and try again.');
  }

  // Enrich with price history from dedicated endpoint (if not already present)
  if (!property.priceHistory) {
    property.priceHistory = await fetchPriceHistory(zpid);
  }

  // Enrich with rental market trends (non-blocking)
  if (!property.rentalMarketTrends && property.city && property.state) {
    property.rentalMarketTrends = await fetchRentalMarketTrends(property.city, property.state);
  }

  // Enrich with housing market data (non-blocking)
  if (!property.housingMarket && property.city && property.state) {
    property.housingMarket = await fetchHousingMarket(property.city, property.state);
  }

  setCache(cacheKey, property);
  return property;
}

/**
 * Fetch price history for a property via the dedicated /pricehistory endpoint.
 * Uses: GET /pricehistory?byzpid=<zpid>
 *
 * Returns null if the endpoint fails or no data is available (non-blocking).
 */
async function fetchPriceHistory(zpid: string): Promise<Array<{ date: string; price: number; event: string }> | undefined> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/pricehistory?byzpid=${encodeURIComponent(zpid)}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) return undefined;

    const data = await res.json() as any;
    const hist = data.priceHistory;

    if (!Array.isArray(hist) || hist.length === 0) return undefined;

    const parsed = hist
      .filter((h: any) => h.price != null && h.price > 0)
      .map((h: any) => ({
        date: String(h.date || ''),
        price: Number(h.price),
        event: String(h.event || 'Unknown'),
      }))
      .filter((h: { date: string; price: number }) => h.date && h.price > 0);

    if (parsed.length === 0) return undefined;

    // Remove outliers: entries with prices below 10% of the median are likely
    // administrative/non-sale events (tax entries, placeholder prices, etc.)
    const prices = parsed.map((h: { price: number }) => h.price).sort((a: number, b: number) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const threshold = median * 0.1;
    const filtered = parsed.filter((h: { price: number }) => h.price >= threshold);

    return filtered.length > 0 ? filtered : undefined;
  } catch (err) {
    console.warn(`[propertyDataService] Failed to fetch price history for zpid ${zpid}:`, (err as Error).message);
    return undefined;
  }
}

/**
 * Fetch rental market trends for the property's city/state.
 * Uses: GET /rental_market?search_query=<city+state>
 *
 * Returns undefined if the endpoint fails or no data is available (non-blocking).
 */
async function fetchRentalMarketTrends(city: string, state: string): Promise<RentalMarketTrends | undefined> {
  const searchQuery = `${city} ${state}`;
  const cacheKey = `rental_market:${searchQuery}`;
  const cached = getCached<RentalMarketTrends>(cacheKey);
  if (cached) return cached;

  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/rental_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) return undefined;

    const data = await res.json() as any;
    const trends = data.rental_market_trends;

    if (!trends?.summary) return undefined;

    const result: RentalMarketTrends = {
      areaName: trends.areaName || searchQuery,
      medianRent: Number(trends.summary.medianRent) || 0,
      monthlyChange: Number(trends.summary.monthlyChange) || 0,
      yearlyChange: Number(trends.summary.yearlyChange) || 0,
      availableRentals: Number(trends.summary.availableRentals) || 0,
      marketTemperature: trends.marketTemperature?.temperature || 'UNKNOWN',
      rentHistogram: Array.isArray(trends.rentHistogram?.priceAndCount)
        ? trends.rentHistogram.priceAndCount
            .filter((h: any) => h.price > 0 && h.count > 0)
            .map((h: any) => ({ price: Number(h.price), count: Number(h.count) }))
        : undefined,
      medianRentOverTime: trends.medianRentPriceOverTime ? {
        currentYear: (trends.medianRentPriceOverTime.currentYear || []).map((m: any) => ({
          month: String(m.month), year: String(m.year), price: Number(m.price) || 0,
        })),
        prevYear: (trends.medianRentPriceOverTime.prevYear || []).map((m: any) => ({
          month: String(m.month), year: String(m.year), price: Number(m.price) || 0,
        })),
      } : undefined,
      nationalMedianRent: trends.rentCompare?.medianRent ? Number(trends.rentCompare.medianRent) : undefined,
    };

    if (result.medianRent > 0) {
      setCache(cacheKey, result);
      return result;
    }
    return undefined;
  } catch (err) {
    console.warn(`[propertyDataService] Failed to fetch rental market trends for ${searchQuery}:`, (err as Error).message);
    return undefined;
  }
}

/**
 * Fetch housing market overview + ZHVI time series for a city.
 * Uses: GET /housing_market?search_query=<city+state>
 */
async function fetchHousingMarket(city: string, state: string): Promise<HousingMarket | undefined> {
  const searchQuery = `${city} ${state}`;
  const cacheKey = `housing_market:${searchQuery}`;
  const cached = getCached<HousingMarket>(cacheKey);
  if (cached) return cached;

  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/housing_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) return undefined;

    const data = await res.json() as any;
    const overview = data.market_overview;
    const analytics = data.market_analytics;

    if (!overview) return undefined;

    const zhviTimeSeries: Array<{ date: string; value: number }> = [];
    if (Array.isArray(analytics?.zhviRange)) {
      for (const entry of analytics.zhviRange) {
        if (entry.timePeriodEnd && entry.dataValue > 0) {
          zhviTimeSeries.push({
            date: entry.timePeriodEnd,
            value: Math.round(entry.dataValue),
          });
        }
      }
      // API returns newest-first; reverse to chronological
      zhviTimeSeries.reverse();
    }

    const result: HousingMarket = {
      areaName: data.search_query || searchQuery,
      typicalHomeValue: Number(overview.typical_home_values) || 0,
      medianSalePrice: Number(overview.median_sale_price) || 0,
      medianListPrice: Number(overview.median_list_price) || 0,
      saleToListRatio: Number(overview.market_saletolist_ratio) || 0,
      pctSoldAboveList: Number(overview.percent_ofsales_over_list_price) || 0,
      pctSoldBelowList: Number(overview.percent_ofsales_under_list_price) || 0,
      medianDaysToPending: Number(overview.median_days_to_pending) || 0,
      forSaleInventory: Number(overview.for_sale_inventory) || 0,
      newListings: Number(overview.new_listings) || 0,
      zhviTimeSeries,
    };

    if (result.typicalHomeValue > 0) {
      setCache(cacheKey, result);
      return result;
    }
    return undefined;
  } catch (err) {
    console.warn(`[propertyDataService] Failed to fetch housing market for ${searchQuery}:`, (err as Error).message);
    return undefined;
  }
}

/**
 * Fetch property details by address.
 * Uses: GET /byaddress?propertyaddress=<full address>
 */
export async function getPropertyByAddress(
  address: string,
  cityStateZip?: string,
): Promise<PropertyData> {
  const host = RAPIDAPI_HOST();
  const fullAddress = cityStateZip ? `${address} ${cityStateZip}` : address;
  const url = `https://${host}/byaddress?propertyaddress=${encodeURIComponent(fullAddress)}`;

  const res = await fetch(url, { headers: rapidHeaders() });
  if (!res.ok) {
    throw new Error(`Address search failed (${res.status})`);
  }

  const raw = await res.json() as any;

  if (raw.message && !raw.message.includes('200')) {
    throw new Error(`Address search failed: ${raw.message}`);
  }

  const zpid = raw.PropertyZPID ? String(raw.PropertyZPID) : '';
  const property = normalizePropertyData(raw, zpid);

  if (!property.address && !property.price) {
    throw new Error('No properties found for the provided address.');
  }

  // Enrich with price history from dedicated endpoint
  if (!property.priceHistory && zpid) {
    property.priceHistory = await fetchPriceHistory(zpid);
  }

  // Enrich with rental market trends (non-blocking)
  if (!property.rentalMarketTrends && property.city && property.state) {
    property.rentalMarketTrends = await fetchRentalMarketTrends(property.city, property.state);
  }

  // Enrich with housing market data (non-blocking)
  if (!property.housingMarket && property.city && property.state) {
    property.housingMarket = await fetchHousingMarket(property.city, property.state);
  }

  return property;
}

/**
 * Lightweight property search returning summaries (for autocomplete / browse).
 * Uses the /byaddress endpoint since that's what this provider supports.
 */
export async function searchProperties(query: string): Promise<PropertySummary[]> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/byaddress?propertyaddress=${encodeURIComponent(query)}`;

    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) return [];

    const raw = await res.json() as any;
    if (!raw.PropertyAddress) return [];

    // This API returns a single result, so wrap it in an array
    return [{
      zpid: String(raw.PropertyZPID || ''),
      address: raw.PropertyAddress?.streetAddress || '',
      city: raw.PropertyAddress?.city || '',
      state: raw.PropertyAddress?.state || '',
      zip: String(raw.PropertyAddress?.zipcode || ''),
      price: Number(raw.Price || raw.zestimate) || 0,
      bedrooms: Number(raw.Bedrooms) || 0,
      bathrooms: Number(raw.Bathrooms) || 0,
      sqft: Number(raw['Area(sqft)']) || 0,
      photo: undefined,
    }];
  } catch {
    return [];
  }
}

/**
 * Fetch API-sourced rental comps for a given ZPID.
 *
 * The private-zillow provider does NOT have a rental comps endpoint.
 * Always returns [] — callers should fall back to the algorithmic estimator.
 */
export async function getRentalComps(_zpid: string): Promise<RentalComp[]> {
  // No rental comps endpoint on private-zillow.p.rapidapi.com
  return [];
}

/**
 * Fetch similar properties for a given ZPID.
 * Uses: GET /similar?byzpid=<zpid>
 *
 * Returns up to ~20 similar properties with price, beds, baths, sqft, etc.
 * Results are cached for 30 minutes to minimise API calls.
 */
export async function getSimilarProperties(zpid: string): Promise<ComparableProperty[]> {
  const cacheKey = `similar:${zpid}`;
  const cached = getCached<ComparableProperty[]>(cacheKey);
  if (cached) return cached;

  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/similar?byzpid=${zpid}`;
    const res = await fetch(url, { headers: rapidHeaders() });

    if (!res.ok) {
      console.warn(`[similar] HTTP ${res.status} for zpid ${zpid}`);
      return [];
    }

    const raw = await res.json() as any;

    // Response shape: { similar_properties: { propertyDetails: [...] } }
    const details: any[] =
      raw?.similar_properties?.propertyDetails ||
      raw?.similarProperties?.propertyDetails ||
      [];

    if (!Array.isArray(details) || details.length === 0) return [];

    const comps: ComparableProperty[] = details
      .filter((d: any) => d.price && d.livingArea)
      .map((d: any) => {
        const addr = d.address || {};
        const price = Number(d.price) || 0;
        const sqft = Number(d.livingArea) || 0;

        const compZpid = String(d.zpid || '');
        return {
          zpid: compZpid,
          address: addr.streetAddress || '',
          city: addr.city || '',
          state: addr.state || '',
          zip: String(addr.zipcode || ''),
          price,
          bedrooms: Number(d.bedrooms) || 0,
          bathrooms: Number(d.bathrooms) || 0,
          sqft,
          lotSize: d.lotSize ? Number(d.lotSize) : undefined,
          homeStatus: d.homeStatus || undefined,
          homeType: d.homeType || undefined,
          photo: d.miniCardPhotos?.[0]?.url || d.imgSrc || undefined,
          estimatedRent: 0,   // will be enriched by the route
          pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
          rentPerSqft: 0,     // will be enriched by the route
          zillowUrl: compZpid ? `https://www.zillow.com/homedetails/${compZpid}_zpid/` : undefined,
        };
      });

    setCache(cacheKey, comps);
    return comps;
  } catch (err: any) {
    console.warn('[similar] Failed to fetch similar properties:', err.message);
    return [];
  }
}

// ---------- normalizer ----------

/**
 * Normalize tax history from varying API response shapes.
 */
function normalizeTaxHistory(raw: any): Array<{ year: number; amount: number }> | undefined {
  const hist = raw.taxHistory || raw.tax_history || raw.TaxHistory;
  if (!Array.isArray(hist) || hist.length === 0) return undefined;
  const parsed = hist
    .map((h: any) => ({ year: Number(h.year || h.time), amount: Number(h.amount || h.value || h.taxPaid) || 0 }))
    .filter((h: { year: number }) => h.year > 0);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Normalize price history from varying API response shapes.
 */
function normalizePriceHistory(raw: any): Array<{ date: string; price: number; event: string }> | undefined {
  const hist = raw.priceHistory || raw.price_history || raw.PriceHistory;
  if (!Array.isArray(hist) || hist.length === 0) return undefined;
  const parsed = hist
    .map((h: any) => ({
      date: String(h.date || h.time || ''),
      price: Number(h.price || h.amount || h.value) || 0,
      event: String(h.event || h.type || h.priceChangeRate || 'Unknown'),
    }))
    .filter((h: { date: string; price: number }) => h.date && h.price > 0);
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Normalize the flat response from private-zillow into our PropertyData shape.
 *
 * Response shape:
 * {
 *   message, Source,
 *   PropertyAddress: { streetAddress, city, state, zipcode, neighborhood, community, subdivision },
 *   zestimate, Bedrooms, Bathrooms, "Area(sqft)",
 *   PropertyZPID, Price, yearBuilt, daysOnZillow, PropertyZillowURL
 * }
 */
function normalizePropertyData(raw: any, zpid: string): PropertyData {
  const addr = raw.PropertyAddress || {};
  const resolvedZpid = zpid || String(raw.PropertyZPID || '');

  // Extract photos from all known response fields
  const photos: string[] = [];
  if (raw.imgSrc) photos.push(raw.imgSrc);
  if (raw.hiResImageLink) photos.push(raw.hiResImageLink);
  if (raw.image) photos.push(raw.image);
  if (Array.isArray(raw.miniCardPhotos)) {
    for (const p of raw.miniCardPhotos) {
      if (p?.url) photos.push(p.url);
    }
  }
  if (Array.isArray(raw.photos)) {
    for (const p of raw.photos) {
      const url = typeof p === 'string' ? p : p?.url || p?.href;
      if (url) photos.push(url);
    }
  }
  // Deduplicate
  const uniquePhotos = [...new Set(photos)];

  return {
    zpid: resolvedZpid,
    address: addr.streetAddress || '',
    city: addr.city || '',
    state: addr.state || '',
    zip: String(addr.zipcode || ''),
    price: Number(raw.Price || raw.zestimate) || 0,
    zestimate: raw.zestimate ? Number(raw.zestimate) : undefined,
    rentZestimate: undefined, // Not available from this provider
    bedrooms: Number(raw.Bedrooms) || 0,
    bathrooms: Number(raw.Bathrooms) || 0,
    sqft: Number(raw['Area(sqft)']) || 0,
    lotSize: undefined,
    yearBuilt: Number(raw.yearBuilt) || 0,
    propertyType: undefined, // Not available from this provider
    description: undefined,
    photos: uniquePhotos,
    taxHistory: normalizeTaxHistory(raw),
    priceHistory: normalizePriceHistory(raw),
    homeStatus: raw.daysOnZillow != null ? `${raw.daysOnZillow} days on Zillow` : undefined,
    zillowUrl: raw.PropertyZillowURL || (resolvedZpid ? `https://www.zillow.com/homedetails/${resolvedZpid}_zpid/` : undefined),
  };
}
