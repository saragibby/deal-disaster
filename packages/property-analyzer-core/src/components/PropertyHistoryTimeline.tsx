import { propertyHistoryDate } from '../utils/propertyHistory';

interface Props {
  title: string;
  source: string;
  description: string;
  emptyMessage: string;
  priceLabel: string;
  missingPrice: string;
  events: Array<{ date: string; event: string; price: number | null }>;
}

export default function PropertyHistoryTimeline({
  title, source, description, emptyMessage, priceLabel, missingPrice, events,
}: Props) {
  const sorted = events.map(event => ({ ...event, timestamp: propertyHistoryDate(event.date) }))
    .sort((a, b) => {
      if (a.timestamp == null) return b.timestamp == null ? 0 : 1;
      if (b.timestamp == null) return -1;
      return b.timestamp - a.timestamp;
    });
  return (
    <section className="ownership-history__timeline" aria-label={title}>
      <h4>{title}</h4>
      <p className="ownership-history__source">Source: {source}. {description}</p>
      {sorted.length === 0 ? <p>{emptyMessage}</p> : (
        <div className="ownership-history__table-wrap">
          <table aria-label={title}>
            <thead><tr><th scope="col">Date</th><th scope="col">Event</th><th scope="col">{priceLabel}</th></tr></thead>
            <tbody>{sorted.map((entry, index) => (
              <tr key={`${entry.date}-${index}`}>
                <td>{entry.timestamp == null ? 'Date unavailable' : entry.date.slice(0, 10)}</td>
                <td>{entry.event || 'Event unavailable'}</td>
                <td>{entry.price == null || !Number.isFinite(entry.price) || entry.price <= 0 ? missingPrice :
                  new Intl.NumberFormat('en-US', {
                    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
                  }).format(entry.price)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
