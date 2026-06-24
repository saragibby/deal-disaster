# Property Analyzer — Accuracy, Trust & Clarity Improvement Plan

> Living tracker for the multi-phase effort to make the Property Analyzer's numbers more
> trustworthy/data-backed and the page far easier to understand. Update the **Progress** boxes
> as work lands.

## Goals

1. **Accuracy & trust** — close the real data gaps and be radically transparent about what is
   data-backed vs. algorithmically estimated. Maximize use of the data APIs we already pay for.
2. **Decision-first UX** — answer "Is this a good deal?" at the top, with plain-language
   explanations of every metric.
3. **Single source of truth** — every part of the page that reports the same fact (e.g. "best
   strategy") must read from one calculation.

---

## Key findings (from codebase audit)

- **Rent/cash-flow/ROI are NOT AI-generated.** The only AI usage is `aiComparisonService.ts`
  (Azure OpenAI), which writes narrative comparison text between properties. All financial numbers
  come from data APIs (RentCast / AirDNA / Zillow) or transparent algorithms.
- **Real accuracy gaps:**
  - **MTR** is 100% algorithmic — no external data source integrated (confidence always `low`).
  - **STR** uses AirDNA when available, otherwise falls back to an algorithm (`low` confidence).
  - **Tax assumptions are hardcoded** — cost-seg `22.5%`, marginal tax rate `20%`.
  - **Default expenses are fixed** — vacancy `8%`, repairs `10%`, capex `10%`, management `0%`,
    property tax `$2,500`, insurance `$1,500`.
  - **Zillow rental comps path is dead** — `getRentalComps()` always returns `[]`; comps come from
    RentCast or algorithmic calibration.
- **Wealth projection is a 5-year FRONTEND calc** (`FiveYearProjection.tsx`), not a 10-year backend
  one. There is no backend break-even/recoup or best-strategy computation.

### The "best strategy" inconsistency (confirmed)

LTR's "net" is defined three different ways, while MTR/STR always use `netMonthlyRevenue` (a figure
that excludes the mortgage). That apples-to-oranges mix is why the nav summary and the KPI/Comparison
cards can disagree:

| Location | LTR value used | Result |
| --- | --- | --- |
| `SectionNav.tsx` (~L82) | `cashFlow.monthlyCashFlow` (**after** mortgage) | LTR penalized → can pick MTR |
| `RentalTabs.tsx` `RentalSummaryStrip` (~L70) | `effectiveRent` (**gross** rent) | LTR inflated → picks LTR |
| `StrategyComparison.tsx` (~L295) | `ltrRent` (**gross** rent) | picks LTR |

**Fix:** one shared `computeStrategyComparison()` that derives a consistent **net cash flow**
(after mortgage + tax + insurance + HOA) for *all three* strategies and selects the best.
Decision: rank by **net cash flow**.

---

## Phased roadmap

### Phase 0 — Foundation: single source of truth & verdict engine
- **0a** Create this tracking doc.
- **0b** Give LTR `netRentalIncome` + `netCashFlow` parity with MTR/STR (shared-types).
- **0c** `computeStrategyComparison()` single source of truth + refactor the 3 call sites.
- **0d** `computeDealVerdict()` deterministic rules engine, wired into the analyzer response.
- **0e** Break-even rent computed on the backend and added to the analysis result.

### Phase 1 — Clarity & trust
1. Decision-first **verdict card** at top (rules verdict + AskWill "explain this" CTA).
2. Apply best-strategy SSOT across nav / KPI / comparison.
3. Plain-language **metric verdicts** under each KPI.
4. **Data-source & confidence transparency** everywhere + prominent low-confidence banner.
5. **Disambiguate** the two market sections (zip · sold vs. city · ZHVI).
6. **Sticky jump-nav**.
7. **"What changed"** indicator on assumption edits.

### Phase 2 — Accuracy & data coverage
1. **API coverage audit** — fetch/surface every available RentCast/AirDNA/Zillow field; the dead
   Zillow rental-comps path is now retired (private-zillow has no comps endpoint — real comps come
   from RentCast → Realtor.com, then the algorithmic estimator); pull RentCast records/sale comps to
   raise confidence.
2. Replace hardcoded **tax/expense defaults** with user inputs + location/property defaults
   (e.g. property tax from Zillow `taxinfo`).
3. **MTR/STR honesty** — clearly mark algorithmic, expose assumptions; optional low-cost APIs noted.
4. Surface **break-even rent** prominently.

