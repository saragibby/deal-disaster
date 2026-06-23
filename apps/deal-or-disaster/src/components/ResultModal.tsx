import { ScoreResult, PropertyCase } from '../types';
import { useState } from 'react';
import { computeDeal, formatPct, lienSurvives, issueCost } from '../utils/dealFinancials';

interface ResultModalProps {
  result: ScoreResult | null;
  caseData: PropertyCase | null;
  onNextCase: () => void;
  onBackToHome?: () => void;
}

export default function ResultModal({ result, caseData, onNextCase, onBackToHome }: ResultModalProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  if (!result || !caseData) return null;

  const formatDecision = (decision: string) => {
    switch (decision) {
      case 'BUY':
        return 'Buy';
      case 'WALK_AWAY':
        return 'Walk Away';
      case 'INVESTIGATE':
        return 'Investigate';
      default:
        return decision;
    }
  };

  const getResultClass = () => {
    if (result.points >= 100) return 'excellent';
    if (result.points >= 50) return 'good';
    if (result.points > 0) return 'okay';
    return 'bad';
  };

  // Single canonical financial model — every figure below renders from this so
  // the banner, calculator, and scoring footer can never disagree.
  const deal = computeDeal(caseData);
  const { closingCosts, totalInvestment, netProfit, issueCosts, occupancyCost, redemptionCost } = deal;

  const classificationLabel =
    deal.classification === 'GOOD'
      ? '✅ GOOD'
      : deal.classification === 'MARGINAL'
      ? '⚠️ MARGINAL'
      : '❌ BAD';
  const classificationClass =
    deal.classification === 'GOOD'
      ? 'good'
      : deal.classification === 'MARGINAL'
      ? 'marginal'
      : 'bad';

  return (
    <div className="modal-overlay">
      <div className={`result-modal ${getResultClass()}`}>
        <div className="result-header">
          <h2>{result.message}</h2>
          <div className="result-points">
            {result.points > 0 ? '+' : ''}{result.points} points
          </div>
          {result.investigationPoints !== undefined && result.decisionPoints !== undefined && (
            <div className="points-breakdown">
              <span className="breakdown-item">Investigation: {result.investigationPoints > 0 ? '+' : ''}{result.investigationPoints}</span>
              <span className="breakdown-divider">•</span>
              <span className="breakdown-item">Decision: {result.decisionPoints > 0 ? '+' : ''}{result.decisionPoints}</span>
            </div>
          )}
        </div>

        <div className="result-explanation">
          <p>{result.explanation}</p>
        </div>

        {!showAnalysis ? (
          <button 
            className="analysis-toggle-btn"
            onClick={() => setShowAnalysis(true)}
          >
            📊 View Financial Analysis
          </button>
        ) : (
          <div className="financial-analysis">
            <h3>Financial Analysis - {caseData.address}</h3>

            <div className="analysis-columns">
              <div className="column">
                <h4>💰 Investment Costs</h4>
                <div className="analysis-row">
                  <span>Starting Bid:</span>
                  <span>${caseData.auctionPrice.toLocaleString()}</span>
                </div>
                <div className="analysis-row">
                  <span>Repairs/Updates:</span>
                  <span>${caseData.repairEstimate.toLocaleString()}</span>
                </div>
                <div className="analysis-row">
                  <span>Closing Costs (2.5%):</span>
                  <span>${closingCosts.toLocaleString()}</span>
                </div>
                {issueCosts > 0 && (
                  <div className="analysis-row">
                    <span>Issue &amp; Remediation Costs:</span>
                    <span>${issueCosts.toLocaleString()}</span>
                  </div>
                )}
                {occupancyCost > 0 && (
                  <div className="analysis-row">
                    <span>Eviction / Cash-for-Keys:</span>
                    <span>${occupancyCost.toLocaleString()}</span>
                  </div>
                )}
                {redemptionCost > 0 && (
                  <div className="analysis-row">
                    <span>Redemption-Period Carrying Costs:</span>
                    <span>${redemptionCost.toLocaleString()}</span>
                  </div>
                )}
                <div className="analysis-row total">
                  <span>Total Investment:</span>
                  <span>${totalInvestment.toLocaleString()}</span>
                </div>
              </div>

              <div className="column">
                <h4>📈 Property Value</h4>
                <div className="analysis-row">
                  <span>Pre-Foreclosure Est. Value:</span>
                  <span>${caseData.propertyValue.toLocaleString()}</span>
                </div>
                <div className="analysis-row">
                  <span>Realistic Resale Value (ARV):</span>
                  <span>${caseData.actualValue.toLocaleString()}</span>
                </div>

                {caseData.liens && caseData.liens.some(lienSurvives) && (
                  <>
                    <h4 style={{ marginTop: '15px', marginBottom: '8px' }}>⚠️ Surviving Liens</h4>
                    {caseData.liens.map((lien, idx) =>
                      lienSurvives(lien) ? (
                        <div key={idx} className="analysis-row warning">
                          <span>{lien.type}:</span>
                          <span>-${lien.amount.toLocaleString()}</span>
                        </div>
                      ) : null
                    )}
                  </>
                )}
              </div>

              <div className="column">
                <h4>🎯 Profit/Loss</h4>
                <div className={`analysis-row ${netProfit >= 0 ? 'profit' : 'loss'}`}>
                  <span>Net Profit/Loss:</span>
                  <span>${netProfit.toLocaleString()}</span>
                </div>
                <div className={`analysis-row ${netProfit >= 0 ? 'profit' : 'loss'}`}>
                  <span>ROI:</span>
                  <span>{formatPct(deal.roi)}</span>
                </div>
                <div className={`analysis-row classification ${classificationClass}`}>
                  <span>Classification:</span>
                  <span>{classificationLabel}</span>
                </div>
              </div>
            </div>

            {caseData.redFlags && caseData.redFlags.length > 0 && (
              <div className="red-flags-section">
                <h4>🚩 Property Investigation Results</h4>
                
                {/* Group flags by discovered status and severity */}
                {(() => {
                  const discoveredFlags = caseData.redFlags.filter(f => f.discovered);
                  const missedFlags = caseData.redFlags.filter(f => !f.discovered);
                  const totalMissedCost = missedFlags.reduce((sum, flag) => sum + issueCost(flag), 0);

                  return (
                    <>
                      {/* Red Herrings Found */}
                      {discoveredFlags.filter(f => f.severity === 'red-herring').length > 0 && (
                        <div className="flag-group red-herring-group">
                          <h5>🟢 Red Herrings (Correctly Identified as Minor)</h5>
                          {discoveredFlags.filter(f => f.severity === 'red-herring').map((flag, idx) => (
                            <div key={idx} className="flag-item severity-red-herring">
                              <div className="flag-text">{flag.description}</div>
                              <div className="flag-location">📄 {flag.hiddenIn}</div>
                              <div className="flag-note">💡 Good catch! This looks concerning but has minimal impact: {flag.impact}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Discovered Real Issues */}
                      {discoveredFlags.filter(f => f.severity !== 'red-herring').length > 0 && (
                        <div className="flag-group discovered-group">
                          <h5>✅ Issues You Found</h5>
                          {discoveredFlags.filter(f => f.severity !== 'red-herring').map((flag, idx) => (
                            <div key={idx} className={`flag-item severity-${flag.severity}`}>
                              <div className="flag-header">
                                <span className={`severity-badge severity-${flag.severity}`}>
                                  {flag.severity.toUpperCase()}
                                </span>
                                {flag.userAnswer === flag.correctChoice && <span className="correct-badge">✅ Answered Correctly</span>}
                                {flag.userAnswer !== undefined && flag.userAnswer !== flag.correctChoice && <span className="incorrect-badge">❌ Incorrect Answer</span>}
                              </div>
                              <div className="flag-text">{flag.description}</div>
                              <div className="flag-location">📄 {flag.hiddenIn}</div>
                              <div className="flag-impact">💰 Impact: {flag.impact}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Missed Critical Issues */}
                      {missedFlags.filter(f => f.severity === 'severe' || f.severity === 'high').length > 0 && (
                        <div className="flag-group missed-critical-group">
                          <h5>⚠️ Critical Issues You Missed</h5>
                          <div className="missed-warning">
                            <strong>Warning:</strong> These major issues could significantly impact your investment!
                          </div>
                          {missedFlags.filter(f => f.severity === 'severe' || f.severity === 'high').map((flag, idx) => (
                            <div key={idx} className={`flag-item severity-${flag.severity} missed`}>
                              <div className="flag-header">
                                <span className={`severity-badge severity-${flag.severity}`}>
                                  {flag.severity.toUpperCase()}
                                </span>
                              </div>
                              <div className="flag-text">{flag.description}</div>
                              <div className="flag-location">📄 Hidden in: {flag.hiddenIn}</div>
                              <div className="flag-impact">💰 Impact: {flag.impact}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Missed Minor Issues */}
                      {missedFlags.filter(f => f.severity === 'low' || f.severity === 'medium').length > 0 && (
                        <div className="flag-group missed-minor-group">
                          <h5>📋 Other Issues Missed</h5>
                          {missedFlags.filter(f => f.severity === 'low' || f.severity === 'medium').map((flag, idx) => (
                            <div key={idx} className={`flag-item severity-${flag.severity} missed`}>
                              <div className="flag-header">
                                <span className={`severity-badge severity-${flag.severity}`}>
                                  {flag.severity.toUpperCase()}
                                </span>
                              </div>
                              <div className="flag-text">{flag.description}</div>
                              <div className="flag-location">📄 Hidden in: {flag.hiddenIn}</div>
                              <div className="flag-impact">💰 Impact: {flag.impact}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Summary of Missed Costs */}
                      {missedFlags.length > 0 && totalMissedCost > 0 && (
                        <div className="missed-cost-summary">
                          <strong>Total Missed Costs:</strong> ~${totalMissedCost.toLocaleString()}
                          <p className="summary-note">These undetected issues could have changed your decision!</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Decision Analysis Section */}
            {caseData.correctDecision && result.userDecision && (
              <div className="decision-analysis">
                <h4>🎯 Decision Analysis</h4>
                <div className="decision-comparison">
                  <div className="decision-item">
                    <span className="decision-label">Your Decision:</span>
                    <span className={`decision-value user-decision ${result.userDecision.toLowerCase()}`}>
                      {formatDecision(result.userDecision)}
                    </span>
                  </div>
                  <div className="decision-item">
                    <span className="decision-label">Expert Recommendation:</span>
                    <span className={`decision-value expert-decision ${caseData.correctDecision.toLowerCase()}`}>
                      {formatDecision(caseData.correctDecision)}
                    </span>
                  </div>
                </div>
                
                {result.userDecision === caseData.correctDecision ? (
                  <div className="decision-feedback correct">
                    <p><strong>✅ Excellent Decision!</strong></p>
                    <p>Your choice matches expert analysis. {caseData.decisionExplanation || 'This demonstrates strong due diligence skills.'}</p>
                  </div>
                ) : (
                  <div className="decision-feedback incorrect">
                    <p><strong>⚠️ Alternative Approach Recommended</strong></p>
                    <p><strong>Why {formatDecision(caseData.correctDecision)}:</strong> {caseData.decisionExplanation || 'This property requires more careful analysis before proceeding.'}</p>
                    {result.userDecision === 'BUY' && caseData.correctDecision === 'WALK_AWAY' && (
                      <p className="advice">💡 <em>Tip: Some properties have too many red flags or costs that make them unprofitable even at the starting bid.</em></p>
                    )}
                    {result.userDecision === 'WALK_AWAY' && caseData.correctDecision === 'BUY' && (
                      <p className="advice">💡 <em>Tip: This was a solid deal despite some issues. Calculate total costs including all liens before walking away.</em></p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="decision-math">
              <h4>⚖️ Why This Scoring</h4>
              {(() => {
                const decision = result.userDecision;
                const roiText = formatPct(deal.roi);
                const lossText = `$${Math.abs(netProfit).toLocaleString()}`;
                const profitText = `$${netProfit.toLocaleString()}`;
                if (decision === 'BUY' && caseData.isGoodDeal) {
                  return (
                    <div className="math-explanation">
                      <p><strong>Bought a GOOD deal:</strong></p>
                      <p>✅ Positive ROI of {roiText} on ${totalInvestment.toLocaleString()} invested = <strong>+100 points</strong></p>
                    </div>
                  );
                }
                if (decision === 'BUY' && !caseData.isGoodDeal) {
                  return (
                    <div className="math-explanation">
                      <p><strong>Bought a BAD deal:</strong></p>
                      <p>❌ Negative ROI of {roiText} — you'd lose {lossText} = <strong>-150 points</strong></p>
                    </div>
                  );
                }
                if (decision === 'WALK_AWAY' && !caseData.isGoodDeal) {
                  return (
                    <div className="math-explanation">
                      <p><strong>Walked away from a BAD deal:</strong></p>
                      <p>✅ Avoided a loss of {lossText} = <strong>+50 points</strong></p>
                    </div>
                  );
                }
                if (decision === 'WALK_AWAY' && caseData.isGoodDeal) {
                  return (
                    <div className="math-explanation">
                      <p><strong>Walked away from a GOOD deal:</strong></p>
                      <p>❌ Missed profit of {profitText} = <strong>-50 points</strong></p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <button 
              className="analysis-toggle-btn"
              onClick={() => setShowAnalysis(false)}
            >
              Hide Analysis
            </button>
          </div>
        )}

        <div className="result-modal-actions">
          {onBackToHome && (
            <button className="back-home-btn" onClick={onBackToHome}>
              ← Back to Home
            </button>
          )}
          <button className="next-case-btn" onClick={onNextCase}>
            Next Case →
          </button>
        </div>
      </div>
    </div>
  );
}
