# Property Analyzer Usage and Cost Reduction Plan

**Date:** October 16, 2026  
**Status:** Coordinate reuse committed; RentCast quick wins implemented and locally validated; shared-cache phases pending
**Baseline:** [Usage and cost analysis](PROPERTY_ANALYZER_USAGE_AND_COST_ANALYSIS.md), source revision `b6ba990`

## Implementation update - coordinate reuse

The first recommended slice is committed as `8cfef67` on `saragibby-analyzer-cost-reduction`:

- Preserve valid numeric `latitude`/`longitude` pairs when present on the property-details record or individual similar-property records. No undocumented alternative field names, string coercion, or extra provider requests are introduced. Actual production field availability still needs confirmation from a sanitized response; mocked fixtures validate preservation, not provider coverage.
- New analyses share one request-scoped geocoding session across the early subject and later comparable stages. Valid pairs are not overwritten; successes and failures are remembered for that analysis.
- Re-analysis fills each missing/invalid pair even when some comparables already have valid coordinates.
- Normalize and deduplicate missing addresses before cache reads/provider work; overlapping single/batch calls share in-process in-flight work. Apartment/unit text remains part of identity.
- Retain the existing persistent cache and Google -> Census -> Nominatim fallback order, validate coordinate ranges including valid zeros, and log non-fatal failures without upstream messages, addresses, or request URLs.
- Emit `[geocoding:usage]` per batch with input count, existing-coordinate reuse, persistent-cache/in-flight hits, provider attempts, and resolved/unresolved unique-key counts. These are local counters, not billing records or a complete all-provider/per-analysis telemetry system. Session-memoized rows are excluded from subsequent lookup batches.

**Verification:** `npm run build:server` passes. The isolated mocked-provider suite,
`npx playwright test --config=playwright.providers.config.ts`, includes 17 geocoding tests:
21 valid locations -> zero provider/cache calls; exactly three unique missing locations ->
three primary requests; overlapping requests -> one lookup/fill; unit separation;
partial re-analysis; early subject success/failure reuse; cache read/write failures;
invalid cache/payload handling; fallback order; numeric zero coordinates; canonical
property normalization; missing-street identity isolation; and sanitized diagnostics. It starts no development servers,
uses no database, and sends no live provider requests.

**Not included:** RentCast changes, Places migration/caching, cross-process single-flight,
additional provider coordinate adapters, provenance/retention migrations, or the
production policy audit. Existing persistent geocoding retention is unchanged, not
certified compliant by this implementation. The broader Phase 0 and Phase 1A items
below remain open where they exceed this slice.

## Implementation update - RentCast quick wins

The next slice is implemented locally, separately from the coordinate-reuse commit:

- New analyses skip the RentCast rent AVM request whenever plausible rental comps exist. A single usable comp qualifies, matching the existing blending policy. With none, the existing AVM blend, Zillow market anchor, and algorithmic fallback remain.
- Apply the existing plausibility filter before deciding whether to fall back from RentCast listings to Realtor listings. Previously, nonempty but entirely implausible RentCast results suppressed that fallback.
- Read `/markets` statistics from `rentalData`, not top-level or `saleData` fields. Read month-keyed history, request 13 months, and compare matching statistics exactly twelve months apart. Missing years/gaps do not become zero growth or a stable trend.
- Preserve absent metrics as optional fields across the shared type and both market displays. An available average is labeled as an average, never relabeled a median. Missing trend is displayed as unavailable.
- Version market projections as `rentcast:market:v2`. Listings/AVM cache keys also use a new version and include the actual effective query, preventing reuse across changed limits, coordinates, or property filters.
- Preserve studio bedrooms (`0`), omit unavailable bathroom/square-footage/type defaults, and omit whole-building bedroom/bathroom/size filters for multi-family rentals. This intentionally corrects query semantics; it may change returned comps and subsequent estimates.

**Expected cost effect:** in the baseline successful-comps case, RentCast drops from
three calls (listings + unused AVM + markets) to two (listings + markets), a 33%
request reduction. Savings are one RentCast request at the account's applicable
rate, not an assumed dollar amount. No-comp cases retain the AVM request and may
also require Realtor fallback. The market mapping itself improves data correctness,
not request count; corrected nonzero medians can change comparable calibration.

