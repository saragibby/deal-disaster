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
    await expect(page.locator('.walk-btn')).toBeVisible();
    // INVESTIGATE is no longer a terminal decision; only BUY / WALK remain.
    await expect(page.locator('.investigate-btn')).toHaveCount(0);
  });

  test('shows the limited due-diligence meter', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.due-diligence-meter')).toBeVisible();
    await expect(page.locator('.due-diligence-meter')).toContainText('Due diligence:');
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
    await expect(page.locator('text=Est. Market Value')).toBeVisible();
    await expect(page.locator('text=Starting Bid')).toBeVisible();
  });

  test('can make a walk away decision', async ({ page }) => {
    await page.locator('.start-btn-secondary', { hasText: 'Play Regular Game' }).click();
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    await page.locator('.walk-btn').click();

    // Result modal should appear with score feedback
    await expect(page.locator('.result-modal')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Deal or Disaster - Lien / Issue Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loginViaAPI(page, TEST_USER.email, TEST_USER.password);
  });

  test('redemption-state case shows redemption note, occupancy cost, and surviving lien badge', async ({ page }) => {
    await page.goto('/deal-or-disaster/deal/case-017');
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    // Redemption-period risk is surfaced to the player.
    await expect(page.locator('.redemption-note')).toBeVisible();
    await expect(page.locator('.redemption-note')).toContainText('Redemption period');

    // Occupancy line shows the occupant type and the cost to clear possession.
    await expect(page.locator('text=Occupied — former owner')).toBeVisible();
    await expect(page.locator('.occupancy-cost')).toContainText('to clear');

    // At least one lien is flagged as surviving the sale.
    await expect(page.locator('.lien-survival.survives').first()).toBeVisible();
  });

  test('junior-lien case shows liens that are wiped at sale', async ({ page }) => {
    await page.goto('/deal-or-disaster/deal/case-018');
    await expect(page.locator('.case-display')).toBeVisible({ timeout: 15000 });

    // The stacked junior liens are surfaced as wiped at the sale.
    await expect(page.locator('.lien-survival.wiped').first()).toBeVisible();
  });
});

