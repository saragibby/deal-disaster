import { randomBytes } from 'crypto';
import type { OwnerContext, PropertyAnalysis, SavedComparison } from '@deal-platform/shared-types';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { getOwnerUserId } from '../middleware/ownerContext.js';

type AnalysisRow = PropertyAnalysis & {
  tenant_id: string;
  platform: string;
  owner_user_id: number;
};

type MutableAnalysisResults = Record<string, unknown> & {
  strEstimate?: { netMonthlyRevenue?: number };
  mtrEstimate?: { netMonthlyRevenue?: number };
};

interface AnalysisSaveInput {
  slug: string;
  zillowUrl: string;
  zpid: string;
  sourceUrl: string;
  sourceType: string;
  propertyData: unknown;
  analysisParams: unknown;
  analysisResults: unknown;
  rentalComps: unknown;
}

interface AnalysisUpdateInput {
  slug: string;
  propertyData: unknown;
  analysisParams: unknown;
  analysisResults: unknown;
  rentalComps: unknown;
}

const ANALYSIS_HISTORY_COLUMNS = `
  slug, zillow_url, zpid, property_data, analysis_params,
  analysis_results, rental_comps, user_overrides, is_shared, public_share_id, created_at
`;

const SHARED_ANALYSIS_COLUMNS = `
  slug, public_share_id, property_data, analysis_params, analysis_results, rental_comps, created_at
`;

const OWNER_PREDICATE = `
  tenant_id = $1
  AND platform = $2
  AND owner_user_id = $3
`;

const ASSET_DASHBOARD_TENANT_ID = 'asset-dashboard';
const ASSET_DASHBOARD_PLATFORM = 'asset-dashboard';

function ownerPredicateValues(ownerContext: OwnerContext): [string, string, number] {
  return [ownerContext.tenantId, ownerContext.platform, getOwnerUserId(ownerContext)];
}

function generatePublicShareId(): string {
  return randomBytes(18).toString('base64url');
}

const SENSITIVE_PUBLIC_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credentials',
  'credential',
  'headers',
  'is_shared',
  'metadata',
  'oauth_id',
  'oauth_provider',
  'owner_user_id',
  'ownerid',
  'owneruserid',
  'password',
  'platformuserid',
  'permissions',
  'privatecontrols',
  'private_controls',
  'providermetadata',
  'provider_metadata',
  'rapidapikey',
  'rapidapi_key',
  'raw',
  'rawdata',
  'raw_data',
  'roles',
  'secret',
  'tenant_id',
  'tenantid',
  'token',
  'user_overrides',
  'user_id',
  'userid',
]);

function sanitizePublicValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizePublicValue);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_PUBLIC_KEYS.has(key.toLowerCase())) {
      continue;
    }

    sanitized[key] = sanitizePublicValue(nestedValue);
  }

  return sanitized;
}

export function toPublicAnalysisProjection(
  analysis: Partial<PropertyAnalysis> | null,
): Partial<PropertyAnalysis> | null {
  if (analysis == null) {
    return null;
  }

  return {
    slug: analysis.slug,
    public_share_id: analysis.public_share_id,
    property_data: sanitizePublicValue(analysis.property_data) as PropertyAnalysis['property_data'],
    analysis_params: sanitizePublicValue(analysis.analysis_params) as PropertyAnalysis['analysis_params'],
    analysis_results: sanitizePublicValue(analysis.analysis_results) as PropertyAnalysis['analysis_results'],
    rental_comps: sanitizePublicValue(analysis.rental_comps) as PropertyAnalysis['rental_comps'],
    created_at: analysis.created_at,
  };
}

