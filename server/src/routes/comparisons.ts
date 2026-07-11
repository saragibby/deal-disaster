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
import { pool } from '../db/pool.js';
import { buildAssetDashboardOwnerContext, getOwnerUserId } from '../middleware/ownerContext.js';

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
    const userId = getOwnerUserId(ownerContext);

    // Verify all slugs belong to this user
    const { rows: validSlugs } = await pool.query(
      `SELECT slug FROM property_analyses WHERE user_id = $1 AND slug = ANY($2)`,
      [userId, propertySlugs],
    );

    if (validSlugs.length !== propertySlugs.length) {
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO saved_comparisons (user_id, tenant_id, platform, owner_user_id, name, property_slugs)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, property_slugs, created_at, updated_at`,
      [userId, ownerContext.tenantId, ownerContext.platform, userId, name.trim(), propertySlugs],
    );

    res.status(201).json({ comparison: rows[0] });
  } catch (err: any) {
    console.error('[comparisons] POST error:', err);
    res.status(500).json({ error: 'Failed to save comparison.' });
  }
});

// ── GET / – List saved comparisons (paginated) ──────────────────────────
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const userId = getOwnerUserId(ownerContext);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, name, property_slugs, created_at, updated_at
         FROM saved_comparisons
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM saved_comparisons WHERE user_id = $1`,
        [userId],
      ),
    ]);

    res.json({
      comparisons: dataResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
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
    const userId = getOwnerUserId(ownerContext);

    const { rows } = await pool.query(
      `SELECT id, name, property_slugs, created_at, updated_at
       FROM saved_comparisons
       WHERE id = $1 AND user_id = $2`,
      [compId, userId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    res.json({ comparison: rows[0] });
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
    const userId = getOwnerUserId(ownerContext);

    const { rowCount } = await pool.query(
      `DELETE FROM saved_comparisons WHERE id = $1 AND user_id = $2`,
      [compId, userId],
    );

    if (rowCount === 0) {
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
    const userId = getOwnerUserId(ownerContext);

    // Verify all slugs belong to this user
    const { rows: validSlugs } = await pool.query(
      `SELECT slug FROM property_analyses WHERE user_id = $1 AND slug = ANY($2)`,
      [userId, propertySlugs],
    );

    if (validSlugs.length !== propertySlugs.length) {
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const { rows, rowCount } = await pool.query(
      `UPDATE saved_comparisons
       SET property_slugs = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, property_slugs, created_at, updated_at`,
      [propertySlugs, compId, userId],
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    res.json({ comparison: rows[0] });
  } catch (err: any) {
    console.error('[comparisons] PATCH error:', err);
    res.status(500).json({ error: 'Failed to update comparison.' });
  }
});

export default router;
