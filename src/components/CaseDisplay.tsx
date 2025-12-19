import { PropertyCase, RedFlag } from '../types';

interface CaseDisplayProps {
  propertyCase: PropertyCase;
  timeRemaining: number;
  onRedFlagClick: (flagId: string) => void;
}

export default function CaseDisplay({ propertyCase, timeRemaining, onRedFlagClick }: CaseDisplayProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const potentialProfit = propertyCase.propertyValue - propertyCase.auctionPrice - propertyCase.repairEstimate;

  return (
    <div className="case-display">
      <div className="case-header">
        <h2>{propertyCase.address}</h2>
        <p className="location">{propertyCase.city}, {propertyCase.state} {propertyCase.zip}</p>
        <div className="timer">
          <span className={timeRemaining < 60 ? 'urgent' : ''}>
            ⏱️ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="property-overview">
        <div className="value-grid">
          <div className="value-item">
            <span className="label">Property Value</span>
            <span className="amount">{formatCurrency(propertyCase.propertyValue)}</span>
          </div>
          <div className="value-item highlight">
            <span className="label">Auction Price</span>
            <span className="amount">{formatCurrency(propertyCase.auctionPrice)}</span>
          </div>
          <div className="value-item">
            <span className="label">Repair Estimate</span>
            <span className="amount">{formatCurrency(propertyCase.repairEstimate)}</span>
          </div>
          <div className={`value-item ${potentialProfit > 0 ? 'profit' : 'loss'}`}>
            <span className="label">Potential Profit</span>
            <span className="amount">{formatCurrency(potentialProfit)}</span>
          </div>
        </div>
      </div>

      <div className="property-details">
        <div className="detail-section">
          <h3>📋 Property Description</h3>
          <p>{propertyCase.description}</p>
          <p><strong>Occupancy:</strong> {propertyCase.occupancyStatus}</p>
          {propertyCase.hoaFees && <p><strong>HOA Fees:</strong> {formatCurrency(propertyCase.hoaFees)}/month</p>}
        </div>

        <div className="detail-section">
          <h3>📸 Photos</h3>
          <div className="photo-grid">
            {propertyCase.photos.map((photo, index) => (
              <div key={index} className="photo-placeholder">
                {photo}
              </div>
            ))}
          </div>
        </div>

        <div className="detail-section lien-section">
          <h3>📄 Lien Stack (Click to review carefully)</h3>
          <div className="lien-list">
            {propertyCase.liens.map((lien, index) => (
              <div key={index} className="lien-item">
                <div className="lien-header">
                  <span className="lien-priority">Priority {lien.priority}</span>
                  <span className="lien-type">{lien.type}</span>
                </div>
                <div className="lien-details">
                  <span className="lien-holder">{lien.holder}</span>
                  <span className="lien-amount">{formatCurrency(lien.amount)}</span>
                </div>
                {lien.notes && <div className="lien-notes">⚠️ {lien.notes}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="detail-section red-flags-section">
          <h3>🔍 Potential Issues (Click if you spot something)</h3>
          <div className="red-flags">
            {propertyCase.redFlags.map((flag: RedFlag) => (
              <button
                key={flag.id}
                className={`red-flag-btn ${flag.discovered ? 'discovered' : ''}`}
                onClick={() => onRedFlagClick(flag.id)}
                disabled={flag.discovered}
              >
                <span className="flag-location">{flag.hiddenIn}</span>
                {flag.discovered && (
                  <span className="flag-revealed">
                    ⚠️ {flag.description} (+25 pts)
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