**Verification:** after `npm run build:packages`, run
`npx playwright test --config=playwright.providers.config.ts`. The suite now contains
43 tests: 17 geocoding, 15 RentCast usage/mapping/rendering tests, and 11 existing
property-record regressions. Tests use mocked providers with no database or live
provider traffic. All package, backend, and app builds pass, including analyzer
boundary checks. The market-display rendering test uses the built core component;
rebuild packages after UI edits before rerunning it.

**Still pending:** shared PostgreSQL ZIP caching and cross-process deduplication;
AVM-first bundle mode; expanded sale/bedroom/property-type projections; production
usage measurement; and provider retention/display approval. Existing saved analysis
snapshots are not rewritten. Re-analysis retains its existing stored-comps/market
refresh policy; it does not acquire a new AVM call from this change.

## 1. Goals and boundaries

Reduce external requests, duplicate work, and provider cost without silently changing investment assumptions, reducing data completeness, or exposing private data.

Cover all providers used by the analyzer: Private-Zillow, Google Geocoding/Places, RentCast, AirDNA, Realty-in-US, Furnished Finder, Xome, and Census/Nominatim fallbacks. Include incidental map/photo traffic and separate chat/comparison workflows in measurement, but do not redesign platform-wide AI behavior without a separate review.

Deliver in independently reversible increments:

1. Establish accurate request accounting and provider-use constraints.
2. Reuse valid data and stop unused calls.
3. Add durable, correctly keyed shared caches and request deduplication.
4. Consolidate RentCast responses and expose useful existing data.
5. Make optional enrichment lazy where approved and verify production savings.

This document proposes defaults for implementation review. Flags remain off for behavioral changes until acceptance criteria and rollout gates are met.

## 2. Baseline and measurable targets

The all-enabled, successful cold scenario with 20 sale comparables makes **37-38 full-page provider calls**, including:

- 21 Google geocodes.
- 5 Google Legacy Nearby Search calls.
- 3 RentCast requests.
- 4-5 Zillow requests.
- 1 AirDNA request.
- 1 Furnished Finder request.
- 2 Xome requests.

Distinguish three outcomes:

| Scenario | Target |
| --- | --- |
| Valid reusable coordinates already available | Zero geocoding-provider calls for those addresses, regardless of whether the provider cache is cold |
| Repeated exact inputs or fresh shared area data | Zero new upstream requests for reusable datasets, including across server processes |
| Truly cold required data | One request per required dataset, plus only justified fallbacks; caching cannot eliminate the initial fill |

Conditional combined illustration:

- Reusing all 21 coordinates and removing one redundant RentCast call reduces **37-38 to 15-16** on an otherwise cold run.
- Reusing an already fresh, permitted Places area dataset removes another five calls: **10-11**.
- These are scenario targets, not guaranteed production averages. In particular, Zillow subject-coordinate availability must be verified, and first-time Places fills still require searches.

First-paid-tier Google savings can reach **$0.105** from 21 avoided geocodes and **$0.160** from five avoided Places searches. Actual invoice savings depend on free allowances, tiers, approved retention, and hit rates. Never add overlapping savings twice.

## 3. Decisions and constraints before changing defaults

### Google storage and map compatibility

Do **not** assume that hospitals remaining in place permits arbitrary caching of Google Places content.

- Google's published policies restrict storage; place IDs have an explicit indefinite-storage exception.
- The reviewed service terms provide a temporary latitude/longitude caching allowance for Geocoding of up to 30 consecutive days. A separate indefinite end-user exception has restrictive conditions and is not a general shared-cache allowance.
- The reviewed Geocoding terms prohibit use with a non-Google map; the platform currently uses Leaflet/OSM.
- The Places policy page reviewed describes Places API (New), while this code uses Legacy Nearby Search. Confirm the applicable Legacy, regional, and account agreement rather than assuming the new API policy grants rights to Legacy content.

**Gate:** verify applicable rights for raw results, coordinates, derived demand scores, cross-user reuse, attribution, saved snapshots, and map display before expanding retention. If current storage/display needs remediation, address it before deploying broader reuse.

The proposed **30-90-day area cache** is conditional on explicit provider rights or an independently licensed/public institutional dataset. Do not treat a derived score as an automatic workaround for storage restrictions.

