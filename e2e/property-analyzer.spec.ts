import { test, expect } from '@playwright/test';
import { API_URL, TEST_USER, loginViaAPI } from './helpers';
import { propertyAnalyzerTest } from './property-analyzer-fixtures';

function authHeaders(token: string) {
  return { Authorization: ['Bearer', token].join(' ') };
}

test.describe('Property Analyzer', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/property-analyzer/');
  });

  test('loads analyzer page with title', async ({ page }) => {
    await expect(page.locator('.page-title', { hasText: 'Property Analyzer' })).toBeVisible({ timeout: 15000 });
  });

  test('shows URL input field with property placeholder', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    const input = page.locator('.analyzer__url-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', /address.*link|link.*address/i);
  });

  test('shows analyze button', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.analyzer__submit-btn')).toBeVisible();
    await expect(page.locator('.analyzer__submit-btn')).toContainText('Analyze');
  });

  test('shows analyzer tabs', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.analyzer__tab', { hasText: 'Analyze' })).toBeVisible();
    await expect(page.locator('.analyzer__tab', { hasText: 'History' })).toBeVisible();
    await expect(page.locator('.analyzer__tab', { hasText: 'Compare' })).toBeVisible();
  });

  test('disables analyze button when input is empty', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    const input = page.locator('.analyzer__url-input');
    await input.fill('');
    await expect(page.locator('.analyzer__submit-btn')).toBeDisabled();
  });

  test('shows error for invalid URL', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    const input = page.locator('.analyzer__url-input');
    await input.fill('https://not-a-zillow-url.com/property');
    await page.locator('.analyzer__submit-btn').click();

    await expect(page.locator('.analyzer__error')).toBeVisible({ timeout: 10000 });
  });

  test('can switch to history tab', async ({ page }) => {
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 15000 });
    await page.locator('.analyzer__tab', { hasText: 'History' }).click();

    // Should show history content (may be empty for test user)
    await expect(page.locator('.analyzer__tab--active', { hasText: 'History' })).toBeVisible();
  });
});

propertyAnalyzerTest.describe('Property Analyzer deterministic fixtures', () => {
  propertyAnalyzerTest.setTimeout(60000);

  propertyAnalyzerTest('creates owned analyses without exposing non-owned analyses', async ({ page, propertyFixtures }) => {
    await page.goto('/');
    const { token } = await loginViaAPI(
      page,
      propertyFixtures.owner.email,
      propertyFixtures.owner.password,
    );

    const historyRes = await page.request.get(`${API_URL}/api/analyzer/history?limit=20`, {
      headers: authHeaders(token),
    });
    await expect(historyRes).toBeOK();

    const history = await historyRes.json();
    const slugs = history.analyses.map((analysis: { slug: string }) => analysis.slug);

    expect(history.total).toBe(propertyFixtures.ownedAnalyses.length);
    expect(slugs).toEqual(expect.arrayContaining(
      propertyFixtures.ownedAnalyses.map(analysis => analysis.slug),
    ));
    for (const analysis of propertyFixtures.nonOwnedAnalyses) {
      expect(slugs).not.toContain(analysis.slug);
    }
  });

  propertyAnalyzerTest('creates public and private share states', async ({ page, propertyFixtures }) => {
    await page.goto('/');
    const { token } = await loginViaAPI(
      page,
      propertyFixtures.owner.email,
      propertyFixtures.owner.password,
    );

    const publicRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${propertyFixtures.publicAnalysis.slug}`,
    );
    await expect(publicRes).toBeOK();

    const privateRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${propertyFixtures.privateAnalysis.slug}`,
    );
    expect(privateRes.status()).toBe(404);

    const shareRes = await page.request.patch(
      `${API_URL}/api/analyzer/history/${propertyFixtures.privateAnalysis.slug}/share`,
      {
        headers: authHeaders(token),
        data: { shared: true },
      },
    );
    await expect(shareRes).toBeOK();
    expect(await shareRes.json()).toMatchObject({
      slug: propertyFixtures.privateAnalysis.slug,
      is_shared: true,
    });

    const newlyPublicRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${propertyFixtures.privateAnalysis.slug}`,
    );
    await expect(newlyPublicRes).toBeOK();
  });

  propertyAnalyzerTest('creates valid saved comparisons for 2 through 6 properties', async ({ page, propertyFixtures }) => {
    await page.goto('/');
    const { token } = await loginViaAPI(
      page,
      propertyFixtures.owner.email,
      propertyFixtures.owner.password,
    );

    const comparisonsRes = await page.request.get(`${API_URL}/api/comparisons?limit=50`, {
      headers: authHeaders(token),
    });
    await expect(comparisonsRes).toBeOK();

    const comparisons = await comparisonsRes.json();
    const sizes = comparisons.comparisons
      .map((comparison: { property_slugs: string[] }) => comparison.property_slugs.length)
      .sort((a: number, b: number) => a - b);

    expect(sizes).toEqual([2, 3, 4, 5, 6]);
    for (const comparison of comparisons.comparisons as Array<{ id: number; property_slugs: string[] }>) {
      expect(comparison.property_slugs).toEqual(expect.arrayContaining(
        propertyFixtures.ownedAnalyses.map(analysis => analysis.slug).slice(0, comparison.property_slugs.length),
      ));

      const detailRes = await page.request.get(`${API_URL}/api/comparisons/${comparison.id}`, {
        headers: authHeaders(token),
      });
      await expect(detailRes).toBeOK();
    }
  });
});
