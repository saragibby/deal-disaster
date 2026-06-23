import { useState } from 'react';
import { PropertyCase, RedFlag } from '../types';
import ForeclosureAnnouncement from './ForeclosureAnnouncement';
import { Share2, X } from 'lucide-react';

interface CaseDisplayProps {
  propertyCase: PropertyCase;
  timeRemaining: number;
  onRedFlagClick: (flagId: string) => void;
  onRedFlagAnswer?: (flagId: string, answerIndex: number) => void;
}

export default function CaseDisplay({ propertyCase, timeRemaining, onRedFlagClick, onRedFlagAnswer }: CaseDisplayProps) {
  const [activeTab, setActiveTab] = useState<'case' | 'announcement'>('case');
  const [expandedLiens, setExpandedLiens] = useState<Set<number>>(new Set());
  const [selectedFlag, setSelectedFlag] = useState<RedFlag | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Repairs on a foreclosure can only be guessed from the outside (no interior
  // access, sold as-is), so we always present a range. Use the explicit
  // min/max when provided; otherwise derive an asymmetric band around the
  // point estimate (surprises skew higher), rounded to clean $500 increments.
  const getRepairRange = () => {
    const roundTo500 = (n: number) => Math.round(n / 500) * 500;
    let low = propertyCase.repairEstimateMin;
    let high = propertyCase.repairEstimateMax;
    if (!low || !high || low > high) {
      low = roundTo500(propertyCase.repairEstimate * 0.85);
      high = roundTo500(propertyCase.repairEstimate * 1.3);
    }
    return { low, high };
  };

  const formatRepairRange = () => {
    const { low, high } = getRepairRange();
    return `${formatCurrency(low)} - ${formatCurrency(high)}`;
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

  const handleFlagClick = (flag: RedFlag) => {
    if (flag.discovered) return;

    // If this flag has a question, show the decision modal
    if (flag.question && flag.choices) {
      setSelectedFlag(flag);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      // Old behavior: just mark as discovered
      onRedFlagClick(flag.id);
    }
  };

  const handleAnswerSubmit = () => {
    if (!selectedFlag || selectedAnswer === null) return;

    // Mark as discovered and show result
    onRedFlagClick(selectedFlag.id);

    // If callback provided, notify parent of answer
    if (onRedFlagAnswer) {
      onRedFlagAnswer(selectedFlag.id, selectedAnswer);
    }

    setShowResult(true);
  };

  const handleCloseModal = () => {
    setSelectedFlag(null);
    setSelectedAnswer(null);
    setShowResult(false);
    setShowHelp(false);
  };

  // Spread before costs mirrors the repair range: the conservative (minimum)
  // spread assumes the high end of repairs, the optimistic spread assumes the
  // low end. We color by the conservative spread so the worst case is honest.
  const repairRange = getRepairRange();
  const spreadConservative = propertyCase.propertyValue - propertyCase.auctionPrice - repairRange.high;
  const spreadOptimistic = propertyCase.propertyValue - propertyCase.auctionPrice - repairRange.low;

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
            <div className="header-top">
              <div className="address-section">
                <span className="listing-tag">🔨 {propertyCase.auctionType || '2nd Chance Foreclosure'}</span>
                <h2>{propertyCase.address}</h2>
                <p className="location">{propertyCase.city}, {propertyCase.state} {propertyCase.zip}</p>
                <div className="property-specs">
                  {propertyCase.beds != null && <span>{propertyCase.beds} Beds</span>}
                  {propertyCase.baths != null && <span>{propertyCase.baths} Baths</span>}
                  {propertyCase.sqft != null && <span>{propertyCase.sqft.toLocaleString()} Sq. Ft.</span>}
                  {propertyCase.yearBuilt != null && <span>Built {propertyCase.yearBuilt}</span>}
                  {propertyCase.propertyType && <span>{propertyCase.propertyType}</span>}
                </div>
              </div>
              <div className="header-badges">
                <button
                  className="share-btn"
                  onClick={() => {
                    const url = window.location.href;
                    navigator.clipboard.writeText(url).then(() => {
                      alert('Link copied to clipboard! Share this property with others.');
                    }).catch(() => {
                      alert('Failed to copy link. URL: ' + url);
                    });
                  }}
                  title="Copy link to this property"
                >
                  <Share2 size={18} />
                </button>
                {propertyCase.difficulty && (
                  <div className={`difficulty-sticker difficulty-${propertyCase.difficulty}`}>
                    <span className="difficulty-sticker-text">
                      {propertyCase.difficulty.toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="timer">
                  <span className={timeRemaining < 60 ? 'urgent' : ''}>
                    ⏱️ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="property-overview">
            <div className="value-grid">
              <div className="value-item">
                <span className="label">Est. Market Value</span>
                <span className="amount">{formatCurrency(propertyCase.propertyValue)}</span>
              </div>
              <div className="value-item highlight">
                <span className="label">Starting Bid</span>
                <span className="amount">{formatCurrency(propertyCase.auctionPrice)}</span>
              </div>
              <div className="value-item">
                <span className="label">Repair Estimate</span>
                <span className="amount">{formatRepairRange()}</span>
              </div>
              <div className={`value-item ${spreadConservative > 0 ? 'profit' : 'loss'}`}>
                <span className="label">Spread Before Costs</span>
                <span className="amount">{`${formatCurrency(spreadConservative)} - ${formatCurrency(spreadOptimistic)}`}</span>
              </div>
            </div>
          </div>

          <div className="property-details">
            <div className="detail-section">
              <h3>📋 Property Description</h3>
              <p>{propertyCase.description}</p>
              <p><strong>Occupancy:</strong> {propertyCase.occupancyStatus}</p>
              {propertyCase.hoaFees && <p><strong>HOA Fees:</strong> {formatCurrency(propertyCase.hoaFees)}/month</p>}
              <p className="listing-disclaimer">
                ⚠️ Sold <strong>as-is</strong> · Cash only · No interior access · No inspection or financing
                contingencies. Buyer assumes all liens that survive the foreclosure sale.
              </p>
            </div>

            <div className="detail-section">
              <h3>📸 Photos</h3>
              <div className="photo-grid">
                {(propertyCase.photoUrls && propertyCase.photoUrls.length > 0 ? propertyCase.photoUrls : propertyCase.photos).map((photo, index) => (
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
              <h3>📄 Lien Stack (Tap a card to flip for details)</h3>
              <div className="lien-grid">
                {propertyCase.liens.map((lien, index) => {
                  const isFlipped = expandedLiens.has(index);
                  return (
                    <div
                      key={index}
                      className={`lien-card ${isFlipped ? 'flipped' : ''}`}
                      onClick={() => toggleLien(index)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isFlipped}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleLien(index)}
                    >
                      <div className="lien-card-inner">
                        <div className="lien-card-face lien-card-front">
                          <div className="lien-header">
                            <span className="lien-priority">Priority {lien.priority}</span>
                            <span className="flip-hint" aria-hidden="true">⟳</span>
                          </div>
                          <span className="lien-type">{lien.type}</span>
                          <div className="lien-details">
                            <span className="lien-holder">{lien.holder}</span>
                            <span className="lien-amount">{formatCurrency(lien.amount)}</span>
                          </div>
                          <span className="flip-cta">Tap for details</span>
                        </div>
                        <div className="lien-card-face lien-card-back">
                          <div className="lien-back-rows">
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
                            {lien.notes && (
                              <div className="detail-row full-width note-row">
                                <span className="detail-label">⚠️ Important Notes:</span>
                                <span className="detail-value">{lien.notes}</span>
                              </div>
                            )}
                          </div>
                          <span className="flip-cta">Tap to flip back</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="detail-section red-flags-section">
              <h3>🔍 Property Investigation (Click a document to review)</h3>
              <div className="red-flags">
                {propertyCase.redFlags.map((flag: RedFlag) => {
                  const answered = flag.discovered && flag.userAnswer !== undefined;
                  const isCorrect = flag.userAnswer === flag.correctChoice;
                  return (
                    <div
                      key={flag.id}
                      className={`flag-card ${flag.discovered ? 'flipped' : ''} ${answered ? (isCorrect ? 'correct' : 'incorrect') : ''}`}
                      onClick={() => handleFlagClick(flag)}
                      role="button"
                      tabIndex={flag.discovered ? -1 : 0}
                      aria-disabled={flag.discovered}
                      onKeyDown={(e) =>
                        !flag.discovered && (e.key === 'Enter' || e.key === ' ') && handleFlagClick(flag)
                      }
                    >
                      <div className="flag-card-inner">
                        <div className="flag-card-face flag-card-front">
                          <span className="flag-doc-icon" aria-hidden="true">📄</span>
                          <span className="flag-location">{flag.hiddenIn}</span>
                          <span className="flip-cta">Click to review</span>
                        </div>
                        <div className="flag-card-face flag-card-back">
                          <span className="flag-back-title">{flag.hiddenIn}</span>
                          {answered ? (
                            <>
                              {flag.answerExplanation && (
                                <p className="flag-explanation">{flag.answerExplanation}</p>
                              )}
                              <span className="flag-points">
                                {isCorrect
                                  ? `+${flag.severity === 'high' || flag.severity === 'severe' ? '75' : '50'} pts`
                                  : '-25 pts'}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="flag-revealed">{flag.description}</span>
                              <span className="flag-points">+25 pts</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Red Flag Decision Modal */}
      {selectedFlag && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="red-flag-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={handleCloseModal}>
              <X size={24} />
            </button>

            <div className="modal-header">
              <h3>📄 {selectedFlag.hiddenIn}</h3>
              <div className="header-actions">
                {!showResult && (
                  <button className="help-btn" onClick={() => setShowHelp(!showHelp)}>
                    {showHelp ? '🔒 Hide Help' : '💡 Get Help'}
                  </button>
                )}
                {showHelp && (
                  <span className={`severity-badge severity-${selectedFlag.severity}`}>
                    {selectedFlag.severity === 'red-herring' ? 'LOW' : selectedFlag.severity.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div className="modal-content">
              <div className="flag-description">
                <h4>⚠️ Issue Found:</h4>
                <p>{selectedFlag.description}</p>
              </div>

              {showHelp && selectedFlag.impact && (
                <div className="flag-impact">
                  <p><strong>💡 Estimated Impact:</strong></p>
                  <p>{selectedFlag.impact}</p>
                </div>
              )}

              {!showResult && selectedFlag.question && (
                <div className="flag-question">
                  <p><strong>{selectedFlag.question}</strong></p>
                  <div className="answer-choices">
                    {selectedFlag.choices?.map((choice, index) => {
                      // Remove "Option X: " prefix if present
                      const cleanChoice = choice.replace(/^Option [A-D]:\s*/i, '');
                      return (
                        <button
                          key={index}
                          className={`choice-btn ${selectedAnswer === index ? 'selected' : ''}`}
                          onClick={() => setSelectedAnswer(index)}
                        >
                          <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
                          <span className="choice-text">{cleanChoice}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    className="submit-answer-btn"
                    onClick={handleAnswerSubmit}
                    disabled={selectedAnswer === null}
                  >
                    Submit Answer
                  </button>
                </div>
              )}

              {showResult && selectedFlag.correctChoice !== undefined && (
                <div className={`answer-result ${selectedAnswer === selectedFlag.correctChoice ? 'correct' : 'incorrect'}`}>
                  {selectedAnswer === selectedFlag.correctChoice ? (
                    <>
                      <h4>✅ Correct!</h4>
                      <p>You correctly identified the impact of this issue.</p>
                      <p className="points-earned">+{(selectedFlag.severity === 'high' || selectedFlag.severity === 'severe') ? '75' : '50'} points</p>
                    </>
                  ) : (
                    <>
                      <h4>❌ Incorrect</h4>
                      <p>The correct answer was: <strong>{selectedFlag.choices?.[selectedFlag.correctChoice]?.replace(/^Option [A-D]:\s*/i, '')}</strong></p>
                      {selectedFlag.answerExplanation && (
                        <p className="explanation">{selectedFlag.answerExplanation}</p>
                      )}
                      <p className="points-lost">-25 points</p>
                    </>
                  )}
                  <button className="continue-btn" onClick={handleCloseModal}>
                    Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
