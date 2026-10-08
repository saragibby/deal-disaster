import type { AnalysisScenario, AnalysisScenarioInput, OwnerContext } from '@deal-platform/shared-types';
import { DEFAULT_ANALYSIS_PARAMS } from '@deal-platform/shared-types';
import { pool } from '../db/pool.js';
import { getOwnerUserId } from '../middleware/ownerContext.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the snapshot before persisting any client-controlled assumptions. */
export function isScenarioInput(value: unknown): value is AnalysisScenarioInput {
  if (!isObject(value) || typeof value.name !== 'string' ||
    value.name.trim().length === 0 || value.name.trim().length > 100) return false;
  const overrides = value.overrides;
  if (!isObject(overrides) || !['ltr', 'mtr', 'str'].includes(String(overrides.selectedStrategy))) return false;
  const params = overrides.params;
  const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!isObject(params) || !Object.keys(DEFAULT_ANALYSIS_PARAMS).every(key => nonnegative(params[key])) ||
    !Object.values(params).every(nonnegative)) return false;
  const allowedParams = new Set([
    ...Object.keys(DEFAULT_ANALYSIS_PARAMS), 'furnishingCost', 'applianceCost',
    'furnishingLifeYears', 'furnitureRepairMonthly', 'cleaningMonthly',
  ]);
  if (Object.keys(params).some(key => !allowedParams.has(key))) return false;
  if (Number(params.loanTermYears) <= 0 || Number(params.downPaymentPct) > 100 ||
    ['vacancyPct', 'repairsPct', 'capexPct', 'managementPct', 'costSegPct', 'taxRate']
      .some(key => Number(params[key]) > 100)) return false;
  for (const key of ['mtrRevenue', 'strRevenue', 'furniture', 'appliances']) {
    if (overrides[key] != null && !nonnegative(overrides[key])) return false;
  }
  if (overrides.depreciationMethod != null && !['full', 'straight'].includes(String(overrides.depreciationMethod))) return false;
  if (overrides.operating != null && (!isObject(overrides.operating) ||
    !Object.entries(overrides.operating).every(([key, amount]) =>
      /^(mtr|str):(utilities|turnover|platform|management|furnishing|cleaning)$/.test(key) && nonnegative(amount)
    ))) return false;
  const metrics = value.metrics;
  if (!isObject(metrics) || !['purchasePrice', 'monthlyIncome', 'monthlyCashFlow', 'totalCashInvested', 'cashOnCashROI', 'capRate']
    .every(key => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]))) return false;
  return Number(metrics.purchasePrice) > 0 && Number(metrics.monthlyIncome) >= 0 && Number(metrics.totalCashInvested) >= 0;
}

const scope = (owner: OwnerContext, slug: string) => [
  owner.tenantId, owner.platform, getOwnerUserId(owner), slug,
];
const ownerFilter = 'pa.tenant_id = $1 AND pa.platform = $2 AND pa.owner_user_id = $3 AND pa.slug = $4';

export async function listScenarios(owner: OwnerContext, slug: string): Promise<AnalysisScenario[]> {
  const result = await pool.query<AnalysisScenario>(
    `SELECT s.id, s.name, s.overrides, s.metrics, s.created_at AS "createdAt"
     FROM analysis_scenarios s JOIN property_analyses pa ON pa.id = s.analysis_id
     WHERE ${ownerFilter} ORDER BY s.created_at, s.id`,
    scope(owner, slug),
  );
  return result.rows;
}

export async function saveScenario(owner: OwnerContext, slug: string, input: AnalysisScenarioInput): Promise<AnalysisScenario | null> {
  const result = await pool.query<AnalysisScenario>(
    `INSERT INTO analysis_scenarios (analysis_id, name, overrides, metrics)
     SELECT pa.id, $5, $6::jsonb, $7::jsonb FROM property_analyses pa WHERE ${ownerFilter}
     RETURNING id, name, overrides, metrics, created_at AS "createdAt"`,
    [...scope(owner, slug), input.name.trim(), JSON.stringify(input.overrides), JSON.stringify(input.metrics)],
  );
  return result.rows[0] ?? null;
}

export async function deleteScenario(owner: OwnerContext, slug: string, id: number): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM analysis_scenarios s USING property_analyses pa
     WHERE pa.id = s.analysis_id AND ${ownerFilter} AND s.id = $5 RETURNING s.id`,
    [...scope(owner, slug), id],
  );
  return result.rows.length > 0;
}
