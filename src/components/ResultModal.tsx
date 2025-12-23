import { ScoreResult, PropertyCase } from '../types';
import { useState } from 'react';

interface ResultModalProps {
  result: ScoreResult | null;
  caseData: PropertyCase | null;
  onNextCase: () => void;
  onBackToHome?: () => void;
}

export default function ResultModal({ result, caseData, onNextCase, onBackToHome }: ResultModalProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  if (!result || !caseData) return null;

  const getResultClass = () => {
    if (result.points >= 100) return 'excellent';
    if (result.points >= 50) return 'good';
    if (result.points > 0) return 'okay';
    return 'bad';
  };

  // Calculate financial metrics
  const closingCosts = caseData.auctionPrice * 0.025;
  const totalInvestment = caseData.auctionPrice + caseData.repairEstimate + closingCosts;
  
  // Calculate surviving liens (liens that you'll have to pay)
  const survivingLiens = caseData.liens
    .filter(lien => 
      lien.type.includes('Federal Tax') ||
      lien.type.includes('HOA Superpriority') ||
      lien.type.includes('Code Enforcement')
    )
    .reduce((sum, lien) => sum + lien.amount, 0);
  
  // Net profit = market value - total investment - surviving liens you must pay
  const netProfit = caseData.actualValue - totalInvestment - survivingLiens;
  const profitMargin = ((netProfit / totalInvestment) * 100).toFixed(1);

  return (
    <div className="modal-overlay">
      <div className={`result-modal ${getResultClass()}`}>
        <div className="result-header">
          <h2>{result.message}</h2>
          <div className="result-points">
            {result.points > 0 ? '+' : ''}{result.points} points
          </div>
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
                  <span>Auction Price:</span>
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
                <div className="analysis-row total">
                  <span>Total Investment:</span>
                  <span>${totalInvestment.toLocaleString()}</span>
                </div>
              </div>

              <div className="column">
                <h4>📈 Property Value</h4>
                <div className="analysis-row">
                  <span>Market Value:</span>
                  <span>${caseData.actualValue.toLocaleString()}</span>
                </div>
                
                {caseData.liens && caseData.liens.some(l => 
                  l.type.includes('Federal Tax') ||
                  l.type.includes('HOA Superpriority') ||
                  l.type.includes('Code Enforcement')
                ) && (
                  <>
                    <h4 style={{ marginTop: '15px', marginBottom: '8px' }}>⚠️ Surviving Liens</h4>
                    {caseData.liens.map((lien, idx) => {
                      const survives = 
                        lien.type.includes('Federal Tax') ||
                        lien.type.includes('HOA Superpriority') ||
                        lien.type.includes('Code Enforcement');
                      
                      return survives ? (
                        <div key={idx} className="analysis-row warning">
                          <span>{lien.type}:</span>
                          <span>-${lien.amount.toLocaleString()}</span>
                        </div>
                      ) : null;
                    })}
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
                  <span>Profit Margin:</span>
                  <span>{profitMargin}%</span>
                </div>
                <div className={`analysis-row classification ${caseData.isGoodDeal ? 'good' : 'bad'}`}>
                  <span>Classification:</span>
                  <span>{caseData.isGoodDeal ? '✅ GOOD' : '❌ BAD'}</span>
                </div>
              </div>
            </div>

            {caseData.redFlags && caseData.redFlags.length > 0 && (
              <div className="red-flags-section">
                <h4>🚩 Red Flags in This Property</h4>
                {caseData.redFlags.map((flag, idx) => (
                  <div key={idx} className={`flag-item severity-${flag.severity}`}>
                    <div className="flag-severity">
                      <strong>Severity: {flag.severity.toUpperCase()}</strong>
                    </div>
                    <div className="flag-text">{flag.description}</div>
                    <div className="flag-location">Location: {flag.hiddenIn}</div>
                    {flag.discovered && <div className="flag-discovered">✅ You found this!</div>}
                  </div>
                ))}
              </div>
            )}

            <div className="decision-math">
              <h4>⚖️ Why This Scoring</h4>
              {result.points >= 100 && (
                <div className="math-explanation">
                  <p><strong>Bought a GOOD deal:</strong></p>
                  <p>✅ Positive ROI of +{profitMargin}% = <strong>+100 points</strong></p>
                </div>
              )}
              {result.points === 50 && (
                <div className="math-explanation">
                  <p><strong>Walked away from a BAD deal:</strong></p>
                  <p>✅ Avoided a loss of ${Math.abs(netProfit).toLocaleString()} = <strong>+50 points</strong></p>
                </div>
              )}
              {result.points === -150 && (
                <div className="math-explanation">
                  <p><strong>Bought a BAD deal:</strong></p>
                  <p>❌ Negative ROI of {profitMargin}% = <strong>-150 points</strong></p>
                </div>
              )}
              {result.points === -50 && (
                <div className="math-explanation">
                  <p><strong>Walked away from a GOOD deal:</strong></p>
                  <p>❌ Missed profit of +${netProfit.toLocaleString()} = <strong>-50 points</strong></p>
                </div>
              )}
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
