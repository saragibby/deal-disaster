# Property Comparison Dashboard — Phases & Implementation

> Comprehensive plan for enhancing the multi-property comparison dashboard in the Property Analyzer app.

---

## Overview

The comparison dashboard (`apps/property-analyzer/src/components/ComparisonDashboard.tsx`) allows users to compare multiple investment properties side-by-side. The original version included basic charts (price, cash flow, ROI, rental income), property cards, a map, and a flat metrics table.

This document outlines 6 phases of improvements — from presentation-only enhancements using existing data, through AI-powered insights, to new external data integrations.

---

## Phase 1 — Instant Clarity

> *No new data needed. Purely presentational improvements using existing `PropertyAnalysis` fields.*

### 1. Deal Snapshot Winner Banner ✅

**What:** A horizontal row of 5 mini cards at the top of the dashboard, each declaring a "winner" category:

| Category | Metric | Logic |
|----------|--------|-------|
| Best Cash Flow | `monthlyCashFlow` | Highest wins |
| Best ROI | `cashOnCashROI` | Highest wins |
| Best Value | `price / sqft` | Lowest wins |
| Best STR Play | `strEstimate.netMonthlyRevenue` | Highest wins |
| Lowest Risk | Rental confidence + vacancy | Highest composite wins |

**Top Pick:** If a single property wins 3+ categories, it receives a gold "Top Pick" trophy badge on its property card with a glow ring border.

**Implementation:**
- `dealSnapshot` useMemo computes winners array and `topPickIdx`
- JSX renders `comparison-dashboard__snapshot` row of cards with icons (TrendingUp, Target, DollarSign, Calendar, Shield)
- Property cards check `isTopPick` flag and conditionally render Trophy badge
- CSS: `.comparison-dashboard__snapshot-card`, `.comparison-dashboard__card--top-pick`, `.comparison-dashboard__top-pick-badge`

**Data source:** `CashFlowBreakdown.monthlyCashFlow`, `ROIMetrics.cashOnCashROI`, `PropertyData.price/sqft`, `STREstimate.netMonthlyRevenue`, `RentalEstimate.confidence`, `AnalysisParams.vacancyPct`

---

### 2. Expense Breakdown Stacked Bar Chart ✅

**What:** A stacked bar chart showing where money goes for each property — Mortgage, Tax, Insurance, Vacancy, Repairs, CapEx, and Management. Two properties with similar cash flow can have very different cost structures.

**Implementation:**
- `expenseData` useMemo extracts all 7 expense categories from `CashFlowBreakdown`
- Rendered as recharts `BarChart` with `stackId="expenses"` on all bars
- Color-coded: Mortgage (red), Tax (orange), Insurance (yellow), Vacancy (green), Repairs (cyan), CapEx (purple), Management (pink)

**Data source:** `CashFlowBreakdown` — `monthlyMortgage`, `monthlyTax`, `monthlyInsurance`, `monthlyVacancy`, `monthlyRepairs`, `monthlyCapex`, `monthlyManagement`

---

### 3. Tax Savings & Depreciation Chart ✅

**What:** Grouped bar chart showing depreciation deduction and tax savings per property, with effective first-year return percentages displayed below the chart.

**Implementation:**
- `taxSavingsData` useMemo extracts `depreciationDeduction`, `taxSavings`, `effectiveFirstYearReturn` from `TaxSavingsBreakdown`
- Rendered as recharts `BarChart` with Depreciation (indigo) and Tax Savings (green)
- Effective return shown as text row below chart: `{property}: X.XX% eff. return`
- CSS: `.comparison-dashboard__eff-return`

**Data source:** `TaxSavingsBreakdown` — `depreciationDeduction`, `taxSavings`, `effectiveFirstYearReturn`

---

## Phase 2 — Income Strategy Comparison

> *Surfaces STR vs LTR strategy data and rental demand indicators.*

### 4. LTR vs STR Strategy Matrix ✅

**What:** Per-property cards with two columns comparing Long-Term Rental vs Short-Term Rental strategies. Each card shows a "winner" badge (LTR or STR) based on which yields higher monthly cash flow.

