# Property Analyzer Usage and Cost Reduction Plan

**Date:** October 16, 2026  
**Status:** RentCast shared-property caching and Census coordinate-only Google avoidance committed; targeted recovery for missing comparables/market data (bounded `/similar` retry, re-analysis backfill, dataset status with a provider-unavailable notice and Refresh button, per-dataset ZIP retry, RentCast display-only rental fallback) committed; RentCast bundle mode (flagged, default off) implemented locally. The user chose to preserve historical data and existing Google institution enrichment. Full retention remediation, Places compatibility, production Places migration, and broader area caching remain deferred.
**Baseline:** [Usage and cost analysis](PROPERTY_ANALYZER_USAGE_AND_COST_ANALYSIS.md), source revision `b6ba990`

## Implementation update - coordinate reuse

The first recommended slice is committed as `8cfef67` on `saragibby-analyzer-cost-reduction`:

- Preserve valid numeric `latitude`/`longitude` pairs when present on the property-details record or individual similar-property records. No undocumented alternative field names, string coercion, or extra provider requests are introduced. Actual production field availability still needs confirmation from a sanitized response; mocked fixtures validate preservation, not provider coverage.
- New analyses share one request-scoped geocoding session across the early subject and later comparable stages. Valid pairs are not overwritten; successes and failures are remembered for that analysis.
- Re-analysis fills each missing/invalid pair even when some comparables already have valid coordinates.
- Normalize and deduplicate missing addresses before cache reads/provider work; overlapping single/batch calls share in-process in-flight work. Apartment/unit text remains part of identity.
- At this commit, retain the existing persistent cache and Google -> Census -> Nominatim fallback order, validate coordinate ranges including valid zeros, and log non-fatal failures without upstream messages, addresses, or request URLs. The later Google update below supersedes that production provider order.
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
production policy audit. Persistent geocoding retention was unchanged in that
slice; see the later Google update for source-based cache exclusion. This does
not certify compliance. The broader Phase 0 and Phase 1A items
below remain open where they exceed this slice.

## Implementation update - RentCast quick wins

The next slice is committed as `b25291c`, separately from the coordinate-reuse commit:

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

**At completion of that slice, still pending:** shared PostgreSQL ZIP caching and
cross-process deduplication (now implemented below); AVM-first bundle mode; expanded sale/bedroom/property-type projections; production
usage measurement; and provider retention/display approval. Existing saved analysis
snapshots are not rewritten. Re-analysis retains its existing stored-comps/market
refresh policy; it does not acquire a new AVM call from this change.

## Implementation update - shared RentCast ZIP-market cache

Committed as `791f16c`, **disabled by default until schema deployment**:

- `getMarketStatistics()` now uses the dedicated [market cache](server/src/services/rentCastMarketCache.ts). With `RENTCAST_SHARED_MARKET_CACHE_ENABLED=true`, independent server processes and both platform wrappers share validated non-personal ZIP rental metrics in PostgreSQL. No owner data, user assumptions, API keys, raw provider payloads, or property records enter this table.
- Freshness remains seven days from fetch. A bounded 500-entry process hot cache lasts at most five minutes in shared mode and cannot outlive the persisted expiry. With sharing disabled, seven-day process-only caching remains, with in-process single-flight and a bounded memory cache.
- Identity includes provider/endpoint, ZIP, explicit `dataType=All`, thirteen-month history coverage, projection version, and a dated seven-day policy version. This increment retains the existing rental projection only; it does not persist or expose sale data simply because `All` was requested.
- Atomic PostgreSQL leases coordinate paid refreshes. A winner rechecks the cache after acquiring; followers wait at most eighteen seconds of polling instead of bypassing coordination. Sixty-second leases expire after a crashed worker; ownership tokens prevent an old worker from saving over or releasing a newer lease. No transaction stays open during HTTP requests.
- Provider timeout is fifteen seconds. The optional cache uses a separate lazy pool against the same database, capped at two connections per process, with two-second connection, statement, and client-operation deadlines. This avoids changing timeouts for unrelated application queries. A client timeout can race an operation's completion; ownership/expiry guards protect late work. Contention and release add their own bounded operations, so eighteen seconds is a polling budget, not a strict total HTTP-response deadline.
- Provider failures and missing/malformed data never become empty-success snapshots. Failed fills impose a thirty-second shared retry cooldown. On a cache/database failure, optional market stats are unavailable with a sanitized warning rather than triggering an uncoordinated paid request. A successful fetch survives a cache-write failure and is reused by that process's hot cache.
- Expired metrics are never served. On shared-cache activity, bounded cleanup runs at most once per hour per process, removing up to 100 expired/inactive rows while preserving live leases and cooldowns. Cleanup is opportunistic, not a deletion guarantee while the application is idle. No stale-data fallback or indefinite historical archive was introduced.

**Rights basis checked October 16, 2026:** RentCast's [API introduction](https://developers.rentcast.io/reference/introduction) explicitly includes internal storage and application distribution among permitted uses. Section 1 of the [API license](https://www.rentcast.io/terms-api) permits internal storage, analytics, and application display/distribution, subject to the remaining license and third-party restrictions. This supports the scoped internal aggregate cache; account-specific agreements and any required revocation/deletion remain operational responsibilities. This finding does not authorize broader Google retention.

### Deploy and enable

1. Deploy the schema before enabling the flag. Run the existing `npm run db:setup` in `server/`, or apply only [add_rentcast_market_cache.sql](server/src/db/migrations/add_rentcast_market_cache.sql) through the deployment's migration process. Both paths are idempotent.
2. Confirm the account's applicable license permits the intended internal cross-user reuse.
3. Set `RENTCAST_SHARED_MARKET_CACHE_ENABLED=true` on every participating server process, then restart/redeploy them. The flag template is in [server/.env.example](server/.env.example). No credentials or production settings were changed during implementation.
4. Verify repeated analyses of the same ZIP across processes perform one initial `/markets` fill and then reuse it for seven days. Monitor `[RentCast:market-cache]` warnings, `[provider:usage]` summaries described below, and account usage.
5. Roll back by setting the flag to `false` on all processes and restarting. The table can remain; rollback does not alter saved analyses or other provider behavior.

**Cost effect:** a genuinely cold ZIP still requires one `/markets` call. Once filled,
other analyses in that ZIP reuse it across users, processes, and restarts during the
freshness window. For N otherwise cold process-level lookups of the same ZIP within
seven days, the target is one market request instead of N, saving N-1 requests.
This is not one additional saved request on every analysis: the old process-memory
cache already eliminated repeats within the same running process.

### Verification

