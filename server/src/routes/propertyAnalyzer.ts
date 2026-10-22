/**
 * Property Analyzer Routes  –  app-specific endpoints
 *
 * Thin layer that orchestrates the general-purpose property services and
 * adds history persistence (CRUD on the property_analyses table).
 *
 * POST   /api/analyzer/run              – lookup + analyze + save
 * GET    /api/analyzer/history           – list saved analyses
 * GET    /api/analyzer/history/:slug     – single saved analysis
 * GET    /api/analyzer/history/:slug/property-records – private owner and sale records
 * POST   /api/analyzer/history/:slug/property-records/refresh – fetch and persist fresh records
 * DELETE /api/analyzer/history/:slug     – delete saved analysis
 * POST   /api/analyzer/re-analyze/:slug  – re-run with updated params
 * PATCH  /api/analyzer/history/:slug/share – toggle sharing on/off
 * GET    /api/analyzer/shared/:identifier – public read-only view (no auth required)
 */

import { Router, Response } from 'express';
import { authenticateOptional, authenticateToken, AuthRequest } from '../middleware/auth.js';
import * as propertyDataService from '../services/propertyDataService.js';
import { resolvePropertyInput } from '../services/propertyInputResolver.js';
import * as rentalEstimationService from '../services/rentalEstimationService.js';
import { getLongTermRentalEstimate } from '../services/longTermRentalService.js';
import { getProviderUsageRequestId, recordProviderCache } from '../services/providerUsageService.js';
import * as strEstimationService from '../services/strEstimationService.js';
import * as investmentAnalysisService from '../services/investmentAnalysisService.js';
import * as geocodingService from '../services/geocodingService.js';
import * as rentCastService from '../services/rentCastService.js';
import * as realtyInUsService from '../services/realtyInUsService.js';
import * as airDnaService from '../services/airDnaService.js';
import * as mtrEstimationService from '../services/mtrEstimationService.js';
import * as furnishedFinderService from '../services/furnishedFinderService.js';
import * as expenseDefaultsService from '../services/expenseDefaultsService.js';
import * as scenarioService from '../services/analysisScenarioService.js';
import {
  backfillAreaMarket, marketDatasetStatuses,
} from '../services/analysisDatasetService.js';
import type {
  AnalysisDatasetStatus, AnalysisParams, ComparableProperty, MarketStatistics, PropertyData, RentalEstimate,
} from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import type { AnalyzerBackendRuntime } from '../analyzer/backend.js';
import { generatePropertySlug } from '../utils/slugify.js';
import { buildAssetDashboardOwnerContext } from '../middleware/ownerContext.js';
import {
  deleteAnalysisBySlug,
  getAnalysisBySlug,
  getAnalysisForReanalysis,
  getAnalysisResultsForOverrides,
  getSharedAnalysisByPublicIdentifier,
  listAnalyses,
  saveAnalysis,
  savePropertyRecords,
  setAnalysisShared,
  updateAnalysisAfterReanalysis,
  updateAnalysisDatasets,
  updateAnalysisOverrides,
} from '../services/analyzerPersistenceService.js';

function createDefaultRuntime(): AnalyzerBackendRuntime {
  return {
    auth: {
      requireAuth: authenticateToken,
      optionalAuth: authenticateOptional,
      buildOwnerContext: buildAssetDashboardOwnerContext,
    },
    config: {
      platform: 'asset-dashboard',
      tenantId: 'asset-dashboard',
    },
  };
}

