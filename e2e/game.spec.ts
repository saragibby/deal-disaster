import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaAPI } from './helpers';

test.describe('Deal or Disaster - Welcome Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/deal-or-disaster/');
  });

  test('shows welcome page with user greeting', async ({ page }) => {
    await expect(page.locator('.welcome-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.welcome-text-section h2')).toContainText('Welcome back');
  });

  test('shows user stats badges', async ({ page }) => {
    await expect(page.locator('.welcome-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.badge-label', { hasText: 'Lifetime Points' })).toBeVisible();
    await expect(page.locator('.badge-label', { hasText: 'Current Streak' })).toBeVisible();
    await expect(page.locator('.badge-label', { hasText: 'Deals Found' })).toBeVisible();
    await expect(page.locator('.badge-label', { hasText: 'Disasters Avoided' })).toBeVisible();
  });

  test('shows how to play instructions', async ({ page }) => {
    await expect(page.locator('.welcome-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.how-to-play')).toBeVisible();
    await expect(page.locator('text=Review the Case')).toBeVisible();
    await expect(page.locator('text=Find Red Flags')).toBeVisible();
    await expect(page.locator('text=Make Your Decision')).toBeVisible();
  });

  test('shows play buttons', async ({ page }) => {
    await expect(page.locator('.welcome-page')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.daily-challenge-btn')).toBeVisible();
    await expect(page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' })).toBeVisible();
  });
});

test.describe('Deal or Disaster - Game Play', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/deal-or-disaster/');
    await expect(page.locator('.welcome-page')).toBeVisible({ timeout: 15000 });
  });

  test('starts regular game and shows case', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();

    // Case should load with property details
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });
    // Address heading should appear
    await expect(page.locator('.case-header h2')).toBeVisible();
  });

  test('shows decision buttons during game', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.buy-btn')).toBeVisible();
    await expect(page.locator('.investigate-btn')).toBeVisible();
    await expect(page.locator('.walk-btn')).toBeVisible();
  });

  test('shows timer during game', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.timer')).toBeVisible();
    await expect(page.locator('.timer')).toContainText('⏱️');
  });

  test('shows case tabs for summary and foreclosure notice', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.tab-btn', { hasText: 'Case Summary' })).toBeVisible();
    await expect(page.locator('.tab-btn', { hasText: 'Foreclosure Notice' })).toBeVisible();
  });

  test('shows property value grid', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.value-grid')).toBeVisible();
    await expect(page.locator('text=Property Value')).toBeVisible();
    await expect(page.locator('text=Auction Price')).toBeVisible();
  });

  test('can make a walk away decision', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await page.locator('.walk-btn').click();

    // Result modal should appear with score feedback
    await expect(page.locator('.result-modal')).toBeVisible({ timeout: 10000 });
  });
});