- `npm run build:server` passes.
- `npx playwright test --config=playwright.providers.config.ts`: 43 existing provider regressions pass with mocked HTTP and no database.
- `npx playwright test --config=playwright.cache.config.ts`: 13 cache tests pass, including two independent Node processes calling the actual RentCast service against an isolated PostgreSQL cluster and making exactly one mocked provider request.
- Cache tests cover restart reuse, atomic ownership/expiry, changed identities, SQL lock deadlines, memory limits/expiry, database/write outages, failed-fill cooldowns, malformed projections, and bounded cleanup.
- The cache suite requires `initdb` and `pg_ctl` on PATH. It creates a temporary Unix-socket-only PostgreSQL cluster, uses no configured application/production database, and stops/removes its own cluster afterward. It is intentionally excluded from the ordinary browser-E2E config; use the dedicated cache config explicitly.

**Remaining:** production enablement/measurement, full-page correlation and billing reconciliation, other
provider cache adapters, broader sale/rental bundle projections, and scheduled
retention/deletion workflows if future licenses require strict purge deadlines.

## Implementation update - expanded data-provider request accounting

Committed as `0a502e3`, this slice adds [providerUsageService](server/src/services/providerUsageService.ts)
and installs its middleware in both analyzer backend wrappers. Async-local contexts
keep overlapping requests isolated without modifying global fetch or provider
response bodies. It instruments the existing data HTTP calls to Zillow, AirDNA,
RentCast, Google Geocoding/Legacy Places, Realty-in-US, Furnished Finder, Xome,
Census, and Nominatim. Provider payload parsing, timeouts, fallback order, and
cache freshness are unchanged.

### Structured summaries and correlation

One `[provider:usage]` JSON summary is emitted when the HTTP response finishes or
closes, with `schemaVersion: 1`. The initial pricing model was
`2026-10-16-scenario-v1`; the Google transport preparation below updates it to
`2026-10-16-scenario-v2` with separate Nearby/Text Search (New) operation labels.

| Field | Meaning |
| --- | --- |
| `requestId`, `workflow`, `outcome`, `durationMs` | Generated UUID, classified workflow, application response outcome, and elapsed request time. A successful application response can still contain provider failures handled by fallbacks. |
| `attempts`, `endpoints[].attempts` | Calls made to fetch, grouped by allowlisted provider/operation. Includes failed attempts; excludes cache-only reuse, browser preflights, and transport-internal redirects. |
| `httpResponses`, `networkErrors`, `headerLatencyMs` | HTTP status counts, thrown transport errors, and cumulative time to fetch resolution/rejection. This is not payload-parse time or proof of a semantically successful response. |
| `cache` | Observations keyed by layer and outcome: memory, PostgreSQL, in-flight, supplied coordinates, session reuse, or saved property-record snapshot. Includes miss, stale, error, and wait/timeout where instrumented. |
| `fallbacks` | Static decision reasons at instrumented fallback branches, attributed to the destination provider/operation. They are not additional requests; an unconfigured fallback may make none. |
| `rentCastBillableCandidates` | HTTP 200 responses with a non-null body stream, not proof of a nonempty or useful payload. No response clone or body consumption is added for billing measurement. |
| `estimatedCostUsd`, `unknownCostAttempts` | Scenario subtotal and attempts whose charge remains unknown. A zero subtotal with unknown attempts does **not** mean a free analysis. |
| `pendingAttempts` | Calls still awaiting headers when the summary is emitted. Their cost remains unknown in that snapshot. |

Workflows distinguish new analysis, re-analysis, saved views, ownership lookup,
explicit ownership refresh, Xome widgets, Xome import-time prewarm, property lookup,
and comparison requests. Unscoped instrumented fetches receive independent
`background` summaries rather than being silently dropped.

The response exposes `X-Provider-Request-Id`. An optional UUID-only
`X-Analysis-Request-Id` request header becomes `parentRequestId`; it is untrusted
correlation metadata, never authorization or ownership. The current frontend does
**not** automatically propagate this to widget loads. Those requests are measured
separately; do not claim automatic full-page totals or join by time alone. Explicit
client-side correlation and saved-analysis attribution remain follow-up work.

Only fixed labels, counters, timing, and generated/validated UUIDs enter this
ledger. URLs, address/ZIP inputs, owner data, payloads, credential values, headers,
and upstream exception messages are excluded. Unknown endpoint paths become
`other`. This guarantee applies to the new ledger, not every pre-existing log.

### Cost assumptions and configuration

- Google known geocoding/Legacy Places HTTP-success responses use the historical
  first-paid-tier assumptions of $0.005/$0.032. HTTP 200 semantic errors can still
  be counted by this model; this is not SKU-level billing evidence.
- Zillow and AirDNA HTTP responses use the documented $0.01/request **overage
  scenario**. Included subscription requests, fixed fees, billing resets, and
  error-specific vendor rules are not reconciled here.
- RentCast candidates remain unknown unless
  `RENTCAST_ESTIMATED_USD_PER_BILLABLE_REQUEST` is supplied with the account's
  applicable nonnegative marginal rate. An invalid configured rate warns without
  logging the value and leaves the charge unknown. Non-200/no-body responses are
  modeled as nonbillable under its documented rule; 200 streams remain candidates.
- Census, Nominatim, and Xome have zero direct provider fees in this model.
  Realty-in-US and Furnished Finder have unknown charges. Transport failures
  remain unknown, even when a vendor might eventually report no charge.
- Infrastructure, bandwidth, free Google allowances, volume/geographic tiers,
  subscription amortization, photos/map tiles, and AI SDK/model charges are not
  included. A comparison workflow summary does not imply AI token accounting.

The optional rate is documented in [server/.env.example](server/.env.example).
No actual environment file, credential, production setting, or account usage was
read or changed.

### Deployment, reporting, and remaining measurement work

Deploy/restart the backend to enable the summaries; no accounting database
migration is required. Configure an appropriate log drain/retention policy before
relying on historical reporting: these are structured application logs, **not**
a new durable analytics table, billing dashboard, or guaranteed delivery system.
Group summaries by workflow and provider/operation; sum attempts, HTTP error
classes, unknown charges, pending calls, and estimated subtotals separately.
Compare new analysis with re-analysis/saved views and distinguish background
prewarm from user-request work. Validate modeled counts against vendor dashboards
before claiming invoice savings.

Cache observations are not additive avoided-call or dollar counters. A shared
area snapshot may be partial; a waiting request may reuse another request's
provider work. The request actually making the fetch owns the attempt. An aborted
response produces a one-time snapshot; late provider completions do not emit a
second delta. Exclude or separately label pending/aborted summaries when estimating
completed-analysis cost. Body parse/semantic errors must still be interpreted
with the existing service diagnostics.

**Verification:** `npm run build:server` passes. The isolated provider suite has
56 tests (43 prior regressions plus 13 accounting tests), covering concurrent
isolation, provider/status/cost attribution, unchanged responses/errors, actual
RentCast cold/warm service behavior, fallback markers, both backend mounts,
workflow classification, correlation validation/redaction, and aborted pending
requests. A synthetic ledger verifies the historical 37-call/$0.315 known-subtotal
arithmetic; it is not a full route replay or production measurement. All 13
isolated PostgreSQL cache tests pass, including zero-attempt persisted-cache reuse
and the existing independent-process single-fill test. No paid network traffic
or application database is used.

