/**
 * AI Comparison Routes
 *
 * POST /api/ai/comparison-summary    – Generate AI summary comparing properties
 * POST /api/ai/property-narratives   – Generate per-property investment narratives
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import * as aiComparisonService from '../services/aiComparisonService.js';
import type { AIComparisonSummary, AIComparisonNarratives } from '@deal-platform/shared-types';
import { buildAssetDashboardOwnerContext } from '../middleware/ownerContext.js';
import { getOwnedAnalysesBySlugs } from '../services/analyzerPersistenceService.js';

const router = Router();

const MAX_PROPERTIES = 10;

// ── POST /comparison-summary ─────────────────────────────────────────────
router.post('/comparison-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { propertySlugs } = req.body as { propertySlugs?: string[] };

    if (!Array.isArray(propertySlugs) || propertySlugs.length < 2) {
      return res.status(400).json({ error: 'At least 2 property slugs are required' });
    }
    if (propertySlugs.length > MAX_PROPERTIES) {
      return res.status(400).json({ error: `Maximum ${MAX_PROPERTIES} properties allowed` });
    }
    if (!propertySlugs.every(s => typeof s === 'string' && s.length > 0)) {
      return res.status(400).json({ error: 'Invalid property slugs' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const properties = await getOwnedAnalysesBySlugs(ownerContext, propertySlugs);

    if (properties.length < 2) {
      return res.status(404).json({ error: 'Could not find enough properties for comparison' });
    }

    const summary = await aiComparisonService.generateComparisonSummary(properties);

    const response: AIComparisonSummary = {
      summary,
      generatedAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (err: any) {
    console.error('[AI comparison-summary]', err);
    res.status(500).json({ error: err.message || 'Failed to generate comparison summary' });
  }
});

// ── POST /property-narratives ────────────────────────────────────────────
router.post('/property-narratives', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { propertySlugs } = req.body as { propertySlugs?: string[] };

    if (!Array.isArray(propertySlugs) || propertySlugs.length < 1) {
      return res.status(400).json({ error: 'At least 1 property slug is required' });
    }
    if (propertySlugs.length > MAX_PROPERTIES) {
      return res.status(400).json({ error: `Maximum ${MAX_PROPERTIES} properties allowed` });
    }
    if (!propertySlugs.every(s => typeof s === 'string' && s.length > 0)) {
      return res.status(400).json({ error: 'Invalid property slugs' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const properties = await getOwnedAnalysesBySlugs(ownerContext, propertySlugs);

    if (properties.length === 0) {
      return res.status(404).json({ error: 'No matching properties found' });
    }

    const narratives = await aiComparisonService.generatePropertyNarratives(properties);

    const response: AIComparisonNarratives = {
      narratives,
      generatedAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (err: any) {
    console.error('[AI property-narratives]', err);
    res.status(500).json({ error: err.message || 'Failed to generate property narratives' });
  }
});

export default router;
