import { test, expect } from '@playwright/test';
import { mtrAnalysis } from './fixtures/mtr-analysis';
import { applyMtrProximity } from '../server/src/services/mtrEstimationService';

test('nearby loads only on MTR activation, retries errors, updates figures and reuses results across tab switches', async ({ page }) => {
  const a = mtrAnalysis();
  const user = { id: 7, name: 'Fixture User', email: 'fixture@example.test' };
  await page.addInitScript(user => {
    localStorage.setItem('token', 'fixture-token');
    localStorage.setItem('user', JSON.stringify(user));
  }, user);
  let calls = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const baseMtr = a.analysis_results.mtrEstimate;
  if (!baseMtr) throw new Error('Missing MTR fixture');
  const enriched = applyMtrProximity(a.property_data, baseMtr, {
    boost: 15, nearby: [{ name: 'Fixture Medical Center', emoji: 'H', miles: 1 }],
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/mtr-nearby')) {
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, json: { error: 'Fixture nearby service unavailable' } });
      await pending;
      return route.fulfill({ json: enriched });
    }
    if (url.pathname.includes('/api/analyzer/history/')) return route.fulfill({ json: { analysis: a } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user, analyses: [], total: 0 } });
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await page.goto(`/property-analyzer/analysis/${a.slug}`);
  const tabs = page.locator('.rental-tabs');
  await expect(tabs.getByRole('button', { name: 'Long-Term', exact: true })).toBeVisible();
  expect(calls).toBe(0);
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  await expect(tabs.getByRole('alert')).toContainText('Fixture nearby service unavailable');
  expect(calls).toBe(1);
  await tabs.getByRole('button', { name: 'Long-Term', exact: true }).click();
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  expect(calls).toBe(1);
  await tabs.getByRole('button', { name: 'Retry nearby places' }).click();
  await expect(tabs.getByRole('status')).toContainText('Loading nearby demand drivers');
  await tabs.getByRole('button', { name: 'Long-Term', exact: true }).click();
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  expect(calls).toBe(2);
  release?.();
  await expect(tabs.getByRole('region', { name: 'Nearby Institutions' })).toContainText('Fixture Medical Center');
  await expect(tabs.getByRole('region', { name: 'MTR Demand', exact: true })).toContainText(String(enriched.demandFactors.overallScore));
  await expect(tabs.getByRole('alert')).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Long-Term', exact: true }).click();
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  expect(calls).toBe(2);
});

test('public shared analysis never triggers a nearby fetch', async ({ page }) => {
  const a = mtrAnalysis();
  let calls = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/mtr-nearby')) {
      calls++;
      return route.fulfill({ status: 500, json: { error: 'Unexpected call' } });
    }
    if (url.pathname.includes('/api/analyzer/shared/')) return route.fulfill({ json: { analysis: a } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { analyses: [], total: 0 } });
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await page.goto('/property-analyzer/shared/fixture-public');
  const tabs = page.locator('.rental-tabs');
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  await expect(tabs.getByRole('heading', { name: 'Mid-Term Rental', exact: true })).toBeVisible();
  expect(calls).toBe(0);
});

test('reanalysis reloads active MTR data and discards the older in-flight response', async ({ page }) => {
  const a = mtrAnalysis();
  const base = a.analysis_results.mtrEstimate;
  if (!base) throw new Error('Missing fixture MTR');
  const user = { id: 7, name: 'Fixture User', email: 'fixture@example.test' };
  await page.addInitScript(user => {
    localStorage.setItem('token', 'fixture-token');
    localStorage.setItem('user', JSON.stringify(user));
  }, user);
  let calls = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/mtr-nearby')) {
      const index = ++calls;
      if (index === 1) await pending;
      return route.fulfill({ json: applyMtrProximity(a.property_data, base, {
        boost: 15, nearby: [{ name: index === 1 ? 'Outdated Hospital' : 'Current Hospital', emoji: 'H', miles: 1 }],
      }) });
    }
    if (url.pathname.includes('/api/analyzer/re-analyze/')) return route.fulfill({ json: a });
    if (url.pathname.includes('/api/analyzer/history/')) return route.fulfill({ json: { analysis: a } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user, analyses: [], total: 0 } });
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await page.goto(`/property-analyzer/analysis/${a.slug}`);
  const tabs = page.locator('.rental-tabs');
  await tabs.getByRole('button', { name: 'Mid-Term', exact: true }).click();
  await expect(tabs.getByRole('status')).toContainText('Loading nearby');
  await page.getByRole('button', { name: 'Re-analyze', exact: true }).click();
  await expect(tabs.getByRole('region', { name: 'Nearby Institutions' })).toContainText('Current Hospital');
  expect(calls).toBe(2);
  const oldFinished = page.waitForResponse(response => response.url().endsWith('/mtr-nearby'));
  release?.();
  await (await oldFinished).finished();
  await expect(tabs.getByRole('region', { name: 'Nearby Institutions' })).toContainText('Current Hospital');
  await expect(tabs).not.toContainText('Outdated Hospital');
});
