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
1. **API coverage audit** — fetch/surface every available RentCast/AirDNA/Zillow field; wire or
   retire the dead Zillow comps path; pull RentCast records/sale comps to raise confidence.
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
- [ ] Phase 1 — Clarity & trust
- [ ] Phase 2 — Accuracy & data coverage
- [ ] Phase 3 — Deeper analysis
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
