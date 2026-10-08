import { propertyAnalyzerTest as test, expect } from './property-analyzer-fixtures';
import { loginViaAPI } from './helpers';

for (const width of [1280, 390]) {
  test(`separates recorded sales from listing events at ${width}px`, async ({ page, propertyFixtures }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
    const analysis = structuredClone(propertyFixtures.ownedAnalyses[0]);
    analysis.property_records = {
      source: 'rentcast', retrievedAt: new Date().toISOString(), found: true,
      ownerNames: [], ownerType: null, mailingAddress: null, ownerOccupied: null,
      sales: [
        { date: '2020-01-01', event: 'Sale', price: null },
        { date: '2025-01-01', event: 'Sale', price: 180000 },
      ],
    };
    analysis.property_data.priceHistory = [
      { date: '2026-10-01', event: 'Listed for sale', price: 300000 },
      { date: 'bad-date', event: 'Listing removed', price: 0 },
      { date: '2026-10-05', event: 'Price change', price: 285000 },
      { date: '2025-01-01', event: 'Sold', price: 175000 },
    ];
    await page.route(`**/api/analyzer/history/${analysis.slug}`, route => route.fulfill({ json: { analysis } }));
    await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
    const section = page.locator('#ownership-history');
    const ownershipNav = page.locator('.section-nav').getByRole('button', { name: 'Ownership', exact: true });
    await expect(ownershipNav).toBeVisible();
    expect(await section.evaluate(element => {
      const outlook = document.getElementById('stress-test');
      return outlook?.nextElementSibling === element;
    })).toBe(true);
    await ownershipNav.click();
    await expect(ownershipNav).toHaveClass(/section-nav__item--active/);
    const sales = section.getByRole('table', { name: 'Recorded Sales', exact: true });
    const listings = section.getByRole('table', { name: 'Listing & Price Events', exact: true });
    await expect(sales.locator('tbody tr').first()).toContainText('2025-01-01');
    await expect(sales).toContainText('$180,000');
    await expect(sales).toContainText('Not disclosed');
    await expect(sales).not.toContainText('Price change');
    await expect(listings.locator('tbody tr').first()).toContainText('Price change');
    await expect(listings.locator('tbody tr').last()).toContainText('Date unavailable');
    await expect(listings).toContainText('$175,000');
    await expect(listings).not.toContainText('$180,000');
    await expect(section).toContainText('Source: saved property-data history');
    await expect(section).toContainText('not independent verification');
    await expect(section).toContainText('Refresh records updates RentCast sales only');
  });
}

test('listing history remains visible when recorded-sales lookup fails', async ({ page, propertyFixtures }) => {
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  await page.route('**/api/analyzer/history/*/property-records', route =>
    route.fulfill({ status: 503, json: { error: 'RentCast is unavailable.' } }));
  await page.goto(`/property-analyzer/analysis/${propertyFixtures.ownedAnalyses[0].slug}`);
  const section = page.locator('#ownership-history');
  await expect(section.getByRole('table', { name: 'Listing & Price Events' })).toContainText('Listed for sale');
  await section.getByRole('button', { name: 'Load property records' }).click();
  await expect(section.getByRole('alert')).toContainText('RentCast is unavailable');
  await expect(section.getByRole('table', { name: 'Listing & Price Events' })).toContainText('Listed for sale');
});

test('shows distinct empty histories without inventing events', async ({ page, propertyFixtures }) => {
  await page.goto('/');
  await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
  const analysis = structuredClone(propertyFixtures.ownedAnalyses[0]);
  delete analysis.property_data.priceHistory;
  analysis.property_records = {
    source: 'rentcast', retrievedAt: new Date().toISOString(), found: false,
    ownerNames: [], ownerType: null, mailingAddress: null, ownerOccupied: null, sales: [],
  };
  await page.route(`**/api/analyzer/history/${analysis.slug}`, route => route.fulfill({ json: { analysis } }));
  await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
  const section = page.locator('#ownership-history');
  await expect(section).toContainText('No recorded sales returned by the provider');
  await expect(section).toContainText('No listing or price events are available');
  await expect(section.getByRole('table')).toHaveCount(0);
});
