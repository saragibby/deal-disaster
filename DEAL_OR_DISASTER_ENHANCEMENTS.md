# Deal or Disaster — Enhancement Backlog

This document captures **future enhancements** for the Deal or Disaster game that were
identified during the financial-consistency audit but intentionally deferred. The Part 1
bugs (financial consistency, labeling, rapid-click race, AI validation) have already been
fixed. The items below are larger product/gameplay changes to work through later.

> Single source of truth for financials is now
> [`apps/deal-or-disaster/src/utils/dealFinancials.ts`](apps/deal-or-disaster/src/utils/dealFinancials.ts)
> (mirrored server-side in
> [`server/src/services/foreclosureGenerator.ts`](server/src/services/foreclosureGenerator.ts)).
> Any enhancement that touches money must render from `computeDeal()` so the banner,
> calculator, and footer can never disagree again.

---

## J. INVESTIGATE needs a real downside ✅ DONE

**Today:** Choosing INVESTIGATE always grants a flat **+10** with no real cost, so it's a
risk-free "safe" answer that short-circuits the BUY/WALK-AWAY decision the game is meant to
teach.

**Proposed:**
- Treat INVESTIGATE as consuming time/turns (it already costs simulated time — make that
  matter against the case timer or a limited number of investigation actions).
- Award partial credit only when investigation actually surfaces a decision-changing issue;
  otherwise apply a small opportunity penalty.
- After investigating, still force a final BUY/WALK-AWAY commitment and score that decision.

**Shipped:** INVESTIGATE is now limited, costly due diligence — each inspection consumes time
and points against a capped due-diligence budget, and the player must still commit to a binary
BUY/WALK-AWAY decision that is scored.

---

## K. Unify the quiz mechanic across both modes ✅ DONE

**Today:** Regular cases and the Daily Challenge use slightly different discovery/quiz flows.

**Proposed:** One consistent mechanic in both modes:
- A quiz on **every** discoverable document/red flag in both regular and daily play.
- Same scoring rules, same "issues found X of Y" feedback, same reveal animations.
- Share the components between modes instead of mode-specific branches.

**Shipped:** Both modes already render the same `CaseDisplay` quiz engine; the gap was that
static regular cases carried no quiz data while AI daily cases did. A new
[`utils/quizGenerator.ts`](apps/deal-or-disaster/src/utils/quizGenerator.ts) `deriveQuiz()`
generates a quiz from each flag's cost range / severity when none is authored (authored quizzes
always win), applied via `withDerivedQuizzes()` at every case-load point. Scoring is now fully
mode-agnostic: a per-case `caseInvestigationPointsRef` replaced the daily-only
`challengeStartPoints`, so the post-decision "investigation vs decision" breakdown is identical
in both modes. All 63 static flags now present a quiz with consistent +50/+75/−25 scoring.

**Follow-up polish (shipped):** The case-display layout was tightened alongside K — the
Property Description now uses a 4-column grid (description spans 3 columns; a property-info
table holding occupancy, beds, baths, sq ft, year built, and type fills the 4th), the duplicate
specs line under the address was removed, the "Sold as-is" disclaimer renders as a top-aligned
row, and the quiz dialog lost its title emoji with a slightly larger option font.

---

## Part 2 — Gameplay & Content Enhancements

### 1. Three archetypes per difficulty ✅ DONE
For each difficulty, deliberately author/generate three case shapes:
- **Clear buy** — obviously profitable once issues are checked.
- **Clear trap** — surviving liens / severe issues sink an attractive-looking spread.
- **Misdirection** — looks like a trap but is actually fine (or vice versa) to reward real
  analysis over pattern-matching the headline numbers.

**Shipped:** `CaseArchetype` type + classifier in `apps/deal-or-disaster/src/utils/archetypes.ts`
(`deriveArchetype`/`deriveDifficulty` via an `alarmScore` that measures scary-but-survivable
noise — wiped junior liens, red herrings, scary-but-cheap issues, occupancy). All 18 static
cases now carry explicit `difficulty` + `archetype` tags (every difficulty×archetype combo
covered). `getRandomCase()` round-robins the three archetypes for a balanced mix. Server
generator (`foreclosureGenerator.ts`) takes an `archetype` target → `getArchetypeGuidance()`
biases the prompt, and the validation gate re-derives the honest archetype from the final
economics so the label can never contradict the math. Scheduler picks a random archetype per
day. (Mirror `alarmScore` kept in sync client/server.)

