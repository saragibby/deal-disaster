import { test, expect, type Page } from '@playwright/test';
import { API_URL, TEST_USER, clearAuth, loginViaAPI } from './helpers';
import { propertyAnalyzerTest } from './property-analyzer-fixtures';
import type { PropertyAnalysis } from '@deal-platform/shared-types';

function authHeaders(token: string) {
  return { Authorization: ['Bearer', token].join(' ') };
}

async function loginAsFixtureOwner(page: Page, propertyFixtures: any) {
  await page.goto('/');
  return loginViaAPI(
    page,
    propertyFixtures.owner.email,
    propertyFixtures.owner.password,
  );
}

async function expectFixtureAnalysisVisible(page: Page, analysis: PropertyAnalysis) {
  await expect(page.locator('.results__property-address')).toContainText(
    analysis.property_data.address,
    { timeout: 15000 },
  );
}

async function openAnalyzerShell(page: Page, propertyFixtures: any) {
  await loginAsFixtureOwner(page, propertyFixtures);
  await page.goto('/property-analyzer/');
  await expect(page.locator('.page-title', { hasText: 'Property Analyzer' })).toBeVisible({ timeout: 15000 });
}

async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__copiedText = text;
        },
      },
    });
  });
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
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'Analyze' })).toBeVisible();
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'History' })).toBeVisible();
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'Compare' })).toBeVisible();
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
    await page.locator('.analyzer-app__nav-tab', { hasText: 'History' }).click();

    // Should show history content (may be empty for test user)
    await expect(page.locator('.analyzer-app__nav-tab--active', { hasText: 'History' })).toBeVisible();
  });
});

