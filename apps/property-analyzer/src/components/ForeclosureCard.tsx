import { useState, useEffect, useMemo } from 'react';
import { api } from '@deal-platform/shared-auth';
import { Gavel, MapPin, ExternalLink, ChevronLeft, ChevronRight, Map as MapIcon, List } from 'lucide-react';
import type { ReactNode } from 'react';
import MapView from './MapView';
import type { MapLayer, MapMarker } from './MapView';

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

const PAGE_SIZE = 8;

export default function ForeclosureCard({ zip, city, state, latitude, longitude }: Props) {
  const [listings, setListings] = useState<XomeListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

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

  // Build map layers for foreclosures (must be before early returns to satisfy hook rules)
  const mapLayers = useMemo((): MapLayer[] => {
    if (listings.length === 0) return [];
    const markers: MapMarker[] = listings
      .filter(l => l.latitude && l.longitude)
      .map(l => {
        const isSelected = l.listingID === selectedId;
        return {
          lat: l.latitude,
          lng: l.longitude,
          color: isSelected ? '#f59e0b' : '#ef4444',
          size: (isSelected ? 'lg' : 'sm') as 'sm' | 'md' | 'lg',
          shape: 'circle' as const,
          label: l.streetAddress,
          popupContent: (
            <div className="map-popup__content">
              <div className="map-popup__address">{l.streetAddress}</div>
              <div className="map-popup__detail">{l.city}, {l.stateOrProvinceCode}</div>
              <div className="map-popup__rent">{l.auctionInfo.bidAmount || l.auctionInfo.startingBid || '—'}</div>
              <div className="map-popup__status">{l.auctionInfo.eventTypeDisplayString}</div>
              <a
                href={`https://www.xome.com${l.detailLinkHref}`}
                target="_blank"
                rel="noopener noreferrer"
                className="map-popup__zillow-link"
              >
                View on Xome <ExternalLink size={12} />
              </a>
            </div>
          ) as ReactNode,
        };
      });

    const layers: MapLayer[] = [];
    if (markers.length > 0) {
      layers.push({ id: 'foreclosures', name: 'Foreclosures', markers, visible: true });
    }
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      layers.push({
        id: 'subject',
        name: 'Your Property',
        markers: [{
          lat: latitude,
          lng: longitude,
          color: '#2563eb',
          size: 'lg' as const,
          shape: 'star' as const,
          label: 'Your Property',
        }],
        visible: true,
      });
    }
    return layers;
  }, [listings, selectedId, latitude, longitude]);

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

  const totalPages = Math.ceil(listings.length / PAGE_SIZE);
  const paginated = listings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleRowClick(id: number) {
    setSelectedId(prev => prev === id ? null : id);
  }

  return (
    <div className="results__card foreclosure-card foreclosure-card--compact">
      <h3 className="results__card-title">
        <span className="results__icon results__icon--red"><Gavel size={20} /></span>
        Nearby Foreclosures
        <span className="foreclosure-card__count">{listings.length} found</span>
      </h3>

      {/* List / Map toggle */}
      <div className="comps__view-toggle">
        <button
          className={`comps__view-btn ${viewMode === 'list' ? 'comps__view-btn--active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          <List size={16} /> List
        </button>
        <button
          className={`comps__view-btn ${viewMode === 'map' ? 'comps__view-btn--active' : ''}`}
          onClick={() => setViewMode('map')}
        >
          <MapIcon size={16} /> Map
        </button>
      </div>

      {viewMode === 'map' && mapLayers.length > 0 && (
        <MapView layers={mapLayers} height={360} />
      )}

      {viewMode === 'list' && (
        <>
          <div className="foreclosure-list">
            {paginated.map(listing => (
              <ForeclosureRow
                key={listing.listingID}
                listing={listing}
                isSelected={listing.listingID === selectedId}
                onClick={() => handleRowClick(listing.listingID)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="comps__pagination">
              <button
                className="comps__page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="comps__page-info">
                {page} of {totalPages}
              </span>
              <button
                className="comps__page-btn"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ForeclosureRow({ listing, isSelected, onClick }: { listing: XomeListing; isSelected: boolean; onClick: () => void }) {
  const auction = listing.auctionInfo;
  const xomeUrl = `https://www.xome.com${listing.detailLinkHref}`;
  const specs = [
    listing.numberBedrooms > 0 && `${listing.numberBedrooms}bd`,
    listing.numberBaths > 0 && `${listing.numberBaths}ba`,
    listing.totalAreaHigh > 0 && `${listing.totalAreaHigh.toLocaleString()}sf`,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={`foreclosure-row ${isSelected ? 'foreclosure-row--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="foreclosure-row__main">
        <div className="foreclosure-row__address">
          <MapPin size={12} />
          {listing.streetAddress}
        </div>
        <div className="foreclosure-row__meta">
          {listing.city}, {listing.stateOrProvinceCode}
          {specs && <span className="foreclosure-row__specs">{specs}</span>}
          {listing._distance != null && (
            <span className="foreclosure-row__dist">
              {listing._distance < 1 ? '< 1 mi' : `${Math.round(listing._distance)} mi`}
            </span>
          )}
        </div>
      </div>
      <div className="foreclosure-row__right">
        <span className="foreclosure-row__bid">
          {auction.bidAmount || auction.startingBid || '—'}
        </span>
        <span className="foreclosure-row__type">
          {auction.eventTypeDisplayString}
        </span>
      </div>
      <a
        href={xomeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="foreclosure-row__link"
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
