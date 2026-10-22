import { Pool } from 'pg';
import type { ProviderUsageReport, ProviderUsageWorkflowRow, ProviderUsageEndpointRow, ProviderUsageUserRow } from '@deal-platform/shared-types';
import { pool } from '../db/pool.js';
import type { ProviderUsageSummary } from './providerUsageService.js';

export const USAGE_RETENTION_DAYS = 90;
const reportingPool = new Pool({
  ...pool.options, max: 1, connectionTimeoutMillis: 2000,
  statement_timeout: 5000, query_timeout: 6000, allowExitOnIdle: true,
});
reportingPool.on('error', () => console.error('[provider:reporting] Idle database connection failed'));

type UsageDatabase = Pick<Pool, 'query'>;

export function createUsageRecorder(db: UsageDatabase, enabled: () => boolean, maxPending = 100) {
  let pending = 0;
  let nextPrune = 0;
  let tail = Promise.resolve();
  return {
    record(summary: ProviderUsageSummary): void {
      if (!enabled()) return;
      if (pending >= maxPending) {
        console.error('[provider:reporting] Queue full; usage record dropped');
        return;
      }
      // Serialize before queuing so a caller cannot mutate an accepted record.
      const { requestId, occurredAt, workflow, outcome } = summary;
      const payload = JSON.stringify(usageProjection(summary));
      pending++;
      tail = tail.then(async () => {
        await db.query(
          `INSERT INTO provider_usage_events(request_id, occurred_at, workflow, outcome, summary)
           VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (request_id) DO NOTHING`,
          [requestId, occurredAt, workflow, outcome, payload],
        );
        if (Date.now() >= nextPrune) {
          await pruneProviderUsage(db);
          nextPrune = Date.now() + 60 * 60 * 1000;
        }
      }).catch(() => {
        // Existing structured logs remain the fallback; never fail an analysis for telemetry.
        console.error('[provider:reporting] Usage persistence/retention failed; consult provider:usage logs');
      }).finally(() => { pending--; });
    },
    flush: () => tail,
  };
}

const recorder = createUsageRecorder(reportingPool, () => process.env.PROVIDER_USAGE_REPORTING_ENABLED === 'true');
export const persistProviderUsage = recorder.record;

export function usageProjection(summary: ProviderUsageSummary): ProviderUsageSummary {
  return {
    ...(summary.actor ? { actor: {
      kind: summary.actor.kind, platform: summary.actor.platform,
      tenantId: summary.actor.tenantId, userId: summary.actor.userId,
    } } : {}),
    schemaVersion: summary.schemaVersion, pricingVersion: summary.pricingVersion,
    requestId: summary.requestId, parentRequestId: summary.parentRequestId,
    occurredAt: summary.occurredAt, workflow: summary.workflow, outcome: summary.outcome,
    durationMs: summary.durationMs, attempts: summary.attempts,
    estimatedCostUsd: summary.estimatedCostUsd, unknownCostAttempts: summary.unknownCostAttempts,
    pendingAttempts: summary.pendingAttempts, costBasis: summary.costBasis,
    configuration: {
      marketCache: summary.configuration.marketCache, propertyCache: summary.configuration.propertyCache,
      rentMode: summary.configuration.rentMode, rentCastRate: summary.configuration.rentCastRate,
    },
    endpoints: summary.endpoints.map(row => ({
      provider: row.provider, operation: row.operation, attempts: row.attempts,
      httpResponses: { ...row.httpResponses }, networkErrors: row.networkErrors,
      pendingAttempts: row.pendingAttempts, headerLatencyMs: row.headerLatencyMs,
      cache: { ...row.cache }, fallbacks: { ...row.fallbacks },
      estimatedCostUsd: row.estimatedCostUsd, unknownCostAttempts: row.unknownCostAttempts,
      rentCastBillableCandidates: row.rentCastBillableCandidates,
    })),
  };
}

export async function pruneProviderUsage(db: UsageDatabase = reportingPool): Promise<number> {
  const result = await db.query(
    `DELETE FROM provider_usage_events WHERE request_id IN (
      SELECT request_id FROM provider_usage_events
      WHERE occurred_at < NOW() - INTERVAL '90 days'
      ORDER BY occurred_at LIMIT 10000
    )`,
  );
  return result.rowCount ?? 0;
}