Use a provisional 30-day fresh window for slowly changing institution data only where permitted; extend to 90 days only after rights and data-quality review. Corporate offices, closures, and category changes deserve shorter freshness or separate policies.

### RentCast strategy

Use mutually exclusive modes:

1. **Compatibility mode:** listings first; skip AVM when usable comps already satisfy the existing estimate path.
2. **Bundle mode:** AVM first; retain its estimate, subject facts, and comps; fetch listings only when the approved comp policy requires a supplement.

Do not implement both modes simultaneously or remove the AVM in bundle mode. Bundle mode changes comp selection and needs a feature flag. Keep active-only supplemental behavior until a product decision explicitly permits inactive recent comps.

### Other decisions

- Preserve current data panels by default; optional/lazy demand enrichment requires approved UI behavior, including pending/unavailable states.
- Confirm cache, storage, and cross-app display rights for each property provider.
- Confirm RentCast configuration and separate Realty-in-US entitlement without reading or logging credential values.
- Treat Furnished Finder's undocumented endpoint as best-effort, not a guaranteed entitled API.

### Include migration to Places API (New)

The platform already uses Places API **Legacy**. Include migration to **Places API (New)** as a measured, feature-flagged work item, not as an automatic cost saving.

- Enable Places API (New) in the Google Cloud project and authorize it on the server key, with appropriate restrictions, quotas, billing alerts, and separate SKU accounting.
- Replace Legacy GET Nearby Search with POST `https://places.googleapis.com/v1/places:searchNearby` and typed request/response mapping.
- Use an explicit minimal field mask for the demand UI: `places.id`, `places.displayName`, `places.location`, `places.types`, and required attribution fields. Do not use `*` or fetch details separately when the search response supplies the necessary data.
- These fields trigger Nearby Search Pro, whose verified first paid tier is **$32 per 1,000**, the same as Legacy Nearby Search's baseline rate. Smaller payloads alone do not make an otherwise identical request cheaper.
- New supports multiple type filters in one request. Evaluate a combined hospital/university query, and available `corporate_office`/`government_office` types, against the current keyword searches. Similar type names do not establish equivalent institution coverage.
- Nearby Search (New) has no `keyword` parameter. Preserve military-base and any other unmatched keyword semantics through explicitly scoped Text Search (New) or an approved alternative dataset; do not silently drop those categories.
- A combined search returns a shared, capped result set (up to 20), not a full quota per category. Dense hospital results may crowd out universities or other categories. Supplement only when necessary, track truncation, and compare category recall and demand-score outcomes.
- Version cache keys by API generation, query strategy, field mask, and response projection; do not interpret Legacy payloads as New responses.
- Migrating API generation does not relax retention, attribution, cross-user, or map-display restrictions.

**Acceptance:** preserve all five demand categories or explicitly approve their replacement; establish no unacceptable category/score regression in representative rural, suburban, urban, and military-area fixtures; demonstrate lower total billable cost including supplemental Text Search and any details requests.

**Cost scenarios:** five equivalent Pro searches still cost $0.160 at the first paid tier; four cost $0.128 and three cost $0.096. These examples assume the same per-request rate for every call and exclude allowances. Price any mixed Nearby/Text Search strategy by its actual field-mask-triggered SKUs before claiming savings. One multi-type query is not guaranteed to replace all five searches.

## 4. Work packages and dependency order

### Phase 0 - Instrumentation, fixtures, and provider policy

**Dependencies:** none.

Tasks:

- Create a server-only provider request wrapper with dependency injection for test fetches; migrate analyzer calls incrementally.
- Record correlation ID, workflow, provider/endpoint identifier, HTTP attempts, cache outcome/layer, fallback reason, latency, and response class.
- Separate HTTP attempts from vendor billable units. RentCast documents billing only HTTP 200 responses with a body; do not generalize that rule to RapidAPI/Google.
- Track optional-widget loads, re-analysis, saved views, background refresh/prewarm, and explicit record refresh separately.
- Store aggregate request events without address/owner data, keys, query strings containing credentials, response bodies, or authorization headers.
- Maintain a versioned pricing model distinguishing fixed fee, quota/renewal period, marginal price, free SKU allowance, and uncertain charges.
- Build sanitized source-schema fixtures and an isolated fake-provider call ledger. Do not run paid shadow traffic.
- Record a provider-policy matrix: permissible fields, retention, cross-user scope, display attribution, and stale-data allowance.