export function createPropertyAnalyzerRouter(runtime: AnalyzerBackendRuntime = createDefaultRuntime()): Router {
const router = Router();
const requireAuth = runtime.auth.requireAuth;
const buildOwnerContext = runtime.auth.buildOwnerContext;

// ── Helper: enrich similar properties with rent estimates ────────────────
function enrichComparables(
  comps: ComparableProperty[],
  subjectProperty?: PropertyData,
  subjectRentalEstimate?: import('@deal-platform/shared-types').RentalEstimate,
  marketStats?: import('@deal-platform/shared-types').MarketStatistics | null,
): ComparableProperty[] {
  const hasCalibration = !!(marketStats?.medianRent || subjectRentalEstimate);

  return comps.map(comp => {
    // Build PropertyData with all available fields from the Zillow response
    const fakePropData: PropertyData = {
      zpid: comp.zpid,
      address: comp.address,
      city: comp.city,
      state: comp.state,
      zip: comp.zip,
      price: comp.price,
      bedrooms: comp.bedrooms,
      bathrooms: comp.bathrooms,
      sqft: comp.sqft,
      yearBuilt: comp.yearBuilt || 0,
      propertyType: comp.homeType || undefined,
      latitude: comp.latitude,
      longitude: comp.longitude,
    };

    const algorithmic = rentalEstimationService.estimateRent(fakePropData);

    // Calibrate using subject's market data and blended rent when available
    const rental = rentalEstimationService.calibrateEstimate(
      algorithmic,
      comp.sqft,
      { marketStats, subjectRentalEstimate, subjectProperty },
    );

    const rentPerSqft = comp.sqft > 0 ? Math.round((rental.mid / comp.sqft) * 100) / 100 : 0;

    return {
      ...comp,
      estimatedRent: rental.mid,
      rentPerSqft,
      rentConfidence: rental.confidence,
      rentSource: hasCalibration ? 'market-calibrated' as const : 'algorithm' as const,
    };
  });
}

// ── Helper: refetch only the similar-properties dataset ─────────────────
async function backfillComparables(
  property: PropertyData,
  zpid: string,
  rentalEstimate: RentalEstimate | undefined,
  marketStatistics: MarketStatistics | null | undefined,
): Promise<{ comparables: ComparableProperty[]; status: AnalysisDatasetStatus }> {
  let comparables: ComparableProperty[] = [];
  let status: AnalysisDatasetStatus = 'unavailable';
  try {
    const fetched = await propertyDataService.getSimilarPropertiesWithStatus(zpid);
    status = fetched.status;
    comparables = enrichComparables(fetched.comps, property, rentalEstimate, marketStatistics ?? null);
  } catch {
    console.warn('[analyzer:comparables] Comparables backfill failed (non-fatal)');
  }
  console.info('[analyzer:comparables]', JSON.stringify({
    requestId: getProviderUsageRequestId(), stage: 'backfill', status, fetchedCount: comparables.length,
  }));
  return { comparables, status };
}

// ── POST /run ────────────────────────────────────────────────────────────
// Full pipeline: fetch property → estimate rent → compute analysis → persist
router.post('/run', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { url, params: userParams } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Please enter a property address or URL.' });
    }
    const ownerContext = await buildOwnerContext(req);

    const { property, source, sourceUrl } = await resolvePropertyInput(url);
    const zpid = property.zpid || '';
    const geocoder = geocodingService.createGeocodingSession();

    // Merge user params with defaults
    const params: AnalysisParams = { ...DEFAULT_ANALYSIS_PARAMS, ...userParams };

    // Property tax: prefer the real tax record, otherwise scale by the home's
    // price and the state's effective tax rate (far better than a flat default).
    let taxSource: 'actual' | 'estimate' = 'estimate';
    if (property.taxHistory?.length && userParams?.annualPropertyTax == null) {
      params.annualPropertyTax = property.taxHistory[0].amount || params.annualPropertyTax;
      taxSource = 'actual';
    } else if (userParams?.annualPropertyTax == null) {
      params.annualPropertyTax = expenseDefaultsService.estimateAnnualPropertyTax(property.price, property.state);
      taxSource = 'estimate';
    } else {
      taxSource = 'actual';
    }

    // Insurance: scale by home value + state catastrophe risk when not supplied.
    let insuranceSource: 'actual' | 'estimate' = 'estimate';
    if (userParams?.annualInsurance == null) {
      params.annualInsurance = expenseDefaultsService.estimateAnnualInsurance(property.price, property.state);
      insuranceSource = 'estimate';
    } else {
      insuranceSource = 'actual';
    }

    // Repairs / capex reserves: scale by the home's age when not supplied.
    if (userParams?.repairsPct == null || userParams?.capexPct == null) {
      const maint = expenseDefaultsService.estimateMaintenancePct(property.yearBuilt);
      if (userParams?.repairsPct == null) params.repairsPct = maint.repairsPct;
      if (userParams?.capexPct == null) params.capexPct = maint.capexPct;
    }

    // Cost-segregation %: scale by property type when not supplied.
    if (userParams?.costSegPct == null) {
      params.costSegPct = expenseDefaultsService.estimateCostSegPct(property.propertyType);
    }

    // HOA fee: prefer API data, then estimate by property type
    let hoaSource: 'zillow' | 'estimate' | 'none' = 'none';

    // Early geocode of subject property (cache-first, needed for proximity scoring)
    try {
      await geocoder.geocodeProperties([property]);
    } catch {
      console.warn('[analyzer/run] Subject geocoding failed (non-fatal)');
    }

    if (userParams?.monthlyHoa == null) {
      if (property.hoaFee) {
        params.monthlyHoa = property.hoaFee;
        hoaSource = 'zillow';
      } else {
        const pType = (property.propertyType || '').toLowerCase();
        if (pType.includes('condo') || pType.includes('condominium')) {
          params.monthlyHoa = 350;
          hoaSource = 'estimate';
        } else if (pType.includes('townhouse') || pType.includes('town_house')) {
          params.monthlyHoa = 250;
          hoaSource = 'estimate';
        } else if (pType.includes('coop') || pType.includes('co-op')) {
          params.monthlyHoa = 400;
          hoaSource = 'estimate';
        }
      }
    } else {
      hoaSource = property.hoaFee ? 'zillow' : 'none';
    }

    // Rental estimation — real for-rent comps first (RentCast → Realtor.com),
    // then Zillow area-median anchor, then the bare algorithm.
    const { rentalEstimate, compSource, usedZillowRent, usedAvm } = await getLongTermRentalEstimate(property);
    const apiComps = rentalEstimate.comps || [];

    // Short-term rental — prefer AirDNA real data, fall back to algorithmic
    let strEstimate = await airDnaService.getSTREstimate(property);
    if (!strEstimate) {
      strEstimate = strEstimationService.estimateSTR(property, rentalEstimate);
    }

    // Mid-term rental — algorithmic estimation with proximity scoring,
    // calibrated to real furnished comps (Furnished Finder) when available.
    let proximityBoost = 0;
    let nearbyInstitutions: { name: string; emoji: string; miles: number }[] = [];
    if (geocodingService.hasValidCoordinates(property)) {
      try {
        const proximity = await mtrEstimationService.getProximityBoost(property.latitude, property.longitude);
        proximityBoost = proximity.boost;
        nearbyInstitutions = proximity.nearby;
      } catch (err: any) {
        console.warn('[analyzer/run] Proximity scoring failed (non-fatal):', err.message);
      }
    }
    let mtrMarketData = null;
    try {
      mtrMarketData = await furnishedFinderService.getMtrMarketData(property);
    } catch (err: any) {
      console.warn('[analyzer/run] Furnished Finder MTR fetch failed (non-fatal):', err.message);
    }
    const mtrEstimate = mtrEstimationService.estimateMTR(property, rentalEstimate, proximityBoost, mtrMarketData);
    if (nearbyInstitutions.length > 0) {
      mtrEstimate.demandFactors.nearbyInstitutions = nearbyInstitutions;
    }

    // Financial analysis
    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, params);

    // Attach STR + MTR estimates and data source tracking
    results.strEstimate = strEstimate;
    results.mtrEstimate = mtrEstimate;
    results.dataSources = {
      rental: apiComps.length > 0
        ? (compSource === 'realtor' ? 'realtor' : 'rentcast')
        : usedZillowRent
          ? 'zillow'
          : (usedAvm ? 'blended' : 'algorithm'),
      str: strEstimate.source === 'airdna' ? 'airdna' : 'algorithm',
      mtr: mtrEstimate.source,
      hoa: hoaSource,
      tax: taxSource,
      insurance: insuranceSource,
    };

    // Fetch & enrich comparable properties (non-blocking — don't fail the analysis)
    let comparables: ComparableProperty[] = [];
    let comparablesStatus: AnalysisDatasetStatus = 'unavailable';
    try {
      const { comps: rawComps, status } = await propertyDataService.getSimilarPropertiesWithStatus(zpid);
      comparablesStatus = status;

      try {
        await geocoder.geocodeProperties([property, ...rawComps]);
      } catch {
        console.warn('[analyzer/run] Comparable geocoding failed (non-fatal)');
      }

      // Enrich comps with calibrated rent estimates using subject's market data
      comparables = enrichComparables(rawComps, property, rentalEstimate);
      console.info('[analyzer:comparables]', JSON.stringify({
        requestId: getProviderUsageRequestId(), stage: 'ready',
        hasZpid: !!zpid, fetchedCount: rawComps.length, enrichedCount: comparables.length,
        mappedCount: comparables.filter(geocodingService.hasValidCoordinates).length,
      }));
    } catch {
      console.warn('[analyzer:comparables]', JSON.stringify({
        requestId: getProviderUsageRequestId(), stage: 'failed', hasZpid: !!zpid,
      }));
    }

    // Attach comparables to results
    results.comparables = comparables;
    results.datasetStatus = { comparables: comparablesStatus, ...marketDatasetStatuses(property) };

    // Finalize: compute the single-source-of-truth strategy comparison now that
    // all estimates and data sources are attached.
    investmentAnalysisService.finalizeAnalysis(results);

    // Persist to DB (upsert — re-analysing same property overwrites the old entry)
    const slug = generatePropertySlug(property.address, property.zip);
    const saved = await saveAnalysis(ownerContext, {
      slug,
      zillowUrl: sourceUrl || url,
      zpid,
      sourceUrl: sourceUrl || url,
      sourceType: source,
      propertyData: property,
      analysisParams: params,
      analysisResults: results,
      rentalComps: rentalEstimate.comps || [],
    });

    res.json({
      slug: saved.slug,
      public_share_id: saved.public_share_id,
      zillow_url: sourceUrl || url,
      zpid,
      source_url: sourceUrl || url,
      source_type: source,
      property_data: property,
      analysis_params: params,
      analysis_results: results,
      rental_comps: rentalEstimate.comps || [],
      created_at: saved.created_at,
    });
  } catch (err: any) {
    console.error('[analyzer/run]', err.message);
    const status = err instanceof propertyDataService.PropertyDataProviderError ? 503 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ── GET /history ─────────────────────────────────────────────────────────
router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildOwnerContext(req);
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const { analyses, total } = await listAnalyses(ownerContext, limit, offset);

    res.json({
      analyses,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('[analyzer/history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /history/:slug ─────────────────────────────────────────────────────
router.get('/history/:slug', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildOwnerContext(req);
    const analysis = await getAnalysisBySlug(ownerContext, req.params.slug);

    if (analysis == null) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json({ analysis });
  } catch (err: any) {
    console.error('[analyzer/history/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function propertyRecordsHandler(req: AuthRequest, res: Response, refresh: boolean) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const ownerContext = await buildOwnerContext(req);
    const analysis = await getAnalysisForReanalysis(ownerContext, req.params.slug);
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }
    if (!refresh && analysis.property_records) {
      recordProviderCache('rentcast', 'property-records', 'saved-analysis', 'hit');
      return res.json(analysis.property_records);
    }
    const records = await rentCastService.getPropertyRecords(analysis.property_data, { refresh });
    const saved = await savePropertyRecords(ownerContext, req.params.slug, records);
    if (!saved) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }
    return res.json(saved);
  } catch (err: unknown) {
    console.error('[analyzer/property-records]', err instanceof Error ? err.message : 'Unknown error');
    const unavailable = err instanceof rentCastService.PropertyRecordsUnavailableError ||
      (err instanceof Error && err.name === 'TimeoutError');
    return res.status(unavailable ? 503 : 502).json({
      error: err instanceof rentCastService.PropertyRecordsUnavailableError
        ? err.message : 'Unable to retrieve property records. Please try again later.',
    });
  }
}

router.get('/history/:slug/property-records', requireAuth, (req: AuthRequest, res: Response) =>
  propertyRecordsHandler(req, res, false));
router.post('/history/:slug/property-records/refresh', requireAuth, (req: AuthRequest, res: Response) =>
  propertyRecordsHandler(req, res, true));

router.get('/history/:slug/scenarios', requireAuth, async (req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const owner = await buildOwnerContext(req);
    if (!await getAnalysisBySlug(owner, req.params.slug)) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }
    return res.json({ scenarios: await scenarioService.listScenarios(owner, req.params.slug) });
  } catch (err: unknown) {
    console.error('[analyzer/scenarios GET]', err);
    return res.status(500).json({ error: 'Unable to load saved scenarios.' });
  }
});

