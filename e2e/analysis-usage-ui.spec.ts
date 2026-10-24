import { test, expect, type Page } from '@playwright/test';
import type { AnalysisUsageSummary } from '@deal-platform/shared-types';

const user = { id: 7, name: 'Fixture User', email: 'fixture@example.test' };

function usage(overrides: Partial<AnalysisUsageSummary> = {}): AnalysisUsageSummary {
  return {
    mode: 'enforce',
    timezone: 'America/Chicago',
    exempt: false,
    pricePerRunCents: 75,
    today: {
      date: '2026-10-23', used: 5, freeLimit: 5, freeUsed: 5, freeRemaining: 0, paidRuns: 0,
      resetsAt: '2026-10-24T05:00:00.000Z',
    },
    credits: { balanceCents: 0, runsAvailable: 0 },
    nextRunChargeCents: -1,
    ...overrides,
  };
}

async function mockApi(page: Page, summary: AnalysisUsageSummary, onRun: () => void) {
  await page.addInitScript(fixtureUser => {
    localStorage.setItem('token', 'fixture-token');
    localStorage.setItem('user', JSON.stringify(fixtureUser));
  }, user);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/billing/summary') return route.fulfill({ json: summary });
    if (url.pathname === '/api/analyzer/run') {
      onRun();
      return route.fulfill({
        status: 402,
        json: { error: 'Daily analysis limit reached.', code: 'ANALYSIS_LIMIT_REACHED', usage: summary },
      });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: { user, analyses: [], total: 0, comparisons: [] } });
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    return route.continue();
  });
}

test('shows remaining usage and a limit dialog with ways to get unblocked', async ({ page }) => {
  let runs = 0;
  await mockApi(page, usage(), () => { runs++; });
  await page.goto('/property-analyzer/');

  await expect(page.getByTestId('usage-meter')).toContainText('Daily limit reached');
  await page.getByPlaceholder(/Enter an address/).fill('123 Main St, Austin, TX 78701');
  await page.locator('.analyzer__submit-btn').click();

  const dialog = page.getByRole('dialog', { name: 'You\'ve reached today\'s analysis limit' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('used all 5 free analyses');
  await expect(dialog).toContainText('$0.75 of credit');
  await expect(dialog).toContainText('always free');
  await expect(page.locator('.analyzer__error')).toHaveCount(0);
  expect(runs).toBe(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.locator('.analyzer__submit-btn').click();
  await dialog.getByRole('button', { name: 'View my analyses' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'History' }).first()).toBeVisible();
});

test('tells users when the next analysis will use credit', async ({ page }) => {
  await mockApi(page, usage({ credits: { balanceCents: 450, runsAvailable: 6 }, nextRunChargeCents: 75 }), () => undefined);
  await page.goto('/property-analyzer/');
  const meter = page.getByTestId('usage-meter');
  await expect(meter).toContainText('next analysis uses $0.75 of credit');
  await expect(meter).toContainText('$4.50 credit (≈6 analyses)');
  await expect(meter.getByRole('button', { name: 'Add credits' })).toBeVisible();
});

test('hides the usage meter for exempt accounts', async ({ page }) => {
  await mockApi(page, usage({ exempt: true, nextRunChargeCents: 0 }), () => undefined);
  await page.goto('/property-analyzer/');
  await expect(page.getByPlaceholder(/Enter an address/)).toBeVisible();
  await expect(page.getByTestId('usage-meter')).toHaveCount(0);
});