Acceptance:

- One analysis can be reconciled to its route calls and post-render widgets.
- All cache misses and fallbacks are visible, including failed providers.
- Logs contain no secret values or personal property ownership data.
- A mocked baseline reproduces 37-38 calls under the documented scenario.

### Phase 1 - Correctness and immediate request elimination

**Dependencies:** Phase 0 fixtures/accounting. Rights review gates provider-specific retention, not ordinary request avoidance.

#### A. Coordinate reuse

Files: [propertyDataService](server/src/services/propertyDataService.ts), [geocodingService](server/src/services/geocodingService.ts), [analysis route](server/src/routes/propertyAnalyzer.ts), [shared types](packages/shared-types/src/index.ts).

- Preserve valid subject coordinates from verified Zillow response fields; do not speculate about undocumented field names.
- Validate finite latitude/longitude ranges, preserving valid zero coordinates.
- Match coordinates to the correct address/unit and track source, observation date, and permitted reuse expiry.
- Include only unresolved subject/comparables in the geocoding batch.
- Deduplicate unresolved addresses before outbound work, not just before SQL lookup.
- Reuse RentCast subject/comparable coordinates when already available and identity matches. Do not add a paid lookup solely to obtain coordinates without demonstrating net benefit.
- Audit existing persistent Google-derived coordinates and saved snapshots against applicable retention/display rules. Do not extend provenance-free entries indefinitely.

Acceptance:

- A subject plus 20 valid coordinate-bearing comps makes zero geocoder calls.
- With exactly three unique unresolved addresses, make three primary geocoder requests, not 21.
- Duplicate addresses share one in-flight lookup; separate apartment units remain distinct.
- Failed early subject lookup does not trigger an uncontrolled second provider chain in the same analysis; use request-scoped outcome deduplication.

#### B. RentCast mapping and unused AVM gate

Files: [rentCastService](server/src/services/rentCastService.ts), [rentalEstimationService](server/src/services/rentalEstimationService.ts), [analysis route](server/src/routes/propertyAnalyzer.ts).

- Correct nested `rentalData`/`saleData` parsing and month-keyed history.
- Represent absent statistics as unavailable, not zero-dollar/stable success.
- Compare observations twelve months apart for YoY; request sufficient history and handle gaps.
- Version/invalidate malformed cached projections.
- In compatibility mode, call AVM only after plausible comp filtering establishes it is needed.
- Preserve studios, omit unknown provider attributes rather than inventing defaults, and distinguish unit versus building attributes for multi-family.

Acceptance:

- Usable comps mean zero AVM calls in compatibility mode.
- No usable comps retains the intended AVM/other-provider fallback behavior.
- Documented market fixtures map to nonzero expected values; missing sections remain unavailable.
- Financial behavior changes caused by corrected input data are explicitly tested and recorded.

### Phase 2 - Shared provider cache infrastructure

**Dependencies:** Phase 0 policy matrix and Phase 1 canonical identity rules.

Files: new server-only provider-cache service; [SQL migrations](server/src/db/migrations); reuse patterns from [areaMarketService](server/src/services/areaMarketService.ts).

Use PostgreSQL initially; do not introduce Redis without evidence that database caching is insufficient.

Design:

- Cache identity: provider, endpoint, normalized complete effective query, schema/normalization version, and required reuse scope.
- Cache row: safe typed payload, provider update time, fetched time, fresh expiry, maximum retention expiry, authoritative-empty state, and policy version.
- Separate provider observations from owner-scoped analysis snapshots and user assumptions.
- Add bounded memory hot cache, in-process single-flight, and a cross-process database refresh lease.
- Implement lease acquisition atomically; use ownership tokens, bounded lease time, bounded waiting, safe failure cleanup, and recheck after acquisition.
- Do not keep a database transaction open while awaiting an external provider.
- Cache only validated successful/authoritative-empty results. Do not turn auth, quota, timeouts, or malformed data into empty success.
- Permit labeled stale fallback only where policy and dataset allow it; never exceed maximum retention.
- Add expiry indexes, bounded pruning, payload limits, and refresh budgets. Delete expired restricted content rather than merely hiding it.
- If cache persistence fails after a provider response succeeds, report the cache failure but do not repeat the paid request in the same operation.
- Use explicit refresh reasons and provider rate limits; do not allow automatic re-render storms to bypass caches.

