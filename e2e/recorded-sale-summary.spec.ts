import { propertyAnalyzerTest as test, expect } from './property-analyzer-fixtures';
import { loginViaAPI } from './helpers';
import type { PropertyRecords } from '@deal-platform/shared-types';

const cases: Array<{
  name: string;
  listingPrice: number;
  sales: PropertyRecords['sales'];
  date?: string;
  purchasePrice?: string;
  elapsed?: string;
  difference?: string;
  percentage?: string;
}> = [
  {
    name: 'selects the latest sale regardless of order and excludes listing events',
    listingPrice: 285000,
    sales: [
      { date: '2020-01-01', price: 90000, event: 'Sale' },
      { date: '2026-09-01', price: 300000, event: 'Listed for sale' },
      { date: '2025-01-15T00:00:00.000Z', price: 180000, event: 'Sale' },
    ],
    date: '2025-01-15', purchasePrice: '$180,000', elapsed: '1 year, 8 months',
    difference: '+$105,000', percentage: '+58.3%',
  },
  {
    name: 'shows price declines without implying profit',
    listingPrice: 150000,
    sales: [{ date: '2026-10-07', price: 200000, event: 'Sale' }],
    date: '2026-10-07', purchasePrice: '$200,000', elapsed: '1 day',
    difference: '-$50,000', percentage: '-25.0%',
  },
  {
    name: 'does not substitute an older disclosed price',
    listingPrice: 285000,
    sales: [
      { date: '2025-01-15', price: null, event: 'Sale' },
      { date: '2020-01-01', price: 100000, event: 'Sale' },
    ],
    date: '2025-01-15', purchasePrice: 'Not disclosed',
    difference: 'Not available', percentage: 'Not available',
  },
  {
    name: 'guards zero sale prices and future dates',
    listingPrice: 285000,
    sales: [{ date: '2027-01-01', price: 0, event: 'Sale' }],
    date: '2027-01-01', purchasePrice: 'Not disclosed',
    elapsed: 'Future-dated record - verify with county records',
    difference: 'Not available', percentage: 'Not available',
  },
  {
    name: 'guards missing listing prices',
    listingPrice: 0,
    sales: [{ date: '2026-10-08', price: 180000, event: 'Sale' }],
    date: '2026-10-08', purchasePrice: '$180,000', elapsed: 'Today',
    difference: 'Not available', percentage: 'Not available',
  },
  {
    name: 'handles equal prices and rejects invalid calendar dates',
    listingPrice: 180000,
    sales: [
      { date: '2026-02-30', price: 300000, event: 'Sale' },
      { date: '2025-01-01', price: 180000, event: 'Sale' },
    ],
    date: '2025-01-01', purchasePrice: '$180,000', difference: '$0', percentage: '0.0%',
  },
  { name: 'handles no sales', listingPrice: 285000, sales: [] },
];

for (const entry of cases) {
  test(`recorded sale summary ${entry.name}`, async ({ page, propertyFixtures }) => {
    await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
    await page.goto('/');
    await loginViaAPI(page, propertyFixtures.owner.email, propertyFixtures.owner.password);
    const analysis = structuredClone(propertyFixtures.ownedAnalyses[0]);
    analysis.property_data.price = entry.listingPrice;
    analysis.user_overrides = { params: { offerPrice: 123456 } };
    analysis.property_records = {
      source: 'rentcast', found: true, retrievedAt: '2026-10-08T12:00:00Z',
      ownerNames: [], ownerType: null, mailingAddress: null, ownerOccupied: null,
      sales: entry.sales,
    };
    await page.route(`**/api/analyzer/history/${analysis.slug}`, route =>
      route.fulfill({ json: { analysis } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/property-analyzer/analysis/${analysis.slug}`);
    const section = page.locator('#ownership-history');
    if (!entry.date) {
      await expect(section).toContainText('No recorded sale with a valid date is available');
      return;
    }
    const summary = section.locator('.ownership-history__sale-summary');
    const value = (label: string) => summary.locator('dl > div').filter({
      has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }),
    }).locator('dd');
    await expect(value('Sale date')).toHaveText(entry.date);
    await expect(value('Recorded purchase price')).toHaveText(entry.purchasePrice!);
    if (entry.elapsed) await expect(value('Time since recorded sale')).toHaveText(entry.elapsed);
    await expect(value('Price difference')).toHaveText(entry.difference!);
    await expect(value('Percentage difference')).toHaveText(entry.percentage!);
    await expect(value('Saved listing/property price')).not.toHaveText('$123,456');
    await expect(summary).toContainText('not owner profit or equity');
    await expect(summary).toContainText('not a live listing lookup or your adjusted offer');
  });
}