The broader Phase 0 remains open for automatic widget linkage, end-to-end cold
route replay, provider-policy matrix completion, persistent reporting, account
quota/invoice reconciliation, and SDK/browser traffic measurement.

## Implementation update - provider retry and cache correctness

Committed as `9c3b519`, this slice addresses request amplification and incorrect cache reuse:

- **Zillow area market:** isolate database reads and writes from provider fetching.
  A failed write no longer repeats the two successful city requests or the
  conditional two-request ZIP fallback. Fresh results remain in the existing
  one-hour hot cache even during database outages. Existing seven-day database
  freshness and partial/stale-field fallback behavior are preserved.
- **AirDNA:** replace the ZPID-only estimate key with a versioned identity built
  from the exact effective property request, ZIP fallback input, and bedroom
  input used by local cleaning-cost calculations. Distinct addresses/units or
  changed bedrooms/bathrooms no longer collide when ZPID is missing or unchanged.
  A changed ZPID alias alone does not force another request for identical inputs.
  Provider query semantics, financial formulas, fallback order, and 24-hour
  freshness remain unchanged; this does not add a shared ZIP fallback cache.
- **Furnished Finder:** only widen a successful but thin primary search. HTTP,
  transport, GraphQL, and malformed-results failures return unavailable without
  storing a 24-hour empty-market entry. A failed wider search is likewise not
  cached. Two valid thin/empty searches can still cache an unavailable market
  signal for 24 hours. No retries, failure cooldown, or cross-process caching
  are added in this slice.
- **Realty-in-US:** the user confirmed an enabled RapidAPI subscription on
  October 16, 2026. Both sale-lookup and rental-comp fallbacks remain enabled
  under the existing shared-key configuration; no new opt-in is required.
  Rental caching now stores unfiltered normalized query observations keyed by
  the full effective body, including limit. Plausibility and bedroom selection
  run separately for each property, including studios, preventing one
  property's price/bedroom filters from poisoning another's result. Missing or
  malformed result containers are not cached as successful empty lists.

**Verification:** the isolated provider suite now has 72 tests: 56 previous tests
plus 16 new retry/cache-correctness regressions in
[provider-cache-correctness.spec.ts](e2e/provider-cache-correctness.spec.ts).
They verify exact two/four-call Zillow outage paths, hot reuse, stale partial
preservation, AirDNA input separation and fallback estimates, Furnished Finder
failure recovery versus genuine thin markets, Realty-in-US per-property filtering,
changed limits, and continued entitled fallback access. HTTP and database calls
are mocked; no credentials, paid endpoints, or application database are used.

These are local correctness changes, not production savings measurements. Realty-
in-US pricing/quotas remain unconfirmed, so accounting still reports its charge
as unknown. Provider-wide rate limits/cooldowns, durable caches, and Google
retention/display review remain separate follow-ups.

## Implementation update - expanded shared caching, RentCast property datasets

Committed as `82a5ee3`, this slice adds opt-in shared **rental listings and rent AVM projections**,
using the same reviewed RentCast storage rights as the ZIP-market cache. It does
not change the listings-first strategy or revive the unused AVM call: usable
rental comps still mean zero AVM requests.

- Extract the existing tested lease/store machinery into
  [sharedProviderCache](server/src/services/sharedProviderCache.ts), with typed
  validation, dataset-specific expiry/identity, and a fixed SQL-table allowlist.
  The original market adapter, seven-day expiry, flag, and keys are preserved.
- Add [provider_data_cache](server/src/db/migrations/add_provider_data_cache.sql)
  and a [RentCast property adapter](server/src/services/rentCastPropertyCache.ts).
  The additive schema is also included in the normal database setup.
- Preserve **24-hour freshness** for listings/AVM. Each adapter has a maximum of
  500 process hot entries; shared-mode hot reuse is at most five minutes and
  never outlives the persisted expiry. Returned values are cloned.
- Identity includes endpoint, projection version, dated 24-hour policy, and a
  SHA-256 digest of the full effective query with sorted parameter names. Studios,
  coordinates, radius, limits, address/unit, type/size filters, and fallback
  city/state/ZIP inputs remain distinct whenever they affect the actual request.
  This is exact-query reuse, not fuzzy property matching or alias discovery.
  The digest avoids plaintext address/query keys; it is not encryption or access control.
- Store only reduced fields already used by the analyzer: AVM `mid/low/high`,
  or listing address/rent/beds/baths/size/source. Listing addresses are provider
  listing facts; treat the cache as internal application data, not anonymous data.
  Owner names, mailing/contact information, raw responses, and credentials are
  never projected into this table. Private ownership-record caching/saved
  snapshots are unchanged and excluded from this flag.
- Validate provider and persisted projections with explicit allowlists, a
  256-KiB per-payload cap, and at most 500 projected comps. Missing/nonnumeric AVM
  rent, invalid supplied ranges, malformed listing containers/rows, HTTP/network
  failures, and oversized projections are not cached as empty success. Existing
  missing-range defaults remain. A valid empty listings array is cached.
- The new shared paths retain sixty-second leases, ownership-checked saves,
  bounded eighteen-second polling, a thirty-second failed-fill cooldown, and
  two-second database operation deadlines. Both provider endpoints now have
  fifteen-second request timeouts. They share the existing dedicated two-connection
  cache pool, not the application's ordinary query pool.
- An unavailable shared cache fails closed: no uncoordinated provider call.
  Listings become unavailable and existing Realtor/AVM/algorithmic fallbacks may
  run; AVM remains optional. A successful provider result survives persistence
  failure in the hot cache, without an immediate repeated paid fetch. Expired data
  is not served; bounded cleanup remains opportunistic, not a strict idle-time
  deletion schedule. See the earlier lease/deadline caveats.
- With the flag off, no database access is added for these endpoints; 24-hour
  process reuse remains, now bounded and with in-process single-flight.

### Deployment and rollback

1. Deploy the backend and run `npm run db:setup` from `server/`, or apply only
   [add_provider_data_cache.sql](server/src/db/migrations/add_provider_data_cache.sql).
   Both schema paths are idempotent. No production migration was run here.
2. Confirm applicable RentCast account terms and operational capacity, then set
   `RENTCAST_SHARED_PROPERTY_CACHE_ENABLED=true` on all participating processes
   and restart. It defaults to `false` in [server/.env.example](server/.env.example).
   This flag is independent of `RENTCAST_SHARED_MARKET_CACHE_ENABLED`.