Acceptance:

- Concurrent identical misses across two server processes produce one fill.
- Changed effective inputs produce misses; equivalent normalized queries reuse correctly.
- Failed refresh leaves permitted prior data intact with accurate stale/error metadata.
- Expired restricted data is not served; cleanup is verified.
- Cache outage has an explicit, bounded, observable degraded path.

### Phase 3 - Provider-specific cache and enrichment integration

**Dependencies:** Phase 2, plus each provider's rights review.

| Provider/data | Implementation | Proposed freshness and key requirements |
| --- | --- | --- |
| Google Places demand drivers | Shared area observations only where permitted; recalculate distance/score for each subject | Conditional 30-day policy, up to 90 days only if approved; category/query/radius/language/policy version and canonical search center |
| Google Geocoding | Resolve only missing coordinates; source-aware persistence and fallback deduplication | Applicable provider retention; no blanket indefinite Google reuse |
| Census/Nominatim | Cache permissible normalized results, track provenance | Provider-specific policy; Nominatim global request coordination and attribution |
| Zillow property | Share address and ZPID aliases for the same verified property | Start with existing 24-hour freshness; complete identity and schema keys |
| Zillow similar properties | Persist query result and reuse coordinates | 24 hours; ZPID/query version |
| Zillow area market | Preserve existing shared weekly snapshots; fix duplicate-fetch error path | Existing 7-day policy; geography and response coverage |
| RentCast AVM/comps | Persist full safe bundle or compatibility-mode results | 24 hours; address/unit, type/beds/baths/sqft, radius/age/count/lookup settings |
| RentCast ZIP market | One shared sale+rental snapshot, reuse across analyses/apps | 1-7 days; ZIP/data type/history coverage/version |
| RentCast property records | Separate private owner fields and reusable permitted property facts | Proposed 7-30 days; explicit refresh, private access, saved-snapshot semantics |
| AirDNA property | Persist validated estimate/bundle; eliminate ZPID-only collisions | Start at 24 hours; canonical property/unit and requested beds/baths |
| AirDNA market fallback | Share provider raw market observations, then calculate subject-specific output | Start at 24 hours; ZIP and all request filters; do not reuse a subject-derived estimate blindly |
| Realty-in-US | Call only when configured/entitled and upstream rental/property paths fail | Start at 24 hours; complete query including ZIP, bedroom selection, limit/status |
| Furnished Finder | Share permitted furnished-listing observations and market calibration | Existing 24-hour starting policy; viewport/beds/query version, 6-to-15-mile fallback coverage |
| Xome nationwide listings | Durable shared list snapshot and single-flight refresh | Existing 4-hour policy; retain old valid snapshot only within an explicit stale limit |
| Xome market trends | Shared ZIP snapshots | Existing 7-day policy |

Places geographic correctness:

- Do not reuse an arbitrary ZIP centroid's ten-mile results as exact demand coverage for every address in a large ZIP.
- Choose a stable grid/search center and a radius that covers the cell plus the subject search radius, where API limits and terms permit.
- Recalculate distances from the actual property, not the cell center.
- Track result truncation: expanded geographic coverage does not prove complete coverage when the provider caps results.
- Keep categories separate so slowly changing bases/hospitals do not force a 90-day freshness policy on offices.
- Do not cache one subject's computed boost as a universally correct ZIP score.

Other work:

- Implement the Places API (New) migration described above behind its own flag. Compare mocked/approved representative results without issuing duplicate paid shadow requests by default. Keep a permitted Legacy rollback path only while supported and enabled.
- Reuse address/ZPID aliases without conflating unmatched properties.
- Fix AirDNA cache identity for empty ZPIDs and changed attributes.
- Prevent Furnished Finder failures from being cached as genuine empty markets for 24 hours; distinguish valid thin-market results from outages.
- Disable unentitled Realty-in-US attempts explicitly, with operational configuration visibility.
- Avoid retry amplification: set timeouts, concurrency limits, bounded retries, and shared provider cooldowns. Do not retry rejected billing/auth requests automatically.

