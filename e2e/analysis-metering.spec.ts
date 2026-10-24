import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { pool } from '../server/src/db/pool';
import { ANALYSIS_CREDITS_SCHEMA } from '../server/src/db/analysisCreditsSchema';
import {
  commitAnalysis,
  createAnalysisMeteringHooks,
  expireCreditLots,
  getCreditTransactions,
  getMeteringConfig,
  getUsageHistory,
  getUsageSummary,
  grantCredits,
  nextLocalMidnight,
  refundAnalysis,
  reserveAnalysis,
  runCreditMaintenance,
  sweepStaleReservations,
  type MeteringConfig,
} from '../server/src/services/analysisMeteringService';
import { createBillingRouter } from '../server/src/routes/billing';
import { createPropertyAnalyzerRouter } from '../server/src/routes/propertyAnalyzer';
import { authenticateToken, type AuthRequest } from '../server/src/middleware/auth';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express') as typeof import('express');
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

const TENANT = 'asset-dashboard';
const createdUsers: number[] = [];

function config(overrides: Partial<MeteringConfig> = {}): MeteringConfig {
  return { mode: 'enforce', freeDailyLimit: 2, priceCents: 75, creditExpiryMonths: 12, staleReservationMs: 15 * 60 * 1000, ...overrides };
}

