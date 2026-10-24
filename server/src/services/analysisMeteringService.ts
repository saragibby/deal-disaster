/**
 * Analysis Metering Service
 *
 * Enforces the daily free-analysis allowance and prepaid credit balance for
 * new property analyses. Every metered run is reserved before provider calls,
 * then committed on success or refunded on failure. A user's reservations are
 * serialized by locking their `users` row, so concurrent requests can never
 * overspend the allowance or the credit balance.
 */

import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type {
  AnalysisChargeType,
  AnalysisMeteringMode,
  AnalysisUsageDay,
  AnalysisUsageHistory,
  AnalysisUsageRecord,
  AnalysisUsageSummary,
  CreditTransaction,
  CreditTransactionPage,
  CreditTransactionType,
} from '@deal-platform/shared-types';
import { ANALYSIS_LIMIT_REACHED } from '@deal-platform/shared-types';
import { pool } from '../db/pool.js';
import { formatDateInTimezone } from '../utils/dateUtils.js';
import type { AuthRequest } from '../middleware/auth.js';
import type { AnalyzerMeteringHooks, AnalyzerMeteringTicket } from '../analyzer/backend.js';
import { getProviderUsageRequestId } from './providerUsageService.js';

// ── Configuration ────────────────────────────────────────────────────────

export interface MeteringConfig {
  mode: AnalysisMeteringMode;
  freeDailyLimit: number;
  priceCents: number;
  creditExpiryMonths: number;
  staleReservationMs: number;
}

function intFromEnv(value: string | undefined, fallback: number, min: number): number {
  const parsed = value?.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : fallback;
}

export function getMeteringConfig(env: NodeJS.ProcessEnv = process.env): MeteringConfig {
  const rawMode = env.ANALYZER_METERING_MODE?.trim().toLowerCase();
  const mode: AnalysisMeteringMode = rawMode === 'shadow' || rawMode === 'enforce' ? rawMode : 'off';
  return {
    mode,
    freeDailyLimit: intFromEnv(env.ANALYZER_FREE_DAILY_LIMIT, 5, 0),
    priceCents: intFromEnv(env.ANALYZER_RUN_PRICE_CENTS, 75, 1),
    creditExpiryMonths: intFromEnv(env.CREDIT_EXPIRY_MONTHS, 12, 1),
    staleReservationMs: 15 * 60 * 1000,
  };
}