### 2. Live, discovery-gated running P&L ❌ TRIED & REMOVED
Show a running profit/loss panel during play that only includes costs the player has
**actually discovered** (use `computeDeal(caseData, { discoveredOnly: true })`). The full
true economics are revealed in the post-decision breakdown. This teaches that hidden costs
change the math.

**Outcome:** Built as a sticky `Running P&L` side rail, then reworked into an interactive
"scratch pad" (player adds figures via `+ Scratch pad` pills), then **removed entirely** by a
design decision. The live rail did the player's reasoning for them, and a partial,
discovery-gated estimate that swings (e.g. +$21k → −$21k once a hidden lien is uncovered) read
as more confusing than instructive. The case is now a clean single column with **no live money
tally** — players reason it out and see the full math only in the post-decision Financial
Analysis. The `computeDeal(..., { discoveredOnly: true })` option still exists in
`dealFinancials.ts` but is no longer used by any UI.

### 3. Scoring tied to the model, not an answer key ✅ DONE
Re-derive scoring from `computeDeal()` ROI/classification rather than the stored
`isGoodDeal` flag, so the points always match the actual economics of the specific case.
(The validation gate already keeps stored vs. computed consistent, so this is a clean
follow-up.)

**Shipped:** `dealIsBuyWorthy(deal)` in `dealFinancials.ts` is now the single source of truth
for decision scoring — a case is buy-worthy exactly when the model classifies it `GOOD`
(ROI ≥ `GOOD_ROI_THRESHOLD`), mirroring the "trueGood" test already used by `archetypes.ts`.
`App.tsx` `handleDecision` and the `ResultModal` "Why This Scoring" footer both branch on this
verdict instead of the authored `isGoodDeal` flag. Verified all 18 static cases score identically
(0 mismatches, no marginal edge cases), so the change is consistent today and self-correcting if a
future case's authored flag ever drifts from its real economics. The deprecated, unused
`ScoringGuideDisplay` was left untouched.

### 4. "Issues found X of Y" indicator
Persistent indicator of how many red flags / documents the player has uncovered, to signal
when more investigation is worthwhile.

### 5. Expert post-game breakdown for regular cases
The Daily Challenge has a richer post-game explanation than regular cases. Bring an
expert-style breakdown (why it was a deal/disaster, which liens survived, cost math) to
regular cases too.

### 6. Expanded lien / issue library ✅ DONE
Add more real-world mechanics:
- Redemption period risk (former owner can reclaim).
- Senior vs. junior lien wipeout nuances.
- Occupancy / eviction risk (occupied properties, hostile tenants, squatters).
- Special assessments, environmental liens, lis pendens.

**Shipped:** `LIEN_CATALOG` (15 archetypes) and `ISSUE_CATALOG` (17 archetypes) now live in
`@deal-platform/shared-types` as a single source of truth, covering super-priority HOA,
federal/state tax, mechanic's, judgment, child-support, code-enforcement, environmental, and
lis-pendens liens plus occupancy and redemption issues. Occupancy/eviction and redemption-period
costs flow into the scored P&L (`computeDeal()`) and the AI validation gate; the generator derives
its lien/issue guidance from the catalog and teaches senior-vs-junior survival. The UI surfaces
occupant type, eviction cost, a redemption badge, and per-lien survival + educational notes.
Curated cases 016–018 demonstrate the mechanics.

### 7. Tone & polish
- Make joke clues in the story actually map to discoverable documents/issues.
- Reconsider lowbrow naming (e.g. the case-008 "Baby Mama Boulevard" / child-support gags)
  for a more broadly comfortable tone.
- Keep humor human and story-led, but ensure every funny clue is mechanically meaningful.

### 8. AI validation pipeline (extend the new gate)
The generator now rejects/regenerates financially inconsistent scenarios and validates
property facts. Future extensions:
- Validate that each red flag's quiz `correctChoice` is consistent with its `costLow/costHigh`.
- Ensure the surviving-lien set implied by `correctDecision` matches the lien data.
- Add archetype targeting (item 1) so generation produces a balanced mix.
- Log rejected scenarios for prompt-quality monitoring.

