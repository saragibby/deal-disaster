import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaAPI, clearAuth } from './helpers';

test.describe('Cross-App Auth: Deal or Disaster', () => {
  test('unauthenticated user on /deal-or-disaster/ is redirected to /login', async ({ page }) => {
    await page.goto('/deal-or-disaster/');

    // Should redirect to login (via window.location.href = '/login')
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('authenticated user can access /deal-or-disaster/', async ({ page }) => {
    // Login via API
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);

    // Navigate to the game
    await page.goto('/deal-or-disaster/');

    // Should NOT redirect to login — should load the game app
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toContain('/deal-or-disaster');
    expect(url).not.toContain('/login');
  });

  test('logging out from dashboard clears auth for deal-or-disaster', async ({ page }) => {
    // Login via API
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);

    // Verify we can access dashboard
    await page.goto('/');
    await expect(page.locator('.app-shell__logo-text')).toBeVisible({ timeout: 10000 });

    // Clear auth (simulates logout)
    await clearAuth(page);

    // Now try to access deal-or-disaster — should be redirected
    await page.goto('/deal-or-disaster/');
    await page.waitForURL('**/login', { timeout: 15000 });
  });
});

test.describe('Cross-App Auth: Property Analyzer', () => {
  test('unauthenticated user on /property-analyzer/ is redirected to /login', async ({ page }) => {
    await page.goto('/property-analyzer/');

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('authenticated user can access /property-analyzer/', async ({ page }) => {
    // Login via API
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);

    // Navigate to property analyzer
    await page.goto('/property-analyzer/');

    // Should NOT redirect to login
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).toContain('/property-analyzer');
    expect(url).not.toContain('/login');
  });
});

test.describe('Shared Auth State Across Apps', () => {
  test('auth token persists in localStorage across app navigations', async ({ page }) => {
    // Login via API
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);

    // Verify token exists
    let token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Navigate to deal-or-disaster (same origin via proxy)
    await page.goto('/deal-or-disaster/');
    await page.waitForTimeout(2000);

    // Token should still be in localStorage (same origin = shared storage)
    token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();

    // Navigate to property-analyzer
    await page.goto('/property-analyzer/');
    await page.waitForTimeout(2000);

    token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });
});