// ── Timezone helpers ─────────────────────────────────────────────────────

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function timezoneOffsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of the next local midnight in `timezone` (DST-aware). */
export function nextLocalMidnight(now: Date, timezone: string): Date {
  const [y, m, d] = formatDateInTimezone(now, timezone).split('-').map(Number);
  const target = Date.UTC(y, m - 1, d + 1);
  let instant = target - timezoneOffsetMs(target, timezone);
  instant = target - timezoneOffsetMs(instant, timezone);
  return new Date(instant);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function resolveTimezone(stored: string | null, hint?: string): string {
  if (isValidTimezone(stored)) return stored;
  if (isValidTimezone(hint)) return hint;
  return 'UTC';
}

// ── Transaction plumbing ─────────────────────────────────────────────────

type Queryable = Pick<PoolClient, 'query'>;

interface LockedUser {
  id: number;
  is_admin: boolean | null;
  timezone: string | null;
}

export class MeteringUserNotFoundError extends Error {
  constructor() {
    super('User not found.');
  }
}

async function withUserLock<T>(userId: number, fn: (client: PoolClient, user: LockedUser) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<LockedUser>(
      'SELECT id, is_admin, timezone FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (!rows[0]) throw new MeteringUserNotFoundError();
    const result = await fn(client, rows[0]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Refunds ──────────────────────────────────────────────────────────────

async function refundEventTx(client: Queryable, eventId: string, reason: string): Promise<boolean> {
  const { rows } = await client.query<{ user_id: number; charge_type: AnalysisChargeType }>(
    `UPDATE analysis_usage_events
        SET status = 'refunded', refund_reason = $2, settled_at = now()
      WHERE id = $1 AND status IN ('reserved', 'committed')
      RETURNING user_id, charge_type`,
    [eventId, reason],
  );
  const event = rows[0];
  if (!event) return false;
  if (event.charge_type !== 'credit') return true;

  const debits = await client.query<{ lot_id: string; cents: number }>(
    `SELECT lot_id, -SUM(amount_cents)::int AS cents
       FROM credit_ledger
      WHERE usage_event_id = $1 AND lot_id IS NOT NULL
      GROUP BY lot_id
     HAVING SUM(amount_cents) < 0`,
    [eventId],
  );
  for (const debit of debits.rows) {
    await client.query('UPDATE credit_lots SET remaining_cents = remaining_cents + $2 WHERE id = $1', [debit.lot_id, debit.cents]);
    await client.query(
      `INSERT INTO credit_ledger (user_id, lot_id, entry_type, amount_cents, usage_event_id, description)
       VALUES ($1, $2, 'usage_refund', $3, $4, $5)`,
      [event.user_id, debit.lot_id, debit.cents, eventId, refundDescription(reason)],
    );
  }
  return true;
}

function refundDescription(reason: string): string {
  if (reason === 'duplicate-property-today') return 'Refund: property already analyzed today';
  if (reason === 'stale') return 'Refund: analysis did not complete';
  return 'Refund: analysis failed';
}

async function sweepUserStaleReservations(client: Queryable, userId: number, config: MeteringConfig): Promise<void> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM analysis_usage_events
      WHERE user_id = $1 AND status = 'reserved'
        AND created_at < now() - ($2::int * interval '1 millisecond')`,
    [userId, config.staleReservationMs],
  );
  for (const row of rows) await refundEventTx(client, row.id, 'stale');
}

/** Refund every abandoned reservation (e.g. after a process crash). Returns the number refunded. */
export async function sweepStaleReservations(config: MeteringConfig = getMeteringConfig()): Promise<number> {
  const { rows } = await pool.query<{ user_id: number }>(
    `SELECT DISTINCT user_id FROM analysis_usage_events
      WHERE status = 'reserved' AND created_at < now() - ($1::int * interval '1 millisecond')`,
    [config.staleReservationMs],
  );
  let refunded = 0;
  for (const { user_id } of rows) {
    await withUserLock(user_id, async (client) => {
      const before = await client.query<{ count: string }>(
        `SELECT COUNT(*) FROM analysis_usage_events
          WHERE user_id = $1 AND status = 'reserved' AND created_at < now() - ($2::int * interval '1 millisecond')`,
        [user_id, config.staleReservationMs],
      );
      await sweepUserStaleReservations(client, user_id, config);
      refunded += Number(before.rows[0].count);
    });
  }
  return refunded;
}

// ── Summary ──────────────────────────────────────────────────────────────

async function buildSummary(
  q: Queryable, user: LockedUser, timezone: string, now: Date, config: MeteringConfig,
): Promise<AnalysisUsageSummary> {
  const date = formatDateInTimezone(now, timezone);
  const counts = await q.query<{ used: string; free_used: string; paid: string }>(
    `SELECT COUNT(*) AS used,
            COUNT(*) FILTER (WHERE charge_type = 'free') AS free_used,
            COUNT(*) FILTER (WHERE charge_type = 'credit') AS paid
       FROM analysis_usage_events
      WHERE user_id = $1 AND usage_date = $2 AND status IN ('reserved', 'committed')`,
    [user.id, date],
  );
  const lots = await q.query<{ remaining_cents: number; expires_at: Date }>(
    `SELECT remaining_cents, expires_at FROM credit_lots
      WHERE user_id = $1 AND remaining_cents > 0 AND expires_at > $2
      ORDER BY expires_at, id`,
    [user.id, now],
  );

  const exempt = user.is_admin === true;
  const freeUsed = Number(counts.rows[0].free_used);
  const freeRemaining = Math.max(0, config.freeDailyLimit - freeUsed);
  const balanceCents = lots.rows.reduce((sum, lot) => sum + lot.remaining_cents, 0);
  const next = lots.rows[0];

  let nextRunChargeCents = 0;
  if (config.mode !== 'off' && !exempt && freeRemaining === 0) {
    if (balanceCents >= config.priceCents) nextRunChargeCents = config.priceCents;
    else if (config.mode === 'enforce') nextRunChargeCents = -1;
  }

  return {
    mode: config.mode,
    timezone,
    exempt,
    pricePerRunCents: config.priceCents,
    today: {
      date,
      used: Number(counts.rows[0].used),
      freeLimit: config.freeDailyLimit,
      freeUsed,
      freeRemaining,
      paidRuns: Number(counts.rows[0].paid),
      resetsAt: nextLocalMidnight(now, timezone).toISOString(),
    },
    credits: {
      balanceCents,
      runsAvailable: Math.floor(balanceCents / config.priceCents),
      ...(next ? { nextExpiration: { cents: next.remaining_cents, expiresAt: next.expires_at.toISOString() } } : {}),
    },
    nextRunChargeCents,
  };
}

export interface MeteringOptions {
  timezoneHint?: string;
  now?: Date;
  config?: MeteringConfig;
}

export async function getUsageSummary(userId: number, options: MeteringOptions = {}): Promise<AnalysisUsageSummary> {
  const config = options.config ?? getMeteringConfig();
  const { rows } = await pool.query<LockedUser>('SELECT id, is_admin, timezone FROM users WHERE id = $1', [userId]);
  if (!rows[0]) throw new MeteringUserNotFoundError();
  const timezone = resolveTimezone(rows[0].timezone, options.timezoneHint);
  return buildSummary(pool, rows[0], timezone, options.now ?? new Date(), config);
}

// ── Reserve / commit / refund ────────────────────────────────────────────

export type ReserveResult =
  | { allowed: true; eventId: string; chargeType: AnalysisChargeType; amountCents: number; wouldBlock: boolean }
  | { allowed: false; usage: AnalysisUsageSummary };

export interface ReserveOptions extends MeteringOptions {
  tenantId: string;
  eventId?: string;
}

export async function reserveAnalysis(userId: number, options: ReserveOptions): Promise<ReserveResult> {
  const config = options.config ?? getMeteringConfig();
  const now = options.now ?? new Date();
  const eventId = options.eventId && UUID_PATTERN.test(options.eventId) ? options.eventId : randomUUID();

  return withUserLock(userId, async (client, user) => {
    await sweepUserStaleReservations(client, userId, config);

    const timezone = resolveTimezone(user.timezone, options.timezoneHint);
    if (!user.timezone && timezone !== 'UTC') {
      // First-seen browser timezone becomes the account's reset timezone. Later
      // changes go through the rate-limited timezone endpoint.
      await client.query('UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS NULL', [userId, timezone]);
      user.timezone = timezone;
    }
    const usageDate = formatDateInTimezone(now, timezone);

    const insertEvent = (chargeType: AnalysisChargeType, amountCents: number, wouldBlock = false) => client.query(
      `INSERT INTO analysis_usage_events
         (id, user_id, tenant_id, usage_date, charge_type, amount_cents, status, would_block, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7, $8)`,
      [eventId, userId, options.tenantId, usageDate, chargeType, amountCents, wouldBlock, now],
    );

    if (user.is_admin === true) {
      await insertEvent('exempt', 0);
      return { allowed: true, eventId, chargeType: 'exempt', amountCents: 0, wouldBlock: false } as const;
    }

    const free = await client.query<{ count: string }>(
      `SELECT COUNT(*) FROM analysis_usage_events
        WHERE user_id = $1 AND usage_date = $2 AND charge_type = 'free' AND status IN ('reserved', 'committed')`,
      [userId, usageDate],
    );
    if (Number(free.rows[0].count) < config.freeDailyLimit) {
      await insertEvent('free', 0);
      return { allowed: true, eventId, chargeType: 'free', amountCents: 0, wouldBlock: false } as const;
    }

    const lots = await client.query<{ id: string; remaining_cents: number }>(
      `SELECT id, remaining_cents FROM credit_lots
        WHERE user_id = $1 AND remaining_cents > 0 AND expires_at > $2
        ORDER BY expires_at, id
        FOR UPDATE`,
      [userId, now],
    );
    const balance = lots.rows.reduce((sum, lot) => sum + lot.remaining_cents, 0);
    if (balance >= config.priceCents) {
      await insertEvent('credit', config.priceCents);
      let remaining = config.priceCents;
      for (const lot of lots.rows) {
        if (remaining === 0) break;
        const take = Math.min(lot.remaining_cents, remaining);
        remaining -= take;
        await client.query('UPDATE credit_lots SET remaining_cents = remaining_cents - $2 WHERE id = $1', [lot.id, take]);
        await client.query(
          `INSERT INTO credit_ledger (user_id, lot_id, entry_type, amount_cents, usage_event_id, description, created_at)
           VALUES ($1, $2, 'usage', $3, $4, 'Property analysis', $5)`,
          [userId, lot.id, -take, eventId, now],
        );
      }
      return { allowed: true, eventId, chargeType: 'credit', amountCents: config.priceCents, wouldBlock: false } as const;
    }

    if (config.mode !== 'enforce') {
      await insertEvent('free', 0, true);
      return { allowed: true, eventId, chargeType: 'free', amountCents: 0, wouldBlock: true } as const;
    }

    return { allowed: false, usage: await buildSummary(client, user, timezone, now, config) } as const;
  });
}

export async function commitAnalysis(
  userId: number, eventId: string, details: { slug?: string; address?: string } = {},
): Promise<'committed' | 'duplicate' | 'missing'> {
  return withUserLock(userId, async (client) => {
    const { rows } = await client.query<{ usage_date: string; charge_type: AnalysisChargeType }>(
      `UPDATE analysis_usage_events
          SET status = 'committed', property_slug = $3, property_address = $4, settled_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'reserved'
        RETURNING usage_date::text, charge_type`,
      [eventId, userId, details.slug ?? null, details.address ?? null],
    );
    const event = rows[0];
    if (!event) return 'missing';
    if (!details.slug || event.charge_type === 'exempt') return 'committed';

    const duplicate = await client.query(
      `SELECT 1 FROM analysis_usage_events
        WHERE user_id = $1 AND usage_date = $2 AND property_slug = $3 AND id <> $4
          AND status = 'committed' AND charge_type <> 'exempt'
        LIMIT 1`,
      [userId, event.usage_date, details.slug, eventId],
    );
    if (duplicate.rows.length === 0) return 'committed';
    await refundEventTx(client, eventId, 'duplicate-property-today');
    return 'duplicate';
  });
}

export async function refundAnalysis(userId: number, eventId: string, reason = 'failed'): Promise<boolean> {
  return withUserLock(userId, (client) => refundEventTx(client, eventId, reason));
}

// ── Credits ──────────────────────────────────────────────────────────────

export interface GrantCreditsInput {
  amountCents: number;
  source: 'purchase' | 'admin_grant';
  description?: string;
  expiresAt?: Date;
  createdBy?: number;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  now?: Date;
  config?: MeteringConfig;
}

export async function grantCredits(userId: number, input: GrantCreditsInput): Promise<{ lotId: string; expiresAt: string }> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('Credit amount must be a positive number of cents.');
  }
  const config = input.config ?? getMeteringConfig();
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth() + config.creditExpiryMonths, now.getUTCDate(),
    now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
  ));

  return withUserLock(userId, async (client) => {
    const lot = await client.query<{ id: string }>(
      `INSERT INTO credit_lots
         (user_id, source, original_cents, remaining_cents, expires_at, stripe_checkout_session_id, stripe_payment_intent_id, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, input.source, input.amountCents, expiresAt, input.stripeCheckoutSessionId ?? null,
        input.stripePaymentIntentId ?? null, now],
    );
    await client.query(
      `INSERT INTO credit_ledger (user_id, lot_id, entry_type, amount_cents, description, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, lot.rows[0].id, input.source, input.amountCents,
        input.description ?? (input.source === 'purchase' ? 'Credit purchase' : 'Credit grant'),
        input.createdBy ?? null, now],
    );
    return { lotId: lot.rows[0].id, expiresAt: expiresAt.toISOString() };
  });
}

// ── History ──────────────────────────────────────────────────────────────

export async function getUsageHistory(
  userId: number, days: number, options: MeteringOptions = {},
): Promise<AnalysisUsageHistory> {
  const { rows: users } = await pool.query<LockedUser>('SELECT id, is_admin, timezone FROM users WHERE id = $1', [userId]);
  if (!users[0]) throw new MeteringUserNotFoundError();
  const timezone = resolveTimezone(users[0].timezone, options.timezoneHint);
  const today = formatDateInTimezone(options.now ?? new Date(), timezone);
  const start = addDays(today, -(days - 1));

  const daily = await pool.query<{ date: string; free: string; paid: string; exempt: string; charged: string }>(
    `SELECT usage_date::text AS date,
            COUNT(*) FILTER (WHERE charge_type = 'free') AS free,
            COUNT(*) FILTER (WHERE charge_type = 'credit') AS paid,
            COUNT(*) FILTER (WHERE charge_type = 'exempt') AS exempt,
            COALESCE(SUM(amount_cents), 0) AS charged
       FROM analysis_usage_events
      WHERE user_id = $1 AND status = 'committed' AND usage_date BETWEEN $2 AND $3
      GROUP BY usage_date`,
    [userId, start, today],
  );
  const byDate = new Map(daily.rows.map(row => [row.date, row]));
  const dayRows: AnalysisUsageDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const row = byDate.get(date);
    dayRows.push({
      date,
      free: Number(row?.free ?? 0),
      paid: Number(row?.paid ?? 0),
      exempt: Number(row?.exempt ?? 0),
      chargedCents: Number(row?.charged ?? 0),
    });
  }

  const recent = await pool.query<{
    id: string; created_at: Date; usage_date: string; property_address: string | null; property_slug: string | null;
    charge_type: AnalysisChargeType; amount_cents: number; status: 'committed' | 'refunded'; refund_reason: string | null;
  }>(
    `SELECT id, created_at, usage_date::text, property_address, property_slug, charge_type, amount_cents, status, refund_reason
       FROM analysis_usage_events
      WHERE user_id = $1 AND status IN ('committed', 'refunded')
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId],
  );

  return {
    days: dayRows,
    recent: recent.rows.map((row): AnalysisUsageRecord => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      usageDate: row.usage_date,
      chargeType: row.charge_type,
      amountCents: row.amount_cents,
      status: row.status,
      ...(row.property_address ? { propertyAddress: row.property_address } : {}),
      ...(row.property_slug ? { propertySlug: row.property_slug } : {}),
      ...(row.refund_reason ? { refundReason: row.refund_reason } : {}),
    })),
  };
}

