/**
 * AI Comparison Routes
 *
 * POST /api/ai/comparison-summary    – Generate AI summary comparing properties
 * POST /api/ai/property-narratives   – Generate per-property investment narratives
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as aiComparisonService from '../services/aiComparisonService.js';
import type { PropertyAnalysis, AIComparisonSummary, AIComparisonNarratives } from '@deal-platform/shared-types';

const router = Router();

const MAX_PROPERTIES = 10;

// ── POST /comparison-summary ─────────────────────────────────────────────
router.post('/comparison-summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { propertyIds } = req.body as { propertyIds?: number[] };

    if (!Array.isArray(propertyIds) || propertyIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 property IDs are required' });
    }
    if (propertyIds.length > MAX_PROPERTIES) {
      return res.status(400).json({ error: `Maximum ${MAX_PROPERTIES} properties allowed` });
    }
    if (!propertyIds.every(id => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ error: 'Invalid property IDs' });
    }

    // Load properties owned by this user
    const placeholders = propertyIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pool.query(
      `SELECT * FROM property_analyses WHERE user_id = $1 AND id IN (${placeholders})`,
      [req.userId, ...propertyIds],
    );

    if (result.rows.length < 2) {
      return res.status(404).json({ error: 'Could not find enough properties for comparison' });
    }

    const properties: PropertyAnalysis[] = result.rows;
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
    const { propertyIds } = req.body as { propertyIds?: number[] };

    if (!Array.isArray(propertyIds) || propertyIds.length < 1) {
      return res.status(400).json({ error: 'At least 1 property ID is required' });
    }
    if (propertyIds.length > MAX_PROPERTIES) {
      return res.status(400).json({ error: `Maximum ${MAX_PROPERTIES} properties allowed` });
    }
    if (!propertyIds.every(id => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ error: 'Invalid property IDs' });
    }

    const placeholders = propertyIds.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pool.query(
      `SELECT * FROM property_analyses WHERE user_id = $1 AND id IN (${placeholders})`,
      [req.userId, ...propertyIds],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No matching properties found' });
    }

    const properties: PropertyAnalysis[] = result.rows;
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
