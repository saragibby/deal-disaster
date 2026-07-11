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
import type { PoolClient } from 'pg';

const router = Router();
const MIN_PROPERTIES = 2;
const MAX_PROPERTIES = 6;

interface ComparisonResponseRow {
  id: number;
  name: string;
  property_slugs: string[];
  created_at: Date;
  updated_at: Date;
}

function validatePropertySlugs(input: unknown): { propertySlugs?: string[]; error?: string } {
  if (!Array.isArray(input) || input.length < MIN_PROPERTIES) {
    return { error: 'At least 2 property slugs are required.' };
  }

  if (input.length > MAX_PROPERTIES) {
    return { error: 'Maximum 6 properties per comparison.' };
  }

  if (!input.every((slug) => typeof slug === 'string' && slug.trim().length > 0)) {
    return { error: 'One or more property slugs are invalid.' };
  }

  const propertySlugs = input.map((slug) => slug.trim());
  if (new Set(propertySlugs).size !== propertySlugs.length) {
    return { error: 'One or more property slugs are invalid.' };
  }

  return { propertySlugs };
}

async function resolveAnalysisIds(
  client: PoolClient,
  tenantId: string,
  ownerUserId: number,
  propertySlugs: string[],
): Promise<number[] | null> {
  const { rows } = await client.query<{ id: number; slug: string }>(
    `SELECT id, slug
     FROM property_analyses
     WHERE tenant_id = $1
       AND owner_user_id = $2
       AND slug = ANY($3::text[])`,
    [tenantId, ownerUserId, propertySlugs],
  );

  const idsBySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const analysisIds = propertySlugs.map((slug) => idsBySlug.get(slug));

  if (analysisIds.some((id) => id == null)) {
    return null;
  }

  return analysisIds as number[];
}

async function replaceComparisonMembers(
  client: PoolClient,
  comparisonId: number,
  analysisIds: number[],
) {
  await client.query(
    `DELETE FROM saved_comparison_members WHERE comparison_id = $1`,
    [comparisonId],
  );

  await client.query(
    `INSERT INTO saved_comparison_members (comparison_id, analysis_id, position)
     SELECT $1, member.analysis_id, member.ordinality::int
     FROM unnest($2::int[]) WITH ORDINALITY AS member(analysis_id, ordinality)`,
    [comparisonId, analysisIds],
  );
}

async function getHydratedComparison(
  client: PoolClient,
  comparisonId: number,
  tenantId: string,
  ownerUserId: number,
): Promise<ComparisonResponseRow | null> {
  const { rows } = await client.query<ComparisonResponseRow>(
    `SELECT sc.id,
            sc.name,
            COALESCE(
              array_agg(pa.slug ORDER BY scm.position) FILTER (WHERE pa.slug IS NOT NULL),
              ARRAY[]::text[]
            ) AS property_slugs,
            sc.created_at,
            sc.updated_at
     FROM saved_comparisons sc
     LEFT JOIN saved_comparison_members scm ON scm.comparison_id = sc.id
     LEFT JOIN property_analyses pa ON pa.id = scm.analysis_id
     WHERE sc.id = $1
       AND sc.tenant_id = $2
       AND sc.owner_user_id = $3
     GROUP BY sc.id, sc.name, sc.created_at, sc.updated_at`,
    [comparisonId, tenantId, ownerUserId],
  );

  return rows[0] ?? null;
}

// ── POST / – Save a new comparison ───────────────────────────────────────
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    const { name, propertySlugs } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Comparison name is required.' });
    }

    const validation = validatePropertySlugs(propertySlugs);
    if (validation.error || !validation.propertySlugs) {
      return res.status(400).json({ error: validation.error });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const ownerUserId = getOwnerUserId(ownerContext);

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const analysisIds = await resolveAnalysisIds(client, ownerContext.tenantId, ownerUserId, validation.propertySlugs);
    if (!analysisIds) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO saved_comparisons (user_id, tenant_id, platform, owner_user_id, name, property_slugs)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [ownerUserId, ownerContext.tenantId, ownerContext.platform, ownerUserId, name.trim(), validation.propertySlugs],
    );

    await replaceComparisonMembers(client, rows[0].id, analysisIds);

    const comparison = await getHydratedComparison(client, rows[0].id, ownerContext.tenantId, ownerUserId);
    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({ comparison });
  } catch (err: any) {
    if (transactionStarted && client) {
      await client.query('ROLLBACK');
    }
    console.error('[comparisons] POST error:', err);
    res.status(500).json({ error: 'Failed to save comparison.' });
  } finally {
    client?.release();
  }
});

