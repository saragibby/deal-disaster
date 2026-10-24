import type { PropertyData, RentalComp } from '@deal-platform/shared-types';
import * as rentCastService from './rentCastService.js';
import * as realtyInUsService from './realtyInUsService.js';
import { recordProviderFallback } from './providerUsageService.js';
import { recordAnalyzerDiagnostic } from './analyzerDiagnostics.js';
import {
  applyZillowMarketRent, combineEstimates, estimateRent, filterPlausibleRentalComps, rentalCompRejectionReason,
} from './rentalEstimationService.js';

type RentEstimate = { mid: number; low: number; high: number };

interface RentalProviders {
  rentCastComps: (property: PropertyData) => Promise<RentalComp[]>;
  realtorComps: (property: PropertyData) => Promise<RentalComp[]>;
  rentCastEstimate: (property: PropertyData) => Promise<RentEstimate | null>;
  rentCastBundle?: (property: PropertyData) => Promise<{ estimate: RentEstimate; comps: RentalComp[] } | null>;
  mode?: () => rentCastService.RentCastRentMode;
}

const defaultProviders: RentalProviders = {
  rentCastComps: rentCastService.getRentalComps,
  realtorComps: realtyInUsService.getRentalComps,
  rentCastEstimate: rentCastService.getRentEstimate,
  rentCastBundle: rentCastService.getRentEstimateBundle,
  mode: rentCastService.rentCastRentMode,
};

function compKey(comp: RentalComp): string | null {
  return comp.address ? comp.address.toLowerCase().replace(/[^a-z0-9]/g, '') : null;
}

function mergeComps(primary: RentalComp[], supplement: RentalComp[]): RentalComp[] {
  const seen = new Set(primary.map(compKey).filter((key): key is string => key !== null));
  return [...primary, ...supplement.filter(comp => {
    const key = compKey(comp);
    if (key === null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

function selectRentCastComps(comps: RentalComp[], property: PropertyData, stage: 'listings' | 'bundle') {
  const rejected = { 'invalid-rent': 0, 'below-minimum': 0, 'above-maximum': 0, 'above-price-ratio': 0 };
  const accepted = comps.filter(comp => {
    const reason = rentalCompRejectionReason(comp.rent, property);
    if (reason === null) return true;
    rejected[reason]++;
    return false;
  });
  recordAnalyzerDiagnostic('comp-selection', {
    stage, inputCount: comps.length,
    acceptedCount: accepted.length,
    invalidRentCount: rejected['invalid-rent'], belowMinimumCount: rejected['below-minimum'],
    aboveMaximumCount: rejected['above-maximum'], abovePriceRatioCount: rejected['above-price-ratio'],
    propertyTypePresent: !!property.propertyType,
    sixPlusBedrooms: property.bedrooms >= 6, sixPlusBathrooms: property.bathrooms >= 6,
  });
  return accepted;
}

/**
 * Bundle mode: one RentCast estimate request supplies both the estimate and
 * recent comps. Active listings are requested only when fewer than
 * BUNDLE_MIN_COMPS plausible comps came back, and the estimate already in hand
 * is reused for the no-comps blend, so no second estimate request is made.
 */
async function getRentCastComps(property: PropertyData, providers: RentalProviders) {
  if (providers.mode?.() !== 'bundle' || !providers.rentCastBundle) {
    return { comps: selectRentCastComps(await providers.rentCastComps(property), property, 'listings'), avm: undefined };
  }
  const bundle = await providers.rentCastBundle(property);
  let comps = selectRentCastComps(bundle?.comps ?? [], property, 'bundle');
  if (comps.length < rentCastService.BUNDLE_MIN_COMPS) {
    recordProviderFallback('rentcast', 'rental-listings', bundle ? 'insufficient-comps' : 'provider-failed');
    comps = mergeComps(comps, selectRentCastComps(await providers.rentCastComps(property), property, 'listings'));
  }
  return { comps, avm: bundle ? bundle.estimate : null };
}

export async function getLongTermRentalEstimate(
  property: PropertyData,
  providers: RentalProviders = defaultProviders,
) {
  const rentCast = await getRentCastComps(property, providers);
  let comps = rentCast.comps;
  let compSource: 'rentcast' | 'realtor' | null = comps.length > 0 ? 'rentcast' : null;
  if (comps.length === 0) {
    recordProviderFallback('realtor', 'listings', 'no-usable-data');
    comps = filterPlausibleRentalComps(await providers.realtorComps(property), property);
    if (comps.length > 0) compSource = 'realtor';
  }
  let rentalEstimate = combineEstimates(comps, estimateRent(property), property);
  let usedAvm = false;
  if (comps.length === 0) {
    // undefined: compatibility mode has not requested an estimate yet; null: bundle request failed.
    let avm = rentCast.avm;
    if (avm === undefined) {
      recordProviderFallback('rentcast', 'rent-avm', 'no-usable-data');
      avm = await providers.rentCastEstimate(property);
    }
    if (avm) {
      usedAvm = true;
      rentalEstimate.mid = Math.round((rentalEstimate.mid + avm.mid) / 2);
      rentalEstimate.low = Math.round((rentalEstimate.low + avm.low) / 2);
      rentalEstimate.high = Math.round((rentalEstimate.high + avm.high) / 2);
      if (rentalEstimate.confidence === 'low') rentalEstimate.confidence = 'medium';
    }
  }
  const usedZillowRent = comps.length === 0 && !!property.rentalMarketTrends?.medianRent
    && property.rentalMarketTrends.source !== 'rentcast';
  if (usedZillowRent) {
    rentalEstimate = applyZillowMarketRent(rentalEstimate, property.rentalMarketTrends);
  }
  return { rentalEstimate, compSource, usedZillowRent, usedAvm };
}
