import { useState, useEffect } from 'react';
import { PropertyCase, RedFlag } from '../types';
import ForeclosureAnnouncement from './ForeclosureAnnouncement';
import { Share2, X, Lock } from 'lucide-react';

// A plain-language hint of what a given record/source actually contains, so the
// player understands what they're paying to pull before they commit a
// due-diligence action. Keyword-matched against the AI-generated source name
// (`hiddenIn`); falls back to a generic line for anything unrecognized.
function getSourceHint(hiddenIn: string): string {
  const s = (hiddenIn || '').toLowerCase();
  const has = (...words: string[]) => words.some((w) => s.includes(w));

  if (has('title', 'deed', 'chain of title')) {
    return 'Ownership history and recorded claims — surviving liens, easements, and clouds on title.';
  }
  if (has('lien', 'judgment', 'encumbrance')) {
    return 'Recorded debts against the property — what survives the sale and follows the new owner.';
  }
  if (has('tax', 'assessor', 'county record', 'treasurer')) {
    return 'Assessed value plus any delinquent property taxes or tax-lien certificates owed.';
  }
  if (has('hoa', 'association', 'condo', 'coa')) {
    return 'Association dues, special assessments, and unpaid balances that transfer with the unit.';
  }
  if (has('inspection', 'inspector', 'condition report')) {
    return 'Known structural, roof, foundation, and system defects flagged by a prior inspection.';
  }
  if (has('permit', 'code', 'violation', 'building dept')) {
    return 'Open permits, unpermitted work, and outstanding code-enforcement violations.';
  }
  if (has('environmental', 'mold', 'asbestos', 'lead', 'radon', 'soil')) {
    return 'Environmental hazards — contamination, mold, or materials that are costly to remediate.';
  }
  if (has('survey', 'plat', 'boundary', 'setback')) {
    return 'Lot boundaries, encroachments, and setback issues that can limit use or resale.';
  }
  if (has('appraisal', 'valuation', 'bpo', 'comps', 'market')) {
    return 'Independent value opinion and comparable sales used to sanity-check the resale number.';
  }
  if (has('occupan', 'tenant', 'lease', 'eviction', 'squatter')) {
    return 'Who is living there now — tenants, leases, or occupants you may have to remove.';
  }
  if (has('court', 'docket', 'lawsuit', 'litigation', 'foreclosure notice', 'bankrupt')) {
    return 'Active legal filings — pending suits, bankruptcies, or foreclosure-process defects.';
  }
  if (has('utility', 'water', 'sewer', 'septic', 'well')) {
    return 'Utility connections and unpaid water/sewer balances that can become municipal liens.';
  }
  if (has('insurance', 'claim', 'flood')) {
    return 'Past claims and flood-zone status that drive insurance cost and lender requirements.';
  }
  if (has('neighbor', 'rumor', 'local')) {
    return 'On-the-ground intel about the property and block that rarely shows up on paper.';
  }
  return 'Background records on this property — pull them to surface issues hidden from the listing.';
}

interface CaseDisplayProps {
  propertyCase: PropertyCase;
  timeRemaining: number;
  onRedFlagClick: (flagId: string) => void;
  onRedFlagAnswer?: (flagId: string, answerIndex: number) => void;
  // Spend one due-diligence action to open a document. Returns false when the
  // budget/time is exhausted, in which case the document stays locked.
  onTryInvestigate?: () => boolean;
  investigationBudget?: number;
  investigationsUsed?: number;
  investigationTimeCost?: number;
  investigationFee?: number;
}