| LTR Column | STR Column |
|------------|------------|
| Monthly Income | Nightly Rate |
| Monthly Expenses | Occupancy % |
| Cash Flow | Gross Revenue |
| CoC ROI | Cash Flow |
| | CoC ROI |

Properties without STR data show a "No STR data available" placeholder.

**Implementation:**
- `strategyData` useMemo computes LTR and STR scenarios per property
- STR cash flow recalculated: `strEstimate.netMonthlyRevenue - (mortgage + tax + insurance + vacancy + repairs + capex + management)`
- STR CoC ROI: `(strMonthlyCashFlow × 12 / totalCashInvested) × 100`
- Winner determined by comparing monthly cash flow
- CSS: `.comparison-dashboard__strategy-grid`, `.comparison-dashboard__strategy-card`, `.comparison-dashboard__strategy-winner--ltr` (purple), `--str` (amber)

**Data source:** `CashFlowBreakdown` (all fields), `STREstimate` — `nightlyRate`, `occupancyRate`, `grossMonthlyRevenue`, `cleaningCosts`, `platformFees`, `netMonthlyRevenue`, `ROIMetrics.totalCashInvested`

---

### 5. Rental Demand Indicators ✅

**What:** Three new rows added to the detailed comparison table with color-coded signal pills indicating rental demand strength.

| Indicator | Good | Neutral | Poor |
|-----------|------|---------|------|
| Price-to-Rent Ratio | < 15× | 15–20× | > 20× |
| Gross Yield | ≥ 8% | 5–8% | < 5% |
| Rent / Sq Ft | (shown as value) | — | — |

**Implementation:**
- `demandIndicators` useMemo computes per-property ratios and signals
- Added as section header row + 3 data rows in `<tbody>` of comparison table
- Signal pills: `.comparison-dashboard__demand-pill--good` (green), `--neutral` (yellow), `--poor` (red)
- Thresholds match single-property view (`PropertyResults.tsx`)

**Data source:** `PropertyData.price`, `PropertyData.sqft`, `CashFlowBreakdown.monthlyRent`, `RentalEstimate.mid`

---

## Phase 3 — Risk & Scenario Analysis

> *Break-even calculations and scenario modeling to assess investment resilience.*

### 6. Break-Even Analysis ✅

**What:** Per-property cards showing how close each property is to break-even, with visual bars and key metrics:

- **Break-even occupancy %** — what vacancy rate makes cash flow = $0
- **Safety margin** — how far above break-even (colored: green > 15%, neutral 5–15%, red < 5%)
- **Break-even rent** — minimum monthly rent to cover all expenses
- **Months to recoup** — total cash invested ÷ monthly cash flow (only shown if CF > 0)

Visual progress bars show break-even occupancy vs current occupancy with color-coding (green < 75%, yellow 75–90%, red > 90%).

**Implementation:**
- `breakEvenData` useMemo computes all metrics from existing cash flow and ROI data
- CSS: `.comparison-dashboard__breakeven-grid`, `.comparison-dashboard__breakeven-card`, `.comparison-dashboard__breakeven-bar-wrap`, `.comparison-dashboard__breakeven-bar--current`

**Data source:** `CashFlowBreakdown` (all expense fields + `monthlyRent`), `ROIMetrics.totalCashInvested`, `AnalysisParams.vacancyPct`

---

### 7. What-If Scenario Sliders ⬜ (Planned)

**What:** Shared slider controls at the top of the charts section:
- "What if vacancy is X%?" (range: 0–30%)
- "What if rents drop X%?" (range: −30% to +30%)

When adjusted, all charts and metrics live-recalculate. Properties that stay cash-flow-positive under stress are more resilient — surfaced visually with conditional highlighting.

**Implementation plan:**
- Local state: `scenarioVacancy` and `scenarioRentAdjust`
- Modified useMemo hooks accept scenario overrides
- Recompute cash flow and ROI from `analysisParams` + overrides using existing formulas
- Slider UI pattern from `PropertyResults.tsx` interactive offer price/rent sliders

