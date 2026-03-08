/**
 * Property Analyzer Routes  –  app-specific endpoints
 *
 * Thin layer that orchestrates the general-purpose property services and
 * adds history persistence (CRUD on the property_analyses table).
 *
 * POST   /api/analyzer/run            – lookup + analyze + save
 * GET    /api/analyzer/history         – list saved analyses
 * GET    /api/analyzer/history/:id     – single saved analysis
 * DELETE /api/analyzer/history/:id     – delete saved analysis
 * POST   /api/analyzer/re-analyze/:id  – re-run with updated params
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as propertyDataService from '../services/propertyDataService';
import * as rentalEstimationService from '../services/rentalEstimationService';
import * as investmentAnalysisService from '../services/investmentAnalysisService';
import * as geocodingService from '../services/geocodingService';
import type { AnalysisParams, ComparableProperty, PropertyData } from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';

const router = Router();

// ── Helper: enrich similar properties with rent estimates ────────────────
function enrichComparables(comps: ComparableProperty[]): ComparableProperty[] {
  return comps.map(comp => {
    // Build a minimal PropertyData to feed the rent estimator
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
      yearBuilt: 0,
    };

    const rental = rentalEstimationService.estimateRent(fakePropData);
    const rentPerSqft = comp.sqft > 0 ? Math.round((rental.mid / comp.sqft) * 100) / 100 : 0;

    return {
      ...comp,
      estimatedRent: rental.mid,
      rentPerSqft,
    };
  });
}

// ── POST /run ────────────────────────────────────────────────────────────
// Full pipeline: fetch property → estimate rent → compute analysis → persist
router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { url, params: userParams } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'A Zillow URL is required.' });
    }

    const zpid = propertyDataService.parseZillowUrl(url);
    const property = await propertyDataService.getPropertyByZpid(zpid);

    // Merge user params with defaults
    const params: AnalysisParams = { ...DEFAULT_ANALYSIS_PARAMS, ...userParams };

    // Use real tax data if available and user didn't supply their own
    if (property.taxHistory?.length && userParams?.annualPropertyTax == null) {
      params.annualPropertyTax = property.taxHistory[0].amount || params.annualPropertyTax;
    }

    // Rental estimation (API + algorithmic blend)
    const apiComps = await propertyDataService.getRentalComps(zpid);
    const algorithmic = rentalEstimationService.estimateRent(property);
    const rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    // Financial analysis
    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, params);

    // Fetch & enrich comparable properties (non-blocking — don't fail the analysis)
    let comparables: ComparableProperty[] = [];
    try {
      const rawComps = await propertyDataService.getSimilarProperties(zpid);
      comparables = enrichComparables(rawComps);
    } catch (err: any) {
      console.warn('[analyzer/run] Failed to fetch comparables:', err.message);
    }

    // Attach comparables to results
    results.comparables = comparables;

    // Geocode all addresses (subject + comps) — cache-first, non-blocking
    try {
      const allAddresses = [
        { address: property.address, city: property.city, state: property.state, zip: property.zip },
        ...comparables.map(c => ({ address: c.address, city: c.city, state: c.state, zip: c.zip })),
      ];

      const coordsMap = await geocodingService.geocodeMultiple(allAddresses);

      // Attach to subject property
      const subjectKey = geocodingService.normalizeAddressKey(property.address, property.city, property.state, property.zip);
      const subjectCoords = coordsMap.get(subjectKey);
      if (subjectCoords) {
        property.latitude = subjectCoords.lat;
        property.longitude = subjectCoords.lng;
      }

      // Attach to comparable properties
      for (const comp of comparables) {
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

    // Persist to DB
    const insertResult = await pool.query(
      `INSERT INTO property_analyses
        (user_id, zillow_url, zpid, property_data, analysis_params, analysis_results, rental_comps)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        req.userId,
        url,
        zpid,
        JSON.stringify(property),
        JSON.stringify(params),
        JSON.stringify(results),
        JSON.stringify(rentalEstimate.comps || []),
      ],
    );

    const saved = insertResult.rows[0];

    res.json({
      id: saved.id,
      zillow_url: url,
      zpid,
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
        `SELECT id, zillow_url, zpid, property_data, analysis_params,
                analysis_results, rental_comps, created_at
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

// ── GET /history/:id ─────────────────────────────────────────────────────
router.get('/history/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM property_analyses WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
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

// ── DELETE /history/:id ──────────────────────────────────────────────────
router.delete('/history/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM property_analyses WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.userId],
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

// ── POST /re-analyze/:id ────────────────────────────────────────────────
// Re-run analysis on a previously-saved property with new params.
// Saves as a new entry rather than overwriting the old one.
router.post('/re-analyze/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const original = await pool.query(
      `SELECT * FROM property_analyses WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId],
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

    // Re-estimate rent if we have stored comps
    const apiComps = row.rental_comps || [];
    const algorithmic = rentalEstimationService.estimateRent(property);
    const rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, newParams);

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

    // Save as new entry
    const insertResult = await pool.query(
      `INSERT INTO property_analyses
        (user_id, zillow_url, zpid, property_data, analysis_params, analysis_results, rental_comps)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        req.userId,
        row.zillow_url,
        row.zpid,
        JSON.stringify(property),
        JSON.stringify(newParams),
        JSON.stringify(results),
        JSON.stringify(rentalEstimate.comps || []),
      ],
    );

    const saved = insertResult.rows[0];

    res.json({
      id: saved.id,
      zillow_url: row.zillow_url,
      zpid: row.zpid,
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

export default router;
