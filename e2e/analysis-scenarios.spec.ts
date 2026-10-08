import { propertyAnalyzerTest as test, expect } from './property-analyzer-fixtures';
import { API_URL, loginViaAPI } from './helpers';
import { DEFAULT_ANALYSIS_PARAMS, type AnalysisScenarioInput } from '@deal-platform/shared-types';

const input: AnalysisScenarioInput = {
  name: 'API scenario',
  overrides: {
    params: { ...DEFAULT_ANALYSIS_PARAMS, offerPrice: 250000, rentOverride: 2000 },
    selectedStrategy: 'ltr',
    operating: {}, depreciationMethod: 'full',
  },
  metrics: {
    purchasePrice: 250000, monthlyIncome: 2000, monthlyCashFlow: 100,
    totalCashInvested: 60000, cashOnCashROI: 2, capRate: 5,
  },
};

test('saves, compares, restores and deletes named scenarios without changing the baseline', async ({ page, propertyFixtures }) => {
  await page.addInitScript(() => { window.__PROPERTY_ANALYZER_FLAGS__ = { savedScenarios: true }; });
  const analysis = propertyFixtures.ownedAnalyses[0];
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  const withStr = structuredClone(analysis);
  withStr.analysis_results.strEstimate = {
    nightlyRate: 200, occupancyRate: 0.7, grossMonthlyRevenue: 4200,
    cleaningCosts: 300, platformFees: 126, netMonthlyRevenue: 3774,
    confidence: 'medium', source: 'algorithm',
  };
  await page.route(`**/api/analyzer/history/${analysis.slug}`, route => route.fulfill({ json: { analysis: withStr } }));
  await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
  const section = page.locator('#saved-scenarios');
  await expect(section).toContainText('No saved scenarios yet');
  await page.locator('.strategy-comparison__card--ltr').click();
  await section.getByLabel('Scenario name').fill('LTR base case');
  await section.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(section.getByRole('columnheader', { name: 'LTR base case' })).toBeVisible();
  const baselineIncome = await section.getByRole('row', { name: /^Monthly income/ }).locator('td').nth(1).textContent();
  await page.locator('.strategy-comparison__card--str').click();
  await page.locator('#loan-calculator input[type="range"]').nth(1).fill('5');
  await section.getByLabel('Scenario name').fill('STR base case');
  await section.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(section.getByRole('columnheader', { name: 'STR base case' })).toBeVisible();
  await expect(section.getByRole('row', { name: /^Rental strategy/ })).toContainText('Short-Term');
  await page.reload();
  await expect(section.getByRole('columnheader', { name: 'LTR base case' })).toBeVisible();
  await expect(section.getByRole('columnheader', { name: 'STR base case' })).toBeVisible();
  await section.getByRole('button', { name: 'Apply LTR base case' }).click();
  await expect(page.locator('.strategy-comparison__card--ltr')).toHaveAttribute('aria-pressed', 'true');
  await expect(section.getByRole('row', { name: /^Interest rate/ }).locator('td').first())
    .toHaveText(`${analysis.analysis_params.interestRate}%`);
  await expect(section.getByRole('row', { name: /^Monthly income/ }).locator('td').first()).toHaveText(baselineIncome ?? '');
  const baseline = await page.request.get(`${API_URL}/api/analyzer/history/${analysis.slug}`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}` },
  });
  expect((await baseline.json()).analysis.analysis_params).toEqual(analysis.analysis_params);
  page.once('dialog', dialog => dialog.accept());
  await section.getByRole('button', { name: 'Delete STR base case' }).click();
  await expect(section.getByRole('columnheader', { name: 'STR base case' })).toHaveCount(0);
  await page.reload();
  await expect(section.getByRole('columnheader', { name: 'STR base case' })).toHaveCount(0);
});

test('scenario API validates input and enforces analysis, user and public-share boundaries', async ({ page, request, propertyFixtures }) => {
  await page.goto('/');
  const { token } = await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  const headers = { Authorization: `Bearer ${token}` };
  const analysis = propertyFixtures.publicAnalysis;
  const url = `${API_URL}/api/analyzer/history/${analysis.slug}/scenarios`;
  for (const bad of [
    { ...input, name: ' ' },
    { ...input, overrides: { ...input.overrides, selectedStrategy: 'invalid' } },
    { ...input, overrides: { ...input.overrides, params: { ...input.overrides.params, interestRate: '7' } } },
    { ...input, metrics: { ...input.metrics, monthlyCashFlow: null } },
  ]) {
    expect((await request.post(url, { headers, data: bad })).status()).toBe(400);
  }
  const saved = await request.post(url, { headers, data: input });
  expect(saved.status()).toBe(201);
  const { scenario } = await saved.json();
  expect((await (await request.get(url, { headers })).json()).scenarios).toHaveLength(1);
  const nonOwnedUrl = `${API_URL}/api/analyzer/history/${propertyFixtures.nonOwnedAnalyses[0].slug}/scenarios`;
  expect((await request.post(nonOwnedUrl, { headers, data: input })).status()).toBe(404);
  expect((await request.get(nonOwnedUrl, { headers })).status()).toBe(404);
  expect((await request.delete(`${nonOwnedUrl}/${scenario.id}`, { headers })).status()).toBe(404);
  expect((await request.get(url)).status()).toBe(401);
  expect((await request.post(url, { data: input })).status()).toBe(401);
  const otherLogin = await request.post(`${API_URL}/api/auth/login`, { data: {
    email: propertyFixtures.other.email, password: propertyFixtures.other.password,
  } });
  const otherHeaders = { Authorization: `Bearer ${(await otherLogin.json()).token}` };
  expect((await request.delete(`${url}/${scenario.id}`, { headers: otherHeaders })).status()).toBe(404);
  await page.goto(`/property-analyzer/shared/${analysis.public_share_id}`);
  await expect(page.locator('.results__property-address')).toContainText(analysis.property_data.address);
  await expect(page.locator('#saved-scenarios')).toHaveCount(0);
  expect((await request.delete(`${url}/${scenario.id}`, { headers })).status()).toBe(200);
});

test('shows scenario load and save errors without success-shaped fallbacks', async ({ page, propertyFixtures }) => {
  await page.addInitScript(() => { window.__PROPERTY_ANALYZER_FLAGS__ = { savedScenarios: true }; });
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  let failLoads = true;
  await page.route('**/api/analyzer/history/*/scenarios', async route => {
    if (route.request().method() === 'GET' && !failLoads) {
      await route.fulfill({ json: { scenarios: [] } });
    } else {
      await route.fulfill({ status: 500, json: { error: 'Scenario service unavailable.' } });
    }
  });
  await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
  const section = page.locator('#saved-scenarios');
  await expect(section.getByRole('alert')).toContainText('unavailable');
  failLoads = false;
  await section.getByRole('button', { name: 'Reload scenarios' }).click();
  await expect(section).toContainText('No saved scenarios yet');
  await section.getByLabel('Scenario name').fill('Failed save');
  await section.getByRole('button', { name: 'Save current scenario' }).click();
  await expect(section.getByRole('alert')).toContainText('unavailable');
  await expect(section.getByRole('columnheader', { name: 'Failed save' })).toHaveCount(0);
});

test('hides scenarios by default without making scenario API requests', async ({ page, propertyFixtures }) => {
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  let requests = 0;
  page.on('request', request => { if (request.url().includes('/scenarios')) requests++; });
  await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
  await expect(page.locator('.results__property-address')).toContainText(propertyFixtures.ownedAnalyses[0].property_data.address);
  await expect(page.locator('#saved-scenarios')).toHaveCount(0);
  expect(requests).toBe(0);
});