// ── GET / – List saved comparisons (paginated) ──────────────────────────
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const ownerUserId = getOwnerUserId(ownerContext);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT sc.id,
                sc.name,
                COALESCE(
                  array_agg(pa.slug ORDER BY scm.position) FILTER (WHERE pa.slug IS NOT NULL),
                  ARRAY[]::text[]
                ) AS property_slugs,
                sc.created_at,
                sc.updated_at
         FROM saved_comparisons sc
         LEFT JOIN saved_comparison_members scm ON scm.comparison_id = sc.id
         LEFT JOIN property_analyses pa ON pa.id = scm.analysis_id
         WHERE sc.tenant_id = $1
           AND sc.owner_user_id = $2
         GROUP BY sc.id, sc.name, sc.created_at, sc.updated_at
         ORDER BY sc.updated_at DESC
         LIMIT $3 OFFSET $4`,
        [ownerContext.tenantId, ownerUserId, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*)
         FROM saved_comparisons
         WHERE tenant_id = $1 AND owner_user_id = $2`,
        [ownerContext.tenantId, ownerUserId],
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
    const ownerUserId = getOwnerUserId(ownerContext);

    const client = await pool.connect();
    let comparison: ComparisonResponseRow | null;
    try {
      comparison = await getHydratedComparison(client, compId, ownerContext.tenantId, ownerUserId);
    } finally {
      client.release();
    }

    if (!comparison) {
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
    const ownerUserId = getOwnerUserId(ownerContext);

    const { rowCount } = await pool.query(
      `DELETE FROM saved_comparisons
       WHERE id = $1 AND tenant_id = $2 AND owner_user_id = $3`,
      [compId, ownerContext.tenantId, ownerUserId],
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
  let client: PoolClient | undefined;
  let transactionStarted = false;
  try {
    const compId = parseInt(req.params.id, 10);

    if (isNaN(compId)) {
      return res.status(400).json({ error: 'Invalid comparison ID.' });
    }

    const { propertySlugs } = req.body;

    const validation = validatePropertySlugs(propertySlugs);
    if (validation.error || !validation.propertySlugs) {
      return res.status(400).json({ error: validation.error });
    }

    const ownerContext = await buildAssetDashboardOwnerContext(req);
    const ownerUserId = getOwnerUserId(ownerContext);

    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const analysisIds = await resolveAnalysisIds(client, ownerContext.tenantId, ownerUserId, validation.propertySlugs);
    if (!analysisIds) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ error: 'One or more property slugs are invalid.' });
    }

    const { rows, rowCount } = await client.query<{ id: number }>(
      `UPDATE saved_comparisons
       SET property_slugs = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
         AND tenant_id = $3
         AND owner_user_id = $4
       RETURNING id`,
      [validation.propertySlugs, compId, ownerContext.tenantId, ownerUserId],
    );

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Comparison not found.' });
    }

    await replaceComparisonMembers(client, compId, analysisIds);

    const comparison = await getHydratedComparison(client, rows[0].id, ownerContext.tenantId, ownerUserId);
    await client.query('COMMIT');
    transactionStarted = false;

    res.json({ comparison });
  } catch (err: any) {
    if (transactionStarted && client) {
      await client.query('ROLLBACK');
    }
    console.error('[comparisons] PATCH error:', err);
    res.status(500).json({ error: 'Failed to update comparison.' });
  } finally {
    client?.release();
  }
});

export default router;