router.post('/history/:slug/scenarios', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!scenarioService.isScenarioInput(req.body)) {
      return res.status(400).json({ error: 'Provide a name (1-100 characters), valid strategy assumptions, and finite scenario metrics.' });
    }
    const owner = await buildOwnerContext(req);
    const scenario = await scenarioService.saveScenario(owner, req.params.slug, req.body);
    if (!scenario) return res.status(404).json({ error: 'Analysis not found.' });
    return res.status(201).json({ scenario });
  } catch (err: unknown) {
    console.error('[analyzer/scenarios POST]', err);
    return res.status(500).json({ error: 'Unable to save scenario.' });
  }
});

router.delete('/history/:slug/scenarios/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid scenario id.' });
    }
    const owner = await buildOwnerContext(req);
    if (!await scenarioService.deleteScenario(owner, req.params.slug, id)) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }
    return res.json({ success: true });
  } catch (err: unknown) {
    console.error('[analyzer/scenarios DELETE]', err);
    return res.status(500).json({ error: 'Unable to delete scenario.' });
  }
});

// ── DELETE /history/:slug ──────────────────────────────────────────────────
router.delete('/history/:slug', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildOwnerContext(req);

    if (!await deleteAnalysisBySlug(ownerContext, req.params.slug)) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[analyzer/history/:id DELETE]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /re-analyze/:slug ────────────────────────────────────────────────
// Re-run analysis on a previously-saved property with new params.
// Updates the existing entry in-place (same slug/URL).
router.post('/re-analyze/:slug', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildOwnerContext(req);
    const row = await getAnalysisForReanalysis(ownerContext, req.params.slug);

    if (row == null) {
      return res.status(404).json({ error: 'Original analysis not found.' });
    }

    const property = row.property_data;

    // Targeted recovery: refetch only area market data the original run lost
    // (shared weekly DB cache), falling back to stored RentCast ZIP statistics.
    await backfillAreaMarket(property, row.analysis_results?.marketStatistics);

    const newParams: AnalysisParams = {
      ...DEFAULT_ANALYSIS_PARAMS,
      ...row.analysis_params,
      ...req.body.params,
    };

    // Property tax / insurance: respect an explicitly-supplied or previously
    // real/custom value, otherwise (re-)derive from the home's price + state so
    // older saved analyses self-heal away from the flat legacy defaults.
    const prevSources = row.analysis_results?.dataSources;
    const bodyParams = req.body.params || {};

    let taxSource: 'actual' | 'estimate';
    if (bodyParams.annualPropertyTax != null) {
      taxSource = 'actual';
    } else if (prevSources?.tax === 'actual') {
      taxSource = 'actual';
    } else if (property.taxHistory?.length) {
      newParams.annualPropertyTax = property.taxHistory[0].amount || newParams.annualPropertyTax;
      taxSource = 'actual';
    } else {
      newParams.annualPropertyTax = expenseDefaultsService.estimateAnnualPropertyTax(property.price, property.state);
      taxSource = 'estimate';
    }

    let insuranceSource: 'actual' | 'estimate';
    if (bodyParams.annualInsurance != null || prevSources?.insurance === 'actual') {
      insuranceSource = 'actual';
    } else {
      newParams.annualInsurance = expenseDefaultsService.estimateAnnualInsurance(property.price, property.state);
      insuranceSource = 'estimate';
    }

    // Repairs / capex / cost-seg: (re-)derive from the home's age and type when
    // the caller didn't supply an explicit override, so older saved analyses
    // self-heal away from the flat legacy defaults.
    if (bodyParams.repairsPct == null || bodyParams.capexPct == null) {
      const maint = expenseDefaultsService.estimateMaintenancePct(property.yearBuilt);
      if (bodyParams.repairsPct == null) newParams.repairsPct = maint.repairsPct;
      if (bodyParams.capexPct == null) newParams.capexPct = maint.capexPct;
    }
    if (bodyParams.costSegPct == null) {
      newParams.costSegPct = expenseDefaultsService.estimateCostSegPct(property.propertyType);
    }

    // Re-estimate rent using stored comps; if none, fetch fresh real comps.
    let apiComps = row.rental_comps || [];
    let compSource: 'rentcast' | 'realtor' | null = apiComps.length > 0 ? 'rentcast' : null;
    if (apiComps.length === 0) {
      apiComps = await realtyInUsService.getRentalComps(property);
      if (apiComps.length > 0) compSource = 'realtor';
    }
    apiComps = rentalEstimationService.filterPlausibleRentalComps(apiComps, property);
    const algorithmic = rentalEstimationService.estimateRent(property);
    let rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic, property);

    // No comps? Anchor to Zillow's area rental-market median (real data, high confidence).
    const usedZillowRent = apiComps.length === 0 && !!property.rentalMarketTrends?.medianRent
    && property.rentalMarketTrends.source !== 'rentcast';
    if (usedZillowRent) {
      rentalEstimate = rentalEstimationService.applyZillowMarketRent(rentalEstimate, property.rentalMarketTrends);
    }

    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, newParams);

    // Re-estimate STR. Re-fetch from AirDNA (24h cached in-service, so no extra
    // API cost) so saved analyses pick up the latest real data and parser
    // improvements (e.g. monthly seasonality). Fall back to the stored
    // real-provider estimate, then to the algorithm.
    const originalSTR = row.analysis_results?.strEstimate;
    let strEstimate = await airDnaService.getSTREstimate(property) || undefined;
    if (!strEstimate) {
      strEstimate = originalSTR && originalSTR.source !== 'algorithm'
        ? originalSTR
        : strEstimationService.estimateSTR(property, rentalEstimate);
    }
    results.strEstimate = strEstimate;

    // Mid-term rental — real furnished comps (Furnished Finder) when available,
    // else algorithmic re-estimation.
    let mtrMarketData = null;
    try {
      mtrMarketData = await furnishedFinderService.getMtrMarketData(property);
    } catch (err: any) {
      console.warn('[analyzer/re-analyze] Furnished Finder MTR fetch failed (non-fatal):', err.message);
    }
    const mtrEstimate = mtrEstimationService.estimateMTR(property, rentalEstimate, 0, mtrMarketData);
    results.mtrEstimate = mtrEstimate;

    // Preserve data source tracking
    results.dataSources = {
      rental: compSource === 'realtor'
        ? 'realtor'
        : apiComps.length > 0
          ? (row.analysis_results?.dataSources?.rental || 'rentcast')
          : (usedZillowRent ? 'zillow' : 'algorithm'),
      str: results.strEstimate?.source === 'airdna' ? 'airdna' : 'algorithm',
      mtr: mtrEstimate.source,
      hoa: row.analysis_results?.dataSources?.hoa || 'none',
      tax: taxSource,
      insurance: insuranceSource,
    };

    // Carry over stored comparables from the original analysis. When the
    // original run saved none because of a provider failure (or the status is
    // unknown), refetch only the similar-properties dataset.
    results.comparables = row.analysis_results?.comparables || [];
    const previousStatus = row.analysis_results?.datasetStatus;
    let comparablesStatus: AnalysisDatasetStatus | undefined = previousStatus?.comparables
      ?? (results.comparables.length ? 'ok' : undefined);
    if (results.comparables.length === 0 && previousStatus?.comparables !== 'none-found') {
      const backfill = await backfillComparables(
        property, property.zpid || row.zpid || '', rentalEstimate, row.analysis_results?.marketStatistics,
      );
      results.comparables = backfill.comparables;
      comparablesStatus = backfill.status;
    }
    results.datasetStatus = {
      ...(comparablesStatus ? { comparables: comparablesStatus } : {}),
      ...marketDatasetStatuses(property),
    };

    // Geocode if coordinates are missing (backfill for older analyses)
    try {
      await geocodingService.createGeocodingSession()
        .geocodeProperties([property, ...results.comparables]);
    } catch {
      console.warn('[analyzer/re-analyze] Geocoding failed (non-fatal)');
    }

    // Finalize: recompute the single-source-of-truth strategy comparison.
    investmentAnalysisService.finalizeAnalysis(results);

    // Update existing entry in-place
    const saved = await updateAnalysisAfterReanalysis(ownerContext, {
      slug: req.params.slug,
      propertyData: property,
      analysisParams: newParams,
      analysisResults: results,
      rentalComps: rentalEstimate.comps || [],
    });

    if (saved == null) {
      return res.status(404).json({ error: 'Original analysis not found.' });
    }

    res.json({
      slug: saved.slug,
      public_share_id: saved.public_share_id,
      zillow_url: row.zillow_url,
      zpid: row.zpid,
      source_url: row.source_url || row.zillow_url,
      source_type: row.source_type || 'zillow',
      property_data: property,
      analysis_params: newParams,
      analysis_results: results,
      rental_comps: rentalEstimate.comps || [],
      user_overrides: row.user_overrides ?? null,
      created_at: saved.created_at,
    });
  } catch (err: any) {
    console.error('[analyzer/re-analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /history/:slug/refresh-missing ──────────────────────────────────
// Refetch only provider datasets missing from a saved analysis (sale
// comparables, Zillow housing/rental market). Financial results, params and
// overrides are not recomputed. Saved comparables are never refetched; market
// data is one shared area snapshot, so a miss refreshes housing and rental
// together while keeping the saved dataset that was already present.
router.post('/history/:slug/refresh-missing', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildOwnerContext(req);
    const row = await getAnalysisForReanalysis(ownerContext, req.params.slug);
    if (row == null) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    const expected = {
      propertyData: JSON.stringify(row.property_data),
      analysisResults: JSON.stringify(row.analysis_results),
    };
    const property: PropertyData = row.property_data;
    const results = row.analysis_results;
    const marketStatistics = results.marketStatistics;
    await backfillAreaMarket(property, marketStatistics, true);

    let comparablesStatus = results.datasetStatus?.comparables
      ?? (results.comparables?.length ? 'ok' : undefined);
    if (!results.comparables?.length && comparablesStatus !== 'none-found') {
      const backfill = await backfillComparables(
        property, property.zpid || row.zpid || '', results.rentalEstimate, marketStatistics,
      );
      results.comparables = backfill.comparables;
      comparablesStatus = backfill.status;
      if (results.comparables.length > 0) {
        try {
          await geocodingService.createGeocodingSession().geocodeProperties([property, ...results.comparables]);
        } catch {
          console.warn('[analyzer/refresh-missing] Geocoding failed (non-fatal)');
        }
      }
    }
    results.datasetStatus = {
      ...(comparablesStatus ? { comparables: comparablesStatus } : {}),
      ...marketDatasetStatuses(property),
    };

    if (!await updateAnalysisDatasets(ownerContext, req.params.slug, property, results, expected)) {
      return res.status(409).json({ error: 'Analysis changed during refresh. Reload it before trying again.' });
    }
    const analysis = await getAnalysisBySlug(ownerContext, req.params.slug);
    if (analysis == null) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }
    res.json({ analysis });
  } catch (err: unknown) {
    console.error('[analyzer/refresh-missing]', err);
    res.status(500).json({ error: 'Unable to refresh missing data.' });
  }
});