async function createUser(options: { admin?: boolean; timezone?: string } = {}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, email_verified, is_admin, timezone)
     VALUES ($1, 'metering-fixture', 'Metering Fixture', true, $2, $3) RETURNING id`,
    [`metering-${randomUUID()}@example.test`, options.admin === true, options.timezone ?? null],
  );
  createdUsers.push(rows[0].id);
  return rows[0].id;
}

async function lotBalances(userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ remaining_cents: number }>(
    'SELECT remaining_cents FROM credit_lots WHERE user_id = $1 ORDER BY id', [userId],
  );
  return rows.map(row => row.remaining_cents);
}

async function reserve(userId: number, cfg: MeteringConfig, now?: Date) {
  return reserveAnalysis(userId, { tenantId: TENANT, config: cfg, now });
}

test.beforeAll(async () => {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE');
  await pool.query(ANALYSIS_CREDITS_SCHEMA);
});

test.afterAll(async () => {
  if (createdUsers.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUsers]);
});

test('reads metering configuration from the environment with safe defaults', () => {
  expect(getMeteringConfig({})).toMatchObject({ mode: 'off', freeDailyLimit: 5, priceCents: 75, creditExpiryMonths: 12 });
  expect(getMeteringConfig({
    ANALYZER_METERING_MODE: 'ENFORCE', ANALYZER_FREE_DAILY_LIMIT: '3', ANALYZER_RUN_PRICE_CENTS: '50',
  })).toMatchObject({ mode: 'enforce', freeDailyLimit: 3, priceCents: 50 });
  expect(getMeteringConfig({ ANALYZER_METERING_MODE: 'bogus', ANALYZER_RUN_PRICE_CENTS: '0', ANALYZER_FREE_DAILY_LIMIT: '-1' }))
    .toMatchObject({ mode: 'off', freeDailyLimit: 5, priceCents: 75 });
});

test('computes the next local midnight across DST transitions', () => {
  expect(nextLocalMidnight(new Date('2026-03-07T12:00:00Z'), 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  expect(nextLocalMidnight(new Date('2026-03-08T12:00:00Z'), 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
  expect(nextLocalMidnight(new Date('2026-10-24T06:30:00Z'), 'America/Los_Angeles').toISOString()).toBe('2026-10-24T07:00:00.000Z');
  expect(nextLocalMidnight(new Date('2026-10-23T23:59:59Z'), 'UTC').toISOString()).toBe('2026-10-24T00:00:00.000Z');
});

test('uses free analyses first, then blocks in enforce mode', async () => {
  const userId = await createUser();
  const cfg = config();
  expect(await reserve(userId, cfg)).toMatchObject({ allowed: true, chargeType: 'free' });
  expect(await reserve(userId, cfg)).toMatchObject({ allowed: true, chargeType: 'free' });
  const blocked = await reserve(userId, cfg);
  expect(blocked.allowed).toBe(false);
  if (blocked.allowed) return;
  expect(blocked.usage).toMatchObject({
    mode: 'enforce', exempt: false, pricePerRunCents: 75, nextRunChargeCents: -1,
    today: { used: 2, freeLimit: 2, freeUsed: 2, freeRemaining: 0, paidRuns: 0 },
    credits: { balanceCents: 0, runsAvailable: 0 },
  });
});

test('spends credits after the free allowance, oldest-expiring lot first, ignoring expired lots', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 0 });
  const now = new Date();
  await grantCredits(userId, { amountCents: 500, source: 'admin_grant', expiresAt: new Date(now.getTime() - 1000), config: cfg });
  await grantCredits(userId, { amountCents: 100, source: 'admin_grant', config: cfg });
  await grantCredits(userId, { amountCents: 50, source: 'admin_grant', expiresAt: new Date(now.getTime() + 30 * 86400000), config: cfg });

  const first = await reserve(userId, cfg);
  expect(first).toMatchObject({ allowed: true, chargeType: 'credit', amountCents: 75 });
  // 50¢ lot expiring soonest is drained first, then 25¢ comes from the 12-month lot.
  expect(await lotBalances(userId)).toEqual([500, 75, 0]);

  const summary = await getUsageSummary(userId, { config: cfg });
  expect(summary.credits).toMatchObject({ balanceCents: 75, runsAvailable: 1 });
  expect(summary.nextRunChargeCents).toBe(75);
  expect(summary.today).toMatchObject({ used: 1, paidRuns: 1 });

  expect(await reserve(userId, cfg)).toMatchObject({ allowed: true, chargeType: 'credit' });
  expect((await reserve(userId, cfg)).allowed).toBe(false);
  expect(await lotBalances(userId)).toEqual([500, 0, 0]);

  const ledger = await getCreditTransactions(userId);
  expect(ledger.items.filter(item => item.type === 'usage').reduce((sum, item) => sum + item.amountCents, 0)).toBe(-150);
  expect(ledger.items.filter(item => item.type === 'admin_grant')).toHaveLength(3);
  expect(ledger.items.find(item => item.type === 'admin_grant')?.expiresAt).toBeTruthy();
});

test('refunds failed runs: free slots are released and credits are restored to their lots', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 1 });
  await grantCredits(userId, { amountCents: 75, source: 'admin_grant', config: cfg });

  const free = await reserve(userId, cfg);
  const paid = await reserve(userId, cfg);
  if (!free.allowed || !paid.allowed) throw new Error('Expected reservations');
  expect(paid.chargeType).toBe('credit');
  expect(await lotBalances(userId)).toEqual([0]);

  expect(await refundAnalysis(userId, paid.eventId)).toBe(true);
  expect(await refundAnalysis(userId, paid.eventId)).toBe(false);
  expect(await lotBalances(userId)).toEqual([75]);
  expect(await refundAnalysis(userId, free.eventId)).toBe(true);

  const summary = await getUsageSummary(userId, { config: cfg });
  expect(summary.today).toMatchObject({ used: 0, freeRemaining: 1 });
  expect(summary.credits.balanceCents).toBe(75);
  const refunds = (await getCreditTransactions(userId)).items.filter(item => item.type === 'usage_refund');
  expect(refunds).toEqual([expect.objectContaining({ amountCents: 75, description: 'Refund: analysis failed' })]);
});

test('re-running the same property on the same local day is free', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 1 });
  await grantCredits(userId, { amountCents: 300, source: 'admin_grant', config: cfg });

  const first = await reserve(userId, cfg);
  if (!first.allowed) throw new Error('Expected reservation');
  expect(await commitAnalysis(userId, first.eventId, { slug: '123-main-st-49503', address: '123 Main St' })).toBe('committed');

  const again = await reserve(userId, cfg);
  if (!again.allowed) throw new Error('Expected reservation');
  expect(again.chargeType).toBe('credit');
  expect(await commitAnalysis(userId, again.eventId, { slug: '123-main-st-49503', address: '123 Main St' })).toBe('duplicate');
  expect(await lotBalances(userId)).toEqual([300]);

  const other = await reserve(userId, cfg);
  if (!other.allowed) throw new Error('Expected reservation');
  expect(await commitAnalysis(userId, other.eventId, { slug: '9-oak-ave-49503', address: '9 Oak Ave' })).toBe('committed');
  expect(await lotBalances(userId)).toEqual([225]);

  const history = await getUsageHistory(userId, 7, {});
  expect(history.days).toHaveLength(7);
  expect(history.days[6]).toMatchObject({ free: 1, paid: 1, chargedCents: 75 });
  expect(history.recent.map(row => [row.propertyAddress, row.status, row.refundReason ?? null])).toEqual([
    ['9 Oak Ave', 'committed', null],
    ['123 Main St', 'refunded', 'duplicate-property-today'],
    ['123 Main St', 'committed', null],
  ]);
});

test('admins are exempt and never blocked', async () => {
  const userId = await createUser({ admin: true });
  const cfg = config({ freeDailyLimit: 0 });
  expect(await reserve(userId, cfg)).toMatchObject({ allowed: true, chargeType: 'exempt', amountCents: 0 });
  const summary = await getUsageSummary(userId, { config: cfg });
  expect(summary).toMatchObject({ exempt: true, nextRunChargeCents: 0 });
});

test('the daily allowance resets at midnight in the user\'s saved timezone', async () => {
  const userId = await createUser({ timezone: 'America/Los_Angeles' });
  const cfg = config({ freeDailyLimit: 1 });
  const lateOct23 = new Date('2026-10-24T06:30:00Z'); // 11:30 PM PDT, Oct 23
  const earlyOct24 = new Date('2026-10-24T07:30:00Z'); // 12:30 AM PDT, Oct 24

  expect(await reserve(userId, cfg, lateOct23)).toMatchObject({ allowed: true, chargeType: 'free' });
  const blocked = await reserve(userId, cfg, lateOct23);
  expect(blocked.allowed).toBe(false);
  if (!blocked.allowed) {
    expect(blocked.usage.today).toMatchObject({ date: '2026-10-23', resetsAt: '2026-10-24T07:00:00.000Z' });
    expect(blocked.usage.timezone).toBe('America/Los_Angeles');
  }
  expect(await reserve(userId, cfg, earlyOct24)).toMatchObject({ allowed: true, chargeType: 'free' });
});

test('first-seen browser timezone is saved, but an untrusted header cannot override it later', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 1 });
  await reserveAnalysis(userId, { tenantId: TENANT, config: cfg, timezoneHint: 'America/Chicago' });
  const { rows } = await pool.query('SELECT timezone FROM users WHERE id = $1', [userId]);
  expect(rows[0].timezone).toBe('America/Chicago');

  const blocked = await reserveAnalysis(userId, { tenantId: TENANT, config: cfg, timezoneHint: 'Pacific/Kiritimati' });
  expect(blocked.allowed).toBe(false);
  await reserveAnalysis(userId, { tenantId: TENANT, config: cfg, timezoneHint: 'Not/AZone' });
  expect((await pool.query('SELECT timezone FROM users WHERE id = $1', [userId])).rows[0].timezone).toBe('America/Chicago');
});

test('concurrent reservations never overspend free analyses or credits', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 2 });
  await grantCredits(userId, { amountCents: 150, source: 'admin_grant', config: cfg });

  const results = await Promise.all(Array.from({ length: 8 }, () => reserve(userId, cfg)));
  const allowed = results.filter(result => result.allowed);
  expect(allowed).toHaveLength(4);
  expect(allowed.filter(result => result.allowed && result.chargeType === 'free')).toHaveLength(2);
  expect(allowed.filter(result => result.allowed && result.chargeType === 'credit')).toHaveLength(2);
  expect(await lotBalances(userId)).toEqual([0]);
});

test('shadow mode records would-be blocks without blocking', async () => {
  const userId = await createUser();
  const cfg = config({ mode: 'shadow', freeDailyLimit: 0 });
  const result = await reserve(userId, cfg);
  expect(result).toMatchObject({ allowed: true, chargeType: 'free', wouldBlock: true });
  const { rows } = await pool.query('SELECT would_block FROM analysis_usage_events WHERE user_id = $1', [userId]);
  expect(rows).toEqual([{ would_block: true }]);
  expect((await getUsageSummary(userId, { config: cfg })).nextRunChargeCents).toBe(0);
});

test('abandoned reservations are refunded by the sweeper', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 0 });
  await grantCredits(userId, { amountCents: 75, source: 'admin_grant', config: cfg });
  const result = await reserve(userId, cfg);
  if (!result.allowed) throw new Error('Expected reservation');
  await pool.query("UPDATE analysis_usage_events SET created_at = now() - interval '1 hour' WHERE id = $1", [result.eventId]);

  expect(await sweepStaleReservations(cfg)).toBeGreaterThanOrEqual(1);
  expect(await lotBalances(userId)).toEqual([75]);
  const { rows } = await pool.query('SELECT status, refund_reason FROM analysis_usage_events WHERE id = $1', [result.eventId]);
  expect(rows[0]).toEqual({ status: 'refunded', refund_reason: 'stale' });
  expect(await commitAnalysis(userId, result.eventId, { slug: 'late' })).toBe('missing');
});

test('expired credit is zeroed with an expiration ledger entry and re-running is a no-op', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 0 });
  const now = new Date();
  await grantCredits(userId, { amountCents: 300, source: 'admin_grant', expiresAt: new Date(now.getTime() + 86400000), config: cfg });
  await grantCredits(userId, { amountCents: 200, source: 'admin_grant', expiresAt: new Date(now.getTime() + 2 * 86400000), config: cfg });
  expect(await reserve(userId, cfg)).toMatchObject({ allowed: true, chargeType: 'credit' });
  expect(await lotBalances(userId)).toEqual([225, 200]);

  const later = new Date(now.getTime() + 1.5 * 86400000);
  const first = await expireCreditLots(later);
  expect(first.lots).toBeGreaterThanOrEqual(1);
  expect(first.cents).toBeGreaterThanOrEqual(225);
  expect(await lotBalances(userId)).toEqual([0, 200]);
  expect(await expireCreditLots(later)).toEqual({ lots: 0, cents: 0 });

  const summary = await getUsageSummary(userId, { config: cfg, now: later });
  expect(summary.credits.balanceCents).toBe(200);
  const ledger = await getCreditTransactions(userId);
  const expirations = ledger.items.filter(item => item.type === 'expiration');
  expect(expirations).toHaveLength(1);
  expect(expirations[0].amountCents).toBe(-225);
  expect(ledger.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(200);
});

test('credit maintenance sweeps stale reservations before expiring credit', async () => {
  const userId = await createUser();
  const cfg = config({ freeDailyLimit: 0 });
  await grantCredits(userId, { amountCents: 75, source: 'admin_grant', expiresAt: new Date(Date.now() + 60_000), config: cfg });
  const result = await reserve(userId, cfg);
  if (!result.allowed) throw new Error('Expected reservation');
  await pool.query("UPDATE analysis_usage_events SET created_at = now() - interval '1 hour' WHERE id = $1", [result.eventId]);

  const summary = await runCreditMaintenance(new Date(Date.now() + 120_000));
  expect(summary.staleRefunded).toBeGreaterThanOrEqual(1);
  expect(summary.expiredLots).toBeGreaterThanOrEqual(1);
  expect(await lotBalances(userId)).toEqual([0]);
  const ledger = await getCreditTransactions(userId);
  expect(ledger.items.map(item => item.type).sort()).toEqual(['admin_grant', 'expiration', 'usage', 'usage_refund']);
  expect(ledger.items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(0);
});

test('runtime hooks return 402 with usage when blocked and are a no-op when metering is off', async () => {
  const userId = await createUser();
  const original = { ...process.env };
  try {
    process.env.ANALYZER_METERING_MODE = 'off';
    const hooks = createAnalysisMeteringHooks(TENANT);
    const req = { userId, headers: { 'x-user-timezone': 'America/New_York' } } as unknown as AuthRequest;
    const off = await hooks.reserve(req);
    expect(off.allowed).toBe(true);
    expect((await pool.query('SELECT 1 FROM analysis_usage_events WHERE user_id = $1', [userId])).rows).toHaveLength(0);

    process.env.ANALYZER_METERING_MODE = 'enforce';
    process.env.ANALYZER_FREE_DAILY_LIMIT = '1';
    const allowed = await hooks.reserve(req);
    if (!allowed.allowed) throw new Error('Expected allowed');
    const usage = await allowed.ticket.commit({ slug: 'hook-slug', address: '1 Hook St' });
    expect(usage?.today).toMatchObject({ used: 1, freeRemaining: 0 });

    const blocked = await hooks.reserve(req);
    expect(blocked).toMatchObject({
      allowed: false, status: 402,
      body: { code: 'ANALYSIS_LIMIT_REACHED', usage: { nextRunChargeCents: -1, timezone: 'America/New_York' } },
    });
  } finally {
    process.env = original;
  }
});

test('billing routes require auth and return summary, usage, transactions and timezone updates', async () => {
  const userId = await createUser({ timezone: 'UTC' });
  const original = { ...process.env };
  process.env.JWT_SECRET = 'metering-fixture-secret';
  process.env.ANALYZER_METERING_MODE = 'enforce';
  process.env.ANALYZER_FREE_DAILY_LIMIT = '5';
  await grantCredits(userId, { amountCents: 600, source: 'admin_grant', description: 'Welcome credit' });

  const app = express();
  app.use(express.json());
  app.use('/api/billing', createBillingRouter());
  const server: Server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api/billing`;
  const headers = { Authorization: `Bearer ${jwt.sign({ userId }, 'metering-fixture-secret')}`, 'Content-Type': 'application/json' };
  try {
    expect((await fetch(`${base}/summary`)).status).toBe(401);

    const summaryResponse = await fetch(`${base}/summary`, { headers });
    expect(summaryResponse.headers.get('cache-control')).toBe('private, no-store');
    expect(await summaryResponse.json()).toMatchObject({
      mode: 'enforce', timezone: 'UTC', today: { freeLimit: 5, freeRemaining: 5 },
      credits: { balanceCents: 600, runsAvailable: 8 }, nextRunChargeCents: 0,
    });

    expect((await fetch(`${base}/usage?days=0`, { headers })).status).toBe(400);
    expect((await fetch(`${base}/usage?days=91`, { headers })).status).toBe(400);
    const usage = await (await fetch(`${base}/usage?days=14`, { headers })).json();
    expect(usage.days).toHaveLength(14);

    const transactions = await (await fetch(`${base}/transactions?limit=10`, { headers })).json();
    expect(transactions.items).toEqual([expect.objectContaining({ type: 'admin_grant', amountCents: 600, description: 'Welcome credit' })]);
    expect((await fetch(`${base}/transactions?cursor=abc`, { headers })).status).toBe(400);

    expect((await fetch(`${base}/timezone`, { method: 'PUT', headers, body: JSON.stringify({ timezone: 'Mars/Base' }) })).status).toBe(400);
    const changed = await fetch(`${base}/timezone`, { method: 'PUT', headers, body: JSON.stringify({ timezone: 'America/Denver' }) });
    expect(await changed.json()).toEqual({ timezone: 'America/Denver' });
    const tooSoon = await fetch(`${base}/timezone`, { method: 'PUT', headers, body: JSON.stringify({ timezone: 'America/Phoenix' }) });
    expect(tooSoon.status).toBe(429);
    expect((await (await fetch(`${base}/summary`, { headers })).json()).timezone).toBe('America/Denver');
  } finally {
    await new Promise(resolve => server.close(resolve));
    process.env = original;
  }
});