**Data source:** Recalculated from existing `AnalysisParams` + `CashFlowBreakdown`

---

## Phase 4 — AI-Powered Insights

> *Leverages existing Azure OpenAI infrastructure (GPT-4 / GPT-5-nano).*

### 8. AI Deal Summary ⬜ (Planned)

**What:** Send all compared properties' financials to GPT-4/5-nano. Get a 3–5 sentence comparison narrative: which property is strongest, key tradeoffs, risks to watch.

**Implementation plan:**
- New server endpoint: `POST /api/ai/comparison-summary`
- Request body: array of property financials (cash flow, ROI, STR, tax savings)
- Response: plain text narrative
- Displayed as a card at the top of the dashboard (below snapshot banner)
- Cache 24h per property set (hash property IDs as cache key)

**Cost:** ~$0.01–0.05 per comparison (gpt-5-nano)

---

### 9. AI Investment Narrative Per Property ⬜ (Planned)

**What:** Collapsible paragraph on each property card interpreting cash flow, ROI, STR potential, build year, and tax savings in plain English.

**Implementation plan:**
- Batch all properties in a single API call to minimize cost
- Displayed as expandable section in property cards
- Use gpt-5-nano for cost efficiency

**Cost:** ~$0.01–0.03 per batch

---

### 10. Price History Trend Analysis ⬜ (Planned)

**What:** Zillow `priceHistory` is already fetched but never analyzed. Compute:
- % change over 1yr / 5yr
- Number of price cuts
- Appreciation rate

Display as sparkline chart + trend badge (📈 Appreciating / 📉 Declining / ➡️ Flat).

**Implementation plan:**
- No new API calls needed — data already in `PropertyData`
- New useMemo for trend calculations
- Sparkline using recharts `LineChart`
- New row in comparison table

---

## Phase 5 — New Data Integrations

> *Low-cost or free external APIs to enrich property context.*

### 11. Walk Score ⬜ (Planned)

**What:** Walkability, transit, and bike scores for each property. Correlates with rental demand and STR occupancy.

| Score | Range | Display |
|-------|-------|---------|
| Walk Score | 0–100 | Badge + label |
| Transit Score | 0–100 | Badge |
| Bike Score | 0–100 | Badge |

**API:** Walk Score API (free, 5,000 calls/day)
**Cost:** Free

---

### 12. School Ratings ⬜ (Planned)

**What:** Nearby school names and ratings (1–10). School quality is the #1 driver of family rental demand. Display top 3 schools as a comparison table section.

**API:** GreatSchools (free) or US Schools on RapidAPI (~$0.001/call)
**Cost:** $0–5/month

---

### 13. Crime / Safety Grade ⬜ (Planned)

**What:** Crime incidents within 1-mile radius, A–F safety grade. High crime = higher vacancy, lower rent, higher insurance. Safety badge per property.

**API:** Crimeometer on RapidAPI (100 free calls/month)
**Cost:** $0–10/month

---

### 14. Demographics (Census Data) ⬜ (Planned)

**What:** Neighborhood demographic data by zip code:
- Median household income (determines rent ceiling)
- Population growth (drives appreciation)
- Renter vs owner % (indicates rental demand)
- Poverty rate

Displayed as new section in the comparison table.

**API:** US Census ACS (completely free, unlimited)
**Cost:** Free

---

## Phase 6 — AI + New Data Combined

> *Highest value — combines external data with AI analysis.*

### 15. AI Neighborhood Report ⬜ (Planned)

**What:** Feed walk score, school ratings, crime grade, and demographics into one Azure OpenAI prompt per property. Generate a 2–3 sentence neighborhood assessment. Expandable "Neighborhood Intel" card.

**Depends on:** Phases 4 + 5

---

### 16. AI Investment Score (0–100) ⬜ (Planned)

**What:** Composite score weighted by investor type ("buy-and-hold" vs "flip"). Confidence level based on data completeness. Large badge on each property card, table sorted by score.

