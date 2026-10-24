/**
 * Billing & Usage Routes
 *
 * GET /api/billing/summary       – today's analysis usage, credit balance, next-run charge
 * GET /api/billing/usage         – per-day usage (?days=1..90, default 30) + recent analyses
 * GET /api/billing/transactions  – credit ledger (?cursor=&limit=)
 * PUT /api/billing/timezone      – set the timezone used for the daily reset (once per 24h)
 *
 * GET  /api/billing/packages             – credit packages and whether purchases are enabled
 * POST /api/billing/checkout             – start a Stripe Checkout Session ({ packageId })
 * GET  /api/billing/checkout/:sessionId  – pending | credited | failed | expired
 * POST /api/billing/webhook              – Stripe webhook (raw body; see createStripeWebhookRouter)
 *
 * GET  /api/billing/admin/users/:id          – a user's usage + recent credit activity (admin)
 * POST /api/billing/admin/users/:id/credits  – grant credits ({ amountCents, reason, expiresInMonths? }) (admin)
 */

import express, { Router, Request, Response } from 'express';
import type Stripe from 'stripe';
import type { AdminUserBilling } from '@deal-platform/shared-types';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { isRateLimited } from '../middleware/rateLimit.js';
import { pool } from '../db/pool.js';
import {
  MeteringUserNotFoundError,
  getCreditTransactions,
  getUsageHistory,
  getUsageSummary,
  grantCredits,
  isValidTimezone,
} from '../services/analysisMeteringService.js';
import {
  BillingNotConfiguredError,
  CheckoutNotFoundError,
  constructStripeEvent,
  createCreditCheckout,
  findCreditPackage,
  getCheckoutStatus,
  getCreditPackageList,
  getStripeClient,
  handleStripeEvent,
} from '../services/billingService.js';

export interface BillingRouterDeps {
  getStripe?: () => Stripe | null;
  getWebhookSecret?: () => string | undefined;
}

const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]{1,200}$/;
const MAX_ADMIN_GRANT_CENTS = 100_000;

const TIMEZONE_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function timezoneHint(req: AuthRequest): string | undefined {
  const value = req.headers['x-user-timezone'];
  return typeof value === 'string' ? value : undefined;
}

function sendError(res: Response, error: unknown, label: string) {
  if (error instanceof MeteringUserNotFoundError) return res.status(404).json({ error: 'User not found' });
  if (error instanceof CheckoutNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof BillingNotConfiguredError) return res.status(503).json({ error: error.message });
  console.error(`[billing:${label}]`, error instanceof Error ? error.message : 'unknown error');
  return res.status(500).json({ error: 'Unable to load billing information.' });
}