// ── PATCH /history/:slug/share ───────────────────────────────────────────
// Toggle sharing on or off for a saved analysis.
router.patch('/history/:slug/share', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { shared } = req.body as { shared?: boolean };
    if (typeof shared !== 'boolean') {
      return res.status(400).json({ error: '"shared" must be a boolean.' });
    }

    const ownerContext = await buildOwnerContext(req);

    const shareState = await setAnalysisShared(ownerContext, req.params.slug, shared);

    if (shareState == null) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json(shareState);
  } catch (err: any) {
    console.error('[analyzer/share]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /history/:slug/overrides ───────────────────────────────────────
// Persist user-made fine-tuning (operating costs, revenue, furniture/appliances,
// selected strategy, changed params). Lightweight — no external data fetch.
// The client sends its already-computed derived figures, which are merged into
// the stored analysis_results so the values flow into property comparisons.
// Gross revenue is left RAW; only net figures are updated so a reload recomputes
// identically from the raw gross + overrides (no double-counting).
router.patch('/history/:slug/overrides', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { overrides, derived } = req.body as {
      overrides?: Record<string, unknown>;
      derived?: {
        cashFlow?: unknown;
        roi?: unknown;
        strategyComparison?: unknown;
        strNet?: number | null;
        mtrNet?: number | null;
      };
    };

    if (overrides == null || typeof overrides !== 'object') {
      return res.status(400).json({ error: '"overrides" must be an object.' });
    }

    const ownerContext = await buildOwnerContext(req);

    const results = await getAnalysisResultsForOverrides(ownerContext, req.params.slug);

    if (results == null) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    const d = derived || {};

    if (d.cashFlow != null) results.cashFlow = d.cashFlow;
    if (d.roi != null) results.roi = d.roi;
    if (d.strategyComparison != null) results.strategyComparison = d.strategyComparison;
    if (d.strNet != null && results.strEstimate) {
      results.strEstimate.netMonthlyRevenue = d.strNet;
    }
    if (d.mtrNet != null && results.mtrEstimate) {
      results.mtrEstimate.netMonthlyRevenue = d.mtrNet;
    }

    if (!await updateAnalysisOverrides(ownerContext, req.params.slug, results, overrides)) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[analyzer/overrides]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /shared/:identifier ───────────────────────────────────────────────
// Public read-only view — no authentication required.
// Accepts either the opaque public share ID or a legacy slug alias, and only
// returns the analysis if the owner has enabled sharing.
router.get('/shared/:identifier', async (req, res: Response) => {
  try {
    const analysis = await getSharedAnalysisByPublicIdentifier(req.params.identifier);

    if (analysis == null) {
      return res.status(404).json({ error: 'Shared analysis not found or sharing is disabled.' });
    }

    res.json({ analysis });
  } catch (err: any) {
    console.error('[analyzer/shared]', err.message);
    res.status(500).json({ error: err.message });
  }
});

return router;
}

const router = createPropertyAnalyzerRouter();
export default router;