export async function getCreditTransactions(
  userId: number, options: { cursor?: string; limit?: number } = {},
): Promise<CreditTransactionPage> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const cursor = options.cursor && /^\d+$/.test(options.cursor) ? options.cursor : null;
  const { rows } = await pool.query<{
    id: string; created_at: Date; entry_type: CreditTransactionType; amount_cents: number;
    description: string | null; expires_at: Date | null;
  }>(
    `SELECT l.id, l.created_at, l.entry_type, l.amount_cents, l.description,
            CASE WHEN l.entry_type IN ('purchase', 'admin_grant') THEN lot.expires_at END AS expires_at
       FROM credit_ledger l
       LEFT JOIN credit_lots lot ON lot.id = l.lot_id
      WHERE l.user_id = $1 AND ($2::bigint IS NULL OR l.id < $2::bigint)
      ORDER BY l.id DESC
      LIMIT $3`,
    [userId, cursor, limit + 1],
  );
  const page = rows.slice(0, limit);
  return {
    items: page.map((row): CreditTransaction => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      type: row.entry_type,
      amountCents: row.amount_cents,
      ...(row.description ? { description: row.description } : {}),
      ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
    })),
    ...(rows.length > limit ? { nextCursor: page[page.length - 1].id } : {}),
  };
}