export function createBillingRouter(deps: BillingRouterDeps = {}): Router {
  const router = Router();
  const getStripe = deps.getStripe ?? (() => getStripeClient());

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });

  router.get('/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      res.json(await getUsageSummary(req.userId!, { timezoneHint: timezoneHint(req) }));
    } catch (error) {
      sendError(res, error, 'summary');
    }
  });

  router.get('/usage', authenticateToken, async (req: AuthRequest, res: Response) => {
    const rawDays = req.query.days ?? '30';
    const days = typeof rawDays === 'string' && /^\d+$/.test(rawDays) ? Number(rawDays) : NaN;
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      return res.status(400).json({ error: 'days must be a whole number between 1 and 90.' });
    }
    try {
      res.json(await getUsageHistory(req.userId!, days, { timezoneHint: timezoneHint(req) }));
    } catch (error) {
      sendError(res, error, 'usage');
    }
  });

  router.get('/transactions', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { cursor, limit } = req.query;
    if (cursor !== undefined && (typeof cursor !== 'string' || !/^\d+$/.test(cursor))) {
      return res.status(400).json({ error: 'Invalid cursor.' });
    }
    if (limit !== undefined && (typeof limit !== 'string' || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) {
      return res.status(400).json({ error: 'limit must be a whole number between 1 and 100.' });
    }
    try {
      res.json(await getCreditTransactions(req.userId!, {
        cursor: cursor as string | undefined,
        limit: limit === undefined ? undefined : Number(limit),
      }));
    } catch (error) {
      sendError(res, error, 'transactions');
    }
  });

  router.put('/timezone', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { timezone } = req.body ?? {};
    if (!isValidTimezone(timezone)) {
      return res.status(400).json({ error: 'Please choose a valid timezone.' });
    }
    try {
      const { rows } = await pool.query<{ timezone: string | null; timezone_updated_at: Date | null }>(
        'SELECT timezone, timezone_updated_at FROM users WHERE id = $1',
        [req.userId],
      );
      const user = rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.timezone === timezone) return res.json({ timezone });

      const lastChange = user.timezone_updated_at?.getTime();
      if (user.timezone && lastChange && Date.now() - lastChange < TIMEZONE_CHANGE_INTERVAL_MS) {
        return res.status(429).json({
          error: 'Your timezone can only be changed once every 24 hours.',
          retryAfter: new Date(lastChange + TIMEZONE_CHANGE_INTERVAL_MS).toISOString(),
        });
      }

      await pool.query(
        'UPDATE users SET timezone = $2, timezone_updated_at = now(), updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [req.userId, timezone],
      );
      res.json({ timezone });
    } catch (error) {
      sendError(res, error, 'timezone');
    }
  });

  router.get('/packages', (_req, res: Response) => {
    res.json(getCreditPackageList(getStripe()));
  });

  router.post('/checkout', authenticateToken, async (req: AuthRequest, res: Response) => {
    const pkg = findCreditPackage(req.body?.packageId);
    if (!pkg) return res.status(400).json({ error: 'Please choose a valid credit package.' });
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: new BillingNotConfiguredError().message });
    if (isRateLimited({ key: `billing-checkout:${req.userId}`, max: 10, windowMs: 10 * 60 * 1000 })) {
      return res.status(429).json({ error: 'Too many checkout attempts. Please try again in a few minutes.' });
    }
    try {
      res.json(await createCreditCheckout(stripe, req.userId!, pkg));
    } catch (error) {
      sendError(res, error, 'checkout');
    }
  });

  router.get('/checkout/:sessionId', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { sessionId } = req.params;
    if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid checkout session.' });
    }
    try {
      res.json(await getCheckoutStatus(getStripe(), req.userId!, sessionId));
    } catch (error) {
      sendError(res, error, 'checkout-status');
    }
  });

  router.get('/admin/users/:id', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id.' });
    try {
      const { rows } = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      const [usage, transactions] = await Promise.all([
        getUsageSummary(userId),
        getCreditTransactions(userId, { limit: 25 }),
      ]);
      const body: AdminUserBilling = { userId, email: rows[0].email, usage, transactions: transactions.items };
      res.json(body);
    } catch (error) {
      sendError(res, error, 'admin-user');
    }
  });

  router.post('/admin/users/:id/credits', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    const userId = Number(req.params.id);
    const { amountCents, reason, expiresInMonths } = req.body ?? {};
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id.' });
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_ADMIN_GRANT_CENTS) {
      return res.status(400).json({ error: `amountCents must be a whole number between 1 and ${MAX_ADMIN_GRANT_CENTS}.` });
    }
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 200) {
      return res.status(400).json({ error: 'A reason (up to 200 characters) is required.' });
    }
    if (expiresInMonths !== undefined && (!Number.isSafeInteger(expiresInMonths) || expiresInMonths < 1 || expiresInMonths > 36)) {
      return res.status(400).json({ error: 'expiresInMonths must be a whole number between 1 and 36.' });
    }
    try {
      const now = new Date();
      const expiresAt = expiresInMonths === undefined ? undefined : new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth() + expiresInMonths, now.getUTCDate(),
        now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
      ));
      const grant = await grantCredits(userId, {
        amountCents,
        source: 'admin_grant',
        description: `Credit grant: ${reason.trim()}`,
        createdBy: req.userId,
        expiresAt,
        now,
      });
      console.log(`[billing:admin-grant] admin ${req.userId} granted ${amountCents}¢ to user ${userId}`);
      res.status(201).json({ ...grant, usage: await getUsageSummary(userId) });
    } catch (error) {
      sendError(res, error, 'admin-grant');
    }
  });

  return router;
}

/**
 * Stripe webhook endpoint. Must be mounted before `express.json()` so the raw
 * body is available for signature verification.
 */
export function createStripeWebhookRouter(deps: BillingRouterDeps = {}): Router {
  const router = Router();
  const getStripe = deps.getStripe ?? (() => getStripeClient());
  const getSecret = deps.getWebhookSecret ?? (() => process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined);

  router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req: Request, res: Response) => {
    const stripe = getStripe();
    const secret = getSecret();
    if (!stripe || !secret) return res.status(503).json({ error: 'Billing webhooks are not configured.' });

    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Missing Stripe signature.' });
    }

    let event: Stripe.Event;
    try {
      event = constructStripeEvent(stripe, req.body, signature, secret);
    } catch {
      return res.status(400).json({ error: 'Invalid Stripe signature.' });
    }

    try {
      const outcome = await handleStripeEvent(event);
      res.json({ received: true, outcome });
    } catch (error) {
      console.error(`[billing:webhook] failed to process ${event.type} ${event.id}:`,
        error instanceof Error ? error.message : 'unknown error');
      res.status(500).json({ error: 'Webhook processing failed.' });
    }
  });

  return router;
}

export const stripeWebhookRoutes = createStripeWebhookRouter();
export default createBillingRouter();
