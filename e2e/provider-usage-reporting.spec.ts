import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import { withProviderUsage, providerUsageMiddleware, recordProviderCache, type ProviderUsageSummary } from '../server/src/services/providerUsageService';
import { authenticateOptional, authenticateToken } from '../server/src/middleware/auth';
import { authenticateInvestorLab } from '../server/src/routes/investorLabAuth';
import { createUsageRecorder, usageProjection } from '../server/src/services/providerUsageReportingService';
import { createProviderUsageReportRouter, usageReportRange } from '../server/src/routes/providerUsage';
import { pool } from '../server/src/db/pool';
import type { Pool } from 'pg';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express') as typeof import('express');
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

async function fixture(): Promise<ProviderUsageSummary> {
  let summary: ProviderUsageSummary | undefined;
  await withProviderUsage('analysis', async () => {
    recordProviderCache('rentcast', 'markets', 'postgres', 'hit');
  }, value => { summary = value; });
  if (!summary) throw new Error('Missing summary');
  return summary;
}

test('usage projection excludes unexpected root, endpoint and configuration fields', async () => {
  const summary = await fixture();
  const polluted = {
    ...summary, address: 'private-address',
    actor: { kind: 'authenticated' as const, userId: 7, platform: 'asset-dashboard', tenantId: 'asset-dashboard', email: 'private-email' },
    configuration: { ...summary.configuration, token: 'private-token' },
    endpoints: summary.endpoints.map(row => ({ ...row, responseBody: 'private-body' })),
  };
  expect(JSON.stringify(usageProjection(polluted))).not.toContain('private-');
  expect(usageProjection(polluted).endpoints[0].cache).toEqual({ 'postgres:hit': 1 });
  expect(usageProjection(polluted).actor?.userId).toBe(7);
});

test('attributes verified required, optional and Investor Lab actors, ignoring client identity claims', async () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalInvestorSecret = process.env.INVESTOR_LAB_JWT_SECRET;
  process.env.JWT_SECRET = 'fixture-actor-auth';
  process.env.INVESTOR_LAB_JWT_SECRET = 'fixture-investor-auth';
  const reports: ProviderUsageSummary[] = [];
  const app = express();
  app.use('/platform', providerUsageMiddleware(row => reports.push(row)));
  app.use('/investor', providerUsageMiddleware(row => reports.push(row), { platform: 'investor-lab', tenantId: 'investor-lab' }));
  app.get('/platform/analyzer/required', authenticateToken, (_req, res) => res.json({ ok: true }));
  app.get('/platform/analyzer/optional', authenticateOptional, (_req, res) => res.json({ ok: true }));
  app.get('/investor/analyzer/required', authenticateInvestorLab, (_req, res) => res.json({ ok: true }));
  const server: Server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const url = `http://127.0.0.1:${address.port}`;
    const valid = jwt.sign({ userId: 7 }, 'fixture-actor-auth');
    const forged = jwt.sign({ userId: 999 }, 'wrong-fixture-secret');
    const investor = jwt.sign({ investorLabUserId: 88, platformUserId: 7, aud: 'investor-lab' }, 'fixture-investor-auth');
    for (const [path, token, status] of [
      ['/platform/analyzer/required', valid, 200],
      ['/platform/analyzer/optional', valid, 200],
      ['/platform/analyzer/optional', forged, 200],
      ['/platform/analyzer/required', forged, 403],
      ['/platform/analyzer/optional', '', 200],
      ['/investor/analyzer/required', investor, 200],
    ] as const) {
      const response = await fetch(`${url}${path}?userId=999`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-User-Id': '999' },
      });
      expect(response.status).toBe(status);
      await response.text();
    }
    expect(reports.map(row => row.actor?.userId)).toEqual([7, 7, null, null, null, 7]);
    expect(reports[0].actor).toEqual({ kind: 'authenticated', platform: 'asset-dashboard', tenantId: 'asset-dashboard', userId: 7 });
    expect(reports[5].actor).toEqual({ kind: 'authenticated', platform: 'investor-lab', tenantId: 'investor-lab', userId: 7 });
    expect(reports[3].actor?.kind).toBe('anonymous');
    expect((await fixture()).actor?.kind).toBe('background');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalInvestorSecret === undefined) delete process.env.INVESTOR_LAB_JWT_SECRET;
    else process.env.INVESTOR_LAB_JWT_SECRET = originalInvestorSecret;
  }
});