3. Verify `[provider:usage]` lists PostgreSQL hits for `rental-listings`/`rent-avm`
   and no outbound attempts on reused datasets. Cache coordination warnings now
   use `[provider:cache]`; the ZIP-input/connection warnings retain their existing
   labels. Monitor fallback traffic and data availability during database outages.
4. Roll back by setting the property flag to `false` everywhere and restarting.
   Leave the additive table intact. No saved analyses need rewriting or purging.

**Expected savings:** N otherwise cold-process calls for the identical eligible
query within 24 hours target one provider fill, saving N-1 requests. A genuinely
cold query still needs its first fill. Changed effective queries do not share.
Do not count this as a saving on requests the old memory cache already avoided,
or as an AVM saving in analyses that already skipped AVM.

**Verification:** backend build passes; 75 isolated provider tests and 23 cache
tests pass. New cache cases cover hashed/query-complete identity, projection
allowlists and size limits, 24-hour expiry/mode separation, default-off behavior,
database outage suppression, persisted-hit accounting, ownership/cooldown/expiry,
and invalid persisted data. For each endpoint, two independent Node processes
calling the actual RentCast service produce **one mocked provider request**; a
third restarted process reuses the snapshot without another request. A separate
three-process case verifies valid empty listings also persist and deduplicate. SQL checks
confirm 24-hour expiry and absence of raw/private fields. The existing market
suite still passes after extraction. Provider tests additionally cover concurrent
listing requests, authoritative empty arrays, malformed/failure recovery, and
the existing missing-range AVM behavior. All database integration uses a disposable
Unix-socket-only PostgreSQL cluster; no live paid providers or application DB.

**Still pending in the broader shared-caching item:** Zillow property/similar
adapters and aliases, AirDNA estimates/market observations, and Xome
listings/market-trends adapters. Their storage, redistribution, and retention
rights have not been established by the supplied subscription pricing or
open-endpoint access alone; do not automatically enable cross-user durable
storage on that basis. The reusable infrastructure is ready for those adapters
after their provider-specific rights review. RentCast private-record reuse and
broader sale/rental bundle projections are also separate work.

## Implementation update - Google foundations, not production Places migration

This local increment begins the Google item without treating a transport change
or slower-moving institutions as permission for broader data storage.

### Selected scope - coordinate lookups only, effective on backend deployment

After reviewing Leaflet/OpenStreetMap compatibility, the user chose to stop
new Google coordinate lookups rather than change map providers. Two follow-up
decisions explicitly limit this increment:

- **Keep historical data unchanged.** Do not purge saved coordinates/institutions,
  recalculate old demand scores, or delete existing geocoding-cache rows.
- **Keep Google institution enrichment for now.** Its proximity boost can also add
  up to two percentage points to modeled MTR occupancy, affecting revenue. This
  is not merely a cosmetic demand-score change. No scoring, occupancy, rental
  revenue, public/saved projection, or institution-display changes are included.

These decisions defer complete retention remediation and Places display/storage
compatibility; they do not resolve or certify those issues.

The default geocoder now uses
[geocodingCache](server/src/services/geocodingCache.ts), built on the existing
table's `provider` and `created_at` fields:

- Preserve valid provider-native coordinates and tag newly normalized Zillow and
  Realty-in-US pairs with `coordinateSource` and `coordinatesObservedAt`. Realty
  pairs are range-checked together, including valid zero coordinates. Provenance
  records the upstream service and local observation time, not its licensing
  rights, survey date, or independent accuracy verification.
- Use **Census only** for new unresolved address lookups. No Google Geocoding
  requests or automatic public Nominatim fallback. Preserve request/session
  deduplication, finite-coordinate validation, zero coordinates, and sanitized
  diagnostics. Census HTTP/no-match/malformed responses leave the location
  unresolved; do not invent coordinates or call a paid geocoder silently.
- Reuse only known Census/Nominatim database rows. Exclude **all Google cache
  rows regardless of age**, plus null/unknown providers. New alternative-source
  rows use `osm:v1:` address keys, so filling a Census miss does not overwrite a
  historical Google or unknown-source row. The new namespace wins over an older
  alternative-source entry. Reads do not renew timestamps.
- Carry provider/time metadata through fresh responses, database hits, sessions,
  duplicate-address fills, and saved property/comparable JSON. Explicitly
  Google-tagged supplied coordinates/cache hits are not reused by the default
  geocoder. Unprovenanced supplied coordinates from historical analyses remain
  untouched and are **not relabeled** as Census/native-provider observations.
- A cache read/write failure is observable and nonfatal; request the free Census
  fallback as needed. No completed paid request can be repeated by this path.
  No new schema columns or migration execution are required.

**Nominatim operational constraint:** the public service's one-request-per-second
limit applies across the application, not each process, and bulk usage is
restricted. Do not redirect the former 21-location workflow to that endpoint.
A future fallback needs a deliberately selected self-hosted/commercial service
and its own terms, attribution, quotas, and deployment configuration. Existing
known Nominatim cache rows may still be reused; production sends it no new calls.

**Important limitations:** historical cache/saved/exported Google content is not
purged or sanitized, and unprovenanced historical pins may still appear on OSM.
No claim of full map compatibility or retention compliance is made. The earlier
uncommitted thirty-day Google cache read/cleanup prototype was superseded by
source exclusion plus the explicit decision not to change historical data.
No scheduled retention job is enabled. Alternative-source retention remains as
before; this is not approval of unlimited retention for every provider.
`coordinatesObservedAt` on database hits uses stored insertion time, not a new
observation. No live database or historical snapshot audit was performed.

**Cost effect:** Google Geocoding requests become zero for new missing-address
lookups, even on an all-cold analysis; native coordinates can still avoid Census
calls. If 21 distinct missing addresses previously required Google, this avoids
21 billable candidates, modeled at **$0.105** before allowances/tiering. The 21
free Census requests replace them, so this is not a 21-request reduction in total
network traffic. Do not double-count savings already achieved by coordinate
reuse. Existing five-search Legacy Places enrichment remains up to **$0.160**
per cold eligible location under the historical model; this is not a zero-Google
workflow. Retain the existing Google key while Places still uses it.

### Places API (New) - typed transport prepared, not activated

[googlePlacesService](server/src/services/googlePlacesService.ts) is an injected,
mock-tested factory. **It is not imported by the production proximity scorer,
has no activation flag yet, and makes no calls unless explicitly invoked.**
Production still uses Legacy Places with its existing seven-day memory cache.
That pre-existing retention/display policy remains unapproved, not silently
certified by leaving it unchanged.

- Preserve five search intents: two Nearby Search (New) POST requests for
  `hospital`/`university`, plus three Text Search (New) POST requests for military
  bases, corporate office parks, and government buildings. Nearby Search (New)
  does not support Legacy `keyword`; do not substitute broad unrelated types.
