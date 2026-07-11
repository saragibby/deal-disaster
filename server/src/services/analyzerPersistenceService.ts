import type { OwnerContext, PropertyAnalysis, SavedComparison } from '@deal-platform/shared-types';
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
  analysis_results, rental_comps, user_overrides, is_shared, created_at
`;

const SHARED_ANALYSIS_COLUMNS = `
  slug, property_data, analysis_params, analysis_results, rental_comps, created_at
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

export async function saveAnalysis(
  ownerContext: OwnerContext,
  input: AnalysisSaveInput,
): Promise<{ slug: string; created_at: string }> {
  const ownerUserId = getOwnerUserId(ownerContext);
  const result = await pool.query<{ slug: string; created_at: string }>(
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
     RETURNING slug, created_at`,
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
): Promise<{ slug: string; created_at: string } | null> {
  const result = await pool.query<{ slug: string; created_at: string }>(
    `UPDATE property_analyses
     SET property_data    = $4,
         analysis_params  = $5,
         analysis_results = $6,
         rental_comps     = $7,
         created_at       = CURRENT_TIMESTAMP
     WHERE ${OWNER_PREDICATE} AND slug = $8
     RETURNING slug, created_at`,
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
): Promise<{ slug: string; is_shared: boolean } | null> {
  const result = await pool.query<{ slug: string; is_shared: boolean }>(
    `UPDATE property_analyses
     SET is_shared = $4
     WHERE ${OWNER_PREDICATE} AND slug = $5
     RETURNING slug, is_shared`,
    [...ownerPredicateValues(ownerContext), shared, slug],
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

export async function getSharedAnalysisBySlug(slug: string): Promise<Partial<PropertyAnalysis> | null> {
  const result = await pool.query<Partial<PropertyAnalysis>>(
    `SELECT ${SHARED_ANALYSIS_COLUMNS}
     FROM property_analyses
     WHERE tenant_id = $1
       AND platform = $2
       AND slug = $3
       AND is_shared = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [ASSET_DASHBOARD_TENANT_ID, ASSET_DASHBOARD_PLATFORM, slug],
  );

  return result.rows[0] ?? null;
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
  const ownerUserId = getOwnerUserId(ownerContext);
  const result = await pool.query<SavedComparison>(
    `INSERT INTO saved_comparisons (user_id, tenant_id, platform, owner_user_id, name, property_slugs)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, property_slugs, created_at, updated_at`,
    [ownerUserId, ownerContext.tenantId, ownerContext.platform, ownerUserId, name, propertySlugs],
  );

  return result.rows[0];
}

export async function listComparisons(
  ownerContext: OwnerContext,
  limit: number,
  offset: number,
): Promise<{ comparisons: SavedComparison[]; total: number }> {
  const ownerValues = ownerPredicateValues(ownerContext);
  const [dataResult, countResult] = await Promise.all([
    pool.query<SavedComparison>(
      `SELECT id, name, property_slugs, created_at, updated_at
       FROM saved_comparisons
       WHERE ${OWNER_PREDICATE}
       ORDER BY updated_at DESC
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
  const result = await pool.query<SavedComparison>(
    `SELECT id, name, property_slugs, created_at, updated_at
     FROM saved_comparisons
     WHERE ${OWNER_PREDICATE} AND id = $4`,
    [...ownerPredicateValues(ownerContext), id],
  );

  return result.rows[0] ?? null;
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
  const result = await pool.query<SavedComparison>(
    `UPDATE saved_comparisons
     SET property_slugs = $4, updated_at = CURRENT_TIMESTAMP
     WHERE ${OWNER_PREDICATE} AND id = $5
     RETURNING id, name, property_slugs, created_at, updated_at`,
    [...ownerPredicateValues(ownerContext), propertySlugs, id],
  );

  return result.rows[0] ?? null;
}
