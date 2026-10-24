import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type StripeType from 'stripe';
import { pool } from '../server/src/db/pool';
import { ANALYSIS_CREDITS_SCHEMA } from '../server/src/db/analysisCreditsSchema';
import { getUsageSummary, reserveAnalysis, type MeteringConfig } from '../server/src/services/analysisMeteringService';
import { getCreditPackages, STRIPE_METADATA_SOURCE } from '../server/src/services/billingService';
import { createBillingRouter, createStripeWebhookRouter } from '../server/src/routes/billing';
import { resetRateLimits } from '../server/src/middleware/rateLimit';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express') as typeof import('express');
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
const Stripe = require('stripe') as typeof StripeType;

const WEBHOOK_SECRET = 'whsec_billing_fixture';
const JWT_SECRET = 'billing-fixture-secret';
const stripe = new Stripe('sk_test_billing_fixture');
const createdUsers: number[] = [];
const servers: Server[] = [];

async function createUser(options: { admin?: boolean } = {}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (email, password_hash, name, email_verified, is_admin)
     VALUES ($1, 'billing-fixture', 'Billing Fixture', true, $2) RETURNING id`,
    [`billing-${randomUUID()}@example.test`, options.admin === true],
  );
  createdUsers.push(rows[0].id);
  return rows[0].id;
}

async function listen(app: import('express').Express): Promise<string> {
  const server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  return `http://127.0.0.1:${address.port}`;
}

function authHeaders(userId: number) {
  return { Authorization: `Bearer ${jwt.sign({ userId }, JWT_SECRET)}`, 'Content-Type': 'application/json' };
}

function checkoutSession(userId: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `cs_test_${randomUUID().replace(/-/g, '')}`,
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    client_reference_id: String(userId),
    payment_intent: `pi_${randomUUID().replace(/-/g, '')}`,
    metadata: { source: STRIPE_METADATA_SOURCE, userId: String(userId), packageId: 'credits_6', creditCents: '600' },
    ...overrides,
  };
}

function stripeEvent(type: string, object: Record<string, unknown>, id = `evt_${randomUUID().replace(/-/g, '')}`) {
  return { id, object: 'event', type, data: { object } };
}

async function webhookServer(): Promise<string> {
  const app = express();
  app.use('/webhook', createStripeWebhookRouter({ getStripe: () => stripe, getWebhookSecret: () => WEBHOOK_SECRET }));
  return listen(app);
}

async function sendWebhook(baseUrl: string, event: unknown, signatureSecret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signatureSecret });
  return fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    body: payload,
  });
}

async function purchaseLots(userId: number) {
  const { rows } = await pool.query<{ original_cents: number; remaining_cents: number; refunded_cents: number }>(
    `SELECT original_cents, remaining_cents, refunded_cents FROM credit_lots
      WHERE user_id = $1 AND source = 'purchase' ORDER BY id`,
    [userId],
  );
  return rows;
}

test.beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE');
  await pool.query(ANALYSIS_CREDITS_SCHEMA);
});

test.afterAll(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  if (createdUsers.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUsers]);
});

test('defines the $6 / $15 / $30 credit packages', async () => {
  expect(getCreditPackages(75).map(pkg => [pkg.id, pkg.priceCents, pkg.creditCents, pkg.runs])).toEqual([
    ['credits_6', 600, 600, 8],
    ['credits_15', 1500, 1500, 20],
    ['credits_30', 3000, 3000, 40],
  ]);

  const app = express();
  app.use(express.json());
  app.use('/billing', createBillingRouter({ getStripe: () => null }));
  const baseUrl = await listen(app);
  const body = await (await fetch(`${baseUrl}/billing/packages`)).json();
  expect(body.purchasesEnabled).toBe(false);
  expect(body.packages).toHaveLength(3);
});