### Phase 3 — Deeper analysis
1. **Goal-based framing** (cash flow / appreciation / tax) reorders sections + reweights verdict.
2. **Sensitivity view** ("at what rent/price/rate does this turn cash-flow positive?").
3. **Saved/named scenarios** with side-by-side compare.

### Phase 4 — Workflow
Portfolio tracking · shareable public-view polish · price/market watch alerts · mobile/responsive pass.

### Phase 5 — Future verticals (roadmap only)
Fix-and-flip · BRRRR · house-hack · auction→analyzer integration · commercial/multifamily ·
STR-specific · non-RE cash-flow assets.

---

## Progress

### Phase 0
- [x] 0a — Workspace tracking doc created
- [x] 0b — LTR net-field parity (`netRentalIncome` + `netCashFlow`)
- [x] 0c — `computeStrategyComparison()` SSOT + 3 refactors
- [x] 0d — `computeDealVerdict()` rules engine wired to routes
- [x] 0e — Break-even rent backend
- [x] Phase 0 build + verification green

### Phases 1–5
- [x] Phase 1 — Clarity & trust
- [~] Phase 2 — Accuracy & data coverage *(in progress: AirDNA STR fix + best-strategy verdict landed)*
- [~] Phase 3 — Deeper analysis *(in progress: sensitivity/stress-test view landed)*
- [ ] Phase 4 — Workflow
- [ ] Phase 5 — Future verticals (roadmap only)

---

## Key files

**Backend**
- `server/src/services/investmentAnalysisService.ts` — calculators + `runFullAnalysis`
- `server/src/services/dealVerdictService.ts` — *(new)* rules engine
- `server/src/routes/propertyAnalyzer.ts` — `/run`, `/re-analyze`; attach verdict
- `server/src/services/rentalEstimationService.ts` / `strEstimationService.ts` / `mtrEstimationService.ts`
- `server/src/services/rentCastService.ts` / `airDnaService.ts` / `propertyDataService.ts`

**Shared**
- `packages/shared-types/src/index.ts` — types + `computeStrategyComparison()` + `computeDealVerdict()` (both pure SSOT functions, reusable by backend now and the frontend live verdict card in Phase 1)

**Frontend** (`apps/property-analyzer/src/`)
- `utils/calculations.ts` — live recompute mirror
- `components/SectionNav.tsx` / `components/RentalTabs.tsx` / `components/StrategyComparison.tsx`
- `components/AnalysisResults.tsx` — verdict card mount, what-changed, break-even
- `components/comparison/HousingMarketTrends.tsx` / `RentalMarketTrends.tsx`

---

## Decisions

- Transparency-first; maximize existing API data. Paid APIs only if low-cost (note per-API).
- Verdict = deterministic rules + AskWill explanation (hybrid).
- **Best strategy ranked by net cash flow (after mortgage).**
- Goal-based framing included (Phase 3). Future verticals are roadmap-only.

---

## Phase 0 — implementation notes (done)

- **Net cash flow is the apples-to-apples ranking metric.** Because all strategies share the same
  property carrying costs (mortgage + tax + insurance + HOA), ranking by net cash flow is equivalent
  to ranking by net rental income — the old bug was simply that the LTR card used *gross* rent while
  MTR/STR used *net*. `computeStrategyComparison()` now derives a consistent `netCashFlow` for all three.
- **SSOT wiring:** backend `runFullAnalysis` → `finalizeAnalysis(results)` computes
  `strategyComparison`, `verdict`, and (via `runFullAnalysis`) `breakEvenRent`, attached to
  `analysis_results` in both `/run` and `/re-analyze`. Frontend `SectionNav.deriveSignals`,
  `RentalSummaryStrip`, and `StrategyComparison` all read the same comparison (recomputed live in
  `AnalysisResults` via the shared function, with a fallback compute for older saved analyses).
- **Verdict** (`computeDealVerdict`) lives in `shared-types` (not a server-only service) so the Phase 1
  verdict card can recompute it live; it is deterministic and fully explainable (reason codes).
- **Not yet surfaced in UI:** `verdict` and `breakEvenRent` are computed and persisted but not rendered —
  that is Phase 1 (verdict card) and Phase 2 (prominent break-even).

---

## Phase 1 — implementation notes (done)

All seven Phase 1 items landed in the analyzer UI (single-property results view):

1. **Decision-first verdict card** — `components/DealVerdictCard.tsx`, mounted at the very top of
   `AnalysisResults` (`#deal-verdict`). Consumes `computeDealVerdict()` recomputed **live** via
   `useMemo` so it reflects adjusted assumptions, not just the saved snapshot. Color-coded by rating
   (strong/marginal/caution), shows the score, headline, plain-language reason chips, and an
   **"Ask Will to explain this verdict"** CTA.