- Explicit field mask:
  `places.id,places.displayName,places.location,places.types,places.attributions`.
  No wildcard, Details requests, photos, reviews, contact fields, or opening hours.
  Requested fields are in the Pro search model; the accounting scenario uses
  $0.032 each for Nearby/Text Pro, before allowances/tier/account differences.
  Five searches therefore still model **$0.160**, not automatic migration savings.
- Keep a sixteen-kilometer circle restriction for Nearby; Text Search uses a
  circle bias plus a local hard radius check because bias alone does not enforce
  coverage. Deduplicate place IDs within each category; do not conflate the five
  categories or claim complete geographic coverage from twenty-result caps.
- Validate finite coordinates, names, types, and structured attribution fields;
  unsafe attribution URI schemes and malformed responses are unavailable, not
  successful empty datasets. Valid empty responses remain distinct.
- Return complete/partial/unavailable/unconfigured status and per-category
  results. Preserve third-party attributions for the future display integration;
  they are not rendered by the current UI because the new adapter is not wired.
- Fifteen-second requests; exact-coordinate concurrent single-flight, cloned
  outputs, and **no completed-result cache**, PostgreSQL persistence, retries,
  paid shadow traffic, or automatic Legacy fallback. Key headers and payloads
  never enter the new diagnostics.
- Accounting distinguishes `places-nearby-new` from `places-text-new` under
  pricing version v2. The factory's default transport uses the existing scoped
  ledger; injected tests can bypass network while exercising the same mapping.

**Verification:** 95 isolated provider tests (75 previous plus 15 Google transport/cache tests and five coordinate-policy tests)
and 25 disposable PostgreSQL cache tests pass, along with shared-package,
all frontend-app, and backend builds and the analyzer boundary checks.
Coverage includes request bodies/field masks, two-versus-three endpoint counts,
exact-location single-flight, no completed-result storage, local radius filtering,
attribution preservation, malformed/HTTP/network failures, partial versus empty
results, sanitized accounting, production Census-only request accounting,
no Google/public-Nominatim fallback, incompatible-source rejection, native and
cached provenance, unchanged unprovenanced input, unchanged historical database
rows, namespace preference, alternative-source refreshes, and explicit read errors.
Existing provider and RentCast cache regressions remain intact. No paid requests,
Cloud configuration changes, or production database access were used.

### Remaining Google rollout gates and next increment

1. Confirm the applicable Google agreement/region and obtain a separate decision
   on the explicitly deferred historical cleanup and Google institution behavior.
   Remediate geocoding/Places retention and non-Google map usage, including
   scheduled deletion and saved-snapshot provenance/expiry. Source exclusion does
   not delete retained content or make old pins compatible.
2. Implement required Google Maps and third-party attribution in every relevant
   display/export and settle whether/how Google-derived institution names and
   demand scores may be saved, shared, or refreshed.
3. Wire the new transport to scoring behind an explicit migration flag, with
   tested category coverage, distance/selection and score semantics, unavailable
   states, public/saved data handling, and an allowed Legacy rollback.
4. Enable Places API (New), server key restrictions, quotas, alerts, and SKU
   monitoring in Google Cloud. This was not done from the implementation session.
5. Only then evaluate permitted shared area observations or independently
   licensed institutional data. No 30-90-day Places cache or multi-category
   request consolidation is enabled here.

## Debugging update - missing sale comparables

The local analysis investigated on October 16 had valid Census subject
coordinates but zero saved sale comparables. Its usage ledger recorded one
HTTP-200 `/similar` call; this does not prove a successful property dataset.
A later correctly parameterized diagnostic returned 20 comparable rows with
native coordinates for that same property. Therefore low regional inventory
and a Census failure are not established explanations for the original result.
The original response body was not retained, so its exact failure cannot be
reconstructed from HTTP-status accounting alone.

The next local increment adds diagnostics without extra provider calls:

- `[similar:diagnostic]` reports `missing-zpid`, `http-error`, `provider-error`
  (including HTTP-200 `ErrorMessage`/error payloads), `invalid-envelope`,
  `invalid-json`, `request-failed`, `normalization-failed`, `empty-response`,
  `all-filtered`, `success`, or `cache-hit`.
- Provider-error diagnostics include the allowlisted error field and a static
  category: rate/quota, access/billing, invalid input, not found, upstream
  unavailable, or unspecified. These are heuristics over the error text, not
  proof of account state or a retry policy; raw text is never logged.
- Success/filter diagnostics include raw, returned, rejected, invalid-record,
  invalid-price, invalid-square-footage, and native-coordinate counts. Invalid
  price/square-footage counts can overlap for one rejected row. No radius,
  inventory, bedroom, or price-similarity filter is added.
- Validate finite positive price and square footage; isolate malformed rows
  instead of allowing one null record to discard the entire response. Keep the
  two existing snake/camel envelope names and the correct `byzpid` parameter.
- Do not cache all-rejected results as a valid 24-hour empty dataset. Valid
  nonempty results retain the existing 24-hour TTL (the old 30-minute comment
  was inaccurate). Cached copies cannot be mutated by downstream geocoding.
- `[analyzer:comparables]` reports fetched/enriched/mapped counts before saving,
  or an explicit failed pipeline. Both diagnostic logs include the existing
  request ID when scoped, correlating with `[provider:usage]` without emitting
  addresses, ZPIDs, URLs, credentials, response bodies, or exception messages.

**Local debugging:** restart the backend to clear any old cached empty results,
then run one **new analysis** (normal provider charges apply). Capture the
`[similar:diagnostic]`, `[analyzer:comparables]`, and matching `[provider:usage]`
lines. Opening history and the existing financial re-analysis route do not
refetch sale comparables. A successful `/similar` dataset with mapped rows
points downstream; `provider-error`/`empty-response` points upstream;
`invalid-envelope` points to response-contract drift; `all-filtered` identifies
local price/size requirements. No automatic retry, paid fallback, live request,
historical rewrite, or search-radius expansion is introduced by this increment.

**Verification:** mocked tests cover a complete 20-row response, correct
`byzpid`, HTTP-200 provider errors, malformed envelopes/rows, exact filter
counts, empty versus failed results, cache recovery/isolation, existing
camel-case support, sanitized failures, missing ZPID, and request-ID correlation.
All 118 provider tests and the backend build pass.

**Observed follow-up:** the user's new Frankenmuth analysis logged
`provider-error` with HTTP 200 and `hasZpid: true`, followed by zero
fetched/enriched/mapped rows. Census resolved the subject. With explicit approval,
one later isolated request using that saved ZPID returned `200: Success` and
20 rows; the saved top-level/property identifiers agreed. This confirms an
intermittent upstream error response for that workflow, not local inventory
filtering or a Census failure. The error body from the failing request was not
retained; account throttling, upstream instability, and timing/concurrency are
not individually proven causes. Safe error categories now make subsequent
failures more informative. No automatic retries or wider searches were enabled.

## Implementation update - targeted recovery for missing datasets

