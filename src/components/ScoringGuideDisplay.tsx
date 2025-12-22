import React, { useState } from 'react';
import { PropertyCase } from '../types';
import '../styles/ScoringGuide.css';

interface ScoringGuideProps {
  caseData: PropertyCase;
}

export const ScoringGuideDisplay: React.FC<ScoringGuideProps> = ({ caseData }) => {
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Calculate financial metrics based on case data
  const closingCosts = caseData.auctionPrice * 0.025; // ~2.5% closing costs
  const totalInvestment = caseData.auctionPrice + caseData.repairEstimate + closingCosts;
  const netProfit = caseData.actualValue - totalInvestment;
  const profitMargin = ((netProfit / totalInvestment) * 100).toFixed(1);

  return (
    <div className="scoring-guide">
      <button 
        className="guide-toggle-btn"
        onClick={() => setShowAnalysis(!showAnalysis)}
      >
        {showAnalysis ? '📊 Hide Financial Analysis' : '📊 Show Financial Analysis'}
      </button>

      {showAnalysis && (
        <div className="guide-content">
          <h3>Financial Analysis - {caseData.address}</h3>
          
          <div className="analysis-grid">
            <div className="analysis-section">
              <h4>Investment Costs</h4>
              <div className="cost-item">
                <span>Auction Price:</span>
                <span className="amount">${caseData.auctionPrice.toLocaleString()}</span>
              </div>
              <div className="cost-item">
                <span>Repairs/Updates:</span>
                <span className="amount">${caseData.repairEstimate.toLocaleString()}</span>
              </div>
              <div className="cost-item">
                <span>Closing Costs (~2.5%):</span>
                <span className="amount">${closingCosts.toLocaleString()}</span>
              </div>
              <div className="cost-item total">
                <span>Total Investment:</span>
                <span className="amount">${totalInvestment.toLocaleString()}</span>
              </div>
            </div>

            <div className="analysis-section">
              <h4>Property Value</h4>
              <div className="cost-item">
                <span>Market Value:</span>
                <span className="amount">${caseData.actualValue.toLocaleString()}</span>
              </div>
              {caseData.liens && caseData.liens.length > 0 && (
                <>
                  <h4 style={{ marginTop: '20px' }}>Liens That Survive</h4>
                  {caseData.liens.map((lien, idx) => {
                    const survives = 
                      lien.type.includes('Federal Tax') ||
                      lien.type.includes('HOA Superpriority') ||
                      lien.type.includes('Code Enforcement');
                    
                    return survives ? (
                      <div key={idx} className="cost-item warning">
                        <span>{lien.type}:</span>
                        <span className="amount">-${lien.amount.toLocaleString()}</span>
                      </div>
                    ) : null;
                  })}
                </>
              )}
            </div>

            <div className="analysis-section">
              <h4>Profit/Loss Analysis</h4>
              <div className={`cost-item ${netProfit >= 0 ? 'profit' : 'loss'}`}>
                <span>Net Profit/Loss:</span>
                <span className="amount">
                  {netProfit >= 0 ? '+' : ''} ${Math.abs(netProfit).toLocaleString()}
                </span>
              </div>
              <div className={`cost-item ${netProfit >= 0 ? 'profit' : 'loss'}`}>
                <span>Profit Margin:</span>
                <span className="amount">
                  {netProfit >= 0 ? '+' : ''} {profitMargin}%
                </span>
              </div>
              <div className={`deal-classification ${caseData.isGoodDeal ? 'good' : 'bad'}`}>
                <strong>Classification:</strong>
                <span>{caseData.isGoodDeal ? '✅ GOOD DEAL' : '❌ BAD DEAL'}</span>
              </div>
            </div>
          </div>

          {caseData.redFlags && caseData.redFlags.length > 0 && (
            <div className="red-flags-analysis">
              <h4>🚩 Key Red Flags</h4>
              {caseData.redFlags.map((flag, idx) => (
                <div key={idx} className={`flag-item severity-${flag.severity}`}>
                  <div className="flag-title">
                    <strong>Severity: {flag.severity.toUpperCase()}</strong>
                  </div>
                  <div className="flag-description">{flag.description}</div>
                  <div className="flag-location">Found in: {flag.hiddenIn}</div>
                </div>
              ))}
            </div>
          )}

          <div className="scoring-outcome">
            <h4>⚖️ Scoring Outcomes</h4>
            <div className="outcome-grid">
              <div className={`outcome ${caseData.isGoodDeal ? 'bad-choice' : 'correct-choice'}`}>
                <div className="choice">BUY</div>
                <div className={caseData.isGoodDeal ? 'points positive' : 'points negative'}>
                  {caseData.isGoodDeal ? '+100' : '-150'} points
                </div>
                <div className="explanation">
                  {caseData.isGoodDeal 
                    ? 'Good investment with positive ROI' 
                    : 'Loss-making deal with surviving liens'}
                </div>
              </div>

              <div className={`outcome ${caseData.isGoodDeal ? 'bad-choice' : 'correct-choice'}`}>
                <div className="choice">WALK AWAY</div>
                <div className={caseData.isGoodDeal ? 'points negative' : 'points positive'}>
                  {caseData.isGoodDeal ? '-50' : '+50'} points
                </div>
                <div className="explanation">
                  {caseData.isGoodDeal 
                    ? 'Missed profitable opportunity' 
                    : 'Correctly avoided bad investment'}
                </div>
              </div>
            </div>
          </div>

          <div className="key-lesson">
            <h4>💡 Learning Points</h4>
            <ul>
              {caseData.isGoodDeal ? (
                <li>✅ Positive cash flow makes this a solid investment</li>
              ) : (
                <li>❌ Red flags like surviving liens make this unprofitable</li>
              )}
              <li>🏦 Always calculate TOTAL costs including repairs and closing</li>
              <li>⚖️ Compare total investment to realistic market value</li>
              <li>📋 Check for liens that survive foreclosure in your jurisdiction</li>
              <li>💰 Target 20%+ profit margin to cover risks and holding costs</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
