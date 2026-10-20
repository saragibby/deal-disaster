/**
 * Helpers for optional analysis datasets (sale comparables, Zillow housing and
 * rental market data): fallback construction and per-dataset fetch status.
 */
import type {
  AnalysisDatasetStatus, MarketStatistics, PropertyData, RentalMarketTrends,
} from '@deal-platform/shared-types';
import { getAreaMarketData } from './areaMarketService.js';

/**
 * Build a ZIP-level rental market summary from RentCast statistics that were
 * already fetched for the analysis. Used only when Zillow has no rental market
 * data; it is labeled with `source: 'rentcast'` and never feeds rent estimates.
 */
export function rentalMarketFromRentCast(
  stats: MarketStatistics | null | undefined,
  zip: string | undefined,
): RentalMarketTrends | undefined {
  const medianRent = stats?.medianRent;
  if (typeof medianRent !== 'number' || !Number.isFinite(medianRent) || medianRent <= 0) return undefined;
  const pct = stats?.rentGrowthPct;
  const hasPct = typeof pct === 'number' && Number.isFinite(pct) && pct > -100;
  const listings = stats?.totalListings;
  return {
    areaName: zip?.trim() ? `ZIP ${zip.trim()}` : 'ZIP code',
    medianRent: Math.round(medianRent),
    monthlyChange: 0,
    yearlyChange: hasPct ? Math.round(medianRent - medianRent / (1 + pct / 100)) : 0,
    availableRentals: typeof listings === 'number' && Number.isFinite(listings) && listings > 0 ? Math.round(listings) : 0,
    marketTemperature: 'UNKNOWN',
    source: 'rentcast',
    ...(hasPct ? { yearlyChangePct: pct } : {}),
  };
}

/** True when the property has no Zillow rental market data (a RentCast fallback counts as missing). */
export function needsZillowRentalMarket(property: PropertyData): boolean {
  return !property.rentalMarketTrends || property.rentalMarketTrends.source === 'rentcast';
}

/**
 * Fill missing Zillow housing/rental market data on a property (shared weekly
 * DB cache, usually no provider call), then apply the RentCast fallback for
 * rental data when Zillow still has none. Mutates and returns `property`.
 */
export async function backfillAreaMarket(
  property: PropertyData,
  marketStatistics: MarketStatistics | null | undefined,
  retryMissing = false,
): Promise<PropertyData> {
  const needsHousing = !property.housingMarket;
  const needsRental = needsZillowRentalMarket(property);
  if ((needsHousing || needsRental) && property.city && property.state) {
    try {
      const area = await getAreaMarketData(property.city, property.state, property.zip, retryMissing);
      if (needsHousing && area.housingMarket) property.housingMarket = area.housingMarket;
      if (needsRental && area.rentalMarket) property.rentalMarketTrends = area.rentalMarket;
    } catch {
      console.warn('[analyzer:datasets] Area market backfill failed (non-fatal)');
    }
  }
  applyRentalMarketFallback(property, marketStatistics);
  return property;
}

/** Apply the RentCast rental-market fallback when no rental market data exists. */
export function applyRentalMarketFallback(
  property: PropertyData,
  marketStatistics: MarketStatistics | null | undefined,
): void {
  if (property.rentalMarketTrends) return;
  const fallback = rentalMarketFromRentCast(marketStatistics, property.zip);
  if (fallback) property.rentalMarketTrends = fallback;
}

export function marketDatasetStatuses(property: PropertyData): {
  housingMarket: AnalysisDatasetStatus;
  rentalMarket: AnalysisDatasetStatus;
} {
  const missing: AnalysisDatasetStatus = property.city && property.state ? 'unavailable' : 'not-applicable';
  return {
    housingMarket: property.housingMarket ? 'ok' : missing,
    rentalMarket: property.rentalMarketTrends ? 'ok' : missing,
  };
}