Follows the Frankenmuth observation above. Scope is limited to recovering the
datasets that were actually lost, never rerunning the paid pipeline.

- **Bounded `/similar` retry.** One retry (two attempts maximum) after a
  transient failure only: HTTP 5xx/408, a transport error, or an HTTP-200
  provider error classified `upstream-unavailable` or `unspecified` (the
  Frankenmuth class). Rate/quota, access/billing, invalid-input and not-found
  errors, HTTP 4xx including 429, malformed/invalid JSON, explicit empty lists
  and all-filtered rows are never retried. Default delay 1 s, overridable with
  `SIMILAR_PROPERTIES_RETRY_DELAY_MS` (0-10,000 ms). Diagnostics add
  `willRetry: true` on the first failure and `attempt: 2` on the retry; single
  attempt log shapes are unchanged. Each retry is a separately counted
  `[provider:usage]` attempt (about $0.01) and occurs only after a failure.
- **Re-analysis backfill.** `POST /re-analyze/:slug` previously reused stored
  comparables and market data unconditionally. It now refetches *only* missing
  datasets: sale comparables when none were saved and a ZPID exists (enriched
  with the stored RentCast market statistics for calibration), and Zillow
  housing/rental market data when either is missing (shared weekly DB cache, so
  usually no provider call). Saved comparables and present market data are
  never refetched; the backfilled data is persisted with the re-analysis.
  Because missing rental-market data can feed the no-comps rent fallback, a
  backfill can change rent the same way a fresh analysis would.
- **Empty area-market memory hold.** A Zillow area fetch that produced neither
  housing nor rental data is now held in memory for 5 minutes instead of 1 hour,
  so an outage does not blank every analysis in the area for an hour. Results
  with data keep the 1-hour hold; DB snapshot behavior is unchanged.

**Verification:** 134 mocked provider tests (retry/no-retry matrix, retry
cap, cache recovery, usage attempts, re-analysis backfill route tests, empty
area-market TTL) and 25 cache tests pass; backend builds. No live calls.

### Provider-unavailable UI and rental-market coverage fallback

Resolves the two items deferred above.

- **Dataset status.** New analyses and re-analyses save
  `analysis_results.datasetStatus` with `comparables`, `housingMarket` and
  `rentalMarket` set to `ok`, `none-found`, `unavailable` or `not-applicable`.
  `getSimilarPropertiesWithStatus` separates a provider failure (`unavailable`)
  from a genuine empty or not-found result (`none-found`). A missing ZPID is
  `not-applicable`. Analyses saved before this change have no status and keep the
  old behavior (the empty section stays hidden).
- **UI notices.** The analyzer shows a notice in the comparables section when
  comparables were `unavailable` and another above the market section when
  housing or rental data was `unavailable`. `none-found` comparables show an
  informational message with no action. A single **Refresh missing data** button
  appears only when the host adapter implements the optional
  `refreshMissingData(slug)`, the view is editable and `onUpdate` exists, so the
  analyzer core stays adapter-driven.
- **Refresh endpoint.** `POST /analyzer/history/:slug/refresh-missing` (also
  mounted under `/api/investor-lab`) backfills only the missing comparables and
  area market data, geocodes new comps via Census, and updates only
  `property_data` and `analysis_results`. Comparables are not refetched when the
  saved status is `none-found`. Provider usage is labeled with the
  `dataset-refresh` workflow. Re-analysis applies the same rule.
- **Per-dataset ZIP retry.** After the city-level Zillow area query, each of
  housing and rental data that is still missing is retried once by ZIP
  (previously only when both were missing). No retry runs without a ZIP.
- **RentCast rental fallback (display only).** When Zillow rental-market data is
  still missing, the RentCast ZIP statistics already fetched for the analysis
  fill the Rental Market card (`source: 'rentcast'`), with no extra provider
  call. The card shows median rent, year-over-year change as a percent, listings
  when available, and a source line. The fallback never feeds rent estimates:
  rent-anchor checks exclude `source: 'rentcast'`, and the summary still counts
  as missing for a later Zillow backfill.
- **Shared snapshot caveat.** Zillow housing and rental data are one shared area
  snapshot, so refreshing missing housing data also requests rental data (about
  $0.01 per area query). Data already saved on the property is kept.

**Verification:** 144 mocked provider tests (status mapping, per-dataset ZIP
retry, no-ZIP no-retry, RentCast display-only fallback, refresh-missing route,
`dataset-refresh` usage workflow) and 25 cache tests pass. Packages, apps and
server build, and the analyzer-core guardrails pass. The notices, button and
RentCast card were checked visually in the reference SaaS harness with fixture
data. No live calls.

### Pre-merge recovery corrections

- Partial area-market snapshots are retried after a five-minute memory hold,
  fetching only their missing dataset. Explicit **Refresh missing data** bypasses
  a partial/empty memory hold. Failed recovery does not renew a partial DB
  snapshot's age; complete cached snapshots still avoid provider calls.
- Dataset refresh uses an optimistic comparison of the original saved property
  and results. If another operation changed either while providers were loading,
  the endpoint returns HTTP 409 instead of overwriting the newer analysis.
- Explicit refresh, like re-analysis, does not retry provider-confirmed empty
  comparable sets (`none-found`).
- Regression tests cover partial memory/DB recovery, preserved cached housing,
  original-snapshot comparisons, HTTP 409, and confirmed-empty comparables.

## Implementation update - RentCast bundle mode

Production plan confirmed as RentCast **Foundation**: $74/month for 1,000
requests (about $0.074 each), $0.06 per request over quota.

**Why the saving is small.** The earlier rent-estimate gate already removed the
unused estimate request, so compatibility mode usually makes one rent request
(active listings). Bundle mode makes one request in that case too. It saves a
request only when active listings have no usable comps (2 RentCast rent
requests drop to 1). RentCast's estimate comps are mostly inactive, so an
active-only bundle would usually need a second request; the user approved
counting **recently seen inactive comps (last seen within 180 days)**.

- **Flag.** `RENTCAST_RENT_MODE=compatibility` (default) or `bundle`. The modes
  are mutually exclusive, so production never pays for both.
- **Bundle request.** One `/avm/rent/long-term` request with `maxRadius=2`,
  `daysOld=180`, `compCount=15` and coordinates when known. It returns the
  estimate and comps; comps with a positive price and seen within 180 days are
  kept (an active comp with no age is kept; an inactive one is dropped).
- **Supplement.** With fewer than 3 plausible comps, one active-listings request
  is added and merged without duplicate addresses (usage fallback reason
  `insufficient-comps`). A failed bundle request also falls back to listings
  (`provider-failed`) and is not retried.
- **Financial blending unchanged.** Comps go through the existing
  `combineEstimates` blend. RentCast's estimate is used only in the existing
  no-comps blend, reusing the estimate already returned, so bundle mode never
  makes a second estimate request. Adopting RentCast's central estimate when
  comps exist remains a separate decision and is not implemented.