export default function CaseDisplay({
  propertyCase,
  timeRemaining,
  onRedFlagClick,
  onRedFlagAnswer,
  onTryInvestigate,
  investigationBudget,
  investigationsUsed = 0,
  investigationTimeCost = 0,
  investigationFee = 0,
}: CaseDisplayProps) {
  const [activeTab, setActiveTab] = useState<'case' | 'announcement'>('case');
  const [expandedLiens, setExpandedLiens] = useState<Set<number>>(new Set());
  const [selectedFlag, setSelectedFlag] = useState<RedFlag | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Documents this player has already paid to inspect. Re-opening a pulled
  // document is free; opening a new one spends a due-diligence action.
  const [openedFlags, setOpenedFlags] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpenedFlags(new Set());
  }, [propertyCase.id]);

  const investigationsRemaining =
    investigationBudget !== undefined ? Math.max(0, investigationBudget - investigationsUsed) : Infinity;
  const canOpenNewDocument = investigationsRemaining > 0 && timeRemaining >= investigationTimeCost;

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

    // First time opening this document: spend a due-diligence action. If the
    // budget/time is gone, keep it locked. Re-opening a pulled document is free.
    if (!openedFlags.has(flag.id)) {
      if (onTryInvestigate && !onTryInvestigate()) return;
      setOpenedFlags((prev) => new Set(prev).add(flag.id));
    }

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
              <p>
                <strong>Occupancy:</strong>{' '}
                {(() => {
                  const occ = propertyCase.occupant
                    ?? (propertyCase.occupancyStatus === 'vacant' ? 'vacant'
                      : propertyCase.occupancyStatus === 'occupied' ? 'owner'
                      : undefined);
                  const label = occ === 'vacant' ? 'Vacant'
                    : occ === 'owner' ? 'Occupied — former owner'
                    : occ === 'tenant' ? 'Occupied — tenant'
                    : occ === 'squatter' ? 'Occupied — squatter'
                    : 'Unknown';
                  return label;
                })()}
                {propertyCase.occupancyCost ? (
                  <span className="occupancy-cost">
                    {' '}· est. {formatCurrency(propertyCase.occupancyCost)} to clear (eviction / cash-for-keys)
                  </span>
                ) : null}
              </p>
              {propertyCase.redemptionPeriodDays ? (
                <p className="redemption-note">
                  <strong>⏳ Redemption period:</strong> the prior owner can reclaim this property for{' '}
                  {propertyCase.redemptionPeriodDays} days after the sale
                  {propertyCase.redemptionCost ? ` — budget ${formatCurrency(propertyCase.redemptionCost)} in carrying costs and risk` : ''}.
                </p>
              ) : null}
              {propertyCase.hoaFees ? <p><strong>HOA Fees:</strong> {formatCurrency(propertyCase.hoaFees)}/month</p> : null}
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
                          {typeof lien.survivesForeclosure === 'boolean' && (
                            <span className={`lien-survival ${lien.survivesForeclosure ? 'survives' : 'wiped'}`}>
                              {lien.survivesForeclosure ? '⚠️ Survives sale' : '✅ Wiped at sale'}
                            </span>
                          )}
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
                            <div className="detail-row">
                              <span className="detail-label">After foreclosure:</span>
                              <span className="detail-value">
                                {lien.survivesForeclosure
                                  ? 'Survives — the buyer inherits this debt'
                                  : 'Wiped out by the sale — buyer does not owe it'}
                              </span>
                            </div>
                            {lien.notes && (
                              <div className="detail-row full-width note-row">
                                <span className="detail-label">⚠️ Important Notes:</span>
                                <span className="detail-value">{lien.notes}</span>
                              </div>
                            )}
                            {lien.educationalNote && (
                              <div className="detail-row full-width note-row lien-edu-row">
                                <span className="detail-label">🎓 Why it matters:</span>
                                <span className="detail-value">{lien.educationalNote}</span>
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
              <div className="investigation-header">
                <div className="investigation-title">
                  <h3>🔍 Property Investigation</h3>
                  {investigationBudget !== undefined && (
                    <span className="dd-cost">
                      Each inspection costs {investigationTimeCost}s
                      {investigationFee > 0 ? ` · −${investigationFee} pts` : ''}
                    </span>
                  )}
                </div>
                {investigationBudget !== undefined && (
                  <div className={`due-diligence-meter ${canOpenNewDocument ? '' : 'exhausted'}`}>
                    <span className="dd-count">
                      Due diligence: {investigationsRemaining} of {investigationBudget} left
                    </span>
                  </div>
                )}
              </div>
              <div className="red-flags">
                {propertyCase.redFlags.map((flag: RedFlag) => {
                  const answered = flag.discovered && flag.userAnswer !== undefined;
                  const isCorrect = flag.userAnswer === flag.correctChoice;
                  const locked = !flag.discovered && !openedFlags.has(flag.id) && !canOpenNewDocument;
                  return (
                    <div
                      key={flag.id}
                      className={`flag-card ${flag.discovered ? 'flipped' : ''} ${answered ? (isCorrect ? 'correct' : 'incorrect') : ''} ${locked ? 'locked' : ''}`}
                      onClick={() => !locked && handleFlagClick(flag)}
                      role="button"
                      tabIndex={flag.discovered || locked ? -1 : 0}
                      aria-disabled={flag.discovered || locked}
                      onKeyDown={(e) =>
                        !flag.discovered && !locked && (e.key === 'Enter' || e.key === ' ') && handleFlagClick(flag)
                      }
                    >
                      <div className="flag-card-inner">
                        <div className="flag-card-face flag-card-front">
                          {locked ? (
                            <>
                              <Lock className="flag-doc-icon" size={26} aria-hidden="true" />
                              <span className="flag-location">{flag.hiddenIn}</span>
                              <span className="flip-cta">Out of due diligence — commit now</span>
                            </>
                          ) : (
                            <>
                              <span className="flag-location">{flag.hiddenIn}</span>
                              <span className="flag-source-hint">{getSourceHint(flag.hiddenIn)}</span>
                              <span className="flip-cta">Tap to inspect</span>
                            </>
                          )}
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
