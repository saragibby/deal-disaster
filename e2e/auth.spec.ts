import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaAPI, clearAuth, API_URL } from './helpers';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows the login page with sign-in form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Sign In');
    await expect(page.locator('.login-card')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('shows OAuth buttons', async ({ page }) => {
    await expect(page.locator('text=Continue with Google')).toBeVisible();
    await expect(page.locator('text=Continue with Microsoft')).toBeVisible();
  });

  test('can toggle between login and register modes', async ({ page }) => {
    // Should start in Sign In mode
    await expect(page.locator('h1')).toContainText('Sign In');

    // Toggle to register
    const toggleBtn = page.locator('text=Create Account').or(page.locator('text=Sign Up'));
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click();
      await expect(page.locator('h1')).toContainText('Create Account');
    }
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.locator('input[type="email"]').fill('bad@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-form__error')).toBeVisible({ timeout: 10000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.locator('input[type="email"]').fill(TEST_USER.email);
    await page.locator('input[type="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard home
    await page.waitForURL('**/');
    await expect(page.locator('text=Passive Income Club')).toBeVisible({ timeout: 10000 });
  });

  test('redirects authenticated user away from login page', async ({ page }) => {
    // First login via API
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);

    // Navigate to login — should redirect to dashboard
    await page.goto('/login');
    await page.waitForURL('**/');
    // Should not see the login form
    await expect(page.locator('.login-card')).not.toBeVisible({ timeout: 5000 });
  });
});

test.describe('Logout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login via API before each test
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForURL('**/');
  });

  test('logout clears auth and redirects to login', async ({ page }) => {
    // Wait for the dashboard to be visible
    await expect(page.locator('.app-shell__logo-text')).toBeVisible({ timeout: 10000 });

    // Click the logout button (has title="Sign out" and class app-shell__logout-btn)
    await page.locator('.app-shell__logout-btn').click();

    // Should land on login page
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Sign In');

    // localStorage should be cleared
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });
});

test.describe('Auth Guard', () => {
  test('unauthenticated user is redirected to login from dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('unauthenticated user is redirected to login from profile', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForURL('**/login', { timeout: 10000 });
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('unauthenticated user can access login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-card')).toBeVisible();
  });
});