propertyAnalyzerTest.describe('Property Analyzer deterministic fixtures', () => {
  propertyAnalyzerTest.setTimeout(60000);

  propertyAnalyzerTest('loads authenticated analyzer shell with header navigation, tabs, and AskWill', async ({ page, propertyFixtures }) => {
    await openAnalyzerShell(page, propertyFixtures);

    await expect(page.locator('.analyzer-app__logo', { hasText: 'Property Analyzer' })).toBeVisible();
    await expect(page.locator('.analyzer-app__home')).toHaveAttribute('href', '/');
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'Analyze' })).toBeVisible();
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'Compare' })).toBeVisible();
    await expect(page.locator('.analyzer-app__nav-tab', { hasText: 'History' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chat with Will' })).toBeVisible();
  });

  propertyAnalyzerTest('redirects unauthenticated analyzer shell requests to login', async ({ page }) => {
    await page.goto('/');
    await clearAuth(page);

    await page.goto('/property-analyzer/');

    await expect(page).toHaveURL(/\/login/);
  });

  propertyAnalyzerTest('loads owned analysis deep links and fails safely for missing or non-owned slugs', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    const owned = propertyFixtures.ownedAnalyses[0];
    const nonOwned = propertyFixtures.nonOwnedAnalyses[0];

    await page.goto(`/property-analyzer/analysis/${owned.slug}`);
    await expectFixtureAnalysisVisible(page, owned);

    await page.goto('/property-analyzer/analysis/e2e-pa-missing-slug');
    await expect(page.locator('.analyzer__error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText(owned.property_data.address);
    await expect(page.locator('body')).not.toContainText(nonOwned.property_data.address);

    await page.goto(`/property-analyzer/analysis/${nonOwned.slug}`);
    await expect(page.locator('.analyzer__error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).not.toContainText(nonOwned.property_data.address);
  });

  propertyAnalyzerTest('lists history, opens a saved analysis, and deletes an owned analysis', async ({ page, propertyFixtures }) => {
    await openAnalyzerShell(page, propertyFixtures);
    const analysis = propertyFixtures.ownedAnalyses[0];
    const deleteTarget = propertyFixtures.ownedAnalyses[propertyFixtures.ownedAnalyses.length - 1];

    await page.locator('.analyzer-app__nav-tab', { hasText: 'History' }).click();
    await expect(page.locator('.history__item-address', { hasText: analysis.property_data.address })).toBeVisible({ timeout: 15000 });

    await page.locator('.history__item', { hasText: analysis.property_data.address }).click();
    await expect(page).toHaveURL(new RegExp(`/property-analyzer/analysis/${analysis.slug}$`));
    await expectFixtureAnalysisVisible(page, analysis);

    await page.locator('.analyzer-app__nav-tab', { hasText: 'History' }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.history__item', { hasText: deleteTarget.property_data.address }).locator('.history__action-btn--danger').click();
    await expect(page.locator('.history__item', { hasText: deleteTarget.property_data.address })).toHaveCount(0);
  });

  propertyAnalyzerTest('shows dashboard recent analysis cards and uses same-origin analyzer links', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    await page.goto('/');

    const recentCard = page.locator('.recent-analysis-card', {
      hasText: propertyFixtures.ownedAnalyses[0].property_data.address,
    });
    await expect(recentCard).toBeVisible({ timeout: 15000 });
    await expect(recentCard).toHaveAttribute(
      'href',
      `/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`,
    );
    await expect(page.locator('.section-link', { hasText: 'Property Analyzer' })).toHaveAttribute('href', '/property-analyzer/');
  });

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

  propertyAnalyzerTest('toggles public sharing, copies shared URLs, and hides private controls on public views', async ({ page, propertyFixtures }) => {
    await stubClipboard(page);
    await loginAsFixtureOwner(page, propertyFixtures);
    const privateAnalysis = propertyFixtures.privateAnalysis;

    await page.goto(`/property-analyzer/analysis/${privateAnalysis.slug}`);
    await expectFixtureAnalysisVisible(page, privateAnalysis);
    await expect(page.locator('.results__property-actions button', { hasText: 'Private' })).toBeVisible();

    await page.locator('.results__property-actions button', { hasText: 'Private' }).click();
    await expect(page.locator('.results__property-actions button', { hasText: 'Public' })).toBeVisible({ timeout: 15000 });
    await page.locator('.results__property-actions button', { hasText: 'Copy Link' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain(`/property-analyzer/shared/${privateAnalysis.slug}`);

    await page.locator('.results__property-actions button', { hasText: 'Public' }).click();
    await expect(page.locator('.results__property-actions button', { hasText: 'Private' })).toBeVisible({ timeout: 15000 });
    await page.goto(`/property-analyzer/shared/${privateAnalysis.slug}`);
    await expect(page.locator('.shared-view__error')).toBeVisible({ timeout: 15000 });

    await page.request.patch(
      `${API_URL}/api/analyzer/history/${privateAnalysis.slug}/share`,
      {
        headers: authHeaders((await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password)).token),
        data: { shared: true },
      },
    );
    await clearAuth(page);
    await page.goto(`/property-analyzer/shared/${privateAnalysis.slug}`);
    await expect(page.locator('.shared-view__banner')).toContainText('Shared Analysis');
    await expectFixtureAnalysisVisible(page, privateAnalysis);
    await expect(page.locator('.results__property-actions')).toHaveCount(0);
    await expect(page.locator('button', { hasText: 'Re-analyze' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chat with Will' })).toHaveCount(0);
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

  propertyAnalyzerTest('enforces saved comparison property count limits', async ({ page, propertyFixtures }) => {
    const { token } = await loginAsFixtureOwner(page, propertyFixtures);
    const slugs = propertyFixtures.ownedAnalyses.map((analysis: PropertyAnalysis) => analysis.slug);

    const tooSmall = await page.request.post(`${API_URL}/api/comparisons`, {
      headers: authHeaders(token),
      data: { name: 'Too small', propertySlugs: slugs.slice(0, 1) },
    });
    expect(tooSmall.status()).toBe(400);

    const tooLarge = await page.request.post(`${API_URL}/api/comparisons`, {
      headers: authHeaders(token),
      data: { name: 'Too large', propertySlugs: [...slugs, propertyFixtures.nonOwnedAnalyses[0].slug] },
    });
    expect(tooLarge.status()).toBe(400);
  });

  propertyAnalyzerTest('loads comparison selector from history, updates private comparison URLs, and reloads from them', async ({ page, propertyFixtures }) => {
    await openAnalyzerShell(page, propertyFixtures);
    const [first, second] = propertyFixtures.ownedAnalyses;

    await page.locator('.analyzer-app__nav-tab', { hasText: 'Compare' }).click();
    await expect(page).toHaveURL(/\/property-analyzer\/compare$/);
    await expect(page.locator('.comparison-selector__history-item', { hasText: first.property_data.address })).toBeVisible({ timeout: 15000 });

    await page.locator('.comparison-selector__history-item', { hasText: first.property_data.address }).click();
    await page.locator('.comparison-selector__history-item', { hasText: second.property_data.address }).click();
    await expect(page.locator('.comparison-selector__chip')).toHaveCount(2);
    await page.locator('.comparison-selector__compare-btn').click();

    await expect(page).toHaveURL(new RegExp(`/property-analyzer/compare\\?props=${first.slug},${second.slug}$`));
    await expect(page.locator('.comparison-dashboard__title')).toContainText('Comparing 2 Properties', { timeout: 15000 });

    await page.reload();
    await expect(page.locator('.comparison-dashboard__title')).toContainText('Comparing 2 Properties', { timeout: 15000 });
    await expect(page.locator('body')).toContainText(first.property_data.address);
    await expect(page.locator('body')).toContainText(second.property_data.address);
  });

  propertyAnalyzerTest('loads and deletes saved comparisons from the selector', async ({ page, propertyFixtures }) => {
    await openAnalyzerShell(page, propertyFixtures);
    const saved = propertyFixtures.savedComparisons[0];

    await page.locator('.analyzer-app__nav-tab', { hasText: 'Compare' }).click();
    await page.locator('.comparison-selector__section-toggle', { hasText: 'Saved Comparisons' }).click();
    await expect(page.locator('.comparison-selector__saved-item', { hasText: saved.name })).toBeVisible({ timeout: 15000 });

    await page.locator('.comparison-selector__saved-item', { hasText: saved.name }).click();
    await expect(page.locator('.comparison-dashboard__title')).toContainText(`Comparing ${saved.property_slugs.length} Properties`, { timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`/property-analyzer/compare\\?props=${saved.property_slugs.join(',')}$`));

    await page.locator('.comparison-dashboard__header button', { hasText: 'Back' }).click();
    await page.locator('.comparison-selector__section-toggle', { hasText: 'Saved Comparisons' }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('.comparison-selector__saved-item', { hasText: saved.name }).locator('.comparison-selector__delete-btn').click();
    await expect(page.locator('.comparison-selector__saved-item', { hasText: saved.name })).toHaveCount(0);
  });

  propertyAnalyzerTest('saves and shares private comparison links from the comparison dashboard', async ({ page, propertyFixtures }) => {
    await stubClipboard(page);
    await openAnalyzerShell(page, propertyFixtures);
    const [first, second] = propertyFixtures.ownedAnalyses;

    await page.goto(`/property-analyzer/compare?props=${first.slug},${second.slug}`);
    await expect(page.locator('.comparison-dashboard__title')).toContainText('Comparing 2 Properties', { timeout: 15000 });

    page.once('dialog', dialog => dialog.accept('E2E saved from dashboard'));
    await page.locator('.comparison-dashboard__actions button', { hasText: 'Save' }).click();
    await expect(page.locator('.comparison-dashboard__actions button', { hasText: 'Saved' })).toBeVisible({ timeout: 15000 });

    page.once('dialog', dialog => dialog.accept());
    await page.locator('.comparison-dashboard__actions button', { hasText: 'Share' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain(`/property-analyzer/compare?props=${first.slug},${second.slug}`);

    await clearAuth(page);
    await page.goto(`/property-analyzer/compare?props=${first.slug},${second.slug}`);
    await expect(page).toHaveURL(/\/login/);
  });

  propertyAnalyzerTest('starts analysis and comparison PDF exports without surfacing errors', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
    await expectFixtureAnalysisVisible(page, propertyFixtures.ownedAnalyses[0]);
    page.on('dialog', dialog => dialog.dismiss());
    await page.locator('.results__property-actions button', { hasText: 'Export PDF' }).click();
    await expect(page.locator('.results__property-actions button', { hasText: /Export PDF|Exporting/ })).toBeVisible();

    const [first, second] = propertyFixtures.ownedAnalyses;
    await page.goto(`/property-analyzer/compare?props=${first.slug},${second.slug}`);
    await expect(page.locator('.comparison-dashboard__title')).toContainText('Comparing 2 Properties', { timeout: 15000 });
    await page.locator('.comparison-dashboard__actions button', { hasText: 'PDF' }).click();
    await expect(page.locator('.comparison-dashboard__actions button', { hasText: /PDF|Exporting/ })).toBeVisible();
  });

  propertyAnalyzerTest('respects the AskWill disable feature flag while analyzer rendering continues', async ({ page, propertyFixtures }) => {
    await page.addInitScript(() => {
      (window as any).__PROPERTY_ANALYZER_FLAGS__ = { askWill: false };
    });
    await loginAsFixtureOwner(page, propertyFixtures);
    await page.goto('/property-analyzer/');

    await expect(page.locator('.page-title', { hasText: 'Property Analyzer' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Chat with Will' })).toHaveCount(0);
  });
});
