import { propertyAnalyzerTest as test, expect } from './property-analyzer-fixtures';
import { API_URL, loginViaAPI } from './helpers';
import type { OwnerContext, PropertyRecords } from '@deal-platform/shared-types';
import { getAnalysisBySlug, savePropertyRecords } from '../server/src/services/analyzerPersistenceService';
import { pool } from '../server/src/db/pool';

const records: PropertyRecords = {
  source: 'rentcast',
  retrievedAt: '2020-01-01T00:00:00.000Z',
  found: true,
  ownerNames: ['Persisted Fixture LLC'],
  ownerType: 'Organization',
  mailingAddress: '100 Example St, Example City, MI 48000',
  ownerOccupied: false,
  sales: [{ date: '2019-01-01', price: 180000, event: 'Sale' }],
};

const ownerContext = (userId: number): OwnerContext => ({
  actorUserId: String(userId), ownerUserId: String(userId),
  tenantId: 'asset-dashboard', platform: 'asset-dashboard',
  permissions: ['analysis:read', 'analysis:write'], roles: ['user'],
});

test.afterAll(async () => { await pool.end(); });

test('persists private records across independent requests and page reloads', async ({ page, request, propertyFixtures }) => {
  const analysis = propertyFixtures.publicAnalysis;
  const owner = ownerContext(propertyFixtures.owner.id);
  expect(await savePropertyRecords(owner, analysis.slug, records)).toEqual(records);
  expect((await getAnalysisBySlug(owner, analysis.slug))?.property_records).toEqual(records);
  for (const context of [
    ownerContext(propertyFixtures.other.id),
    { ...owner, tenantId: 'another-tenant' },
    { ...owner, platform: 'investor-lab' as const },
  ]) {
    expect(await savePropertyRecords(context, analysis.slug, { ...records, ownerNames: ['Wrong Owner'] })).toBeNull();
  }
  expect((await getAnalysisBySlug(owner, analysis.slug))?.property_records).toEqual(records);

  await page.goto('/');
  const { token } = await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  const headers = { Authorization: `Bearer ${token}` };
  const cached = await request.get(`${API_URL}/api/analyzer/history/${analysis.slug}/property-records`, { headers });
  expect(cached.ok()).toBe(true);
  expect(await cached.json()).toEqual(records);
  expect(cached.headers()['cache-control']).toBe('private, no-store');
  const shared = await request.get(`${API_URL}/api/analyzer/shared/${analysis.public_share_id}`);
  expect(shared.ok()).toBe(true);
  expect((await shared.json()).analysis).not.toHaveProperty('property_records');
  await page.goto(`/property-analyzer/shared/${analysis.public_share_id}`);
  await expect(page.locator('.results__property-address')).toContainText(analysis.property_data.address);
  await expect(page.locator('.section-nav').getByRole('button', { name: 'Ownership', exact: true })).toHaveCount(0);
  await expect(page.locator('#ownership-history')).toHaveCount(0);

  let recordRequests = 0;
  page.on('request', req => { if (req.url().includes('/property-records')) recordRequests++; });
  await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
  const section = page.locator('#ownership-history');
  await expect(section).toContainText('Persisted Fixture LLC');
  await expect(section).toContainText('Over 24 hours old');
  await expect(section.getByRole('button', { name: 'Refresh records' })).toBeVisible();
  await page.reload();
  await expect(section).toContainText('Persisted Fixture LLC');
  expect(recordRequests).toBe(0);
});

test('retains persisted records after a failed refresh and replaces them after success', async ({ page, propertyFixtures }) => {
  const analysis = propertyFixtures.ownedAnalyses[0];
  await savePropertyRecords(ownerContext(propertyFixtures.owner.id), analysis.slug, records);
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  let attempts = 0;
  await page.route('**/api/analyzer/history/*/property-records/refresh', async route => {
    expect(route.request().method()).toBe('POST');
    attempts++;
    if (attempts === 1) {
      await route.fulfill({ status: 503, json: { error: 'RentCast is temporarily unavailable.' } });
    } else {
      await route.fulfill({ json: { ...records, retrievedAt: new Date().toISOString(), ownerNames: ['Refreshed Fixture LLC'] } });
    }
  });
  await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
  const section = page.locator('#ownership-history');
  await section.getByRole('button', { name: 'Refresh records' }).click();
  await expect(section.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(section).toContainText('Persisted Fixture LLC');
  await expect(section).toContainText('Showing the last successfully retrieved records');
  await section.getByRole('button', { name: 'Refresh records' }).click();
  await expect(section).toContainText('Refreshed Fixture LLC');
  await expect(section).toContainText('Retrieved within the last 24 hours');
  await expect(section.getByRole('alert')).toHaveCount(0);
});

test('refresh requires authentication and matching ownership', async ({ page, request, propertyFixtures }) => {
  await page.goto('/');
  const { token } = await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  const nonOwned = await request.post(
    `${API_URL}/api/analyzer/history/${propertyFixtures.nonOwnedAnalyses[0].slug}/property-records/refresh`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(nonOwned.status()).toBe(404);
  const anonymous = await request.post(
    `${API_URL}/api/analyzer/history/${propertyFixtures.ownedAnalyses[0].slug}/property-records/refresh`,
  );
  expect(anonymous.status()).toBe(401);
});