**Depends on:** All prior phases

---

## Implementation Status

| # | Feature | Phase | Status | Files Modified |
|---|---------|-------|--------|----------------|
| 1 | Deal Snapshot Banner | 1 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 2 | Expense Breakdown Chart | 1 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 3 | Tax Savings Chart | 1 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 4 | LTR vs STR Strategy Matrix | 2 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 5 | Rental Demand Indicators | 2 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 6 | Break-Even Analysis | 3 | ✅ Done | ComparisonDashboard.tsx, analyzer.css |
| 7 | What-If Scenario Sliders | 3 | ⬜ Planned | ComparisonDashboard.tsx |
| 8 | AI Deal Summary | 4 | ⬜ Planned | New server endpoint + ComparisonDashboard.tsx |
| 9 | AI Investment Narrative | 4 | ⬜ Planned | New server endpoint + ComparisonDashboard.tsx |
| 10 | Price History Trends | 4 | ⬜ Planned | ComparisonDashboard.tsx |
| 11 | Walk Score | 5 | ⬜ Planned | New service + ComparisonDashboard.tsx |
| 12 | School Ratings | 5 | ⬜ Planned | New service + ComparisonDashboard.tsx |
| 13 | Crime / Safety Grade | 5 | ⬜ Planned | New service + ComparisonDashboard.tsx |
| 14 | Demographics | 5 | ⬜ Planned | New service + ComparisonDashboard.tsx |
| 15 | AI Neighborhood Report | 6 | ⬜ Planned | New server endpoint + ComparisonDashboard.tsx |
| 16 | AI Investment Score | 6 | ⬜ Planned | New server endpoint + ComparisonDashboard.tsx |

---

## Cost Estimates (Phases 5–6 APIs)

| API | Free Tier | Expected Monthly Cost |
|-----|-----------|----------------------|
| Walk Score | 5,000/day | Free |
| US Census ACS | Unlimited | Free |
| GreatSchools / US Schools | 100–500/month | $0–5 |
| Crimeometer | 100/month | $0–10 |
| Azure OpenAI (summaries) | Pay-per-token | ~$0.50–2 |

---

## Technical Notes

### Architecture
- **Frontend:** React + TypeScript (`apps/property-analyzer/src/components/`)
- **Charts:** recharts (BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell)
- **Icons:** lucide-react (Trophy, Shield, AlertTriangle, Target, TrendingUp, etc.)
- **Types:** `@deal-platform/shared-types` — PropertyAnalysis, CashFlowBreakdown, ROIMetrics, TaxSavingsBreakdown, STREstimate
- **Styling:** BEM-style `.comparison-dashboard__*` classes in `analyzer.css`
- **AI:** Azure OpenAI (GPT-4 / GPT-5-nano), existing `AZURE_OPENAI_*` env vars
- **External APIs:** Zillow, AirDNA, RentCast via existing `RAPIDAPI_KEY`

### Design Decisions
- All Phase 1–3 improvements use data already in `PropertyAnalysis` — no new API calls or backend changes
- Winner banner uses simple "highest/lowest wins" logic, not a weighted composite score
- What-if scenarios are local-only recalculations, not persisted or shared via URL
- New sections auto-capture in PDF export via existing DOM snapshot logic
- Property colors from `PROPERTY_COLORS` array (imported from ComparisonSelector) used consistently across all new sections

### Verification Checklist
- [ ] Compare 2–3 properties and confirm winner banner correctly identifies best per category
- [ ] Verify expense breakdown bars sum to `totalMonthlyExpenses` for each property
- [ ] Verify tax savings values match single-property view for the same property
- [ ] Test STR strategy matrix with a property that has no STR data (shows "No STR data available")
- [ ] Confirm rental demand signals match thresholds (price-to-rent < 15× = Strong, etc.)
- [ ] Test break-even with negative cash flow property — months-to-recoup hidden
- [ ] Test with 2 properties (minimum) and 6 properties (maximum) — layout shouldn't break
- [ ] Run existing e2e tests to confirm no regressions
