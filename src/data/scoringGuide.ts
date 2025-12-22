/**
 * SCORING GUIDE - Deal or Disaster
 * 
 * This guide shows the financial analysis and reasoning for each case,
 * explaining why each property is classified as a "good deal" or "bad deal"
 */

export interface ScoringAnalysis {
  caseId: string;
  address: string;
  classification: 'GOOD_DEAL' | 'BAD_DEAL';
  financialAnalysis: {
    auctionPrice: number;
    estimatedRepairs: number;
    closingCosts: number;
    totalInvestment: number;
    marketValue: number;
    netProfit: number;
    profitMargin: number;
  };
  redFlagsFound: Array<{
    description: string;
    financialImpact: number;
    why: string;
  }>;
  decision: string;
  optimalChoice: 'BUY' | 'WALK_AWAY';
  scoringOutcome: {
    ifBuy: number;
    ifWalkAway: number;
    reason: string;
  };
}

export const scoringGuides: ScoringAnalysis[] = [
  {
    caseId: 'case-001',
    address: '1428 Elm Street, Phoenix, AZ',
    classification: 'BAD_DEAL',
    financialAnalysis: {
      auctionPrice: 180000,
      estimatedRepairs: 45000,
      closingCosts: 5000,
      totalInvestment: 230000,
      marketValue: 200000,
      netProfit: -30000,
      profitMargin: -13.0
    },
    redFlagsFound: [
      {
        description: 'IRS Federal Tax Lien ($78,000)',
        financialImpact: -78000,
        why: 'Federal tax liens survive foreclosure sales in many jurisdictions. When you buy the property, you inherit this $78k debt. The IRS can claim the property or force you to pay. This completely eliminates any profit potential.'
      }
    ],
    decision: `
FINANCIAL MATH:
- Auction Price: $180,000
- Repairs: $45,000
- Closing Costs: ~$5,000
- TOTAL COST TO OWN: $230,000

- Market Value: $200,000
- IRS Lien (survives sale): -$78,000
- ACTUAL VALUE: $122,000

- NET LOSS: $230,000 - $122,000 = -$108,000 LOSS

This is a TERRIBLE deal. You'd lose $108,000 on this property.
    `,
    optimalChoice: 'WALK_AWAY',
    scoringOutcome: {
      ifBuy: -150,
      ifWalkAway: 50,
      reason: 'Buying this property costs you 150 points. Walking away earns you 50 points because you correctly identified the hidden IRS lien threat.'
    }
  },

  {
    caseId: 'case-002',
    address: '742 Evergreen Terrace, Las Vegas, NV',
    classification: 'GOOD_DEAL',
    financialAnalysis: {
      auctionPrice: 140000,
      estimatedRepairs: 35000,
      closingCosts: 4500,
      totalInvestment: 179500,
      marketValue: 245000,
      netProfit: 65500,
      profitMargin: 36.5
    },
    redFlagsFound: [
      {
        description: 'HOA Fees ($150/month, $1,200 back dues)',
        financialImpact: -1200,
        why: 'HOA fees are normal and reasonable for this property type. The $1,200 back dues is manageable and already factored into the auction price. This is NOT a deal-killer, just a normal cost of ownership.'
      }
    ],
    decision: `
FINANCIAL MATH:
- Auction Price: $140,000
- Repairs: $35,000
- Closing Costs: ~$4,500
- TOTAL COST TO OWN: $179,500

- Market Value (after repairs): $245,000
- HOA Back Dues: -$1,200 (minor)
- Ongoing HOA: $150/month (normal for this property)

- NET PROFIT: $245,000 - $179,500 = $65,500 PROFIT
- PROFIT MARGIN: 36.5% return

This is a SOLID DEAL. You make $65,500 profit with reasonable HOA costs.
    `,
    optimalChoice: 'BUY',
    scoringOutcome: {
      ifBuy: 100,
      ifWalkAway: -50,
      reason: 'Buying this property earns you 100 points because it is genuinely a good investment. Walking away loses 50 points because you would have missed a great opportunity.'
    }
  },

  {
    caseId: 'case-003',
    address: '221B Baker Street, Henderson, NV',
    classification: 'BAD_DEAL',
    financialAnalysis: {
      auctionPrice: 210000,
      estimatedRepairs: 28000,
      closingCosts: 6500,
      totalInvestment: 244500,
      marketValue: 150000,
      netProfit: -94500,
      profitMargin: -38.6
    },
    redFlagsFound: [
      {
        description: 'HOA Superpriority Lien ($47,500)',
        financialImpact: -47500,
        why: 'Nevada law gives HOA liens SUPERPRIORITY status. This means the HOA lien survives foreclosure and ranks AHEAD of the mortgage. You must pay this $47.5k on top of your purchase price. It\'s a first claim on the property.'
      },
      {
        description: 'Property is Occupied',
        financialImpact: -10000,
        why: 'Occupied properties require formal eviction proceedings. Expect 3-6 months delays and $5k-$15k in legal/eviction costs. You can\'t rent it out or sell it during this time.'
      }
    ],
    decision: `
FINANCIAL MATH:
- Auction Price: $210,000
- Superpriority HOA Lien (MUST PAY): $47,500
- Repairs: $28,000
- Eviction Costs: ~$10,000
- Closing Costs: ~$6,500
- TOTAL COST TO OWN: $302,000

- Market Value: ~$150,000 (after long delay from occupancy)
- Additional HOA Lien: -$18,000 (still owed)

- NET LOSS: $302,000 - $150,000 = -$152,000 LOSS

This is a DISASTER. The superpriority HOA lien kills this deal. You lose $152,000.
    `,
    optimalChoice: 'WALK_AWAY',
    scoringOutcome: {
      ifBuy: -150,
      ifWalkAway: 50,
      reason: 'Buying this property costs you 150 points due to the fatal superpriority HOA lien. Walking away earns 50 points for correctly identifying this Nevada-specific trap.'
    }
  },

  {
    caseId: 'case-004',
    address: '4160 Government Way, Tucson, AZ',
    classification: 'BAD_DEAL',
    financialAnalysis: {
      auctionPrice: 95000,
      estimatedRepairs: 22000,
      closingCosts: 3500,
      totalInvestment: 120500,
      marketValue: 165000,
      netProfit: -55500,
      profitMargin: -46.0
    },
    redFlagsFound: [
      {
        description: 'Code Enforcement Lien ($35,000)',
        financialImpact: -35000,
        why: 'Municipal code enforcement liens survive foreclosure. This property has unpermitted additions and safety violations. You MUST bring it to code before you can legally rent, sell, or occupy it. The $35k lien stays with the property.'
      },
      {
        description: 'Repair Estimate is Unrealistically Low',
        financialImpact: -30000,
        why: 'The repair estimate of $22k doesn\'t account for bringing unpermitted work into compliance. Code violations typically cost 50-100% MORE to fix properly. Real repair costs: $50k-$70k minimum.'
      }
    ],
    decision: `
FINANCIAL MATH:
- Auction Price: $95,000
- Official Repair Estimate: $22,000 (UNREALISTIC)
- Code Remediation (hidden cost): ~$50,000
- Code Enforcement Lien (must pay): $35,000
- Closing Costs: ~$3,500
- TOTAL REALISTIC COST: $205,500

- Market Value: ~$165,000
- Code Lien: $35,000 (survives foreclosure)

- NET LOSS: $205,500 - $165,000 = -$40,500 LOSS

This is a BAD DEAL. Hidden code violations and unrealistic repair estimates lead to massive losses.
    `,
    optimalChoice: 'WALK_AWAY',
    scoringOutcome: {
      ifBuy: -150,
      ifWalkAway: 50,
      reason: 'Buying this property costs you 150 points due to the code enforcement lien and unrealistic repairs. Walking away earns 50 points for spotting the municipal lien trap.'
    }
  },

  {
    caseId: 'case-005',
    address: '1313 Mockingbird Lane, Scottsdale, AZ',
    classification: 'GOOD_DEAL',
    financialAnalysis: {
      auctionPrice: 285000,
      estimatedRepairs: 55000,
      closingCosts: 8500,
      totalInvestment: 348500,
      marketValue: 465000,
      netProfit: 116500,
      profitMargin: 33.4
    },
    redFlagsFound: [
      {
        description: 'Mechanics Lien - ABC Roofing ($8,500)',
        financialImpact: -8500,
        why: 'This lien is recent and for legitimate roof work. However, it\'s small relative to the deal size (1.7% of auction price). You should factor it in but it doesn\'t kill the profitability.'
      }
    ],
    decision: `
FINANCIAL MATH:
- Auction Price: $285,000
- Repairs/Updates: $55,000
- Mechanics Lien (small, manageable): $8,500
- Closing Costs: ~$8,500
- TOTAL COST TO OWN: $357,000

- Market Value (after repairs): $465,000
- Mechanics Lien: -$8,500 (already counted)

- NET PROFIT: $465,000 - $357,000 = $108,000 PROFIT
- PROFIT MARGIN: 33.4% return

This is an EXCELLENT DEAL. The mechanics lien is small and manageable. You make $108,000 profit.
    `,
    optimalChoice: 'BUY',
    scoringOutcome: {
      ifBuy: 100,
      ifWalkAway: -50,
      reason: 'Buying this property earns you 100 points. Walking away loses 50 points because this is a genuinely profitable investment despite the small mechanics lien.'
    }
  }
];

/**
 * Scoring Summary for Learning
 * 
 * SCORING RULES:
 * ✅ Buy GOOD deal (profitable) = +100 points
 * ❌ Buy BAD deal (money-losing) = -150 points
 * ✅ Walk from BAD deal = +50 points
 * ❌ Walk from GOOD deal = -50 points
 * 🚩 Find hidden red flag = +25 bonus points
 * 
 * KEY LESSONS:
 * 1. Tax liens (IRS, federal) survive foreclosure - they're deadly
 * 2. HOA superpriority liens vary by state - know your jurisdiction
 * 3. Code violations create hidden costs - never assume low repair estimates
 * 4. Occupied properties have eviction delays and legal costs
 * 5. Small mechanical liens are often manageable - evaluate deal viability overall
 * 
 * FINANCIAL THRESHOLD:
 * - Good deal: 20%+ profit margin with manageable risks
 * - Bad deal: Any scenario with negative net profit or survival liens
 */