2. **AskWill hybrid hook** — `shared-ui/AskWill.tsx` now listens for a global
   `window` `askwill:ask` CustomEvent `{ detail: { question } }`, opens the chat, and auto-sends the
   question. Refactored `handleSend` → `sendMessage(text)` with refs so event-driven sends read
   current state. The verdict card dispatches this event.
3. **Plain-language metric verdict** — a sentence under the Monthly Cash Flow KPI in `AnalysisResults`
   ("the rent covers every expense with … left over" / "you'd fund a … shortfall") plus the break-even
   rent. ROI metrics already carry Strong/Fair/Weak signals via `ROIScorecard`.
4. **Data-source & confidence transparency** — every rent figure carries its source
   (RentCast / AirDNA / algorithmic) and a confidence pill on the per-strategy cards in
   `components/StrategyComparison.tsx`. When any active strategy is low-confidence, an amber
   caveat footnote renders **inside the Strategy Comparison section** (no longer a separate
   top-of-page banner — see Phase 2 notes).
5. **Market-section disambiguation** — added `market-section__subtitle` lines clarifying that
   `HousingMarketTrends` = "what homes are worth to buy" and `RentalMarketTrends` = "what landlords
   charge to rent".
6. **Sticky jump-nav** — `analyzer-app__header` is now `position: sticky` with a full-width inner
   wrapper and a `--scrolled` elevation. `SectionNav` gained IntersectionObserver **scroll-spy** that
   highlights the active section; `.results__section` got `scroll-margin-top` so the header never
   covers anchored targets.
7. **"What changed" indicator** — inline banner in `AnalysisResults` (shown when `isAdjusted`) diffs the
   current assumptions against the saved baseline (label: from → to chips), shows the **cash-flow delta
   vs. original**, and offers a Reset-all button.

**Key files added:** `DealVerdictCard.tsx`, `DataConfidenceBanner.tsx`.
**Verified:** `build:packages` + property-analyzer `tsc && vite build` both green.

> Note: `DataConfidenceBanner.tsx` was later **removed** in Phase 2 — its indicators were folded
> into the Strategy Comparison cards/footnote (see Phase 2 notes).

---

## Phase 2 — implementation notes (in progress)

Accuracy work landed so far (single-property results view):

1. **AirDNA STR integration fixed.** `airDnaService.ts` was calling a 404 endpoint and parsing the
   wrong response shape, so every STR estimate came back `low` confidence. Switched to
   `GET /rentalizer?address=…&bedrooms=&bathrooms=` (host `airdna1.p.rapidapi.com`) and parse
   `property_statistics` (`adr.ltm`, `occupancy.ltm`, `revenue.ltm`, `confidence_score.level`).
   STR confidence now reflects AirDNA's own confidence.
2. **STR monthly seasonality curve.** AirDNA only returns month-level data inside
   `cleaning_fee.cleaning_fee_years`; `parseSeasonality()` derives a 12-month revenue/occupancy
   curve from it (booking-volume proxy). Rendered as a `recharts` bar chart in the STR **Strategy
   Deep Dive** (best month green, slowest amber).
3. **`/re-analyze` self-heals STR.** The route now re-fetches AirDNA (24h in-service cache, no extra
   cost) so previously-saved analyses pick up the parser fix instead of reusing a stale estimate.
4. **Verdict reflects the BEST strategy, not always LTR.** `computeDealVerdict()` now accepts the
   `strategyComparison` and scores against the highest-net-cash-flow strategy (LTR/MTR/STR): CoC and
   cap rate are derived from that strategy's net cash flow, confidence from that strategy, with a
   `best_strategy` reason + "as a short-term rental" headline suffix. Wired into **both** the live
   client verdict (`AnalysisResults.tsx`) and the stored server verdict (`investmentAnalysisService.ts`
   `finalizeAnalysis`). Example: 50550 Lagae St flipped from "Proceed with caution" to
   "Strong deal as a short-term rental."
   - *Future enhancement (noted in code):* make the Cash Flow section itself strategy-aware so its
     figures switch to MTR/STR values when one of those is the best strategy, instead of always LTR.
5. **Confidence/transparency UI relocation.** Removed the top-of-page `DataConfidenceBanner`; the
   per-strategy confidence + source badges already live on the Strategy Comparison cards, and a
   low-confidence amber caveat footnote now renders inside that section when any active strategy is
   low-confidence.
6. **Layout polish.** Recommendation card moved to sit directly below the address/price card with
   consistent `2rem` section spacing.
