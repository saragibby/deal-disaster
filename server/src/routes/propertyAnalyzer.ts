/**
 * Property Analyzer Routes  –  app-specific endpoints
 *
 * Thin layer that orchestrates the general-purpose property services and
 * adds history persistence (CRUD on the property_analyses table).
 *
 * POST   /api/analyzer/run              – lookup + analyze + save
 * GET    /api/analyzer/history           – list saved analyses
 * GET    /api/analyzer/history/:slug     – single saved analysis
 * DELETE /api/analyzer/history/:slug     – delete saved analysis
 * POST   /api/analyzer/re-analyze/:slug  – re-run with updated params
 * PATCH  /api/analyzer/history/:slug/share – toggle sharing on/off
 * GET    /api/analyzer/shared/:slug      – public read-only view (no auth required)
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as propertyDataService from '../services/propertyDataService.js';
import { resolvePropertyInput } from '../services/propertyInputResolver.js';
import * as rentalEstimationService from '../services/rentalEstimationService.js';
import * as strEstimationService from '../services/strEstimationService.js';
import * as investmentAnalysisService from '../services/investmentAnalysisService.js';
import * as geocodingService from '../services/geocodingService.js';
import * as rentCastService from '../services/rentCastService.js';
import * as realtyInUsService from '../services/realtyInUsService.js';
import * as airDnaService from '../services/airDnaService.js';
import * as mtrEstimationService from '../services/mtrEstimationService.js';
import * as furnishedFinderService from '../services/furnishedFinderService.js';
import * as expenseDefaultsService from '../services/expenseDefaultsService.js';
import type { AnalysisParams, ComparableProperty, PropertyData } from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import { generatePropertySlug } from '../utils/slugify.js';

const router = Router();

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

// ── POST /run ────────────────────────────────────────────────────────────
// Full pipeline: fetch property → estimate rent → compute analysis → persist
router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { url, params: userParams } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Please enter a property address or URL.' });
    }

    const { property, source, sourceUrl } = await resolvePropertyInput(url);
    const zpid = property.zpid || '';

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
    if (!property.latitude || !property.longitude) {
      try {
        const coords = await geocodingService.geocodeAddress(
          property.address, property.city, property.state, property.zip,
        );
        if (coords) {
          property.latitude = coords.lat;
          property.longitude = coords.lng;
        }
      } catch { /* non-fatal */ }
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
    let apiComps = await rentCastService.getRentalComps(property);
    let compSource: 'rentcast' | 'realtor' | null = apiComps.length > 0 ? 'rentcast' : null;
    if (apiComps.length === 0) {
      apiComps = await realtyInUsService.getRentalComps(property);
      if (apiComps.length > 0) compSource = 'realtor';
    }
    const algorithmic = rentalEstimationService.estimateRent(property);
    let rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    // Also try RentCast's AVM rent estimate as a cross-check
    const rentCastEstimate = await rentCastService.getRentEstimate(property);
    if (rentCastEstimate && apiComps.length === 0) {
      // If we got an AVM estimate but no comps, blend it in
      rentalEstimate.mid = Math.round((rentalEstimate.mid + rentCastEstimate.mid) / 2);
      rentalEstimate.low = Math.round((rentalEstimate.low + rentCastEstimate.low) / 2);
      rentalEstimate.high = Math.round((rentalEstimate.high + rentCastEstimate.high) / 2);
      if (rentalEstimate.confidence === 'low') rentalEstimate.confidence = 'medium';
    }

    // No rental comps? Anchor to Zillow's area rental-market median (real data,
    // high confidence) instead of falling back to the bare algorithm.
    const usedZillowRent = apiComps.length === 0 && !!property.rentalMarketTrends?.medianRent;
    if (usedZillowRent) {
      rentalEstimate = rentalEstimationService.applyZillowMarketRent(rentalEstimate, property.rentalMarketTrends);
    }

    // Short-term rental — prefer AirDNA real data, fall back to algorithmic
    let strEstimate = await airDnaService.getSTREstimate(property);
    if (!strEstimate) {
      strEstimate = strEstimationService.estimateSTR(property, rentalEstimate);
    }

    // Mid-term rental — algorithmic estimation with proximity scoring,
    // calibrated to real furnished comps (Furnished Finder) when available.
    let proximityBoost = 0;
    let nearbyInstitutions: { name: string; emoji: string; miles: number }[] = [];
    if (property.latitude && property.longitude) {
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

    // Market statistics — non-blocking, for rent trend display
    let marketStatistics = null;
    try {
      marketStatistics = await rentCastService.getMarketStatistics(property.zip);
    } catch (err: any) {
      console.warn('[analyzer/run] Market stats failed (non-fatal):', err.message);
    }

    // Financial analysis
    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, params);

    // Attach STR + MTR estimates and data source tracking
    results.strEstimate = strEstimate;
    results.mtrEstimate = mtrEstimate;
    if (marketStatistics) results.marketStatistics = marketStatistics;
    results.dataSources = {
      rental: apiComps.length > 0
        ? (compSource === 'realtor' ? 'realtor' : 'rentcast')
        : usedZillowRent
          ? 'zillow'
          : (rentCastEstimate ? 'blended' : 'algorithm'),
      str: strEstimate.source === 'airdna' ? 'airdna' : 'algorithm',
      mtr: mtrEstimate.source,
      hoa: hoaSource,
      tax: taxSource,
      insurance: insuranceSource,
    };

    // Fetch & enrich comparable properties (non-blocking — don't fail the analysis)
    let comparables: ComparableProperty[] = [];
    try {
      const rawComps = zpid ? await propertyDataService.getSimilarProperties(zpid) : [];

      // Geocode all addresses (subject + comps) before enrichment
      // so lat/lng are available for per-comp estimation
      const allAddresses = [
        { address: property.address, city: property.city, state: property.state, zip: property.zip },
        ...rawComps.map(c => ({ address: c.address, city: c.city, state: c.state, zip: c.zip })),
      ];

      try {
        const coordsMap = await geocodingService.geocodeMultiple(allAddresses);

        // Attach to subject property
        const subjectKey = geocodingService.normalizeAddressKey(property.address, property.city, property.state, property.zip);
        const subjectCoords = coordsMap.get(subjectKey);
        if (subjectCoords) {
          property.latitude = subjectCoords.lat;
          property.longitude = subjectCoords.lng;
        }

        // Attach to comparable properties before enrichment
        for (const comp of rawComps) {
          const compKey = geocodingService.normalizeAddressKey(comp.address, comp.city, comp.state, comp.zip);
          const compCoords = coordsMap.get(compKey);
          if (compCoords) {
            comp.latitude = compCoords.lat;
            comp.longitude = compCoords.lng;
          }
        }
      } catch (err: any) {
        console.warn('[analyzer/run] Geocoding failed (non-fatal):', err.message);
      }

      // Enrich comps with calibrated rent estimates using subject's market data
      comparables = enrichComparables(rawComps, property, rentalEstimate, marketStatistics);
    } catch (err: any) {
      console.warn('[analyzer/run] Failed to fetch comparables:', err.message);
    }

    // Attach comparables to results
    results.comparables = comparables;

    // Finalize: compute the single-source-of-truth strategy comparison now that
    // all estimates and data sources are attached.
    investmentAnalysisService.finalizeAnalysis(results);

    // Persist to DB (upsert — re-analysing same property overwrites the old entry)
    const slug = generatePropertySlug(property.address, property.zip);
    const insertResult = await pool.query(
      `INSERT INTO property_analyses
        (user_id, slug, zillow_url, zpid, source_url, source_type, property_data, analysis_params, analysis_results, rental_comps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, slug) DO UPDATE SET
        zillow_url       = EXCLUDED.zillow_url,
        zpid             = EXCLUDED.zpid,
        source_url       = EXCLUDED.source_url,
        source_type      = EXCLUDED.source_type,
        property_data    = EXCLUDED.property_data,
        analysis_params  = EXCLUDED.analysis_params,
        analysis_results = EXCLUDED.analysis_results,
        rental_comps     = EXCLUDED.rental_comps,
        created_at       = CURRENT_TIMESTAMP
       RETURNING slug, created_at`,
      [
        req.userId,
        slug,
        sourceUrl || url,
        zpid,
        sourceUrl || url,
        source,
        JSON.stringify(property),
        JSON.stringify(params),
        JSON.stringify(results),
        JSON.stringify(rentalEstimate.comps || []),
      ],
    );

    const saved = insertResult.rows[0];

    res.json({
      slug: saved.slug,
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
    res.status(500).json({ error: err.message });
  }
});