test('POST /analyzer/run blocks before provider calls and refunds credits when the run fails', async () => {
  const userId = await createUser({ timezone: 'UTC' });
  const original = { ...process.env };
  const originalFetch = globalThis.fetch;
  process.env.JWT_SECRET = 'metering-run-secret';
  process.env.RAPIDAPI_KEY = 'metering-fixture-key';
  process.env.ANALYZER_METERING_MODE = 'enforce';
  process.env.ANALYZER_FREE_DAILY_LIMIT = '0';

  const app = express();
  app.use(express.json());
  app.use('/analyzer', createPropertyAnalyzerRouter({
    auth: {
      requireAuth: authenticateToken,
      optionalAuth: authenticateToken,
      buildOwnerContext: async () => ({
        actorUserId: String(userId), ownerUserId: String(userId), tenantId: TENANT, platform: 'asset-dashboard',
        roles: ['user'], permissions: ['analysis:read', 'analysis:write'],
      }),
    },
    config: { platform: 'asset-dashboard', tenantId: TENANT },
    metering: createAnalysisMeteringHooks(TENANT),
  }));
  const server: Server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  const root = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/analyzer`;
  const headers = { Authorization: `Bearer ${jwt.sign({ userId }, 'metering-run-secret')}`, 'Content-Type': 'application/json' };
  let providerCalls = 0;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).startsWith(root)) return originalFetch(input, init);
    providerCalls++;
    return new Response('provider unavailable', { status: 500 });
  }) as typeof fetch;
  try {
    const body = JSON.stringify({ url: '123 Metering St, Grand Rapids, MI 49503' });
    const blocked = await fetch(`${root}/run`, { method: 'POST', headers, body });
    expect(blocked.status).toBe(402);
    expect(await blocked.json()).toMatchObject({
      code: 'ANALYSIS_LIMIT_REACHED', usage: { nextRunChargeCents: -1, credits: { balanceCents: 0 } },
    });
    expect(providerCalls).toBe(0);

    expect((await fetch(`${root}/run`, { method: 'POST', headers, body: '{}' })).status).toBe(400);

    await grantCredits(userId, { amountCents: 75, source: 'admin_grant' });
    const failed = await fetch(`${root}/run`, { method: 'POST', headers, body });
    expect(failed.status).toBeGreaterThanOrEqual(500);
    expect(providerCalls).toBeGreaterThan(0);
    expect(await lotBalances(userId)).toEqual([75]);
    const { rows } = await pool.query(
      'SELECT charge_type, status, refund_reason FROM analysis_usage_events WHERE user_id = $1', [userId],
    );
    expect(rows).toEqual([{ charge_type: 'credit', status: 'refunded', refund_reason: 'failed' }]);
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    process.env = original;
  }
});
