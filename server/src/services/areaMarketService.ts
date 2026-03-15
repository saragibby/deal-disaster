/**
 * Area Market Data Service
 *
 * Persists housing market & rental market data in PostgreSQL, shared across
 * all users.  Rows are never overwritten — each fetch creates a new snapshot
 * so historical data is retained for long-term analysis.
 *
 * Refresh policy: data older than 7 days triggers a fresh API call.
 * In-memory cache (1 hour) avoids hitting the DB on every property analysis.
 */

import { pool } from '../db/pool.js';
import type { HousingMarket, RentalMarketTrends } from '@deal-platform/shared-types';

// ── configuration ──────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MEM_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — avoid repeated DB reads

const RAPIDAPI_KEY = () => process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = () => process.env.RAPIDAPI_HOST || 'private-zillow.p.rapidapi.com';

function rapidHeaders() {
  return {
    'x-rapidapi-key': RAPIDAPI_KEY(),
    'x-rapidapi-host': RAPIDAPI_HOST(),
  };
}

// ── in-memory hot cache ────────────────────────────────────────────────

interface MemEntry<T> { data: T; expiresAt: number }
const memCache = new Map<string, MemEntry<any>>();

function memGet<T>(key: string): T | null {
  const e = memCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { memCache.delete(key); return null; }
  return e.data as T;
}
function memSet<T>(key: string, data: T): void {
  memCache.set(key, { data, expiresAt: Date.now() + MEM_CACHE_TTL_MS });
}

// ── helpers ────────────────────────────────────────────────────────────

function normalizeAreaKey(city: string, state: string): string {
  return `${city.trim().toLowerCase()}, ${state.trim().toLowerCase()}`;
}

// ── DB table bootstrap ─────────────────────────────────────────────────

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS area_market_data (
      id SERIAL PRIMARY KEY,
      area_key VARCHAR(255) NOT NULL,
      area_name VARCHAR(255) NOT NULL,
      housing_market JSONB,
      rental_market JSONB,
      fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_area_market_data_area_key
      ON area_market_data(area_key, fetched_at DESC)
  `);
  tableReady = true;
}

// ── DB reads ───────────────────────────────────────────────────────────

interface AreaRow {
  housing_market: HousingMarket | null;
  rental_market: RentalMarketTrends | null;
  fetched_at: Date;
}

async function getLatestRow(areaKey: string): Promise<AreaRow | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT housing_market, rental_market, fetched_at
       FROM area_market_data
      WHERE area_key = $1
      ORDER BY fetched_at DESC
      LIMIT 1`,
    [areaKey],
  );
  return rows[0] || null;
}

function isStale(fetchedAt: Date): boolean {
  return Date.now() - fetchedAt.getTime() > REFRESH_INTERVAL_MS;
}

// ── DB write ───────────────────────────────────────────────────────────

async function insertRow(
  areaKey: string,
  areaName: string,
  housingMarket: HousingMarket | null,
  rentalMarket: RentalMarketTrends | null,
): Promise<void> {
  await ensureTable();
  await pool.query(
    `INSERT INTO area_market_data (area_key, area_name, housing_market, rental_market)
     VALUES ($1, $2, $3, $4)`,
    [areaKey, areaName, housingMarket ? JSON.stringify(housingMarket) : null, rentalMarket ? JSON.stringify(rentalMarket) : null],
  );
}

// ── API fetchers (pure — no caching logic) ─────────────────────────────

async function fetchHousingMarketFromApi(searchQuery: string): Promise<HousingMarket | null> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/housing_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const overview = data.market_overview;
    const analytics = data.market_analytics;
    if (!overview) return null;

    const zhviTimeSeries: Array<{ date: string; value: number }> = [];
    if (Array.isArray(analytics?.zhviRange)) {
      for (const entry of analytics.zhviRange) {
        if (entry.timePeriodEnd && entry.dataValue > 0) {
          zhviTimeSeries.push({ date: entry.timePeriodEnd, value: Math.round(entry.dataValue) });
        }
      }
      zhviTimeSeries.reverse(); // chronological
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

    return result.typicalHomeValue > 0 ? result : null;
  } catch (err) {
    console.warn(`[areaMarketService] housing_market API failed for "${searchQuery}":`, (err as Error).message);
    return null;
  }
}

async function fetchRentalMarketFromApi(searchQuery: string): Promise<RentalMarketTrends | null> {
  try {
    const host = RAPIDAPI_HOST();
    const url = `https://${host}/rental_market?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, { headers: rapidHeaders() });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const trends = data.rental_market_trends;
    if (!trends?.summary) return null;

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

    return result.medianRent > 0 ? result : null;
  } catch (err) {
    console.warn(`[areaMarketService] rental_market API failed for "${searchQuery}":`, (err as Error).message);
    return null;
  }
}

// ── public API ─────────────────────────────────────────────────────────

export interface AreaMarketData {
  housingMarket: HousingMarket | undefined;
  rentalMarket: RentalMarketTrends | undefined;
}

/**
 * Get housing + rental market data for an area.
 *
 * Resolution order:
 *   1. In-memory hot cache (1 hour TTL)
 *   2. PostgreSQL (latest row for this area_key)
 *   3. RapidAPI — only if no row exists or row is >7 days old
 *
 * New API results are inserted as a new row (snapshot) so historical
 * data accumulates for long-term analysis.
 */
export async function getAreaMarketData(city: string, state: string): Promise<AreaMarketData> {
  const areaKey = normalizeAreaKey(city, state);
  const searchQuery = `${city} ${state}`;

  // 1. Memory cache
  const memHit = memGet<AreaMarketData>(`area:${areaKey}`);
  if (memHit) return memHit;

  // 2. DB lookup
  try {
    const row = await getLatestRow(areaKey);

    if (row && !isStale(row.fetched_at)) {
      const result: AreaMarketData = {
        housingMarket: row.housing_market ?? undefined,
        rentalMarket: row.rental_market ?? undefined,
      };
      memSet(`area:${areaKey}`, result);
      return result;
    }

    // 3. Stale or missing — fetch fresh from API (both in parallel)
    const [housing, rental] = await Promise.all([
      fetchHousingMarketFromApi(searchQuery),
      fetchRentalMarketFromApi(searchQuery),
    ]);

    // Persist as new snapshot row
    const areaName = housing?.areaName || rental?.areaName || searchQuery;
    if (housing || rental) {
      await insertRow(areaKey, areaName, housing, rental);
    }

    const result: AreaMarketData = {
      housingMarket: housing ?? row?.housing_market ?? undefined,
      rentalMarket: rental ?? row?.rental_market ?? undefined,
    };
    memSet(`area:${areaKey}`, result);
    return result;
  } catch (err) {
    // DB unavailable — fall through to direct API call
    console.warn(`[areaMarketService] DB error, falling back to API:`, (err as Error).message);
    const [housing, rental] = await Promise.all([
      fetchHousingMarketFromApi(searchQuery),
      fetchRentalMarketFromApi(searchQuery),
    ]);
    return {
      housingMarket: housing ?? undefined,
      rentalMarket: rental ?? undefined,
    };
  }
}
