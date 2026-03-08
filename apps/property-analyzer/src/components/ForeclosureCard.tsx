import { useState, useEffect } from 'react';
import { api } from '@deal-platform/shared-auth';
import { Gavel, MapPin, BedDouble, Bath, Ruler, Calendar, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

interface XomeListing {
  listingID: number;
  detailLinkHref: string;
  streetAddress: string;
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  propertyType: string;
  numberBedrooms: number;
  numberBaths: number;
  totalAreaHigh: number;
  yearBuilt: number;
  latitude: number;
  longitude: number;
  imageFilePath: string;
  isListingImageAvailable: boolean;
  auctionSaleTransactionTypeDisplayString: string;
  isActiveAuction: boolean;
  _distance: number;
  auctionInfo: {
    eventTypeDisplayString: string;
    bidAmount: string;
    startingBid: string;
    formattedAuctionStartDate: string;
    formattedAuctionEndDate: string;
    hasAuctionEnded: boolean;
    isAuctionRunning: boolean;
    hasBuyersPremium: boolean;
  };
}

interface Props {
  zip: string;
  city: string;
  state: string;
  latitude?: number;
  longitude?: number;
}

const PREVIEW_COUNT = 4;

export default function ForeclosureCard({ zip, city, state, latitude, longitude }: Props) {
  const [listings, setListings] = useState<XomeListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchForeclosures() {
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        setError('Location coordinates not available');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await api.searchForeclosures({
          latitude,
          longitude,
          limit: 50,
        });

        if (!cancelled) {
          const items: XomeListing[] = data?.data?.listings || [];
          setListings(items);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch foreclosures');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchForeclosures();
    return () => { cancelled = true; };
  }, [zip, city, state, latitude, longitude]);

  if (loading) {
    return (
      <div className="results__card foreclosure-card">
        <h3 className="results__card-title">
          <span className="results__icon results__icon--red"><Gavel size={20} /></span>
          Nearby Foreclosures
        </h3>
        <div className="foreclosure-card__loading">
          <span className="analyzer-spinner" /> Searching foreclosure auctions near {zip}…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="results__card foreclosure-card">
        <h3 className="results__card-title">
          <span className="results__icon results__icon--red"><Gavel size={20} /></span>
          Nearby Foreclosures
        </h3>
        <div className="foreclosure-card__empty">
          Unable to fetch foreclosure data. {error}
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="results__card foreclosure-card">
        <h3 className="results__card-title">
          <span className="results__icon results__icon--red"><Gavel size={20} /></span>
          Nearby Foreclosures
        </h3>
        <div className="foreclosure-card__empty">
          No active foreclosure auctions found near {city}, {state} {zip}.
        </div>
      </div>
    );
  }

  const visibleListings = expanded ? listings : listings.slice(0, PREVIEW_COUNT);
  const hasMore = listings.length > PREVIEW_COUNT;

  return (
    <div className="results__card foreclosure-card">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--red"><Gavel size={20} /></span>
        Nearby Foreclosures
        <span className="foreclosure-card__count">{listings.length} found</span>
      </h3>

      <div className="foreclosure-card__grid">
        {visibleListings.map(listing => (
          <ForeclosureListing key={listing.listingID} listing={listing} />
        ))}
      </div>

      {hasMore && (
        <button
          className="foreclosure-card__toggle"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? (
            <><ChevronUp size={14} /> Show fewer</>
          ) : (
            <><ChevronDown size={14} /> Show all {listings.length} foreclosures</>
          )}
        </button>
      )}
    </div>
  );
}

function ForeclosureListing({ listing }: { listing: XomeListing }) {
  const auction = listing.auctionInfo;
  const xomeUrl = `https://www.xome.com${listing.detailLinkHref}`;

  return (
    <div className="foreclosure-listing">
      {listing.isListingImageAvailable && listing.imageFilePath && (
        <div className="foreclosure-listing__image">
          <img src={listing.imageFilePath} alt={listing.streetAddress} loading="lazy" />
          <span className="foreclosure-listing__badge">
            {listing.auctionSaleTransactionTypeDisplayString || 'Auction'}
          </span>
        </div>
      )}

      <div className="foreclosure-listing__body">
        <div className="foreclosure-listing__address">
          <MapPin size={14} />
          {listing.streetAddress}
        </div>
        <div className="foreclosure-listing__location">
          {listing.city}, {listing.stateOrProvinceCode} {listing.postalCode}
          {listing._distance != null && (
            <span className="foreclosure-listing__distance">
              {listing._distance < 1
                ? '< 1 mi away'
                : `${Math.round(listing._distance)} mi away`}
            </span>
          )}
        </div>

        <div className="foreclosure-listing__stats">
          {listing.numberBedrooms > 0 && (
            <span><BedDouble size={13} /> {listing.numberBedrooms} bd</span>
          )}
          {listing.numberBaths > 0 && (
            <span><Bath size={13} /> {listing.numberBaths} ba</span>
          )}
          {listing.totalAreaHigh > 0 && (
            <span><Ruler size={13} /> {listing.totalAreaHigh.toLocaleString()} sqft</span>
          )}
          {listing.yearBuilt > 0 && (
            <span><Calendar size={13} /> {listing.yearBuilt}</span>
          )}
        </div>

        <div className="foreclosure-listing__auction-info">
          <div className="foreclosure-listing__bid">
            {auction.bidAmount || auction.startingBid || '—'}
          </div>
          <div className="foreclosure-listing__auction-meta">
            <span className="foreclosure-listing__event-type">
              {auction.eventTypeDisplayString}
            </span>
            {auction.formattedAuctionStartDate && (
              <span className="foreclosure-listing__dates">
                {auction.formattedAuctionStartDate} – {auction.formattedAuctionEndDate}
              </span>
            )}
          </div>
        </div>

        <a
          href={xomeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="foreclosure-listing__link"
        >
          View on Xome <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