// ── GET /history ─────────────────────────────────────────────────────────
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit)) || 20));
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT slug, zillow_url, zpid, property_data, analysis_params,
                analysis_results, rental_comps, is_shared, created_at
         FROM property_analyses
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.userId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM property_analyses WHERE user_id = $1`,
        [req.userId],
      ),
    ]);

    res.json({
      analyses: dataRes.rows,
      total: countRes.rows[0].total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('[analyzer/history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /history/:slug ─────────────────────────────────────────────────────
router.get('/history/:slug', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT slug, zillow_url, zpid, property_data, analysis_params,
              analysis_results, rental_comps, is_shared, created_at
       FROM property_analyses WHERE slug = $1 AND user_id = $2`,
      [req.params.slug, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json({ analysis: result.rows[0] });
  } catch (err: any) {
    console.error('[analyzer/history/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /history/:slug ──────────────────────────────────────────────────
router.delete('/history/:slug', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM property_analyses WHERE slug = $1 AND user_id = $2 RETURNING slug`,
      [req.params.slug, req.userId],
    );

    if (result.rows.length === 0) {
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
router.post('/re-analyze/:slug', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const original = await pool.query(
      `SELECT * FROM property_analyses WHERE slug = $1 AND user_id = $2`,
      [req.params.slug, req.userId],
    );

    if (original.rows.length === 0) {
      return res.status(404).json({ error: 'Original analysis not found.' });
    }

    const row = original.rows[0];
    const property = row.property_data;
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
    const algorithmic = rentalEstimationService.estimateRent(property);
    let rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    // No comps? Anchor to Zillow's area rental-market median (real data, high confidence).
    const usedZillowRent = apiComps.length === 0 && !!property.rentalMarketTrends?.medianRent;
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

    // Carry over stored comparables from the original analysis
    results.comparables = row.analysis_results?.comparables || [];

    // Geocode if coordinates are missing (backfill for older analyses)
    const needsGeocode = !property.latitude || !results.comparables?.some((c: ComparableProperty) => c.latitude);
    if (needsGeocode) {
      try {
        const comparables = results.comparables || [];
        const allAddresses = [
          { address: property.address, city: property.city, state: property.state, zip: property.zip },
          ...comparables.map((c: ComparableProperty) => ({ address: c.address, city: c.city, state: c.state, zip: c.zip })),
        ];

        const coordsMap = await geocodingService.geocodeMultiple(allAddresses);

        const subjectKey = geocodingService.normalizeAddressKey(property.address, property.city, property.state, property.zip);
        const subjectCoords = coordsMap.get(subjectKey);
        if (subjectCoords) {
          property.latitude = subjectCoords.lat;
          property.longitude = subjectCoords.lng;
        }

        for (const comp of comparables) {
          const compKey = geocodingService.normalizeAddressKey(comp.address, comp.city, comp.state, comp.zip);
          const compCoords = coordsMap.get(compKey);
          if (compCoords) {
            comp.latitude = compCoords.lat;
            comp.longitude = compCoords.lng;
          }
        }
      } catch (err: any) {
        console.warn('[analyzer/re-analyze] Geocoding failed (non-fatal):', err.message);
      }
    }

    // Finalize: recompute the single-source-of-truth strategy comparison.
    investmentAnalysisService.finalizeAnalysis(results);

    // Update existing entry in-place
    const updateResult = await pool.query(
      `UPDATE property_analyses
       SET property_data    = $1,
           analysis_params  = $2,
           analysis_results = $3,
           rental_comps     = $4,
           created_at       = CURRENT_TIMESTAMP
       WHERE slug = $5 AND user_id = $6
       RETURNING slug, created_at`,
      [
        JSON.stringify(property),
        JSON.stringify(newParams),
        JSON.stringify(results),
        JSON.stringify(rentalEstimate.comps || []),
        req.params.slug,
        req.userId,
      ],
    );

    const saved = updateResult.rows[0];

    res.json({
      slug: saved.slug,
      zillow_url: row.zillow_url,
      zpid: row.zpid,
      source_url: row.source_url || row.zillow_url,
      source_type: row.source_type || 'zillow',
      property_data: property,
      analysis_params: newParams,
      analysis_results: results,
      rental_comps: rentalEstimate.comps || [],
      created_at: saved.created_at,
    });
  } catch (err: any) {
    console.error('[analyzer/re-analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /history/:slug/share ───────────────────────────────────────────
// Toggle sharing on or off for a saved analysis.
router.patch('/history/:slug/share', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { shared } = req.body as { shared?: boolean };
    if (typeof shared !== 'boolean') {
      return res.status(400).json({ error: '"shared" must be a boolean.' });
    }

    const result = await pool.query(
      `UPDATE property_analyses SET is_shared = $1
       WHERE slug = $2 AND user_id = $3
       RETURNING slug, is_shared`,
      [shared, req.params.slug, req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[analyzer/share]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /shared/:slug ────────────────────────────────────────────────────
// Public read-only view — no authentication required.
// Only returns the analysis if the owner has enabled sharing.
router.get('/shared/:slug', async (req, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT slug, property_data, analysis_params, analysis_results, rental_comps, created_at
       FROM property_analyses
       WHERE slug = $1 AND is_shared = TRUE`,
      [req.params.slug],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Shared analysis not found or sharing is disabled.' });
    }

    res.json({ analysis: result.rows[0] });
  } catch (err: any) {
    console.error('[analyzer/shared]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
