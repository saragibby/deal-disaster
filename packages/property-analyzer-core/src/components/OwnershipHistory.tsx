import { useState } from 'react';
import { FileText } from 'lucide-react';
import type { PropertyRecords, PropertyData } from '@deal-platform/shared-types';
import { usePropertyAnalyzerCore } from '../context.js';
import RecordedSaleSummary from './RecordedSaleSummary';
import PropertyHistoryTimeline from './PropertyHistoryTimeline';

export default function OwnershipHistory({ slug, initialRecords, listingPrice, priceHistory }: {
  slug: string;
  initialRecords?: PropertyRecords | null;
  listingPrice: number;
  priceHistory?: PropertyData['priceHistory'];
}) {
  const { adapters } = usePropertyAnalyzerCore();
  const [records, setRecords] = useState<PropertyRecords | null>(initialRecords ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await (refresh
        ? adapters.api.refreshPropertyRecords(slug)
        : adapters.api.getPropertyRecords(slug)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to retrieve property records.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="ownership-history" className="results__card results__section ownership-history">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--blue"><FileText size={20} /></span>
        Ownership &amp; Sale History
      </h3>
      <p className="results__card-subtitle">
        Recorded ownership and sales, separate from listing price changes. Records may lag recent transfers.
      </p>
      <button type="button" className="results__reset-btn" onClick={() => load(!!records)} disabled={loading}>
        {loading ? (records ? 'Refreshing records...' : 'Loading records...') :
          records ? 'Refresh records' : 'Load property records'}
      </button>
      {error && <p className="ownership-history__error" role="alert">{error}</p>}
      {error && records && <p className="ownership-history__source">Refresh failed. Showing the last successfully retrieved records.</p>}
      {records && (
        <>
          <p className="ownership-history__source">
            Source: RentCast public records &middot; Retrieved {new Date(records.retrievedAt).toLocaleString()}
            {' '}&middot; {Date.now() - Date.parse(records.retrievedAt) >= 24 * 60 * 60 * 1000
              ? 'Over 24 hours old - refresh for updated records.' : 'Retrieved within the last 24 hours.'}
          </p>
          {!records.found ? <p>No property record was found for this address.</p> : (
            <>
              <dl className="ownership-history__details">
                <div><dt>Recorded owner</dt><dd>{records.ownerNames.join(', ') || 'Not available'}</dd></div>
                <div><dt>Owner type</dt><dd>{records.ownerType || 'Not available'}</dd></div>
                <div><dt>Mailing address</dt><dd>{records.mailingAddress || 'Not available'}</dd></div>
                <div><dt>Owner occupied</dt><dd>{records.ownerOccupied == null ? 'Not available' : records.ownerOccupied ? 'Yes' : 'No'}</dd></div>
              </dl>
              <RecordedSaleSummary sales={records.sales} listingPrice={listingPrice} />
            </>
          )}
          <p className="ownership-history__source">
            Phone and email are not supplied by this provider. Verify ownership with county records;
            sale coverage and disclosed prices vary by county and state.
          </p>
        </>
      )}
      <div className="ownership-history__timelines">
        {records && (
          <PropertyHistoryTimeline
            title="Recorded Sales"
            source="RentCast public records"
            description="Reported sale transactions, newest first. This is not listing history."
            emptyMessage="No recorded sales returned by the provider."
            priceLabel="Recorded price"
            missingPrice="Not disclosed"
            events={records.sales}
          />
        )}
        <PropertyHistoryTimeline
          title="Listing & Price Events"
          source="saved property-data history"
          description="Listing-reported events, newest first. A sold event is not independent verification of a recorded transfer. Refresh records updates RentCast sales only, not this saved listing history."
          emptyMessage="No listing or price events are available in this saved analysis."
          priceLabel="Reported price"
          missingPrice="Not available"
          events={priceHistory ?? []}
        />
      </div>
    </section>
  );
}
