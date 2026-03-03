/**
 * General-Purpose Property Data Routes
 *
 * Reusable endpoints for property lookups, rental estimates, and financial
 * analysis.  These are stateless (no DB writes) so they can be consumed by
 * any frontend app or server-side process.
 *
 * POST /api/property/lookup     – look up a property (by URL, ZPID, or address)
 * GET  /api/property/rental-estimate – estimate rent for a property
 * POST /api/property/analyze    – run full investment analysis (no persistence)
 * GET  /api/property/search     – search for properties by query
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, authenticateOptional, AuthRequest } from '../middleware/auth.js';
import * as propertyDataService from '../services/propertyDataService';
import * as rentalEstimationService from '../services/rentalEstimationService';
import * as investmentAnalysisService from '../services/investmentAnalysisService';
import type { AnalysisParams, PropertyData } from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';

const router = Router();

// ── POST /lookup ─────────────────────────────────────────────────────────
// Accept { url } or { zpid } or { address, city, state }
// Returns normalised PropertyData.
router.post('/lookup', authenticateOptional, async (req: Request, res: Response) => {
  try {
    const { url, zpid, address, city, state } = req.body;

    let property: PropertyData;

    if (url) {
      const extractedZpid = propertyDataService.parseZillowUrl(url);
      property = await propertyDataService.getPropertyByZpid(extractedZpid);
    } else if (zpid) {
      property = await propertyDataService.getPropertyByZpid(String(zpid));
    } else if (address && city && state) {
      property = await propertyDataService.getPropertyByAddress(address, `${city}, ${state}`);
    } else {
      return res.status(400).json({
        error: 'Provide a Zillow URL, ZPID, or address (address + city + state).',
      });
    }

    res.json({ property });
  } catch (err: any) {
    console.error('[property/lookup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /rental-estimate ─────────────────────────────────────────────────
// Query params: zpid  OR  price & bedrooms & sqft (for pure algorithmic)
router.get('/rental-estimate', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { zpid, price, bedrooms, sqft, yearBuilt, propertyType } = req.query;

    let property: PropertyData | null = null;
    let apiComps: any[] = [];

    // If we have a ZPID, try fetching real comps first
    if (zpid) {
      property = await propertyDataService.getPropertyByZpid(String(zpid));
      apiComps = await propertyDataService.getRentalComps(String(zpid));
    } else if (price) {
      // Build a minimal PropertyData from query params for algorithmic estimate
      property = {
        zpid: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        price: Number(price),
        bedrooms: Number(bedrooms) || 3,
        bathrooms: 2,
        sqft: Number(sqft) || 1500,
        yearBuilt: Number(yearBuilt) || 2000,
        propertyType: String(propertyType || ''),
      };
    }

    if (!property) {
      return res.status(400).json({ error: 'Provide zpid or price+bedrooms+sqft.' });
    }

    const algorithmic = rentalEstimationService.estimateRent(property);
    const blended = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    res.json({ rentalEstimate: blended });
  } catch (err: any) {
    console.error('[property/rental-estimate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /analyze ────────────────────────────────────────────────────────
// Accept { url, zpid, property, params }
// Runs full investment analysis.  Does NOT save to DB.
router.post('/analyze', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { url, zpid: bodyZpid, property: bodyProperty, params: userParams } = req.body;

    // Resolve property data
    let property: PropertyData;
    if (bodyProperty && bodyProperty.price) {
      property = bodyProperty;
    } else if (url) {
      const extractedZpid = propertyDataService.parseZillowUrl(url);
      property = await propertyDataService.getPropertyByZpid(extractedZpid);
    } else if (bodyZpid) {
      property = await propertyDataService.getPropertyByZpid(String(bodyZpid));
    } else {
      return res.status(400).json({ error: 'Provide url, zpid, or property data.' });
    }

    // Merge user params with defaults
    const params: AnalysisParams = { ...DEFAULT_ANALYSIS_PARAMS, ...userParams };

    // Fetch rental data
    const apiComps = property.zpid
      ? await propertyDataService.getRentalComps(property.zpid)
      : [];
    const algorithmic = rentalEstimationService.estimateRent(property);
    const rentalEstimate = rentalEstimationService.combineEstimates(apiComps, algorithmic);

    // Use property tax from tax history if available and user didn't override
    if (
      property.taxHistory?.length &&
      userParams?.annualPropertyTax == null
    ) {
      params.annualPropertyTax = property.taxHistory[0].amount || params.annualPropertyTax;
    }

    // Run analysis
    const results = investmentAnalysisService.runFullAnalysis(property, rentalEstimate, params);

    res.json({ property, results, rentalEstimate });
  } catch (err: any) {
    console.error('[property/analyze]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /search ──────────────────────────────────────────────────────────
router.get('/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '');
    if (!q) {
      return res.status(400).json({ error: 'Provide a search query (?q=...).' });
    }

    const results = await propertyDataService.searchProperties(q);
    res.json({ results });
  } catch (err: any) {
    console.error('[property/search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