### Phase 4 - RentCast bundle consolidation and useful-data projections

**Dependencies:** Phase 1 mapping; Phase 2 cache; controlled feature flag.

- Add a typed AVM bundle contract: rent/range, subject facts, comp identities/coordinates/status/recency/distance/correlation, provider timestamps.
- Bundle mode replaces the separate normal listings request, supplementing only when the approved comp policy is unmet.
- Keep compatibility mode as rollback; avoid paying for both modes in production comparisons.
- Preserve financial blending initially; separately gate adoption of AVM central estimates.
- Expose useful listing/market fields without forwarding raw responses.
- Add rental-comp recency/status/maps and segment-aware market benchmarks where supported by existing data.
- Reuse on-demand property-record tax/HOA facts only through explicit user-approved re-analysis, preserving overrides.
- Public output uses explicit field allowlists. Ownership/mailing/contact data stays private, including nested fields.
- Evaluate bounded broader listing pools only after traffic demonstrates reuse; record pagination/filter/geographic coverage.
- Do not replace Zillow ZHVI, recorded sales, or foreclosure data with RentCast asking-price aggregates.

Acceptance:

- Sufficient AVM bundle: one valuation call, zero listings calls.
- Insufficient active comps: one justified supplement, not an unconditional second call.
- Fresh ZIP snapshot: no market provider call.
- No available joint bedroom/type segment is fabricated from separate marginal aggregates.
- Public/shared output contains no newly introduced private fields.

### Phase 5 - Lazy enrichment, browser requests, and repeat workflows

**Dependencies:** Phase 3; explicit product approval for visible behavior changes.

- Offer on-demand institution detail/demand enrichment behind a flag rather than silently omitting demand from the analysis.
- If demand affects MTR estimates, display pending status and update/recompute consistently when enrichment arrives; persist an appropriate snapshot and notify the user. Do not compare enriched and unenriched results as equivalent.
- Consider visible/expanded-section loading for Xome panels; retain useful error and retry states.
- Replace eager Xome import-time prewarm with approved demand-driven or traffic-aware refresh. Do not add periodic refreshes for unused data.
- Prevent redundant saved-slug navigation reloads when the just-returned analysis is authoritative; preserve deep-link and back/forward behavior.
- Preserve on-demand ownership-record loading; avoid fetching it automatically to populate optional panels.
- Keep parameter sliders local and autosave-only; do not rerun external fetches for financing-only changes.
- Re-analysis refreshes only datasets required by changed inputs/freshness or explicit user refresh.
- Lazy-load photos and maps where appropriate, reuse local browser cache behavior, and respect OSM tile usage policies; do not bulk prefetch map tiles.
- Account for Ask Will/AI comparison separately. Avoid automatically adding LLM calls to exploit cached enrichment; shared-fact adapters may serve existing workflows without launching new inference.

## 5. Proposed change sets

| Change set | Scope | Depends on | Rollback |
| --- | --- | --- | --- |
| 1 | Provider accounting, fixtures, rights/configuration checklist | None | Disable added accounting sink; preserve core requests |
| 2 | Coordinate reuse/deduplication, market mapping, compatibility AVM gate | 1 | Per-feature flags; never revive incorrect zero-valued mappings as a success fallback |
| 3 | Provider cache migrations/service/leases/policy expiry | 1-2 | Disable reads/writes by provider; leave additive schema intact |
| 4 | Zillow/RentCast/AirDNA/Xome durable cache adapters | 3 | Switch individual adapters back; preserve rate/budget protections |
| 5 | Places API (New) migration, permitted area strategy, fallback-provider cache integration | 3 + rights approval | Revert API-generation flag where supported; disable area reuse/lazy mode |
| 6 | RentCast bundle mode and typed enriched projections | 2-4 | Return to compatibility mode |
| 7 | Approved lazy panels, repeat-workflow and browser-request reductions | 4-6 + UX approval | Restore prior eager UI via flags |
| 8 | Budget dashboards, production reconciliation, updated unit costs | All enabled increments | Observability stays; revert individual feature flags as needed |

No destructive migration or production cache purge is required for ordinary rollout. Use versioned keys; invalidate/delete only identified malformed or policy-expired content.

## 6. Validation strategy

