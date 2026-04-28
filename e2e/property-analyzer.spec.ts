import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaAPI } from './helpers';

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
