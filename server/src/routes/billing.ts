/**
 * Billing & Usage Routes
 *
 * GET /api/billing/summary       – today's analysis usage, credit balance, next-run charge
 * GET /api/billing/usage         – per-day usage (?days=1..90, default 30) + recent analyses
 * GET /api/billing/transactions  – credit ledger (?cursor=&limit=)
 * PUT /api/billing/timezone      – set the timezone used for the daily reset (once per 24h)
 */

import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import {
  MeteringUserNotFoundError,
  getCreditTransactions,
  getUsageHistory,
  getUsageSummary,
  isValidTimezone,
} from '../services/analysisMeteringService.js';

const TIMEZONE_CHANGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function timezoneHint(req: AuthRequest): string | undefined {
  const value = req.headers['x-user-timezone'];
  return typeof value === 'string' ? value : undefined;
}

function sendError(res: Response, error: unknown, label: string) {
  if (error instanceof MeteringUserNotFoundError) return res.status(404).json({ error: 'User not found' });
  console.error(`[billing:${label}]`, error instanceof Error ? error.message : 'unknown error');
  return res.status(500).json({ error: 'Unable to load billing information.' });
}

export function createBillingRouter(): Router {
  const router = Router();

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

  return router;
}

export default createBillingRouter();
