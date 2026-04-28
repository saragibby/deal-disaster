import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaAPI } from './helpers';

test.describe('Dashboard Home', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
  });

  test('shows welcome message and stat cards', async ({ page }) => {
    await expect(page.locator('.home__title')).toContainText('Welcome back');

    // Stat cards should be visible
    await expect(page.locator('.stat-card__label', { hasText: 'Lifetime Points' })).toBeVisible();
    await expect(page.locator('.stat-card__label', { hasText: 'Day Streak' })).toBeVisible();
    await expect(page.locator('.stat-card__label', { hasText: 'Deals Found' })).toBeVisible();
    await expect(page.locator('.stat-card__label', { hasText: 'Disasters Avoided' })).toBeVisible();
  });

  test('shows all games section', async ({ page }) => {
    await expect(page.locator('.section-title', { hasText: 'All Games' })).toBeVisible();
    await expect(page.locator('.game-grid')).toBeVisible();
  });

  test('shows top players section', async ({ page }) => {
    await expect(page.locator('.section-title', { hasText: 'Top Players' })).toBeVisible();
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await expect(page.locator('.home__title')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to games page', async ({ page }) => {
    await page.goto('/games');
    await expect(page.locator('.page-title', { hasText: 'Games' })).toBeVisible();
    await expect(page.locator('.section-title', { hasText: 'Available Now' })).toBeVisible();
  });

  test('can navigate to leaderboard page', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.locator('.page-title', { hasText: 'Leaderboard' })).toBeVisible();
    // May show table or empty state depending on DB
    const table = page.locator('.leaderboard-table');
    const emptyState = page.locator('.empty-state');
    await expect(table.or(emptyState)).toBeVisible();
  });

  test('can navigate to profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.locator('.page-title', { hasText: 'My Profile' })).toBeVisible();
    await expect(page.locator('.profile-card')).toBeVisible();
    // Should show the test user's email
    await expect(page.locator('.profile-card__email')).toContainText(TEST_USER.email);
  });

  test('can navigate to resources page', async ({ page }) => {
    await page.goto('/resources');
    await expect(page.locator('.page-title', { hasText: 'Learning Resources' })).toBeVisible();
  });

  test('can navigate to tools page', async ({ page }) => {
    await page.goto('/tools');
    await expect(page.locator('.page-title', { hasText: 'Investing Tools' })).toBeVisible();
  });

  test('can navigate to news page', async ({ page }) => {
    await page.goto('/news');
    await expect(page.locator('.page-title', { hasText: 'News & Updates' })).toBeVisible();
  });
});

test.describe('Games Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/games');
  });

  test('shows Deal or Disaster as available game', async ({ page }) => {
    await expect(page.locator('.page-title', { hasText: 'Games' })).toBeVisible();
    await expect(page.locator('.game-card__title', { hasText: 'Deal or Disaster' })).toBeVisible();
  });

  test('shows coming soon games', async ({ page }) => {
    await expect(page.locator('.section-title', { hasText: 'Coming Soon' })).toBeVisible();
  });
});
