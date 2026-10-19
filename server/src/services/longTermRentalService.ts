import type { PropertyData } from '@deal-platform/shared-types';
import * as rentCastService from './rentCastService.js';
import * as realtyInUsService from './realtyInUsService.js';
import { recordProviderFallback } from './providerUsageService.js';
import {
  applyZillowMarketRent, combineEstimates, estimateRent, filterPlausibleRentalComps,
} from './rentalEstimationService.js';

const defaultProviders = {
  rentCastComps: rentCastService.getRentalComps,
  realtorComps: realtyInUsService.getRentalComps,
  rentCastEstimate: rentCastService.getRentEstimate,
};

export async function getLongTermRentalEstimate(
  property: PropertyData,
  providers = defaultProviders,
) {
  let comps = filterPlausibleRentalComps(await providers.rentCastComps(property), property);
  let compSource: 'rentcast' | 'realtor' | null = comps.length > 0 ? 'rentcast' : null;
  if (comps.length === 0) {
    recordProviderFallback('realtor', 'listings', 'no-usable-data');
    comps = filterPlausibleRentalComps(await providers.realtorComps(property), property);
    if (comps.length > 0) compSource = 'realtor';
  }
  let rentalEstimate = combineEstimates(comps, estimateRent(property), property);
  let usedAvm = false;
  if (comps.length === 0) {
    recordProviderFallback('rentcast', 'rent-avm', 'no-usable-data');
    const avm = await providers.rentCastEstimate(property);
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