async function resolveOwnedAnalysisIds(
  client: PoolClient,
  ownerContext: OwnerContext,
  propertySlugs: string[],
): Promise<number[] | null> {
  const result = await client.query<{ id: number; slug: string }>(
    `SELECT id, slug
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = ANY($4::text[])`,
    [...ownerPredicateValues(ownerContext), propertySlugs],
  );
  const idsBySlug = new Map(result.rows.map(row => [row.slug, row.id]));
  const analysisIds = propertySlugs.map(slug => idsBySlug.get(slug));

  if (analysisIds.some(id => id == null)) {
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
    'DELETE FROM saved_comparison_members WHERE comparison_id = $1',
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
  ownerContext: OwnerContext,
  id: number,
): Promise<SavedComparison | null> {
  const result = await client.query<SavedComparison>(
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
       AND sc.platform = $2
       AND sc.owner_user_id = $3
       AND sc.id = $4
     GROUP BY sc.id, sc.name, sc.created_at, sc.updated_at`,
    [...ownerPredicateValues(ownerContext), id],
  );
  return result.rows[0] ?? null;
}

export async function saveAnalysis(
  ownerContext: OwnerContext,
  input: AnalysisSaveInput,
): Promise<{ slug: string; public_share_id: string | null; created_at: string }> {
  const ownerUserId = getOwnerUserId(ownerContext);
  const result = await pool.query<{ slug: string; public_share_id: string | null; created_at: string }>(
    `INSERT INTO property_analyses
      (user_id, tenant_id, platform, owner_user_id, slug, zillow_url, zpid, source_url, source_type, property_data, analysis_params, analysis_results, rental_comps)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (user_id, slug) DO UPDATE SET
      zillow_url       = EXCLUDED.zillow_url,
      zpid             = EXCLUDED.zpid,
      tenant_id        = EXCLUDED.tenant_id,
      platform         = EXCLUDED.platform,
      owner_user_id    = EXCLUDED.owner_user_id,
      source_url       = EXCLUDED.source_url,
      source_type      = EXCLUDED.source_type,
      property_data    = EXCLUDED.property_data,
      analysis_params  = EXCLUDED.analysis_params,
      analysis_results = EXCLUDED.analysis_results,
      rental_comps     = EXCLUDED.rental_comps,
      created_at       = CURRENT_TIMESTAMP
     WHERE property_analyses.tenant_id = EXCLUDED.tenant_id
       AND property_analyses.platform = EXCLUDED.platform
       AND property_analyses.owner_user_id = EXCLUDED.owner_user_id
     RETURNING slug, public_share_id, created_at`,
    [
      ownerUserId,
      ownerContext.tenantId,
      ownerContext.platform,
      ownerUserId,
      input.slug,
      input.zillowUrl,
      input.zpid,
      input.sourceUrl,
      input.sourceType,
      JSON.stringify(input.propertyData),
      JSON.stringify(input.analysisParams),
      JSON.stringify(input.analysisResults),
      JSON.stringify(input.rentalComps),
    ],
  );

  const saved = result.rows[0];
  if (saved == null) {
    throw new Error('Analysis could not be saved for this owner context.');
  }

  return saved;
}

export async function listAnalyses(
  ownerContext: OwnerContext,
  limit: number,
  offset: number,
): Promise<{ analyses: Partial<PropertyAnalysis>[]; total: number }> {
  const ownerValues = ownerPredicateValues(ownerContext);
  const [dataResult, countResult] = await Promise.all([
    pool.query<Partial<PropertyAnalysis>>(
      `SELECT ${ANALYSIS_HISTORY_COLUMNS}
       FROM property_analyses
       WHERE ${OWNER_PREDICATE}
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [...ownerValues, limit, offset],
    ),
    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM property_analyses WHERE ${OWNER_PREDICATE}`,
      ownerValues,
    ),
  ]);

  return {
    analyses: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

export async function getAnalysisBySlug(
  ownerContext: OwnerContext,
  slug: string,
): Promise<Partial<PropertyAnalysis> | null> {
  const result = await pool.query<Partial<PropertyAnalysis>>(
    `SELECT ${ANALYSIS_HISTORY_COLUMNS}
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = $4`,
    [...ownerPredicateValues(ownerContext), slug],
  );

  return result.rows[0] ?? null;
}

export async function getAnalysisForReanalysis(
  ownerContext: OwnerContext,
  slug: string,
): Promise<AnalysisRow | null> {
  const result = await pool.query<AnalysisRow>(
    `SELECT *
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = $4`,
    [...ownerPredicateValues(ownerContext), slug],
  );

  return result.rows[0] ?? null;
}

export async function deleteAnalysisBySlug(
  ownerContext: OwnerContext,
  slug: string,
): Promise<boolean> {
  const result = await pool.query<{ slug: string }>(
    `DELETE FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = $4
     RETURNING slug`,
    [...ownerPredicateValues(ownerContext), slug],
  );

  return result.rows.length > 0;
}

export async function updateAnalysisAfterReanalysis(
  ownerContext: OwnerContext,
  input: AnalysisUpdateInput,
): Promise<{ slug: string; public_share_id: string | null; created_at: string } | null> {
  const result = await pool.query<{ slug: string; public_share_id: string | null; created_at: string }>(
    `UPDATE property_analyses
     SET property_data    = $4,
         analysis_params  = $5,
         analysis_results = $6,
         rental_comps     = $7,
         created_at       = CURRENT_TIMESTAMP
     WHERE ${OWNER_PREDICATE} AND slug = $8
     RETURNING slug, public_share_id, created_at`,
    [
      ...ownerPredicateValues(ownerContext),
      JSON.stringify(input.propertyData),
      JSON.stringify(input.analysisParams),
      JSON.stringify(input.analysisResults),
      JSON.stringify(input.rentalComps),
      input.slug,
    ],
  );

  return result.rows[0] ?? null;
}

export async function setAnalysisShared(
  ownerContext: OwnerContext,
  slug: string,
  shared: boolean,
): Promise<{ slug: string; is_shared: boolean; public_share_id: string | null } | null> {
  const publicShareId = shared ? generatePublicShareId() : null;
  const result = await pool.query<{ slug: string; is_shared: boolean; public_share_id: string | null }>(
    `UPDATE property_analyses
     SET is_shared = $4,
         public_share_id = CASE
           WHEN $4 = TRUE THEN COALESCE(public_share_id, $5)
           ELSE public_share_id
         END
     WHERE ${OWNER_PREDICATE} AND slug = $6
     RETURNING slug, is_shared, public_share_id`,
    [...ownerPredicateValues(ownerContext), shared, publicShareId, slug],
  );

  return result.rows[0] ?? null;
}

export async function getAnalysisResultsForOverrides(
  ownerContext: OwnerContext,
  slug: string,
): Promise<MutableAnalysisResults | null> {
  const result = await pool.query<{ analysis_results: MutableAnalysisResults }>(
    `SELECT analysis_results
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = $4`,
    [...ownerPredicateValues(ownerContext), slug],
  );

  return result.rows[0]?.analysis_results ?? null;
}

export async function updateAnalysisOverrides(
  ownerContext: OwnerContext,
  slug: string,
  analysisResults: unknown,
  overrides: unknown,
): Promise<boolean> {
  const result = await pool.query<{ slug: string }>(
    `UPDATE property_analyses
     SET analysis_results = $4, user_overrides = $5
     WHERE ${OWNER_PREDICATE} AND slug = $6
     RETURNING slug`,
    [
      ...ownerPredicateValues(ownerContext),
      JSON.stringify(analysisResults),
      JSON.stringify(overrides),
      slug,
    ],
  );

  return result.rows.length > 0;
}

export async function getSharedAnalysisByPublicIdentifier(identifier: string): Promise<Partial<PropertyAnalysis> | null> {
  const result = await pool.query<Partial<PropertyAnalysis>>(
    `SELECT ${SHARED_ANALYSIS_COLUMNS}
     FROM property_analyses
     WHERE tenant_id = $1
       AND platform = $2
       AND is_shared = TRUE
       AND (public_share_id = $3 OR slug = $3)
     ORDER BY CASE WHEN public_share_id = $3 THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [ASSET_DASHBOARD_TENANT_ID, ASSET_DASHBOARD_PLATFORM, identifier],
  );

  return toPublicAnalysisProjection(result.rows[0] ?? null);
}

