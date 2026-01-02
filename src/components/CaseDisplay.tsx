import { useState } from 'react';
import { PropertyCase, RedFlag } from '../types';
import ForeclosureAnnouncement from './ForeclosureAnnouncement';

interface CaseDisplayProps {
  propertyCase: PropertyCase;
  timeRemaining: number;
  onRedFlagClick: (flagId: string) => void;
}

export default function CaseDisplay({ propertyCase, timeRemaining, onRedFlagClick }: CaseDisplayProps) {
  const [activeTab, setActiveTab] = useState<'case' | 'announcement'>('case');
  const [expandedLiens, setExpandedLiens] = useState<Set<number>>(new Set());
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const toggleLien = (index: number) => {
    const newExpanded = new Set(expandedLiens);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLiens(newExpanded);
  };

  const potentialProfit = propertyCase.propertyValue - propertyCase.auctionPrice - propertyCase.repairEstimate;

  return (
    <div className="case-display">
      <div className="case-tabs">
        <button 
          className={`tab-btn ${activeTab === 'case' ? 'active' : ''}`}
          onClick={() => setActiveTab('case')}
        >
          📊 Case Summary
        </button>
        <button 
          className={`tab-btn ${activeTab === 'announcement' ? 'active' : ''}`}
          onClick={() => setActiveTab('announcement')}
        >
          📄 Foreclosure Notice
        </button>
      </div>

      {activeTab === 'announcement' ? (
        <ForeclosureAnnouncement caseId={propertyCase.id} propertyData={propertyCase} />
      ) : (
        <>
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
                {photo.startsWith('http') ? (
                  <img src={photo} alt={`Property photo ${index + 1}`} loading="lazy" />
                ) : (
                  photo
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="detail-section lien-section">
          <h3>📄 Lien Stack (Click to review carefully)</h3>
          <div className="lien-list">
            {propertyCase.liens.map((lien, index) => {
              const isExpanded = expandedLiens.has(index);
              return (
                <div 
                  key={index} 
                  className={`lien-item ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => toggleLien(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleLien(index)}
                >
                  <div className="lien-header">
                    <span className="lien-priority">Priority {lien.priority}</span>
                    <span className="lien-type">{lien.type}</span>
                    <span className="expand-indicator">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                  <div className="lien-details">
                    <span className="lien-holder">{lien.holder}</span>
                    <span className="lien-amount">{formatCurrency(lien.amount)}</span>
                  </div>
                  {isExpanded && (
                    <div className="lien-expanded-details">
                      <div className="detail-row">
                        <span className="detail-label">Lien Type:</span>
                        <span className="detail-value">{lien.type}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Holder:</span>
                        <span className="detail-value">{lien.holder}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Amount:</span>
                        <span className="detail-value">{formatCurrency(lien.amount)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Priority Position:</span>
                        <span className="detail-value">{lien.priority}</span>
                      </div>
                      {lien.notes && (
                        <div className="detail-row full-width">
                          <span className="detail-label">⚠️ Important Notes:</span>
                          <span className="detail-value">{lien.notes}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
        </>
      )}
    </div>
  );
}