test('creates a checkout session for a valid package and reuses the Stripe customer', async () => {
  resetRateLimits();
  const userId = await createUser();
  const customerCalls: unknown[] = [];
  const sessionCalls: Array<Record<string, any>> = [];
  const fakeStripe = {
    customers: {
      create: async (params: unknown) => {
        customerCalls.push(params);
        return { id: `cus_${randomUUID().replace(/-/g, '')}` };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, any>) => {
          sessionCalls.push(params);
          return { id: 'cs_test_fixture', url: 'https://checkout.stripe.test/session' };
        },
      },
    },
  } as unknown as StripeType;

  const app = express();
  app.use(express.json());
  app.use('/billing', createBillingRouter({ getStripe: () => fakeStripe }));
  app.use('/disabled', createBillingRouter({ getStripe: () => null }));
  const baseUrl = await listen(app);

  const invalid = await fetch(`${baseUrl}/billing/checkout`, {
    method: 'POST', headers: authHeaders(userId), body: JSON.stringify({ packageId: 'credits_1000' }),
  });
  expect(invalid.status).toBe(400);

  const disabled = await fetch(`${baseUrl}/disabled/checkout`, {
    method: 'POST', headers: authHeaders(userId), body: JSON.stringify({ packageId: 'credits_6' }),
  });
  expect(disabled.status).toBe(503);

  for (const packageId of ['credits_15', 'credits_6']) {
    const response = await fetch(`${baseUrl}/billing/checkout`, {
      method: 'POST', headers: authHeaders(userId), body: JSON.stringify({ packageId }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessionId: 'cs_test_fixture', url: 'https://checkout.stripe.test/session' });
  }

  expect(customerCalls).toHaveLength(1);
  expect(customerCalls[0]).toMatchObject({ metadata: { userId: String(userId), source: STRIPE_METADATA_SOURCE } });
  const { rows } = await pool.query<{ stripe_customer_id: string }>('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  expect(rows[0].stripe_customer_id).toMatch(/^cus_/);
  expect(sessionCalls[0]).toMatchObject({
    mode: 'payment',
    customer: rows[0].stripe_customer_id,
    client_reference_id: String(userId),
    metadata: { source: STRIPE_METADATA_SOURCE, userId: String(userId), packageId: 'credits_15', creditCents: '1500' },
    invoice_creation: { enabled: true },
  });
  expect(sessionCalls[0].line_items[0].price_data.unit_amount).toBe(1500);
  expect(sessionCalls[0].line_items[0].price_data.product_data.tax_code).toBe('txcd_10103001');
  expect(sessionCalls[0].success_url).toContain('/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}');
  expect(sessionCalls[1].customer).toBe(rows[0].stripe_customer_id);
});

test('rejects webhooks with an invalid signature', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  const response = await sendWebhook(baseUrl, stripeEvent('checkout.session.completed', checkoutSession(userId)), 'whsec_wrong');
  expect(response.status).toBe(400);
  expect(await purchaseLots(userId)).toEqual([]);

  const unsigned = await fetch(`${baseUrl}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  expect(unsigned.status).toBe(400);
});

test('grants purchased credits exactly once per checkout session', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  const session = checkoutSession(userId, { metadata: { source: STRIPE_METADATA_SOURCE, userId: String(userId), packageId: 'credits_15', creditCents: '1500' } });
  const event = stripeEvent('checkout.session.completed', session);

  const first = await sendWebhook(baseUrl, event);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ received: true, outcome: 'processed' });

  const replay = await sendWebhook(baseUrl, event);
  expect(await replay.json()).toEqual({ received: true, outcome: 'duplicate' });

  // A different event for the same session (e.g. async success) must not double-grant.
  await sendWebhook(baseUrl, stripeEvent('checkout.session.async_payment_succeeded', session));

  expect(await purchaseLots(userId)).toEqual([{ original_cents: 1500, remaining_cents: 1500, refunded_cents: 0 }]);
  const summary = await getUsageSummary(userId);
  expect(summary.credits).toMatchObject({ balanceCents: 1500, runsAvailable: 20 });
});

test('waits for async payments before granting credits', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  const session = checkoutSession(userId, { payment_status: 'unpaid' });

  await sendWebhook(baseUrl, stripeEvent('checkout.session.completed', session));
  expect(await purchaseLots(userId)).toEqual([]);

  await sendWebhook(baseUrl, stripeEvent('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' }));
  expect(await purchaseLots(userId)).toHaveLength(1);
});

test('ignores sessions whose metadata does not match the purchaser', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  const otherUserId = await createUser();
  const response = await sendWebhook(baseUrl, stripeEvent('checkout.session.completed',
    checkoutSession(userId, { client_reference_id: String(otherUserId) })));
  expect(await response.json()).toMatchObject({ outcome: 'ignored' });
  expect(await purchaseLots(userId)).toEqual([]);
  expect(await purchaseLots(otherUserId)).toEqual([]);
});

test('ignores payments from other products sharing the Stripe account', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  // Same shape as our checkout, but created by another product on the account.
  const foreign = checkoutSession(userId, { metadata: { userId: String(userId), packageId: 'credits_6', creditCents: '600' } });
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_failed'] as const) {
    const response = await sendWebhook(baseUrl, stripeEvent(type, foreign));
    expect(await response.json()).toMatchObject({ outcome: 'ignored' });
  }
  const refund = await sendWebhook(baseUrl, stripeEvent('charge.refunded', {
    id: `ch_${randomUUID()}`, object: 'charge', payment_intent: `pi_${randomUUID()}`, amount_refunded: 600,
  }));
  expect(await refund.json()).toMatchObject({ outcome: 'ignored' });
  const dispute = await sendWebhook(baseUrl, stripeEvent('charge.dispute.created', {
    id: `dp_${randomUUID()}`, object: 'dispute', charge: `ch_${randomUUID()}`, payment_intent: `pi_${randomUUID()}`,
  }));
  expect(await dispute.json()).toMatchObject({ outcome: 'ignored' });
  expect(await purchaseLots(userId)).toEqual([]);
});

test('claws back only unused credit when a purchase is refunded', async () => {
  const baseUrl = await webhookServer();
  const userId = await createUser();
  const session = checkoutSession(userId);
  await sendWebhook(baseUrl, stripeEvent('checkout.session.completed', session));

  const cfg: MeteringConfig = { mode: 'enforce', freeDailyLimit: 0, priceCents: 75, creditExpiryMonths: 12, staleReservationMs: 15 * 60 * 1000 };
  const reservation = await reserveAnalysis(userId, { tenantId: 'asset-dashboard', config: cfg });
  expect(reservation).toMatchObject({ allowed: true, chargeType: 'credit' });

  const charge = { id: 'ch_fixture', object: 'charge', payment_intent: session.payment_intent, amount: 600 };
  await sendWebhook(baseUrl, stripeEvent('charge.refunded', { ...charge, amount_refunded: 200 }));
  expect(await purchaseLots(userId)).toEqual([{ original_cents: 600, remaining_cents: 325, refunded_cents: 200 }]);

  // Stripe reports cumulative refunds; a later full refund only removes what's left.
  await sendWebhook(baseUrl, stripeEvent('charge.refunded', { ...charge, amount_refunded: 600 }));
  await sendWebhook(baseUrl, stripeEvent('charge.refunded', { ...charge, amount_refunded: 600 }));
  expect(await purchaseLots(userId)).toEqual([{ original_cents: 600, remaining_cents: 0, refunded_cents: 600 }]);

  const { rows } = await pool.query<{ amount_cents: number }>(
    `SELECT amount_cents FROM credit_ledger WHERE user_id = $1 AND entry_type = 'stripe_refund' ORDER BY id`, [userId],
  );
  expect(rows.map(row => row.amount_cents)).toEqual([-200, -325]);
});

test('reports checkout status only to the purchaser and fulfils paid sessions on lookup', async () => {
  const userId = await createUser();
  const otherUserId = await createUser();
  const paid = checkoutSession(userId);
  const open = checkoutSession(userId, { status: 'open', payment_status: 'unpaid' });
  const sessions = new Map([[paid.id, paid], [open.id, open]]);
  const fakeStripe = {
    checkout: { sessions: { retrieve: async (id: string) => sessions.get(id) } },
  } as unknown as StripeType;

  const app = express();
  app.use(express.json());
  app.use('/billing', createBillingRouter({ getStripe: () => fakeStripe }));
  const baseUrl = await listen(app);

  expect((await fetch(`${baseUrl}/billing/checkout/not-a-session`, { headers: authHeaders(userId) })).status).toBe(400);
  expect((await fetch(`${baseUrl}/billing/checkout/${paid.id}`, { headers: authHeaders(otherUserId) })).status).toBe(404);

  const pending = await fetch(`${baseUrl}/billing/checkout/${open.id}`, { headers: authHeaders(userId) });
  expect(await pending.json()).toEqual({ status: 'pending' });

  const credited = await fetch(`${baseUrl}/billing/checkout/${paid.id}`, { headers: authHeaders(userId) });
  expect(await credited.json()).toEqual({ status: 'credited', creditCents: 600 });
  expect(await purchaseLots(userId)).toHaveLength(1);

  expect((await fetch(`${baseUrl}/billing/checkout/${paid.id}`, { headers: authHeaders(otherUserId) })).status).toBe(404);
});

test('lets admins grant credits and view a user\'s billing', async () => {
  const adminId = await createUser({ admin: true });
  const userId = await createUser();
  const app = express();
  app.use(express.json());
  app.use('/billing', createBillingRouter({ getStripe: () => null }));
  const baseUrl = await listen(app);
  const grant = (actor: number, body: unknown) => fetch(`${baseUrl}/billing/admin/users/${userId}/credits`, {
    method: 'POST', headers: authHeaders(actor), body: JSON.stringify(body),
  });

  expect((await grant(userId, { amountCents: 300, reason: 'self-serve' })).status).toBe(403);
  expect((await grant(adminId, { amountCents: 0, reason: 'nope' })).status).toBe(400);
  expect((await grant(adminId, { amountCents: 300 })).status).toBe(400);
  expect((await grant(adminId, { amountCents: 300, reason: 'x', expiresInMonths: 99 })).status).toBe(400);

  const granted = await grant(adminId, { amountCents: 300, reason: 'Support goodwill', expiresInMonths: 1 });
  expect(granted.status).toBe(201);
  expect((await granted.json()).usage.credits.balanceCents).toBe(300);

  const { rows } = await pool.query<{ entry_type: string; created_by: number; description: string }>(
    'SELECT entry_type, created_by, description FROM credit_ledger WHERE user_id = $1', [userId],
  );
  expect(rows).toEqual([{ entry_type: 'admin_grant', created_by: adminId, description: 'Credit grant: Support goodwill' }]);

  const view = await fetch(`${baseUrl}/billing/admin/users/${userId}`, { headers: authHeaders(adminId) });
  const body = await view.json();
  expect(body).toMatchObject({ userId, usage: { credits: { balanceCents: 300 } } });
  expect(body.transactions).toHaveLength(1);
  expect((await fetch(`${baseUrl}/billing/admin/users/${userId}`, { headers: authHeaders(userId) })).status).toBe(403);
});
