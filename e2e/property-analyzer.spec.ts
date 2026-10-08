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

  test('shows an actionable error when the property data provider is unavailable', async ({ page }) => {
    await page.route('**/api/analyzer/run', async route => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Property lookup is temporarily unavailable because the property data provider rejected the account billing or credit status. Please contact support if this continues.',
        }),
      });
    });

    await page.locator('.analyzer__url-input').fill('https://www.zillow.com/homedetails/12345678_zpid/');
    await page.locator('.analyzer__submit-btn').click();

    await expect(page.locator('.analyzer__error')).toContainText(
      'Property lookup is temporarily unavailable because the property data provider rejected the account billing or credit status. Please contact support if this continues.',
    );
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

  propertyAnalyzerTest('loads ownership and recorded sales only on request', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    const analysis = propertyFixtures.ownedAnalyses[0];
    let recordRequests = 0;
    await page.route('**/api/analyzer/history/*/property-records', async route => {
      recordRequests++;
      await route.fulfill({ json: {
        source: 'rentcast', retrievedAt: '2026-10-08T12:00:00.000Z', found: true,
        ownerNames: ['Fixture Holdings LLC'], ownerType: 'Organization',
        mailingAddress: '100 Example St, Example City, MI 48000', ownerOccupied: false,
        sales: [
          { date: '2025-01-15T00:00:00.000Z', event: 'Sale', price: 180000 },
          { date: '2020-06-01', event: 'Sale', price: null },
        ],
      } });
    });
    await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
    await expectFixtureAnalysisVisible(page, analysis);
    const section = page.locator('#ownership-history');
    await expect(section.getByRole('button', { name: 'Load property records' })).toBeVisible();
    expect(recordRequests).toBe(0);
    await section.getByRole('button', { name: 'Load property records' }).click();
    await expect(section).toContainText('Fixture Holdings LLC');
    await expect(section).toContainText('100 Example St');
    await expect(section).toContainText('$180,000');
    await expect(section).toContainText('Not disclosed');
    await expect(section).toContainText('Source: RentCast');
    expect(recordRequests).toBe(1);
  });

  propertyAnalyzerTest('shows property record errors, retries, and empty results', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    let recordRequests = 0;
    await page.route('**/api/analyzer/history/*/property-records', async route => {
      recordRequests++;
      if (recordRequests === 1) {
        await route.fulfill({ status: 503, json: { error: 'Property records are temporarily unavailable.' } });
      } else {
        await route.fulfill({ json: {
          source: 'rentcast', retrievedAt: '2026-10-08T12:00:00.000Z', found: false,
          ownerNames: [], ownerType: null, mailingAddress: null, ownerOccupied: null, sales: [],
        } });
      }
    });
    await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
    const section = page.locator('#ownership-history');
    await section.getByRole('button', { name: 'Load property records' }).click();
    await expect(section.getByRole('alert')).toContainText('temporarily unavailable');
    await section.getByRole('button', { name: 'Load property records' }).click();
    await expect(section).toContainText('No property record was found');
    await expect(section.getByRole('alert')).toHaveCount(0);
  });

  propertyAnalyzerTest('keeps property records private and owner-scoped', async ({ page, request, propertyFixtures }) => {
    const { token } = await loginAsFixtureOwner(page, propertyFixtures);
    const nonOwned = await request.get(
      `${API_URL}/api/analyzer/history/${propertyFixtures.nonOwnedAnalyses[0].slug}/property-records`,
      { headers: authHeaders(token) },
    );
    expect(nonOwned.status()).toBe(404);
    const anonymous = await request.get(
      `${API_URL}/api/analyzer/history/${propertyFixtures.ownedAnalyses[0].slug}/property-records`,
    );
    expect(anonymous.status()).toBe(401);
    await clearAuth(page);
    await page.goto(`/property-analyzer/shared/${propertyFixtures.publicAnalysis.public_share_id}`);
    await expectFixtureAnalysisVisible(page, propertyFixtures.publicAnalysis);
    await expect(page.locator('#ownership-history')).toHaveCount(0);
  });

  for (const viewport of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'mobile', width: 390, height: 844 }]) {
  propertyAnalyzerTest(`paginates, filters, and sorts LTR and MTR deep-dive comparables consistently on ${viewport.name}`, async ({ page, propertyFixtures }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAsFixtureOwner(page, propertyFixtures);
    const analysis = structuredClone(propertyFixtures.ownedAnalyses[0]);
    analysis.analysis_results.rentalEstimate.comps = Array.from({ length: 18 }, (_, index) => ({
      address: `Rental ${String(index + 1).padStart(2, '0')}`,
      source: 'rentcast',
      rent: 1000 + index * 100,
      bedrooms: index % 3,
      sqft: 1000 + index * 50,
    }));
    const mtr = analysis.analysis_results.mtrEstimate = {
      monthlyRate: 3000, furnishedPremium: 1.35, occupancyRate: 0.9,
      avgStayMonths: 3, turnoversPerYear: 4, grossMonthlyRevenue: 2700,
      utilityCosts: 200, turnoverCosts: 50, platformFees: 0, managementCosts: 100,
      netMonthlyRevenue: 2350, confidence: 'high', source: 'furnished-finder',
      seasonality: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        .map((month, index) => ({ month, revenue: 2500 + index * 20, occupancy: 0.9 })),
      revenueRange: { low: 2200, mid: 2700, high: 3200 },
      furnishingCosts: {
        perBedroomCost: 2000, commonAreaCost: 3000, totalCost: 9000,
        amortizedMonthly: 150, usefulLifeYears: 5, quality: 'standard',
      },
      demandFactors: {
        bedroomScore: 90, propertyTypeScore: 65, overallScore: 93,
        nearbyInstitutions: [
          { name: 'Fixture Medical Center', emoji: '🏥', miles: 2.4 },
          { name: 'Fixture University', emoji: '🎓', miles: 4.8 },
        ],
      },
      marketComps: { radiusMiles: 10, sampleSize: 18, totalListings: 30, comps: [] },
    };
    mtr.marketComps = {
      radiusMiles: 10, sampleSize: 18, totalListings: 30,
      comps: Array.from({ length: 18 }, (_, index) => ({
        bedrooms: index === 17 ? null : index % 3,
        bathrooms: index === 17 ? null : 1 + index % 2,
        propertyType: index === 17 ? null : index % 2 === 0 ? 'single_family' : 'apartment',
        monthlyRate: 2000 + index * 100,
      })),
    };
    analysis.analysis_results.strEstimate = {
      nightlyRate: 150, occupancyRate: 0.65, grossMonthlyRevenue: 2925,
      cleaningCosts: 300, platformFees: 90, netMonthlyRevenue: 2535,
      confidence: 'medium', source: 'algorithm',
    };
    await page.route(`**/api/analyzer/history/${analysis.slug}`, route => route.fulfill({
      json: { analysis },
    }));
    await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
    await expectFixtureAnalysisVisible(page, analysis);

    const deepDive = page.locator('.rental-tabs');
    await expect(deepDive.getByRole('button', { name: 'Long-Term', exact: true }))
      .toContainText('High confidence');
    await expect(deepDive.getByRole('button', { name: 'Mid-Term', exact: true }))
      .toContainText('High confidence');
    await expect(deepDive.getByRole('button', { name: 'Short-Term', exact: true }))
      .toContainText('Medium confidence');
    for (const tab of ['Long-Term', 'Mid-Term', 'Short-Term']) {
      await deepDive.getByRole('button', { name: tab, exact: true }).click();
      const cards = deepDive.locator('.rental-tabs__panel').locator(
        '.rental-insights__str-stat, .rental-insights__deep-section, .rental-tabs__cashflow, .rental-tabs__cashflow-item, .mtr-furnishing-card, .mtr-demand',
      );
      expect(await cards.count()).toBeGreaterThan(0);
      for (const card of await cards.all()) {
        await expect(card).toHaveCSS('border-top-width', '1px');
        await expect(card).toHaveCSS('border-right-width', '1px');
        await expect(card).toHaveCSS('border-bottom-width', '1px');
        await expect(card).toHaveCSS('border-left-width', '1px');
        await expect(card).toHaveCSS('border-top-style', 'solid');
        await expect(card).toHaveCSS('border-radius', '12px');
      }
    }
    await deepDive.getByRole('button', { name: 'Long-Term', exact: true }).click();
    for (const strategy of ['LTR', 'MTR']) {
      if (strategy === 'MTR') {
        await deepDive.getByRole('button', { name: 'Mid-Term', exact: true }).click();
        const demand = deepDive.getByRole('region', { name: 'MTR Demand', exact: true });
        await expect(demand).toContainText('93/100');
        await expect(demand).toContainText('Strong');
        await expect(demand).toContainText('Estimated suitability for mid-term rentals');
        await expect(demand.getByRole('meter', { name: 'Bedroom fit', exact: true })).toHaveAttribute('aria-valuenow', '90');
        await expect(demand.getByRole('meter', { name: 'Property-type fit', exact: true })).toHaveAttribute('aria-valuenow', '65');
        const rentalBar = page.locator('.strategy-comparison__bar-fill--income-mtr').first();
        const demandBars = demand.locator('.strategy-comparison__bar-fill');
        for (const property of ['background-image', 'border-radius', 'height']) {
          const rentalStyle = await rentalBar.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
          await expect(demandBars.nth(0)).toHaveCSS(property, rentalStyle);
          await expect(demandBars.nth(1)).toHaveCSS(property, rentalStyle);
        }
        await expect(demand).toContainText('+15 points');
        const institutions = deepDive.getByRole('region', { name: 'Nearby Institutions', exact: true });
        await expect(institutions).toContainText('Fixture Medical Center');
        await expect(institutions).toContainText('2.4 mi');
        await expect(demand).not.toContainText('Fixture Medical Center');
        const leftColumn = deepDive.locator('.mtr-demand-column');
        await expect(leftColumn.getByRole('region', { name: 'MTR Demand', exact: true })).toBeVisible();
        const furnishingBox = await leftColumn.locator('.rental-insights__mtr-furnishing').boundingBox();
        await expect(leftColumn.getByRole('region', { name: 'Upfront furnishing', exact: true })).toContainText('$9,000');
        await expect(leftColumn.getByRole('region', { name: 'Monthly amortization', exact: true })).toContainText('$150/mo');
        await expect(leftColumn.locator('.mtr-furnishing-card')).toHaveCount(2);
        await expect(leftColumn.locator('.mtr-furnishing-card').first()).toHaveCSS('border-top-style', 'solid');
        const demandBox = await demand.boundingBox();
        if (!furnishingBox || !demandBox) throw new Error('Furnishing and demand layout is not visible.');
        expect(furnishingBox.x).toBe(demandBox.x);
        expect(furnishingBox.width).toBe(demandBox.width);
        expect(demandBox.y).toBeGreaterThanOrEqual(furnishingBox.y + furnishingBox.height);
        const factorsBox = await leftColumn.boundingBox();
        const institutionsBox = await institutions.boundingBox();
        if (!factorsBox || !institutionsBox) throw new Error('Demand card layout is not visible.');
        if (viewport.name === 'mobile') {
          expect(institutionsBox.y).toBeGreaterThanOrEqual(factorsBox.y + factorsBox.height);
        } else {
          expect(institutionsBox.x).toBeGreaterThan(factorsBox.x);
          expect(institutionsBox.y).toBe(factorsBox.y);
        }
        await expect(deepDive.locator('.rental-insights__mtr-furnishing')).toContainText('Upfront furnishing');
        await expect(deepDive.locator('.rental-insights__mtr-furnishing')).toContainText('$9,000');
        await expect(deepDive.locator('.rental-insights__mtr-furnishing')).toContainText('Monthly amortization');
        await expect(deepDive.locator('.rental-insights__mtr-furnishing')).toContainText('$150/mo');
        const charts = deepDive.locator('.mtr-revenue-charts');
        await expect(charts).toContainText('MTR Monthly Revenue Seasonality');
        await expect(charts).toContainText('MTR Revenue Range');
        const demandBarHeight = await demand.getByRole('meter', { name: 'Bedroom fit', exact: true })
          .evaluate(element => getComputedStyle(element).height);
        await expect(charts.locator('.rental-insights__range-track')).toHaveCSS('height', demandBarHeight);
        const seasonalityBox = await charts.locator(':scope > div').nth(0).boundingBox();
        const rangeBox = await charts.locator(':scope > div').nth(1).boundingBox();
        if (!seasonalityBox || !rangeBox) throw new Error('MTR revenue charts are not visible.');
        if (viewport.name === 'desktop') {
          expect(rangeBox.x).toBeGreaterThan(seasonalityBox.x);
          expect(rangeBox.y).toBe(seasonalityBox.y);
          const plotBox = await charts.locator('.rental-insights__seasonality-chart').boundingBox();
          const rangePlotBox = await charts.locator('.rental-insights__range').boundingBox();
          if (!plotBox || !rangePlotBox) throw new Error('Revenue plotting areas are not visible.');
          expect(Math.abs((rangePlotBox.y + rangePlotBox.height / 2) - (plotBox.y + plotBox.height / 2)))
            .toBeLessThanOrEqual(1);
        } else {
          expect(rangeBox.y).toBeGreaterThanOrEqual(seasonalityBox.y + seasonalityBox.height);
        }
      }
      const table = deepDive.getByRole('table', {
        name: strategy === 'LTR' ? 'LTR rental comparables' : 'MTR furnished comparables',
      });
      const section = deepDive.getByRole('region', {
        name: strategy === 'LTR' ? 'LTR rental comparables' : 'MTR furnished comparables',
      });
      await expect(table.locator('tbody tr')).toHaveCount(8);
      await expect(table.getByRole('spinbutton')).toHaveCount(0);
      await expect(table.getByRole('searchbox')).toHaveCount(0);
      await expect(section.getByRole('status')).toContainText('1-8 of 18');
      await expect(section.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
      await section.getByRole('button', { name: 'Next page', exact: true }).click();
      await expect(section.getByRole('status')).toContainText('9-16 of 18');
      await section.getByRole('button', { name: 'Next page', exact: true }).click();
      await expect(table.locator('tbody tr')).toHaveCount(2);
      await expect(section.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();

      for (const label of strategy === 'LTR' ? ['Source', 'Rent / mo', 'Beds', 'Sq Ft'] : ['Beds', 'Baths', 'Property Type', 'Rent / mo']) {
        const header = table.getByRole('columnheader').filter({ has: page.getByRole('button', { name: label, exact: true }) });
        await header.getByRole('button', { name: label, exact: true }).click();
        await expect(header).toHaveAttribute('aria-sort', 'ascending');
        await expect(section.getByRole('status')).toContainText('Page 1 of 3');
        await header.getByRole('button', { name: label, exact: true }).click();
        await expect(header).toHaveAttribute('aria-sort', 'descending');
      }
      const rentIndex = strategy === 'LTR' ? 1 : 3;
      await expect(table.locator('tbody tr').first().locator('td').nth(rentIndex)).toHaveText(strategy === 'LTR' ? '$2,700' : '$3,700');
      await table.getByRole('button', { name: 'Rent / mo', exact: true }).click();
      await expect(table.locator('tbody tr').first().locator('td').nth(rentIndex)).toHaveText(strategy === 'LTR' ? '$1,000' : '$2,000');

      await section.getByRole('button', { name: 'Next page', exact: true }).click();
      const editor = page.getByRole('dialog');
      await table.getByRole('button', { name: 'Edit Rent / mo filter', exact: true }).click();
      await expect(editor).toBeVisible();
      await expect(editor).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(editor.getByRole('spinbutton', { name: 'Minimum Rent / mo', exact: true }))
        .toHaveCSS('background-color', 'rgb(255, 255, 255)');
      const editorBox = await editor.boundingBox();
      expect(editorBox).not.toBeNull();
      expect(editorBox!.x).toBeGreaterThanOrEqual(0);
      expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(viewport.width);
      await editor.getByRole('spinbutton', { name: 'Minimum Rent / mo', exact: true }).fill(strategy === 'LTR' ? '1500' : '2500');
      await editor.getByRole('spinbutton', { name: 'Maximum Rent / mo', exact: true }).fill(strategy === 'LTR' ? '1800' : '2800');
      await editor.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(section.locator('.rental-comps__toolbar')).toContainText(strategy === 'LTR' ? 'Rent / mo: $1,500 - $1,800' : 'Rent / mo: $2,500 - $2,800');
      await expect(table.locator('tbody tr')).toHaveCount(4);
      await expect(section.getByRole('status')).toContainText('1-4 of 4 (18 total)');
      await table.getByRole('button', { name: 'Edit Beds filter', exact: true }).click();
      await editor.getByRole('spinbutton', { name: 'Maximum Beds', exact: true }).fill('0');
      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      await expect(table.getByRole('button', { name: 'Edit Beds filter', exact: true })).toBeFocused();
      await expect(table.locator('tbody tr')).toHaveCount(1);
      await section.getByRole('button', { name: 'Remove Beds filter', exact: true }).click();
      await expect(table.locator('tbody tr')).toHaveCount(4);
      await section.getByRole('button', { name: 'Clear filters', exact: true }).click();

      await table.getByRole('button', { name: strategy === 'LTR' ? 'Edit Source filter' : 'Edit Property Type filter', exact: true }).click();
      await editor.getByRole('searchbox', { name: strategy === 'LTR' ? 'Filter Source' : 'Filter Property Type', exact: true })
        .fill(strategy === 'LTR' ? 'rEnTaL 01' : 'SINGLE FAMILY');
      await expect(table.locator('tbody tr')).toHaveCount(strategy === 'LTR' ? 1 : 8);
      await expect(section.getByRole('status')).toContainText(strategy === 'LTR' ? 'of 1 (18 total)' : 'of 9 (18 total)');
      await editor.getByRole('searchbox').fill('no such property');
      await expect(table).toContainText('No comparable properties match these filters.');
      await expect(section.getByRole('status')).toContainText('0 of 0');
      await expect(section.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
      await editor.getByRole('button', { name: 'Done', exact: true }).click();
      await section.getByRole('button', { name: 'Clear filters', exact: true }).click();
      await expect(table.locator('tbody tr')).toHaveCount(8);
      await table.getByRole('button', { name: 'Edit Beds filter', exact: true }).click();
      await editor.getByRole('spinbutton', { name: 'Maximum Beds', exact: true }).fill('0');
      await expect(table.locator('tbody tr')).toHaveCount(6);
      await expect(table.locator('tbody tr').first().locator('td').nth(strategy === 'LTR' ? 2 : 0)).toHaveText('0');
      await editor.getByRole('button', { name: 'Reset filter', exact: true }).click();
      await expect(editor.getByRole('spinbutton', { name: 'Maximum Beds', exact: true })).toHaveValue('');
      await expect(table.locator('tbody tr')).toHaveCount(8);
      await section.locator('.rental-comps__toolbar > span').click();
      await expect(editor).toHaveCount(0);
      await expect(section.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled();
      if (strategy === 'MTR') {
        await table.getByRole('button', { name: 'Beds', exact: true }).click();
        await table.getByRole('button', { name: 'Beds', exact: true }).click();
        await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('2');
        await section.getByRole('button', { name: 'Next page', exact: true }).click();
        await section.getByRole('button', { name: 'Next page', exact: true }).click();
        await expect(table.locator('tbody tr').last().locator('td').first()).toHaveText('—');
        await expect(table.locator('tbody tr').last().locator('td').nth(2)).toHaveText('—');
      }
    }
  });
  }

  propertyAnalyzerTest('shows unavailable demand data without inventing a location boost', async ({ page, propertyFixtures }) => {
    await loginAsFixtureOwner(page, propertyFixtures);
    const analysis = structuredClone(propertyFixtures.ownedAnalyses[0]);
    analysis.analysis_results.mtrEstimate = {
      monthlyRate: 3000, furnishedPremium: 1.35, occupancyRate: 0.9,
      avgStayMonths: 3, turnoversPerYear: 4, grossMonthlyRevenue: 2700,
      utilityCosts: 200, turnoverCosts: 50, platformFees: 0, managementCosts: 100,
      netMonthlyRevenue: 2350, confidence: 'low', source: 'algorithm',
      furnishingCosts: {
        perBedroomCost: 2000, commonAreaCost: 3000, totalCost: 9000,
        amortizedMonthly: 150, usefulLifeYears: 5, quality: 'standard',
      },
      demandFactors: { bedroomScore: 90, propertyTypeScore: 65, overallScore: 78 },
    };
    await page.route(`**/api/analyzer/history/${analysis.slug}`, route => route.fulfill({ json: { analysis } }));
    await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
    await expectFixtureAnalysisVisible(page, analysis);
    await page.locator('.rental-tabs').getByRole('button', { name: 'Mid-Term', exact: true }).click();
    await expect(page.locator('.rental-tabs').getByRole('button', { name: 'Mid-Term', exact: true })).toContainText('Low confidence');
    const demand = page.getByRole('region', { name: 'MTR Demand', exact: true });
    await expect(demand).toContainText('No added boost');
    await expect(page.getByRole('region', { name: 'Nearby Institutions', exact: true })).toContainText('Nearby institution data is unavailable');
    await expect(demand).not.toContainText('+1 points');
    analysis.analysis_results.mtrEstimate.demandFactors = {
      bedroomScore: 95, propertyTypeScore: 90, overallScore: 100,
      nearbyInstitutions: [{ name: 'Fixture Hospital', emoji: '🏥', miles: 1 }],
    };
    await page.reload();
    await expectFixtureAnalysisVisible(page, analysis);
    await page.locator('.rental-tabs').getByRole('button', { name: 'Mid-Term', exact: true }).click();
    await expect(demand).toContainText('100/100');
    await expect(demand).toContainText('+7 points');
  });

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
    const publicBody = await publicRes.json();
    expect(publicBody.analysis).not.toHaveProperty('user_id');
    expect(publicBody.analysis).not.toHaveProperty('is_shared');

    const opaquePublicRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${propertyFixtures.publicAnalysis.public_share_id}`,
    );
    await expect(opaquePublicRes).toBeOK();

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
    const shareBody = await shareRes.json();
    expect(shareBody).toMatchObject({
      slug: propertyFixtures.privateAnalysis.slug,
      is_shared: true,
    });
    expect(typeof shareBody.public_share_id).toBe('string');

    const newlyPublicRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${propertyFixtures.privateAnalysis.slug}`,
    );
    await expect(newlyPublicRes).toBeOK();
    const newlyPublicOpaqueRes = await page.request.get(
      `${API_URL}/api/analyzer/shared/${shareBody.public_share_id}`,
    );
    await expect(newlyPublicOpaqueRes).toBeOK();
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
    const copiedUrl = await page.waitForFunction(() => (window as any).__copiedText).then(handle => handle.jsonValue() as Promise<string>);
    expect(copiedUrl).toContain('/property-analyzer/shared/');
    expect(copiedUrl).not.toContain(`/property-analyzer/shared/${privateAnalysis.slug}`);

    await page.locator('.results__property-actions button', { hasText: 'Public' }).click();
    await expect(page.locator('.results__property-actions button', { hasText: 'Private' })).toBeVisible({ timeout: 15000 });
    await page.goto(`/property-analyzer/shared/${privateAnalysis.slug}`);
    await expect(page.locator('.shared-view__error')).toBeVisible({ timeout: 15000 });

    const reshareRes = await page.request.patch(
      `${API_URL}/api/analyzer/history/${privateAnalysis.slug}/share`,
      {
        headers: authHeaders((await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password)).token),
        data: { shared: true },
      },
    );
    await expect(reshareRes).toBeOK();
    const reshareBody = await reshareRes.json();
    await clearAuth(page);
    await page.goto(`/property-analyzer/shared/${reshareBody.public_share_id}`);
    await expect(page.locator('.shared-view__banner')).toContainText('Shared Analysis');
    await expectFixtureAnalysisVisible(page, privateAnalysis);
    await expect(page.locator('.results__property-actions')).toHaveCount(0);
    await expect(page.locator('button', { hasText: 'Re-analyze' })).toHaveCount(0);
    await expect(page.locator('.results__offer-toggle')).toHaveCount(0);
    await expect(page.locator('.results__editable-input')).toHaveCount(0);
    await expect(page.locator('.slider-input__controls')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Chat with Will' })).toHaveCount(0);

    await page.goto(`/property-analyzer/shared/${privateAnalysis.slug}`);
    await expectFixtureAnalysisVisible(page, privateAnalysis);
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

  propertyAnalyzerTest('starts analysis and comparison PDF/print exports without uncaught browser errors', async ({ page, propertyFixtures }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      (window as any).__propertyAnalyzerExportEvents = [];
      const originalAddEventListener = window.addEventListener.bind(window);
      originalAddEventListener('property-analyzer:export-started', ((event: CustomEvent<{ kind: string }>) => {
        (window as any).__propertyAnalyzerExportEvents.push(event.detail.kind);
      }) as EventListener);
      window.print = () => {
        (window as any).__printCalls = ((window as any).__printCalls ?? 0) + 1;
      };
    });
    await loginAsFixtureOwner(page, propertyFixtures);
    await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
    await expectFixtureAnalysisVisible(page, propertyFixtures.ownedAnalyses[0]);
    page.on('dialog', dialog => dialog.dismiss());
    await page.locator('.results__property-actions button', { hasText: 'Export PDF' }).click();
    await expect(page.locator('.results__property-actions button', { hasText: /Export PDF|Exporting/ })).toBeVisible();
    await page.locator('.results__property-actions button', { hasText: 'Print' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__printCalls ?? 0)).toBeGreaterThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => (window as any).__propertyAnalyzerExportEvents)).toEqual([
      'analysis-pdf',
      'analysis-print',
    ]);

    const [first, second] = propertyFixtures.ownedAnalyses;
    await page.goto(`/property-analyzer/compare?props=${first.slug},${second.slug}`);
    await expect(page.locator('.comparison-dashboard__title')).toContainText('Comparing 2 Properties', { timeout: 15000 });
    await page.locator('.comparison-dashboard__actions button', { hasText: 'PDF' }).click();
    await expect(page.locator('.comparison-dashboard__actions button', { hasText: /PDF|Exporting/ })).toBeVisible();
    await page.locator('.comparison-dashboard__actions button', { hasText: 'Print' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__printCalls ?? 0)).toBeGreaterThanOrEqual(1);

    await expect.poll(() => page.evaluate(() => (window as any).__propertyAnalyzerExportEvents)).toEqual([
      'comparison-pdf',
      'comparison-print',
    ]);
    expect(pageErrors).toEqual([]);
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