Use the existing Playwright runner and fixture/mocked-fetch style demonstrated in [RentCast property-record tests](e2e/rentcast-property-records.spec.ts). No new test framework is necessary.

Add focused provider orchestration/cache tests with mocked fetch and isolated database fixtures, plus browser checks in [analyzer tests](e2e/property-analyzer.spec.ts). Keep cross-process lease checks isolated from shared development/production resources.

Required cases:

- Exact cold/warm request counts, partial coordinate coverage, studio/zero coordinates, duplicate addresses, distinct units, missing ZPID.
- Nested RentCast response mapping, history gaps, malformed responses, inactive comps, per-unit multi-family semantics.
- Cache identity changes for property attributes, filters, radius, history range, schema version, and scope.
- Two-process concurrency, lease expiry/owner loss, cache write failures, timeouts, provider quota/auth rejection, and authoritative empty responses.
- Expiration, maximum retention deletion, stale labeling, explicit refresh, absence of unauthorized cross-user data.
- No changes to user financing overrides, saved analysis ownership, public sharing, or comparison consistency.
- Existing field attribution/map policy behavior and newly required provenance.
- Back/forward navigation, slug loading, collapsed/visible panels, and enrichment completion.

Build shared packages before consumers; use root build scripts in dependency order. Run `npm run check:property-analyzer-guardrails` before any core-boundary changes. Run targeted Playwright selectors first, then the broader analyzer suite if shared contracts or orchestration change. Do not use live billable APIs in automated validation.

## 7. Rollout and success criteria

1. Establish a short representative baseline of provider attempts, billable calls, cache hits, failures, and latency without adding data-provider traffic.
2. Deploy additive migrations with provider cache features disabled.
3. Enable one change set/provider at a time in controlled traffic.
4. Compare matched cohorts by new/saved/re-analysis workflow, unique property, unique area, and provider availability. Do not compare different enabled-service mixes as savings.
5. Verify data completeness and financial-output differences alongside request reduction.
6. Stop rollout on missing data, incorrect comps, stale/retention violations, private-data leakage, or refresh amplification. Roll back the relevant flag, not the whole cache schema.
7. Reconcile actual billing by provider/SKU and renewal period; update the analysis document with observed results.

Release gates:

- Fixture call-count targets pass; no unauthorized live calls are needed to prove them.
- All provider calls pass through accounting or are explicitly documented exclusions.
- All reused data has validated identity, source, age, and permitted scope.
- Financial changes are intentional and tested; saved user assumptions remain intact.
- Enabled changes demonstrably reduce requests in their eligible cohorts, without unacceptable data/latency regressions.
- No claim of "all services optimized" until every provider row has implemented or explicitly deferred status with a reason.

## 8. Cost model after implementation

For reporting, count:

```text
New provider requests =
  unique permitted dataset misses
  + approved conditional supplements
  + bounded fallback/retry attempts
```

For RentCast bundle mode, let `V` be unique valuation misses, `M` market misses, `S` active-listing supplements, and `O` on-demand record misses:

```text
Successful RentCast calls = V + M + S + O
```

For Google:

```text
Geocoding calls = unique unresolved eligible address misses
Places calls   = category searches for new/expired permitted area observations
```

Report three numbers separately: marginal cost at current quota position, allocated monthly cost per completed analysis, and all-cold scenario cost. Include background refresh, failures where billable, infrastructure, and fixed fees in realized unit economics.

## 9. Reference policies and evidence

- [Detailed provider inventory and RentCast review](PROPERTY_ANALYZER_USAGE_AND_COST_ANALYSIS.md)
- [Google Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), noting the page's API New scope.
- [Nearby Search migration guide](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-nearby): POST, field masks, multiple types, and keyword-to-Text-Search differences.
- [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search) and [place types](https://developers.google.com/maps/documentation/places/web-service/place-types): field/SKU selection, result limits, and supported category filters.
- [Google Maps service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), subject to the applicable account/region agreement.
- [RentCast rent estimate and comps](https://developers.rentcast.io/reference/rent-estimate-long-term)
- [RentCast market statistics](https://developers.rentcast.io/reference/market-statistics)
- [RentCast successful-request billing](https://developers.rentcast.io/reference/billing-and-pricing)

Policy review is a release dependency, not a claim that this plan substitutes for contractual/legal interpretation.