7. **Location/property-aware tax & insurance defaults.** Replaced the flat `$2,500` property-tax /
   `$1,500` insurance assumptions with `expenseDefaultsService.ts`: property tax = price × the
   state's effective tax rate (50-state + DC table; e.g. NJ 2.47%, MI 1.48%, AL 0.41%), insurance =
   price × 0.5% × a state catastrophe-risk factor (e.g. FL 2.6×, TX 1.7×), floored at $600. A real
   tax record (`taxHistory`) or a user-supplied value still wins. Sources are tracked in
   `dataSources.tax` (`actual` | `estimate`) and `dataSources.insurance` (`actual` | `estimate`)
   and surfaced as **Actual/Estimated** badges on the Property Tax & Insurance rows. `/re-analyze`
   self-heals older saved analyses away from the legacy flat defaults (respects previously real or
   custom values via the stored source).
   - *Badge bug fixed:* the initial analyze previously sent the full `DEFAULT_ANALYSIS_PARAMS`
     (including `annualPropertyTax`/`annualInsurance`), so the server's "derive only when absent"
     check never fired and both were stamped `actual` (no badge). `PropertyAnalyzer.handleAnalyze`
     now omits tax/insurance from the `/run` payload so the server derives them and stamps the
     correct source. When the user overrides either value via the expense sliders the badge switches
     to **Custom**, so the annotation always matches the displayed figure.
8. **Re-analyze action.** A muted ghost **Re-analyze** button in the results toolbar re-fetches live
   data and recomputes with the current assumptions via `api.reAnalyze(slug, …)`, omitting any
   tax/insurance the user hasn't overridden so they re-derive. Results refresh in place through a new
   `onUpdate` callback on `AnalysisResults`; the button is hidden in the read-only shared view.
9. **Property-aware reserves & cost-seg defaults.** Extended `expenseDefaultsService.ts` with
   `estimateMaintenancePct(yearBuilt)` (repairs/capex scale with the home's age — e.g. ≤10 yrs 6%/6%,
   26–50 yrs 10%/11%, 50+ yrs 12%/13%) and `estimateCostSegPct(propertyType)` (multifamily 28%,
   condo/townhome 20%, manufactured 15%, single-family 22.5%). `/run` and `/re-analyze` derive these
   when the caller doesn't override them; `PropertyAnalyzer.handleAnalyze` now also strips
   `repairsPct`/`capexPct`/`costSegPct` (alongside tax/insurance) so the server computes them, and
   the re-analyze handler omits any the user hasn't changed so older analyses self-heal. Vacancy,
   Repairs and CapEx rows now carry **Estimated/Custom** badges, and the tax-savings panel shows an
   assumption footnote ("Assumes X% cost segregation … at a Y% marginal rate"). Marginal tax rate
   stays a transparent user assumption (personal, not property-derivable); vacancy stays a
   conservative default (no reliable per-market vacancy source) but is now clearly badged.

**Files touched:** `airDnaService.ts`, `propertyAnalyzer.ts`, `investmentAnalysisService.ts`,
`rentalEstimationService.ts`, `expenseDefaultsService.ts` *(new)*, `shared-types/src/index.ts`,
`AnalysisResults.tsx`, `PropertyAnalyzer.tsx`, `StrategyComparison.tsx`, `analyzer.css`. **Removed:** `DataConfidenceBanner.tsx`.
**Still open in Phase 2:** MTR real data source, prominent
break-even surfacing.

---

## Phase 3 — implementation notes (in progress)

1. **Sensitivity / "Stress Test" view.** New `SensitivityCard.tsx` mounted as a full-width section
   between the Cash Flow grid and Wealth Projection. For each of the three biggest drivers — **rent,
   purchase price, interest rate** — it solves the break-even value (where monthly cash flow crosses
   $0) by bisection over the *same* client calculators used for the live recompute
   (`calculateMortgage` + `calculateCashFlow`), so it always agrees with the Cash Flow section and
   updates live as assumptions are edited. Each driver renders a two-zone (safe/​risk) track with a
   marker at today's value and a line at break-even, plus a plain-language cushion sentence
   (e.g. "$250/mo cushion — rent could drop to $2,150 before you're underwater"). No API or schema
   changes; fully client-side. Edge cases (cash-flow positive or negative across the whole tested
   range) fall back to a full-color track + explanatory caption.
   - *Still open in Phase 3:* goal-based framing (cash flow / appreciation / tax) that reorders
     sections + reweights `computeDealVerdict()`; saved/named scenarios with side-by-side compare.

**Files touched:** `SensitivityCard.tsx` *(new)*, `AnalysisResults.tsx`, `analyzer.css`.