export async function getOwnedAnalysesBySlugs(
  ownerContext: OwnerContext,
  slugs: string[],
): Promise<PropertyAnalysis[]> {
  const result = await pool.query<PropertyAnalysis>(
    `SELECT *
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = ANY($4)`,
    [...ownerPredicateValues(ownerContext), slugs],
  );

  return result.rows;
}

export async function countOwnedAnalysisSlugs(
  ownerContext: OwnerContext,
  slugs: string[],
): Promise<number> {
  const result = await pool.query<{ slug: string }>(
    `SELECT slug
     FROM property_analyses
     WHERE ${OWNER_PREDICATE} AND slug = ANY($4)`,
    [...ownerPredicateValues(ownerContext), slugs],
  );

  return result.rows.length;
}

export async function saveComparison(
  ownerContext: OwnerContext,
  name: string,
  propertySlugs: string[],
): Promise<SavedComparison> {
  const client = await pool.connect();
  const ownerUserId = getOwnerUserId(ownerContext);
  try {
    await client.query('BEGIN');
    const analysisIds = await resolveOwnedAnalysisIds(client, ownerContext, propertySlugs);
    if (analysisIds == null) {
      throw new Error('One or more property slugs are invalid for this owner context.');
    }
    const result = await client.query<{ id: number }>(
      `INSERT INTO saved_comparisons (user_id, tenant_id, platform, owner_user_id, name, property_slugs)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [ownerUserId, ownerContext.tenantId, ownerContext.platform, ownerUserId, name, propertySlugs],
    );

    await replaceComparisonMembers(client, result.rows[0].id, analysisIds);
    const comparison = await getHydratedComparison(client, ownerContext, result.rows[0].id);
    if (comparison == null) {
      throw new Error('Saved comparison could not be hydrated after creation.');
    }
    await client.query('COMMIT');

    return comparison;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listComparisons(
  ownerContext: OwnerContext,
  limit: number,
  offset: number,
): Promise<{ comparisons: SavedComparison[]; total: number }> {
  const ownerValues = ownerPredicateValues(ownerContext);
  const [dataResult, countResult] = await Promise.all([
    pool.query<SavedComparison>(
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
         AND sc.platform = $2
         AND sc.owner_user_id = $3
       GROUP BY sc.id, sc.name, sc.created_at, sc.updated_at
       ORDER BY sc.updated_at DESC
       LIMIT $4 OFFSET $5`,
      [...ownerValues, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM saved_comparisons WHERE ${OWNER_PREDICATE}`,
      ownerValues,
    ),
  ]);

  return {
    comparisons: dataResult.rows,
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function getComparisonById(
  ownerContext: OwnerContext,
  id: number,
): Promise<SavedComparison | null> {
  const client = await pool.connect();
  try {
    return await getHydratedComparison(client, ownerContext, id);
  } finally {
    client.release();
  }
}

export async function deleteComparisonById(ownerContext: OwnerContext, id: number): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM saved_comparisons
     WHERE ${OWNER_PREDICATE} AND id = $4`,
    [...ownerPredicateValues(ownerContext), id],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function updateComparisonSlugs(
  ownerContext: OwnerContext,
  id: number,
  propertySlugs: string[],
): Promise<SavedComparison | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const analysisIds = await resolveOwnedAnalysisIds(client, ownerContext, propertySlugs);
    if (analysisIds == null) {
      throw new Error('One or more property slugs are invalid for this owner context.');
    }
    const result = await client.query<{ id: number }>(
      `UPDATE saved_comparisons
       SET property_slugs = $4, updated_at = CURRENT_TIMESTAMP
       WHERE ${OWNER_PREDICATE} AND id = $5
       RETURNING id`,
      [...ownerPredicateValues(ownerContext), propertySlugs, id],
    );

    if (result.rows[0] == null) {
      await client.query('ROLLBACK');
      return null;
    }

    await replaceComparisonMembers(client, id, analysisIds);
    const comparison = await getHydratedComparison(client, ownerContext, id);
    if (comparison == null) {
      throw new Error('Saved comparison could not be hydrated after update.');
    }
    await client.query('COMMIT');

    return comparison;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