export async function getProviderUsageReport(
  from: string, to: string, workflow?: string, db: UsageDatabase = reportingPool,
): Promise<ProviderUsageReport> {
  const params = [from, to, workflow ?? null];
  const filtered = `SELECT * FROM provider_usage_events
    WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
      AND occurred_at >= NOW() - INTERVAL '90 days'`;
  // One statement gives all report sections a consistent snapshot.
  const { rows } = await db.query<{
    workflows: ProviderUsageWorkflowRow[];
    endpoints: ProviderUsageEndpointRow[];
    users: ProviderUsageUserRow[];
    dailyAnalyses: ProviderUsageReport['dailyAnalyses'];
  }>(`WITH period_events AS (${filtered}),
    events AS (SELECT * FROM period_events WHERE $3::text IS NULL OR workflow = $3),
    daily_analyses AS (
      SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE outcome <> 'complete')::int AS "failedRequests"
      FROM period_events WHERE workflow = 'analysis' GROUP BY day
    ),
    workflows AS (
      SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        workflow, summary->'configuration' AS configuration,
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE outcome <> 'complete')::int AS "failedRequests",
        COALESCE(SUM((summary->>'attempts')::int), 0)::int AS attempts,
        COALESCE(SUM((summary->>'estimatedCostUsd')::numeric), 0)::float8 AS "estimatedCostUsd",
        COALESCE(SUM((summary->>'unknownCostAttempts')::int), 0)::int AS "unknownCostAttempts",
        COALESCE(SUM((summary->>'pendingAttempts')::int), 0)::int AS "pendingAttempts"
      FROM events GROUP BY day, workflow, summary->'configuration'
    ), actors AS (
      SELECT COALESCE(summary->'actor'->>'kind', 'unattributed') AS attribution,
        summary->'actor'->>'platform' AS platform, summary->'actor'->>'tenantId' AS "tenantId",
        (summary->'actor'->>'userId')::int AS "userId",
        COUNT(*)::int AS requests,
        COUNT(*) FILTER (WHERE outcome <> 'complete')::int AS "failedRequests",
        SUM((summary->>'attempts')::int)::int AS attempts,
        SUM((summary->>'estimatedCostUsd')::numeric)::float8 AS "estimatedCostUsd",
        SUM((summary->>'unknownCostAttempts')::int)::int AS "unknownCostAttempts",
        SUM((summary->>'pendingAttempts')::int)::int AS "pendingAttempts",
        SUM(rc.attempts)::int AS "rentCastAttempts",
        SUM(rc.candidates)::int AS "rentCastBillableCandidates",
        SUM(rc.cost)::float8 AS "rentCastEstimatedCostUsd"
      FROM events CROSS JOIN LATERAL (
        SELECT COALESCE(SUM((p->>'attempts')::int),0) AS attempts,
          COALESCE(SUM((p->>'rentCastBillableCandidates')::int),0) AS candidates,
          COALESCE(SUM((p->>'estimatedCostUsd')::numeric),0) AS cost
        FROM jsonb_array_elements(summary->'endpoints') p WHERE p->>'provider' = 'rentcast'
      ) rc
      GROUP BY attribution, platform, "tenantId", "userId"
    ), actor_names AS (
      SELECT a.*, u.name FROM actors a LEFT JOIN users u ON a.attribution = 'authenticated'
        AND a.platform IN ('asset-dashboard', 'investor-lab') AND u.id = a."userId"
    ), endpoints AS (
      SELECT e.workflow, p->>'provider' AS provider, p->>'operation' AS operation,
        SUM((p->>'attempts')::int)::int AS attempts,
        SUM((p->>'estimatedCostUsd')::numeric)::float8 AS "estimatedCostUsd",
        SUM((p->>'unknownCostAttempts')::int)::int AS "unknownCostAttempts",
        SUM((p->>'networkErrors')::int)::int AS "networkErrors",
        SUM(COALESCE((p->'cache'->>'memory:hit')::int, 0))::int AS "memoryHits",
        SUM(COALESCE((p->'cache'->>'postgres:hit')::int, 0))::int AS "postgresHits",
        SUM((SELECT COALESCE(SUM(value::int),0) FROM jsonb_each_text(p->'cache') WHERE key LIKE '%:miss'))::int AS "cacheMisses",
        SUM((SELECT COALESCE(SUM(value::int),0) FROM jsonb_each_text(p->'cache') WHERE key LIKE '%:error'))::int AS "cacheErrors",
        SUM((SELECT COALESCE(SUM(value::int),0) FROM jsonb_each_text(p->'httpResponses') WHERE key::int >= 400))::int AS "httpErrors",
        SUM((SELECT COALESCE(SUM(value::int),0) FROM jsonb_each_text(p->'fallbacks')))::int AS fallbacks
      FROM events e CROSS JOIN LATERAL jsonb_array_elements(e.summary->'endpoints') p
      GROUP BY e.workflow, p->>'provider', p->>'operation'
    )
    SELECT COALESCE((SELECT jsonb_agg(w ORDER BY day, workflow) FROM workflows w), '[]'::jsonb) AS workflows,
      COALESCE((SELECT jsonb_agg(p ORDER BY provider, operation, workflow) FROM endpoints p), '[]'::jsonb) AS endpoints,
      COALESCE((SELECT jsonb_agg(a ORDER BY "rentCastAttempts" DESC, attempts DESC, platform, "tenantId", "userId") FROM actor_names a), '[]'::jsonb) AS users,
      COALESCE((SELECT jsonb_agg(d ORDER BY day) FROM daily_analyses d), '[]'::jsonb) AS "dailyAnalyses"`,
  params);
  const data = rows[0];
  const totals = data.workflows.reduce((sum, row) => ({
    requests: sum.requests + row.requests,
    failedRequests: sum.failedRequests + row.failedRequests,
    attempts: sum.attempts + row.attempts,
    estimatedCostUsd: sum.estimatedCostUsd + row.estimatedCostUsd,
    unknownCostAttempts: sum.unknownCostAttempts + row.unknownCostAttempts,
    pendingAttempts: sum.pendingAttempts + row.pendingAttempts,
  }), { requests: 0, failedRequests: 0, attempts: 0, estimatedCostUsd: 0, unknownCostAttempts: 0, pendingAttempts: 0 });
  return {
    enabled: process.env.PROVIDER_USAGE_REPORTING_ENABLED === 'true',
    retentionDays: USAGE_RETENTION_DAYS, from, to, totals, ...data,
  };
}