- **Projection and privacy.** Comps are allowlisted to address, rent, beds,
  baths, square feet, distance, status (`active`/`inactive`), days since last
  seen, similarity score and coordinates. Subject-property and owner fields are
  not stored. The 24-hour shared cache uses its own key namespace
  (`rent-avm-bundle`) and validator; usage is counted under `rent-avm`.
- **UI.** The long-term rental comps table adds Distance and Listing columns
  ("Active" or "Off market · seen Nd ago") only when comps carry those fields.
  Coordinates are stored for a future rent-comps map but not yet displayed.

| Case | Compatibility | Bundle |
| --- | ---: | ---: |
| 3+ usable comps | 1 (listings) | 1 (estimate) |
| 1-2 usable comps | 1 | 2 (estimate + listings) |
| No active listings, recent inactive comps | 2 (listings + estimate) | 1 |
| No comps anywhere | 2 + Realtor | 2 + Realtor |

Bundle mode is a win only where active rental inventory is thin, and it costs
one extra request where 1-2 active listings would have been enough. Roll out
by comparing matched cohorts with provider usage reports before making it the
default. ZIP market statistics are unchanged (1 request, cached 7 days).

**Verification:** 11 new mocked tests (`e2e/rentcast-bundle.spec.ts`) cover
each orchestration case, the mode flag, projection and age filtering, malformed
responses, the cache validator, request parameters, cache reuse, and usage
labels. The comp-table columns were checked visually in the reference SaaS
harness with fixture data. No live calls.

## Implementation update - durable usage reporting

### Oct 22 follow-up - nearby Places only on Mid-Term tab activation

