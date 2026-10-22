import { DEFAULT_ANALYSIS_PARAMS, type PropertyAnalysis } from '@deal-platform/shared-types';
import { runFullAnalysis, finalizeAnalysis } from '../../server/src/services/investmentAnalysisService';
import { estimateMTR } from '../../server/src/services/mtrEstimationService';

export function mtrAnalysis(): PropertyAnalysis {
  const property = {
    zpid: '9988776655', address: '10 Nearby Fixture Ave', city: 'Example', state: 'NC', zip: '27500',
    price: 200000, bedrooms: 3, bathrooms: 2, sqft: 1500, yearBuilt: 2000,
    latitude: 35.112, longitude: -80.112, propertyType: 'Single Family',
  };
  const rental = { mid: 1800, low: 1600, high: 2000, confidence: 'low' as const };
  const results = runFullAnalysis(property, rental, DEFAULT_ANALYSIS_PARAMS);
  results.mtrEstimate = estimateMTR(property, rental);
  finalizeAnalysis(results);
  return {
    id: 1, slug: 'nearby-fixture', user_id: 7, zillow_url: 'https://www.zillow.com/homedetails/9988776655_zpid/',
    property_data: property, analysis_params: { ...DEFAULT_ANALYSIS_PARAMS },
    analysis_results: results, created_at: '2026-10-22T00:00:00Z',
  };
}