test('recorder is disabled by default, immutable, bounded and logs failed writes', async () => {
  const summary = await fixture();
  const calls: unknown[][] = [];
  let fail = false;
  const db = Object.create(null) as Pick<Pool, 'query'>;
  Object.defineProperty(db, 'query', { value: async (_sql: string, params: unknown[]) => {
    if (fail) throw new Error('fixture-db-failure');
    calls.push(params);
    return { rows: [], rowCount: 0 };
  } });
  const disabled = createUsageRecorder(db, () => false);
  disabled.record(summary);
  await disabled.flush();
  expect(calls).toEqual([]);
  const recorder = createUsageRecorder(db, () => true, 1);
  const messages: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args); };
  try {
    recorder.record(summary);
    recorder.record(summary);
    summary.workflow = 'background';
    await recorder.flush();
    expect(calls[0][2]).toBe('analysis');
    expect(JSON.parse(String(calls[0][4])).workflow).toBe('analysis');
    expect(messages.flat().join(' ')).toContain('Queue full');
    fail = true;
    recorder.record(summary);
    await recorder.flush();
    expect(messages.flat().join(' ')).toContain('persistence/retention failed');
  } finally { console.error = original; }
});

test('report date validation rejects malformed, oversized and invalid workflow requests', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  expect(usageReportRange({}, now).from).toBe('2026-10-13T12:00:00.000Z');
  expect(usageReportRange({ from: '2026-10-01', to: '2026-10-20', workflow: 'analysis' }, now).workflow).toBe('analysis');
  for (const query of [
    { from: '2026-02-30', to: '2026-10-20' },
    { from: '2026-01-01', to: '2026-10-20' },
    { from: '2026-10-20', to: '2026-10-01' },
    { from: ['2026-10-01'], to: '2026-10-20' },
    { workflow: 'invented' }, { to: '2027-10-20' },
  ]) expect(() => usageReportRange(query, now)).toThrow();
});

test('usage report requires a valid authenticated administrator and surfaces storage errors', async () => {
  const originalQuery = pool.query;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'fixture-reporting-auth';
  Object.defineProperty(pool, 'query', {
    configurable: true, writable: true,
    value: async (_sql: string, params: unknown[]) => ({ rows: [{ is_admin: params[0] === 1 }] }),
  });
  const app = express();
  let failReport = true;
  app.use('/usage', createProviderUsageReportRouter(async (from, to, workflow) => {
    if (failReport) throw new Error('fixture storage unavailable');
    expect(workflow).toBe('analysis');
    return {
      enabled: true, retentionDays: 90, from, to,
      totals: { requests: 0, failedRequests: 0, attempts: 0, estimatedCostUsd: 0, unknownCostAttempts: 0, pendingAttempts: 0 },
      workflows: [], endpoints: [], users: [], dailyAnalyses: [],
    };
  }));
  const server: Server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const url = `http://127.0.0.1:${address.port}/usage`;
    expect((await fetch(url)).status).toBe(401);
    const token = (userId: number) => jwt.sign({ userId }, 'fixture-reporting-auth');
    expect((await fetch(url, { headers: { Authorization: `Bearer ${token(2)}` } })).status).toBe(403);
    const invalid = await fetch(`${url}?workflow=invalid`, { headers: { Authorization: `Bearer ${token(1)}` } });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toContain('Invalid usage workflow');
    const unavailable = await fetch(url, { headers: { Authorization: `Bearer ${token(1)}` } });
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error).toContain('Usage report unavailable');
    failReport = false;
    const success = await fetch(`${url}?workflow=analysis`, { headers: { Authorization: `Bearer ${token(1)}` } });
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ retentionDays: 90, totals: { requests: 0 }, workflows: [], endpoints: [] });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    Object.defineProperty(pool, 'query', { value: originalQuery, configurable: true, writable: true });
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
