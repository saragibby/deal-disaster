import { test, expect } from '@playwright/test';
import type { ProviderUsageReport } from '@deal-platform/shared-types';

const totals = { requests: 2, failedRequests: 1, attempts: 3, estimatedCostUsd: 0.148, unknownCostAttempts: 1, pendingAttempts: 0 };
const report: ProviderUsageReport = {
  enabled: true, retentionDays: 90, from: '2026-10-01', to: '2026-10-20', totals,
  dailyAnalyses: [{ day: '2026-10-19', requests: 5, failedRequests: 2 }],
  users: [
    { ...totals, attribution: 'authenticated', platform: 'asset-dashboard', tenantId: 'asset-dashboard',
      userId: 7, name: 'Fixture Analyst', rentCastAttempts: 1, rentCastBillableCandidates: 1, rentCastEstimatedCostUsd: 0.074 },
    { ...totals, attribution: 'unattributed', platform: null, tenantId: null,
      userId: null, name: null, rentCastAttempts: 0, rentCastBillableCandidates: 0, rentCastEstimatedCostUsd: 0 },
  ],
  workflows: [{ ...totals, day: '2026-10-19', workflow: 'analysis',
    configuration: { marketCache: true, propertyCache: true, rentMode: 'compatibility', rentCastRate: 0.074 } }],
  endpoints: [{ provider: 'rentcast', operation: 'markets', workflow: 'analysis',
    attempts: 1, estimatedCostUsd: 0.074, unknownCostAttempts: 0, networkErrors: 0,
    httpErrors: 0, memoryHits: 2, postgresHits: 3, cacheMisses: 1, cacheErrors: 0, fallbacks: 0 }],
};

test('admin report shows costs, configuration, cache counts and explicit empty/error states', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
  const user = { id: 1, email: 'fixture@example.test', name: 'Fixture Admin', is_admin: true };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('token', 'fixture-not-a-credential');
    localStorage.setItem('user', JSON.stringify(user));
  }, { user });
  let state: 'data' | 'empty' | 'error' = 'data';
  const workflows: string[] = [];
  const ranges: { from: string | null; to: string | null }[] = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.endsWith('/provider-usage')) {
        workflows.push(url.searchParams.get('workflow') ?? '');
        ranges.push({ from: url.searchParams.get('from'), to: url.searchParams.get('to') });
        if (state === 'error') return route.fulfill({ status: 503, json: { error: 'Fixture reporting database unavailable' } });
        const data = state === 'empty'
          ? { ...report, totals: { ...totals, requests: 0, attempts: 0, estimatedCostUsd: 0, failedRequests: 0, unknownCostAttempts: 0 }, workflows: [], endpoints: [], users: [], dailyAnalyses: [] }
          : url.searchParams.get('from') === '2026-10-18'
            ? { ...report, from: '2026-10-18', to: '2026-10-19',
              users: [{ ...report.users[0], name: 'Date-filtered Analyst', requests: 1 }],
              dailyAnalyses: [{ day: '2026-10-18', requests: 1, failedRequests: 0 }] }
            : report;
        return route.fulfill({ json: data });
      }
      return route.fulfill({ json: { user, resources: [], tools: [], announcements: [] } });
    }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'API Usage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'API usage and estimated cost' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Daily usage and rollout configuration' })).toContainText('RentCast $0.0740/call');
  await expect(page.getByRole('table', { name: 'Provider attempts, reuse and failures' })).toContainText('markets');
  const users = page.getByRole('table', { name: 'Usage and RentCast cost by user' });
  await expect(users).toContainText('Fixture Analyst (#7)');
  await expect(users).toContainText('unattributed');
  await expect(users).toContainText('$0.0740');
  await expect(page.getByText('$0.1480', { exact: true }).first()).toBeVisible();
  const chart = page.getByRole('region', { name: 'Daily analysis runs', exact: true });
  await expect(chart.getByRole('listitem', { name: '2026-10-19: 5 runs, 3 completed, 2 failed or aborted', exact: true })).toBeVisible();
  await expect(chart.getByRole('listitem', { name: '2026-10-18: 0 runs, 0 completed, 0 failed or aborted', exact: true })).toBeVisible();
  expect(workflows[0]).toBe('analysis');
  await page.getByLabel('From', { exact: true }).fill('2026-10-18');
  await expect(users).toContainText('Date-filtered Analyst');
  await expect(users).not.toContainText('Fixture Analyst');
  expect(ranges.at(-1)?.from).toBe('2026-10-18');
  await page.getByLabel('Through', { exact: true }).fill('2026-10-18');
  await expect.poll(() => ranges.at(-1)?.to).toBe('2026-10-19T00:00:00.000Z');
  await expect(chart).toContainText('1 recorded full-analysis runs');
  await page.getByLabel('From', { exact: true }).fill('2026-10-01');
  await expect(users).toContainText('Fixture Analyst');
  await page.getByLabel('Workflow', { exact: true }).selectOption('saved-view');
  await expect.poll(() => workflows.at(-1)).toBe('saved-view');
  await expect(chart).toContainText('5 recorded full-analysis runs');
  expect(workflows.at(-1)).toBe('saved-view');
  state = 'empty';
  await page.getByRole('button', { name: 'Load report' }).click();
  await expect(page.getByText(/No recorded usage in this period/)).toBeVisible();
  await expect(chart).toContainText('0 recorded full-analysis runs');
  expect(workflows.at(-1)).toBe('saved-view');
  state = 'error';
  await page.getByRole('button', { name: 'Load report' }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture reporting database unavailable');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(chart).toHaveCount(0);
});

test('non-admin cannot see the reporting tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('token', 'fixture-not-a-credential');
    localStorage.setItem('user', JSON.stringify({ id: 2, name: 'Fixture', is_admin: false }));
  });
  await page.route('**/api/**', route => route.fulfill({
    json: { user: { id: 2, is_admin: false }, resources: [], tools: [], announcements: [] },
  }));
  await page.route('**/www.googletagmanager.com/**', route => route.abort());
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'API Usage', exact: true })).toHaveCount(0);
});
