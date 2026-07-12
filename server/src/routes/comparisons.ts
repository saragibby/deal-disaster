/**
 * Saved Comparisons Routes
 *
 * POST   /api/comparisons          – save a new comparison
 * GET    /api/comparisons          – list saved comparisons (paginated)
 * GET    /api/comparisons/:id      – get a single saved comparison
 * PATCH  /api/comparisons/:id      – update a comparison (add/remove slugs)
 * DELETE /api/comparisons/:id      – delete a saved comparison
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { buildAssetDashboardOwnerContext } from '../middleware/ownerContext.js';
import {
  countOwnedAnalysisSlugs,
  deleteComparisonById,
  getComparisonById,
  listComparisons,
  saveComparison,
  updateComparisonSlugs,
} from '../services/analyzerPersistenceService.js';

const router = Router();

// ── POST / – Save a new comparison ───────────────────────────────────────
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, propertySlugs } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Comparison name is required.' });
    }

    if (!Array.isArray(propertySlugs) || propertySlugs.length < 2) {
      return res.status(400).json({ error: 'At least 2 property slugs are required.' });
    }

    if (propertySlugs.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 properties per comparison.' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);

    if (await countOwnedAnalysisSlugs(ownerContext, propertySlugs) !== propertySlugs.length) {
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const comparison = await saveComparison(ownerContext, name.trim(), propertySlugs);

    res.status(201).json({ comparison });
  } catch (err: any) {
    console.error('[comparisons] POST error:', err);
    res.status(500).json({ error: 'Failed to save comparison.' });
  }
});

// ── GET / – List saved comparisons (paginated) ──────────────────────────
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const { comparisons, total } = await listComparisons(ownerContext, limit, offset);

    res.json({
      comparisons,
      total,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('[comparisons] GET list error:', err);
    res.status(500).json({ error: 'Failed to load comparisons.' });
  }
});

// ── GET /:id – Get a single saved comparison ────────────────────────────
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);

    if (isNaN(compId)) {
      return res.status(400).json({ error: 'Invalid comparison ID.' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const comparison = await getComparisonById(ownerContext, compId);

    if (comparison == null) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    res.json({ comparison });
  } catch (err: any) {
    console.error('[comparisons] GET single error:', err);
    res.status(500).json({ error: 'Failed to load comparison.' });
  }
});

// ── DELETE /:id – Delete a saved comparison ─────────────────────────────
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);

    if (isNaN(compId)) {
      return res.status(400).json({ error: 'Invalid comparison ID.' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);

    if (!await deleteComparisonById(ownerContext, compId)) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[comparisons] DELETE error:', err);
    res.status(500).json({ error: 'Failed to delete comparison.' });
  }
});

// ── PATCH /:id – Update a comparison's property slugs ───────────────────
router.patch('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);

    if (isNaN(compId)) {
      return res.status(400).json({ error: 'Invalid comparison ID.' });
    }

    const { propertySlugs } = req.body;

    if (!Array.isArray(propertySlugs) || propertySlugs.length < 2) {
      return res.status(400).json({ error: 'At least 2 property slugs are required.' });
    }

    if (propertySlugs.length > 6) {
      return res.status(400).json({ error: 'Maximum 6 properties per comparison.' });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);

    if (await countOwnedAnalysisSlugs(ownerContext, propertySlugs) !== propertySlugs.length) {
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const comparison = await updateComparisonSlugs(ownerContext, compId, propertySlugs);

    if (comparison == null) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    res.json({ comparison });
  } catch (err: any) {
    console.error('[comparisons] PATCH error:', err);
    res.status(500).json({ error: 'Failed to update comparison.' });
  }
});

export default router;