// ── Analyzer runtime hooks (Asset Dashboard) ─────────────────────────────

const NOOP_TICKET: AnalyzerMeteringTicket = {
  commit: async () => undefined,
  refund: async () => undefined,
};

function timezoneHeader(req: AuthRequest): string | undefined {
  const value = req.headers['x-user-timezone'];
  return typeof value === 'string' ? value : undefined;
}

export function createAnalysisMeteringHooks(tenantId: string): AnalyzerMeteringHooks {
  return {
    async reserve(req) {
      const config = getMeteringConfig();
      const userId = req.userId;
      if (config.mode === 'off' || userId == null) return { allowed: true, ticket: NOOP_TICKET };
      const timezoneHint = timezoneHeader(req);

      let reservation: ReserveResult;
      try {
        reservation = await reserveAnalysis(userId, {
          tenantId, timezoneHint, config, eventId: getProviderUsageRequestId(),
        });
      } catch (error) {
        console.error('[metering] Reservation failed:', error instanceof Error ? error.message : 'unknown error');
        if (config.mode === 'enforce') {
          return {
            allowed: false, status: 503,
            body: { error: 'Unable to verify your analysis allowance right now. Please try again.' },
          };
        }
        return { allowed: true, ticket: NOOP_TICKET };
      }

      if (!reservation.allowed) {
        return {
          allowed: false, status: 402,
          body: { error: 'Daily analysis limit reached.', code: ANALYSIS_LIMIT_REACHED, usage: reservation.usage },
        };
      }
      const { eventId } = reservation;
      if (reservation.wouldBlock) {
        console.info('[metering:would-block]', JSON.stringify({ eventId, freeDailyLimit: config.freeDailyLimit }));
      }

      return {
        allowed: true,
        ticket: {
          async commit(details) {
            try {
              await commitAnalysis(userId, eventId, details);
              return await getUsageSummary(userId, { timezoneHint, config });
            } catch (error) {
              console.error('[metering] Commit failed:', error instanceof Error ? error.message : 'unknown error');
              return undefined;
            }
          },
          async refund(reason) {
            try {
              await refundAnalysis(userId, eventId, reason);
            } catch (error) {
              console.error('[metering] Refund failed:', error instanceof Error ? error.message : 'unknown error');
            }
          },
        },
      };
    },
  };
}
