/**
 * IMPLEMENTATION SUMMARY: Financial Analysis Display
 * 
 * FLOW:
 * 1. Player reviews case (foreclosure announcement, property details, liens)
 * 2. Player makes decision: BUY, WALK AWAY, or INVESTIGATE MORE
 * 3. Result Modal appears with:
 *    - Decision outcome (✅ Excellent, ❌ Bad, etc.)
 *    - Points awarded/lost
 *    - Basic explanation
 *    - "📊 View Financial Analysis" button
 * 4. Player clicks button to reveal detailed MATH
 * 5. Financial Analysis shows:
 *    - Investment Costs breakdown
 *    - Property Value section
 *    - Profit/Loss calculation with percentage
 *    - Classification (GOOD DEAL / BAD DEAL)
 *    - All Red Flags found/missed
 *    - Scoring Math explanation
 */

// EXAMPLE RESULT SCREENS:

// ============================================================================
// SCENARIO 1: Buy a GOOD DEAL (Case 2: Las Vegas Townhome)
// ============================================================================

INITIAL RESULT SCREEN:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│              ✅ Excellent Decision!                        │
│                    +100 points                             │
│                                                            │
│  This was a solid deal! You'll make approximately        │
│  $65,500 profit.                                           │
│                                                            │
│       📊 View Financial Analysis                           │
│                                                            │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘


AFTER CLICKING "View Financial Analysis":
┌────────────────────────────────────────────────────────────┐
│                 Financial Analysis                         │
│        742 Evergreen Terrace, Las Vegas, NV                │
│                                                            │
│  💰 Investment Costs    📈 Property Value    🎯 Profit/Loss│
│  ─────────────────────  ─────────────────    ──────────────│
│  Auction Price:         Market Value:         Net Profit:   │
│  $140,000              $245,000              +$65,500       │
│                                                            │
│  Repairs/Updates:      Surviving Liens:      Profit Margin:│
│  $35,000               None (good sign!)     +36.5%         │
│                                                            │
│  Closing Costs (2.5%):                       Classification:│
│  $4,500                                      ✅ GOOD DEAL   │
│                                                            │
│  Total Investment:                                         │
│  $179,500                                                  │
│                                                            │
│                                                            │
│  🚩 Red Flags in This Property                             │
│  ─────────────────────────────────────────               │
│  ⚠️ SEVERITY: LOW                                           │
│  Minor HOA fees - normal and manageable. Property is       │
│  actually a solid deal!                                    │
│  Location: HOA Documents                                   │
│  ✅ You found this!                                         │
│                                                            │
│                                                            │
│  ⚖️ Why This Scoring                                        │
│  ─────────────────────────────────────────               │
│  Bought a GOOD deal:                                      │
│  ✅ Positive ROI of +36.5% = +100 points                  │
│                                                            │
│       Hide Analysis                                        │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘


// ============================================================================
// SCENARIO 2: Buy a BAD DEAL (Case 1: Phoenix with IRS Lien)
// ============================================================================

INITIAL RESULT SCREEN:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│              ❌ Bad Investment!                             │
│                    -150 points                             │
│                                                            │
│  This was a trap! IRS tax lien survives foreclosure!      │
│  You\'ll inherit $78k debt that attaches to the property.  │
│  You would lose approximately $108,000.                    │
│                                                            │
│       📊 View Financial Analysis                           │
│                                                            │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘


AFTER CLICKING "View Financial Analysis":
┌────────────────────────────────────────────────────────────┐
│                 Financial Analysis                         │
│       1428 Elm Street, Phoenix, AZ                         │
│                                                            │
│  💰 Investment Costs    📈 Property Value    🎯 Profit/Loss│
│  ─────────────────────  ─────────────────    ──────────────│
│  Auction Price:         Market Value:         Net Loss:     │
│  $180,000              $200,000              -$108,000      │
│                                                            │
│  Repairs/Updates:      Surviving Liens:      Profit Margin:│
│  $45,000               ⚠️ IRS Lien: -$78k    -46.9%         │
│                                                            │
│  Closing Costs (2.5%):                       Classification:│
│  $5,000                                      ❌ BAD DEAL    │
│                                                            │
│  Total Investment:                                         │
│  $230,000                                                  │
│                                                            │
│                                                            │
│  🚩 Red Flags in This Property                             │
│  ─────────────────────────────────────────               │
│  🚨 SEVERITY: HIGH                                          │
│  IRS tax lien survives foreclosure! You\'ll inherit $78k  │
│  debt that attaches to the property.                       │
│  Location: Title Report - Page 7                           │
│                                                            │
│                                                            │
│  ⚖️ Why This Scoring                                        │
│  ─────────────────────────────────────────               │
│  Bought a BAD deal:                                       │
│  ❌ Negative ROI of -46.9% = -150 points                  │
│                                                            │
│       Hide Analysis                                        │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘


// ============================================================================
// SCENARIO 3: Walk Away from BAD DEAL (Case 3: Henderson Condo)
// ============================================================================

INITIAL RESULT SCREEN:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│              👍 Smart Move!                                 │
│                    +50 points                              │
│                                                            │
│  Good instincts! You avoided a bad deal. HOA              │
│  Superpriority Lien in Nevada! First $47.5k survives      │
│  foreclosure...                                            │
│                                                            │
│       📊 View Financial Analysis                           │
│                                                            │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘


AFTER CLICKING "View Financial Analysis":
┌────────────────────────────────────────────────────────────┐
│                 Financial Analysis                         │
│       221B Baker Street, Henderson, NV                     │
│                                                            │
│  💰 Investment Costs    📈 Property Value    🎯 Profit/Loss│
│  ─────────────────────  ─────────────────    ──────────────│
│  Auction Price:         Market Value:         Net Loss:     │
│  $210,000              $150,000              -$152,000      │
│                                                            │
│  Repairs/Updates:      Surviving Liens:      Profit Margin:│
│  $28,000               ⚠️ HOA Superpriority: -38.6%         │
│                        -$47,500                            │
│  Eviction Costs:                                           │
│  ~$10,000              Occupied Property      Classification:│
│                                               ❌ BAD DEAL   │
│  Closing Costs (2.5%):                                     │
│  $6,500                                                    │
│                                                            │
│  Total Investment:                                         │
│  $302,000                                                  │
│                                                            │
│                                                            │
│  🚩 Red Flags in This Property                             │
│  ─────────────────────────────────────────               │
│  🚨 SEVERITY: HIGH                                          │
│  HOA Superpriority Lien in Nevada! First $47.5k survives  │
│  foreclosure. You inherit this debt on top of your        │
│  purchase price.                                           │
│  Location: HOA Lien - Fine Print                           │
│                                                            │
│  ⚠️ SEVERITY: MEDIUM                                        │
│  Property is occupied - expect 3-6 month eviction delay   │
│  and legal costs of $5k-$15k                               │
│  Location: Occupancy Status                                │
│                                                            │
│                                                            │
│  ⚖️ Why This Scoring                                        │
│  ─────────────────────────────────────────               │
│  Walked away from a BAD deal:                             │
│  ✅ Avoided a loss of $152,000 = +50 points               │
│                                                            │
│       Hide Analysis                                        │
│            Next Case →                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
