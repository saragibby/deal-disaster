import type { PropertyRecords } from '@deal-platform/shared-types';
import { propertyHistoryDate } from '../utils/propertyHistory';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);

function elapsedTime(timestamp: number, now: number): string {
  if (timestamp > now) return 'Future-dated record - verify with county records';
  const start = new Date(timestamp);
  const end = new Date(now);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() - start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) months--;
  if (months < 1) {
    const days = Math.floor((now - timestamp) / (24 * 60 * 60 * 1000));
    return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return [
    years ? `${years} year${years === 1 ? '' : 's'}` : '',
    remainingMonths ? `${remainingMonths} month${remainingMonths === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ');
}

export default function RecordedSaleSummary({ sales, listingPrice }: {
  sales: PropertyRecords['sales'];
  listingPrice: number;
}) {
  const datedSales = sales
    .filter(sale => sale.event.trim().toLowerCase() === 'sale')
    .map(sale => ({ sale, timestamp: propertyHistoryDate(sale.date) }))
    .filter((entry): entry is { sale: PropertyRecords['sales'][number]; timestamp: number } =>
      entry.timestamp != null)
    .sort((a, b) => b.timestamp - a.timestamp);
  const latest = datedSales[0];
  if (!latest) {
    return <p>No recorded sale with a valid date is available for the sale summary.</p>;
  }
  const price = latest.sale.price;
  const hasSalePrice = price != null && Number.isFinite(price) && price > 0;
  const hasListingPrice = Number.isFinite(listingPrice) && listingPrice > 0;
  const difference = hasSalePrice && hasListingPrice ? listingPrice - price : null;
  const percentage = difference != null && hasSalePrice ? difference / price * 100 : null;

  return (
    <div className="ownership-history__sale-summary">
      <h4>Latest Recorded Sale</h4>
      <dl className="ownership-history__details">
        <div><dt>Sale date</dt><dd>{latest.sale.date.slice(0, 10)}</dd></div>
        <div><dt>Recorded purchase price</dt><dd>{hasSalePrice ? money(price) : 'Not disclosed'}</dd></div>
        <div><dt>Time since recorded sale</dt><dd>{elapsedTime(latest.timestamp, Date.now())}</dd></div>
      </dl>
      <h4>Listing Price vs. Last Recorded Sale</h4>
      <dl className="ownership-history__details">
        <div><dt>Saved listing/property price</dt><dd>{hasListingPrice ? money(listingPrice) : 'Not available'}</dd></div>
        <div><dt>Price difference</dt><dd>{difference == null ? 'Not available' :
          `${difference > 0 ? '+' : ''}${money(difference)}`}</dd></div>
        <div><dt>Percentage difference</dt><dd>{percentage == null ? 'Not available' :
          `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`}</dd></div>
      </dl>
      {difference == null && (
        <p className="ownership-history__source">
          A comparison requires a disclosed positive price for the latest recorded sale and an available listing/property price.
        </p>
      )}
      <p className="ownership-history__source">
        Uses the listing/property price saved in this analysis, not a live listing lookup or your adjusted offer.
        The difference is not owner profit or equity; it excludes debt, improvements, transaction costs, and taxes.
        Time since sale does not establish how long the current owner has owned the property.
      </p>
    </div>
  );
}
