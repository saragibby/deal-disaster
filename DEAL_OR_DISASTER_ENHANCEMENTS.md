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

## J. INVESTIGATE needs a real downside

**Today:** Choosing INVESTIGATE always grants a flat **+10** with no real cost, so it's a
risk-free "safe" answer that short-circuits the BUY/WALK-AWAY decision the game is meant to
teach.

**Proposed:**
- Treat INVESTIGATE as consuming time/turns (it already costs simulated time — make that
  matter against the case timer or a limited number of investigation actions).
- Award partial credit only when investigation actually surfaces a decision-changing issue;
  otherwise apply a small opportunity penalty.
- After investigating, still force a final BUY/WALK-AWAY commitment and score that decision.

---

## K. Unify the quiz mechanic across both modes

**Today:** Regular cases and the Daily Challenge use slightly different discovery/quiz flows.

**Proposed:** One consistent mechanic in both modes:
- A quiz on **every** discoverable document/red flag in both regular and daily play.
- Same scoring rules, same "issues found X of Y" feedback, same reveal animations.
- Share the components between modes instead of mode-specific branches.

---

## Part 2 — Gameplay & Content Enhancements

### 1. Three archetypes per difficulty
For each difficulty, deliberately author/generate three case shapes:
- **Clear buy** — obviously profitable once issues are checked.
- **Clear trap** — surviving liens / severe issues sink an attractive-looking spread.
- **Misdirection** — looks like a trap but is actually fine (or vice versa) to reward real
  analysis over pattern-matching the headline numbers.

### 2. Live, discovery-gated running P&L
Show a running profit/loss panel during play that only includes costs the player has
**actually discovered** (use `computeDeal(caseData, { discoveredOnly: true })`). The full
true economics are revealed in the post-decision breakdown. This teaches that hidden costs
change the math.

### 3. Scoring tied to the model, not an answer key
Re-derive scoring from `computeDeal()` ROI/classification rather than the stored
`isGoodDeal` flag, so the points always match the actual economics of the specific case.
(The validation gate already keeps stored vs. computed consistent, so this is a clean
follow-up.)

### 4. "Issues found X of Y" indicator
Persistent indicator of how many red flags / documents the player has uncovered, to signal
when more investigation is worthwhile.

### 5. Expert post-game breakdown for regular cases
The Daily Challenge has a richer post-game explanation than regular cases. Bring an
expert-style breakdown (why it was a deal/disaster, which liens survived, cost math) to
regular cases too.

### 6. Expanded lien / issue library
Add more real-world mechanics:
- Redemption period risk (former owner can reclaim).
- Senior vs. junior lien wipeout nuances.
- Occupancy / eviction risk (occupied properties, hostile tenants, squatters).
- Special assessments, environmental liens, lis pendens.

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