Full analysis runs no longer call Google Places for MTR proximity scoring.
They still calculate a baseline MTR estimate and fetch furnished-market comps
as before. Opening the **Mid-Term** deep-dive tab triggers an authenticated,
owner/tenant/platform-scoped `POST /analyzer/history/:slug/mtr-nearby` request
(under the wrapper's API prefix). It accepts no client-provided coordinates:
the server loads the saved property's coordinates and MTR baseline.
Missing coordinates/estimates return 422, non-owned/missing analyses 404,
and provider/storage failures 503. Public read-only views do not fetch Places.

The successful response updates the in-view estimate, nearby institutions,
demand score, occupancy, revenue, seasonality, and strategy comparisons
together. New analyses are explicitly labeled as baseline estimates until
nearby drivers are loaded. The existing demand boost cap (15 points) and
occupancy boost rule remain unchanged. No refreshed institution names or
enriched MTR response are written to the saved analysis by this endpoint;
reloads revert to the saved estimate until the tab is opened again.
Existing historical saved proximity data is not purged by this change.

Client state reuses the successful response across tab switches, deduplicates
pending requests, discards responses for replaced analyses, and offers an
explicit retry after failures rather than silently presenting empty data.
Both the Asset Dashboard adapter and Investor Lab adapter expose this operation.
The existing seven-day in-memory proximity cache remains unchanged; exact
in-flight cache-key duplicates share one lookup. Failed/partial searches are
not cached, and provider searches have 15-second timeouts. No longer-lived
storage or provider switch is introduced; the prepared Places New transport
remains policy-gated and is not activated.

Admin reporting uses the distinct `mtr-nearby` workflow, including actor
attribution and endpoint-level Google counts/cost estimates. Compare **all
workflows** (or analysis plus mtr-nearby) when measuring end-to-end cost, not
only the reduced initial-analysis bucket. An uncached activation still makes
five legacy nearby searches; analyses whose users never open MTR avoid them.
No paid requests are needed to run the mocked provider regression tests or
the isolated `playwright.mtr.config.ts` browser suite (build the analyzer first).

The dashboard's **Admin > API Usage** tab adds date/workflow-filtered reports
and a daily full-analysis bar graph. The graph uses the selected UTC date range
independently of the workflow filter, combines configuration cohorts per day,
and separates completed from failed/aborted runs. It excludes re-analysis,
saved views and dataset refreshes. Missing days display zero recorded runs,
not verified inactivity; pre-collection periods/outages can have missing events
and the current UTC day may be partial. Counts represent request runs, not
unique properties or currently saved analysis rows.

The date/workflow-filtered reports cover both analyzer wrappers.
The workflow filter defaults to new analyses (`analysis`), not a mix
of saved views and analyses. UTC daily rows show requests, attempts per request,
estimated cost per request, failures, and unknown charges. A second table
breaks down provider/endpoint attempts, estimated cost, unknown charges, HTTP
and network errors, fallback events, memory/DB cache hits, misses and errors.
Requests with no external calls still count toward the workflow denominator.
Failed/aborted request costs are included when calculating cost per completed
request. Cache counters are events across layers, not a unique-lookup hit rate
or a claim of incremental savings.

Request-start timestamps and rollout configuration (market/property cache
flags, compatibility/bundle mode, RentCast scenario rate) are captured with each
summary. Compare daily rows only for like workflows/configurations. Reports
aggregate the selected window; change its dates to compare periods. There is
no historical backfill or automatic baseline/savings attribution.

**Storage and reliability:** `provider_usage_events` stores allowlisted
structured summaries with opaque request IDs; no addresses, headers,
tokens, full URLs or raw provider payloads. New records include server-authenticated
platform user IDs with platform/tenant scope for the admin-only **Usage by user**
table. Anonymous and background requests are separate; older records remain
unattributed. Actor identity is captured after route authentication, never from
client identity headers or property ownership. Names are resolved from current
user records only when an administrator loads the report; names/emails are not
stored in usage summaries, and actor IDs are omitted from general usage logs.
Identity shares the same 90-day retention as usage. No schema migration is needed:
the optional actor projection lives in the existing JSONB summary.
Per-user rows honor the date/workflow filters and include all-provider attempts,
known scenario costs, unknown-cost attempts, failures, RentCast attempts and
billable candidates. Cache-fill cost belongs to the fetching actor, not later
cache users; this is not a cost-allocation ledger. Existing `[provider:usage]` logs
continue. The default reporter asynchronously writes through a dedicated
one-connection pool with deadlines and a bounded 100-record queue. Storage
failures and queue overflow log explicit `[provider:reporting]` errors without
failing an analysis. This is best-effort operational telemetry: abrupt process
termination, outages or saturation can leave gaps, so it is not an invoice
ledger. HTTP 503 is returned if the reporting store cannot be read; the UI does
not turn failures into zero-usage results.

**Retention:** the user selected 90 days. Queries always exclude older records.
Successful writes trigger bounded expiry cleanup at most hourly (10,000 rows
per pass). Physical deletion during idle periods or large backlogs requires the
scheduled `cd server && npm run usage:prune` command; configure it daily in the
deployment scheduler and monitor failures. No scheduler is provisioned by this
code change. Subscription allocations/free quotas and billing reconciliation
remain separate from scenario costs; unknown charges stay visible.

### RentCast investigation snapshot - 2026-10-22, approximately 17:35 UTC

Read-only production queries since reporting began returned:

| UTC day | New-analysis requests | RentCast attempts within analyses | Attempts / analysis |
|---|---:|---:|---:|
| Oct 20 | 21 | 29 | 1.38 |
| Oct 21 | 66 | 91 | 1.38 |
| Oct 22 (partial) | 171 | 188 | 1.10 |

Across all workflows: 309 RentCast attempts: 219 rental listings, 84 ZIP
markets, 5 rent AVM, and 1 property-record lookup. There were 308 HTTP 200
billable candidates and one AVM HTTP 400; no recorded RentCast network or
cache errors. All observed configurations used both shared caches and
compatibility mode. Saved-view workflows had zero recorded provider attempts.

ZIP markets recorded 128 memory hits and 35 PostgreSQL hits; rental listings
recorded 3 memory hits and 25 PostgreSQL hits. These are layer events, not
unique-query hit-rate denominators. Cache state at the later inspection had
84 fresh ZIP entries and 203 fresh property entries, with no live leases.

The recorded increase accompanies more new-analysis requests, while attempts
per analysis fell. This is not a before/after savings experiment: Oct 20 is
the first recorded day, Oct 22 is partial, and data mix/configuration coverage
must be considered. It does not reconcile earlier usage or other consumers
of the same API key. Saved analysis rows cannot reconstruct request frequency
or actor-level provider costs: full runs upsert the same property and refresh
its timestamp, and rows can be deleted.

At the configured $0.074 scenario rate, 308 candidates represent $22.792;
if all were overage at the confirmed $0.06 rate, their incremental cost would
be $18.48. Neither is an invoice calculation: included requests and the fixed
$74 subscription must be reconciled separately.

Reduction candidates, not enabled by this change:

- Fetch ZIP market statistics only when needed for the market panel. These
  account for 84/309 attempts (27%); actual savings depend on panel usage and
  preserving the current display-only rental-market fallback.
- Investigate demand for repeated full runs instead of reopening saved
  analyses. Existing usage events cannot be reliably joined back to property
  owners; user attribution starts with deployment of the new actor projection.
- Evaluate broader nearby-listings reuse only with accuracy tests and provider
  policy review. Current cache identities include exact coordinates and bed/
  bath query filters; silently rounding or dropping filters changes results.
- Keep bundle mode off: this sample has only five AVM attempts, so forcing an
  AVM bundle has no demonstrated call-saving advantage over listings-first.

### Deploy and enable reporting

**Oct 22 follow-up - ZIP statistics paused:** New full analyses no longer call
RentCast `/v1/markets` or attach its ZIP statistics to results. The Strategy
Comparison trend strip and Long-Term > Market Statistics block are removed,
including for saved analyses containing historical statistics. Rental listing
comps, conditional rent AVM fallback, and on-demand property records remain.
New comparable rent calibration uses subject rental data/algorithmic fallback
instead of freshly fetched ZIP statistics. Zillow market datasets remain
unchanged; new analyses no longer manufacture the RentCast rental-market
display fallback. Historical stored statistics/caches are not deleted, and
existing saved-analysis recalculation/backfill can still reuse stored data
without fetching RentCast ZIP statistics. The cache/service implementation is
retained for a possible future reintroduction; no production route calls it.

1. Deploy the code. Apply
   [add_provider_usage_events.sql](server/src/db/migrations/add_provider_usage_events.sql),
   or run the existing database setup. The schema is additive and idempotent.
2. Set `PROVIDER_USAGE_REPORTING_ENABLED=true` on Heroku (default false). This
   enables collection, not provider traffic. Existing usage flags/rates are
   unchanged.
3. Schedule `cd server && npm run usage:prune` daily for retention during idle
   periods. Verify that expired records are removed and monitor reporting
   errors. The command deletes only usage records older than 90 days.
4. As a platform administrator, open `/admin` and select **API Usage**.
   `GET /api/portal/admin/provider-usage` uses existing JWT and database-backed
   admin checks. Non-admin users cannot query the report.
5. Filter by UTC `from` (inclusive) and `to` (exclusive), with a maximum 90-day
   span and an optional workflow. The UI's **Through** date is inclusive.
   Collection starts at enablement; empty periods do not prove no prior usage.
6. Roll back collection with `PROVIDER_USAGE_REPORTING_ENABLED=false`. Existing
   retained reports remain readable; schema/data are not destroyed.

Verification includes mocked recorder disablement/overflow/write-failure and
privacy projection tests; admin authentication/date validation/error responses;
isolated PostgreSQL schema idempotence, deduplication, restart persistence,
aggregation, date/workflow/configuration separation and retention; and an
isolated mocked browser suite for admin/denied/empty/error/filter states. No
live provider calls or production database changes are required.

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
- Confirm RentCast configuration without reading or logging credential values. Realty-in-US entitlement was confirmed by the user on October 16, 2026; pricing and quotas remain unconfirmed.
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
| RentCast AVM/comps | Implemented opt-in: reduced compatibility-mode AVM/listing projections; full bundle remains future work | 24 hours; full effective query plus projection/policy versions |
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
- Preserve entitled Realty-in-US fallbacks (user-confirmed enabled subscription); require operational review if that entitlement changes.
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
Selected coordinate-only increment:
  Google geocoding calls = 0
  Census calls = unique unresolved eligible address/cache misses
  Legacy Places calls = existing category searches on eligible location misses

Future policy-approved Places strategy:
  Places calls = category searches for new/expired permitted area observations
```

Report three numbers separately: marginal cost at current quota position, allocated monthly cost per completed analysis, and all-cold scenario cost. Include background refresh, failures where billable, infrastructure, and fixed fees in realized unit economics.

## 9. Reference policies and evidence

- [Detailed provider inventory and RentCast review](PROPERTY_ANALYZER_USAGE_AND_COST_ANALYSIS.md)
- [Google Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies)
- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), noting the page's API New scope.
- [Nearby Search migration guide](https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-nearby): POST, field masks, multiple types, and keyword-to-Text-Search differences.
- [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search) and [place types](https://developers.google.com/maps/documentation/places/web-service/place-types): field/SKU selection, result limits, and supported category filters.
- [Google Maps service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), subject to the applicable account/region agreement.
- [Census Geocoding services](https://geocoding.geo.census.gov/geocoder/) and [public Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- [RentCast rent estimate and comps](https://developers.rentcast.io/reference/rent-estimate-long-term)
- [RentCast market statistics](https://developers.rentcast.io/reference/market-statistics)
- [RentCast successful-request billing](https://developers.rentcast.io/reference/billing-and-pricing)

Policy review is a release dependency, not a claim that this plan substitutes for contractual/legal interpretation.