### 9. Single market-value resale anchor ✅ DONE
Beginners should reason about **one** headline number, not two. The old model used a separate,
lower `actualValue` (ARV) as the resale price while *also* subtracting repairs/liens —
effectively double-counting damage and contradicting the on-screen value labels.

**Shipped:** `computeDeal()` now uses `propertyValue` (market value) as the single resale
anchor; `actualValue` is deprecated (kept only for back-compat, forced equal to `propertyValue`).
Every cost that sinks a deal is an explicit, inspectable line item (surviving liens, repairs,
issue costs, occupancy, redemption, closing) — never a hidden lower resale value. All 18 static
cases were rebalanced so traps lose money through *visible* items; `ResultModal` collapsed its
two value rows into one "Market Value (Resale)"; and the AI generator + validation gate force
`actualValue = estimatedValue` so generated cases follow the same one-number model.

### 10. Due-diligence budget + no-impact / money-saver investigation items ✅ DONE
Investigation should be a real resource decision, and not every finding should be bad news —
some red flags should be harmless noise and a few should actually *save* the buyer money, so
players learn to investigate thoughtfully rather than treating every document as a landmine.

**Shipped:**
- **Budget scales with the case, not a magic number.** `dueDiligenceBudget(itemCount, difficulty)`
  in `App.tsx` caps inspections at a fraction of the available investigation items —
  easy = all items, medium ≈ 75%, hard ≈ 50% (min 1, never more than the item count). This
  replaced the old fixed `{ easy: 4, medium: 3, hard: 2 }` budget. The `CaseDisplay` meter
  ("Due diligence: X of Y left") and `tryInvestigate()` both read from it.
- **Money-savers** are modeled as a **negative** `costLow`/`costHigh` on a normal
  (non-red-herring) flag, so `computeDeal()` nets them straight out of total investment with no
  special-casing. The server validation now permits negative costs (down to a −$200k floor) and
  forbids a `red-herring` from carrying a saving. `dealFinancials.ts` ↔ `foreclosureGenerator.ts`
  stay mirrored.
- **No-impact items** are `severity: 'red-herring'` flags with no cost; quizzes auto-derive via
  `quizGenerator.ts`, which gained a money-saver template ("it saves about $X — subtract it from
  your costs").
- **UI frames savings as good news**, not issues: `CaseDisplay` shows "💰 Good News:" /
  "💡 Estimated Savings:" for money-savers and `ResultModal` adds a "Credits & Savings" row when
  net issue costs are negative.
- **Generator prompt** now requires ≥1 no-impact red-herring and asks ~half of scenarios to
  include one transferable-warranty / assumable-credit style money-saver as a negative cost.
- **Static cases retrofitted:** no-impact items added to cases 001, 002, 005, 006, 008;
  money-savers added to GOOD cases 002, 005, 007. Verified **0 classification flips** across all
  18 cases (money-savers nudge GOOD ROIs up without rescuing any trap).

### 11. Property-dimension realism + sticky case header ✅ DONE
**Shipped (dimensions):** The generator prompt and validation gate now enforce coherent
beds/baths/sq ft/year-built combinations (and matching image prompts), with a coherence safety
net; the 18 static cases were audited for realistic dimensions (e.g. case-003 corrected to
3 bed / 2.5 bath / 1,950 sq ft).

**Shipped (sticky header):** A `game-sticky-bar` appears on scroll (past ~220px) showing the
property address, current points, and the live timer (turning urgent under 60s), so the key
context stays visible while reading a long case. Styled in `App.css` with a mobile breakpoint.

---

## Already fixed (Part 1 — for reference)

- **A** — Inconsistent value labels (Property Value vs ARV) across screens.
- **B** — "Potential Profit" mislabeled a pre-cost spread as profit.
- **C** — Banner loss math sign bug (e.g. "$-48,000").
- **D** — "Why This Scoring" footer showed wrong block / "+-46.8%" formatting.
- **E/F** — Total Investment ignored surviving liens and remediation costs.
- **G** — Blank "Impact" lines on case data.
- **H** — AI cases with invalid beds/baths/sqft/yearBuilt.
- **I** — Rapid document clicks dropped reveals / points (race condition).

All Part 1 financial figures now render from the single `computeDeal()` model, and the AI
generator enforces a financial-consistency gate before a scenario is accepted.
