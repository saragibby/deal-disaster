# Property Analyzer Usage and Cost Analysis

**Prepared:** October 16, 2026  
**Source baseline:** local `main`, revision `b6ba990` (October 8, 2026)  
**Method:** read-only source tracing and public pricing verification; not a measured production trace.

**Implementation follow-up:** [Usage and cost reduction plan](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md) covers phased changes for all analyzer providers, validation, rollout, and provider retention/display constraints. Proposed long-lived Google caching is conditional on applicable terms, not assumed safe solely because locations change slowly.

**Coordinate-reuse implementation update:** The first slice is now implemented and
locally tested; the counts below remain the original baseline, not post-deployment
measurements. Valid canonical numeric coordinates are preserved and reused,
missing addresses share in-flight work, and early subject lookups are not repeated
within the same analysis. Mocked tests verify zero geocoder requests for a subject
plus 20 located comparables, and exactly three primary requests for three unique
missing locations. Availability of these fields in actual provider responses still
requires confirmation. Up to 21 avoided Google geocodes saves $0.105 at the modeled
first paid tier; a genuinely cold analysis with no supplied coordinates still needs
one initial geocode per unique required address. Places usage is unchanged.

**RentCast implementation update:** the subsequent local slice gates the unused AVM
request when usable rental comps exist, reducing the modeled three RentCast calls
to two in that scenario. It also corrects nested rental-market statistics and
same-month YoY mapping, preserves missing values, and fixes query-specific cache
keys/studio filters. These correctness fixes can change estimates; the original
counts and dollar examples below remain a historical baseline. This slice is
locally tested, not deployed or measured in production.

**Shared ZIP-market cache update:** an opt-in PostgreSQL cache now reuses validated
RentCast rental-market metrics across processes and server restarts for seven days.
Atomic refresh leases avoid duplicate concurrent fills. Two independent Node
processes calling the actual service were tested against a disposable local
PostgreSQL cluster: exactly one mocked `/markets` request was made. Enable only
after deploying the schema and setting `RENTCAST_SHARED_MARKET_CACHE_ENABLED=true`;
it defaults off. One cold ZIP fill is still required; savings apply to otherwise
duplicated process-level fills, not repeats already covered by the old memory
cache. See the [rollout and validation details](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#implementation-update---shared-rentcast-zip-market-cache).

**Request-accounting update:** a subsequent local slice now emits sanitized
`[provider:usage]` summaries for analyzer data-provider HTTP calls in both platform
wrappers. Summaries include workflow/request IDs, provider/endpoint attempts, HTTP
statuses, transport failures, cache/fallback observations, header latency, modeled
cost, unknown charges, and pending attempts. RentCast HTTP 200 body streams are
billable candidates, not invoice evidence; an optional configured account rate
can price that scenario. The historical baseline below is unchanged. Tests verify
ledger arithmetic and real mocked-service cold/warm behavior, not production
totals or a full 37-call route replay. Widget requests are separate summaries
unless a caller explicitly supplies the supported correlation header; the current
UI does not do so automatically. AI SDK usage, photos/map tiles, durable reporting,
and invoice/quota reconciliation remain outside this slice. See
[accounting fields, pricing assumptions, limitations, and deployment](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#implementation-update---expanded-data-provider-request-accounting).

**Provider-correctness update:** the next local slice prevents Zillow cache-write
failures from repeating completed market fetches, makes AirDNA cache identities
query-specific instead of ZPID-only, separates Furnished Finder outages from
cacheable thin markets, and applies Realty-in-US rental filters per subject over
query-keyed observations. The user also confirmed Realty-in-US is enabled in
RapidAPI; its pricing/quotas remain unconfirmed. Both fallback paths stay enabled.
See [implementation and tests](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#implementation-update---provider-retry-and-cache-correctness).
Historical cold-path counts below are unchanged; outage and repeat-request
behavior is improved, not measured production usage.

**Shared property-data cache update:** the next local slice adds independently
opt-in 24-hour PostgreSQL reuse of reduced RentCast rental-listings and AVM results.
It retains the unused-AVM gate and existing request filters. Cross-process leases,
query-specific hashed identities, validated field allowlists, bounded memory and
timeouts, and failure cooldowns avoid duplicate fills without storing raw or
ownership-record responses. For each endpoint, two actual service processes
made one mocked provider request and a restarted third reused the result.
The first genuinely cold query still incurs a request. Enable only after deploying
the new schema and setting `RENTCAST_SHARED_PROPERTY_CACHE_ENABLED=true`; this does
not enable the separate ZIP-market flag. Zillow/AirDNA/Xome shared adapters remain
pending provider-specific storage-rights review. See
[scope, validation, rollout, and deferred providers](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#implementation-update---expanded-shared-caching-rentcast-property-datasets).

**Google coordinate-only update:** the next local increment uses Census for new
missing-address lookups and excludes **all** Google geocoding-cache rows, regardless
of age. New Census entries use a separate namespace without overwriting old rows;
new provider-native and resolved coordinates carry source/time provenance.
No automatic public Nominatim fallback is enabled. With 21 genuinely missing
addresses, 21 free Census requests replace the former Google requests, avoiding
up to **$0.105** at the modeled first paid tier, not reducing total HTTP calls by
21. Do not double-count this against coordinate-reuse savings.

The user explicitly chose to **leave historical data unchanged and retain Google
institution enrichment**. Old unprovenanced coordinates are not relabeled or
removed; historical caches, snapshots, and exports are not purged. No scheduled
retention job runs. Google proximity can add up to two percentage points to
modeled MTR occupancy as well as demand scores, so removing it would change
financial estimates. That behavior remains unchanged. Full historical retention
and Places/OSM compatibility are **deferred, not completed**.

A separate typed Places (New) factory is prepared
and tested but **not connected to production scoring**: two Nearby searches and
three Text searches preserve the existing category intents, retain attribution
metadata, and use explicit Pro field masks with no result persistence. Accounting
now identifies the new endpoints separately under pricing version v2. Five calls
still model $0.160; no new migration or area-cache savings are claimed. The old
thirty-day Google cache prototype was superseded by source exclusion without
deletion, consistent with the user's narrower approval. See
[implemented Google foundations and remaining rollout gates](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#implementation-update---google-foundations-not-production-places-migration).

**Comparable-debugging update:** the investigated local snapshot had working
Census coordinates but zero sale comparables; a later correctly parameterized
Zillow diagnostic returned 20 rows. HTTP 200 alone cannot explain the earlier
empty result. New local diagnostics distinguish upstream errors/empty datasets,
response-shape issues, local price/size rejection, cache reuse, and downstream
enrichment/mapping counts using the same request ID, without additional provider
requests. All-rejected results are no longer cached for 24 hours. See the
[debugging procedure](PROPERTY_ANALYZER_COST_REDUCTION_PLAN.md#debugging-update---missing-sale-comparables).
Follow-up logs for a Frankenmuth analysis confirmed an HTTP-200 provider error
before any comparable filtering. One approved isolated request for that same
saved ZPID then returned 20 rows. This establishes intermittent upstream failure,
not low inventory or a Census regression; its exact error cause remains unknown.
Safe error-field/category logging now distinguishes common failure classes
without retaining raw provider errors. No automatic retries, increased search
traffic, or new measured savings are claimed.

## Executive summary

A new property analysis returning **20 comparable properties**, with all relevant providers enabled and all application caches initially empty, makes:

| Scope | Outbound provider HTTP requests |
| --- | ---: |
| Core analysis pipeline | **35-36** |
| Core plus automatically loaded result-page widgets | **37-38** |
| Above plus one explicit ownership-record lookup | **38-39** |

The one-request difference is whether property details include usable price history. Twenty comparables is an example, not an enforced maximum.

The largest fan-out is **21 Google Geocoding requests and 5 Google Places searches**. At Google's first paid tier, these cost **$0.265 per cold analysis**, before monthly free allowances.

Confirmed RapidAPI subscriptions:

- **Private-Zillow PRO:** $20/month, with public terms of 10,000 requests/month and $0.01 per additional request.
- **AirDNA PRO:** $20/month, with public terms of 3,000 requests/month and $0.01 per additional request.
- **Xome:** modeled at $0 direct API cost based on the user's confirmation of open-endpoint access.

After applicable included requests are exhausted, the **RapidAPI + Google marginal subtotal is $0.315-$0.325 per cold analysis**, excluding RentCast, fallback traffic, excess bandwidth, and infrastructure.

**RentCast remains an important configuration uncertainty.** It is separate from RapidAPI; the supplied RapidAPI subscription screenshot does not establish whether RentCast is enabled.

## 1. Scope and assumptions

The primary scenario assumes:

- One successful new analysis with a valid address, ZIP, and ZPID.
- Twenty distinct comparable addresses.
- All relevant providers configured; Furnished Finder enabled.
- Successful primary provider responses and successful cache writes.
- Both process-memory caches and persistent PostgreSQL area/geocoding caches initially miss.
- No concurrent analyses or other account traffic consuming quotas.

Restarting a server does not clear the persistent PostgreSQL caches.

Counts exclude database queries, authentication/session traffic, HTTP preflights, transport redirects, static assets, property photos, map tiles, and user-initiated chat/comparison actions.

No live paid requests, production database queries, credential reads, or production cache clearing were performed. Production deployment parity, enabled providers, actual invoices, and grandfathered account terms were not verified.

## 2. Request flow

The frontend submits `POST /api/analyzer/run`. The server resolves the property, fetches market and rental data, computes investment metrics, enriches comparables, and persists the analysis.

After results render, the UI separately loads an Xome market snapshot and nearby foreclosures.

### Core endpoint inventory

| Provider | Endpoint | Primary cold count | Purpose and conditions |
| --- | --- | ---: | --- |
| Private-Zillow / RapidAPI | `GET /byzpid` OR `GET /byaddress` | 1 | Property facts, tax history, photos, HOA, and any embedded price history. |
| Private-Zillow / RapidAPI | `GET /pricehistory` | 0-1 | Used when normalized property details lack usable history; address lookup also requires a ZPID. |
| Private-Zillow / RapidAPI | `GET /housing_market` | 1 | City/state housing-market data. |
| Private-Zillow / RapidAPI | `GET /rental_market` | 1 | City/state rental-market data. |
| Google Geocoding | `GET /maps/api/geocode/json` | 1 | Early subject-property geocoding. |
| RentCast | `GET /v1/listings/rental/long-term` | 1 | Active rental comps, default limit 10; one request for the list. |
| RentCast | `GET /v1/avm/rent/long-term` | 1 | Rent valuation, requested even when successful comps make its estimate unused. |
| AirDNA / RapidAPI | `GET /rentalizer` | 1 | Property-level short-term rental estimate. |
| Google Places Legacy | `GET /maps/api/place/nearbysearch/json` | **5** | Hospitals, military bases, universities, corporate office parks, government buildings. |
| Furnished Finder | `POST /graphql`, `FFGeoSearch` | 1 | Furnished MTR comps in an approximately 6-mile search box. |
| RentCast | `GET /v1/markets` | 1 | ZIP rental statistics, requesting 12 months of history. |
| Private-Zillow / RapidAPI | `GET /similar` | 1 | Sale comparables returned together, not a separate details lookup per comp. |
| Google Geocoding | `GET /maps/api/geocode/json` | **20** | One lookup per comparable address. Subject is included in the batch but its successful early geocode is now cached. |
| Local computation / PostgreSQL | No external data API | 0 | Expense defaults, financing, cash flow, ROI, taxes, strategy calculations, comparable rent calibration, persistence. |

**Core total: 4-5 Zillow + 3 RentCast + 1 AirDNA + 5 Places + 1 Furnished Finder + 21 geocoding = 35-36.**

Zillow URLs normally use the ZPID lookup. Plain addresses and parsed Redfin, Realtor, and Trulia URLs normally use the address lookup.

The current Zillow normalizer does not preserve subject latitude/longitude or embedded market objects. The pipeline therefore geocodes the subject and requests area-market enrichment when city/state are available and caches miss.

### Automatic result-page requests

| Component | Application endpoint | Cold outbound request |
| --- | --- | --- |
| Market snapshot | `GET /api/xome/market-trends?postalCode=...` | 1 Xome market-trends request |
| Nearby foreclosures | `POST /api/xome/search` | 1 Xome nationwide listing-search request, then local distance filtering |

The listing request asks for up to 10,000 nationwide records. It is not a request per displayed foreclosure.

The Xome module prewarms its listing cache when loaded with a configured key. Prewarm and the first search share an in-flight promise: do not count both as separate requests for the same refresh. If prewarming already completed, the first user search incurs no new listing-provider request; the upstream cost belongs to startup/refresh instead.

The baseline data workflow has three logical frontend requests: analysis, market snapshot, and foreclosures. Navigation to the saved analysis slug can additionally trigger a database-backed history read and remount result widgets. Working newly populated caches prevent those remounts from repeating upstream Xome calls.

### General call-count formula

For `C` distinct valid comparable addresses and `H = 1` when separate price history is needed, otherwise `0`:

```text
Core provider requests = C + 15 + H
Full result page       = C + 17 + H
Plus ownership records = C + 18 + H
```

These formulas describe the successful, fully enabled primary scenario, not universal bounds.

## 3. Conditional calls and fallbacks

| Condition | Change from primary scenario |
| --- | --- |
| Both Zillow city/state market responses lack usable data, with ZIP available | **+2 Zillow calls**: retry both market endpoints by ZIP. |
| RentCast rental comps return an empty array | **+1 Realty-in-US RapidAPI attempt**, if configured and ZIP exists. |
| AirDNA Rentalizer fails or cannot be parsed | **+1 AirDNA call** to `/v1/market/statistics`. |
| Furnished Finder primary search fails or has insufficient comps | **+1 GraphQL call**, widening to approximately 15 miles. |
| Google geocoding fails | Try US Census, then OSM Nominatim: up to **2 extra HTTP requests per geocoding attempt**. |
| Early subject geocoding fails | Subject may be attempted again in the later batch. |
| User clicks "Load property records" | **+1 RentCast** `/v1/properties` request. Explicit refresh bypasses its service cache. |
| Initial Zillow lookup returns an HTTP provider error | May attempt one Realty-in-US for-sale search if input contains an extractable ZIP; this is an alternate pipeline branch. |
| Area-market persistence fails after fetching provider data | Database fallback can reissue market requests. |

With 20 comps, adding the first four fallback rows gives **42-43 full-page outbound requests**, before ownership records or geocoding fallback chains. This is not a worst-case bound.

An algorithmic result does not imply zero paid attempts: providers may have been called unsuccessfully before the fallback calculation ran. Whether failed requests are billable depends on the provider's terms.

Duplicate uncached comparable addresses can also create duplicate geocoding requests: the batch deduplicates SQL lookup keys but builds its miss array from the original rows.

### If RentCast is not enabled

Its three functions return without outbound provider requests. The route then attempts Realty-in-US rental comps when a ZIP and RapidAPI key exist.

Realty-in-US was not shown in the supplied subscription screenshot, but the user subsequently confirmed an enabled subscription on October 16, 2026. Its pricing/quotas remain unconfirmed.

Removing three RentCast requests and adding one Realty-in-US attempt gives **35-36 full-page requests**, assuming all other primary providers succeed. This is a conditional scenario, not a confirmed description of production.

The Property History API BASIC subscription visible in the screenshot is not used in the traced analyzer pipeline; a targeted server/shared-auth source search found no integration.

## 4. Confirmed pricing inputs

### RapidAPI and Xome

| Provider / plan | Monthly fee | Included requests | Overage | Published rate limit |
| --- | ---: | ---: | ---: | --- |
| Private-Zillow PRO | $20 | 10,000 | $0.01/request | 10 requests/second |
| AirDNA PRO | $20 | 3,000 | $0.01/request | 1 request/second |
| Xome open-endpoint access | $0 direct API cost, per user | Not established | Not established | Not established |

The screenshot confirms subscription names and monthly fees. Quotas and overages come from the rendered public pricing pages; confirm account terms if subscriptions are grandfathered.

Both RapidAPI pages also list **10,240 MB/month bandwidth allowance**, then **$0.001 per additional MB**. Response sizes were not measured. Confirm how this platform fee aggregates on the actual account.

AirDNA pricing is for the RapidAPI wrapper at `airdna1.p.rapidapi.com`, not a direct AirDNA subscription.

### Google Maps Platform, global USD pricing

The code uses **Legacy Nearby Search**, not Places API (New).

| SKU | Monthly free allowance | First paid tier per 1,000 | Per request |
| --- | ---: | ---: | ---: |
| Geocoding | 10,000 | $5.00 | $0.005 |
| Places - Nearby Search, Legacy | 5,000 | $32.00 | $0.032 |

For 20 comps, at first-paid-tier rates:

```text
21 geocodes x $0.005 = $0.105
 5 searches x $0.032 = $0.160
Google subtotal     = $0.265
```

Allowances apply monthly per SKU, not per analysis. Other account traffic consumes them. Higher-volume tiers, regional pricing, taxes, or negotiated terms can change actual costs.

### RentCast API: separate, unconfirmed production plan

| Plan | Monthly fee | Included requests | Overage | Three overage requests |
| --- | ---: | ---: | ---: | ---: |
| Developer | $0 | 50 | $0.20 | $0.600 |
| Foundation | $74 | 1,000 | $0.06 | $0.180 |
| Growth | $199 | 5,000 | $0.03 | $0.090 |
| Scale | $449 | 25,000 | $0.015 | $0.045 |

These are API plans, not consumer dashboard plans. Three baseline calls become four if ownership records are explicitly loaded.

Furnished Finder has no metered billing integration in source. Assuming $0 direct request cost is not a guarantee of free production entitlement: the service explicitly describes an undocumented internal endpoint without a published contract or SLA.

US Census and OSM Nominatim are public geocoding fallbacks, generally without metered fees, subject to their usage policies.

## 5. Marginal cost per cold analysis

After applicable included requests/free allowances are exhausted, using first-tier Google rates:

| Component | Cost |
| --- | ---: |
| Zillow, 4-5 calls | $0.040-$0.050 |
| AirDNA, 1 call | $0.010 |
| Google Geocoding and Places | $0.265 |
| Xome | $0 direct API cost |
| **Subtotal before RentCast** | **$0.315-$0.325** |

With RentCast overage:

| RentCast plan | Combined marginal subtotal |
| --- | ---: |
| Developer | $0.915-$0.925 |
| Foundation | $0.495-$0.505 |
| Growth | $0.405-$0.415 |
| Scale | $0.360-$0.370 |

These figures exclude subscription allocation, fallbacks, excess bandwidth, infrastructure, and taxes; assume no direct Furnished Finder charge.

Inside included RapidAPI quotas, incremental RapidAPI request charges are $0. The fixed $40/month still belongs in average unit economics.

## 6. Monthly cost and allocated unit economics

Let:

- `N` = completed primary-path cold analyses in the relevant period.
- `Z` = 4 or 5 Zillow requests per analysis.
- Each analysis returns 20 comparables.

Assuming no other usage:

```text
RapidAPI monthly request cost =
  $40
  + max(0, Z*N - 10000) * $0.01
  + max(0, N - 3000) * $0.01
```

Within Google's first paid tiers:

```text
Google monthly cost =
    max(0, 21*N - 10000) * $0.005
  + max(0,  5*N -  5000) * $0.032
```

Use Google's tier schedule beyond those tiers. RapidAPI subscription renewal periods may not align with Google's calendar-month billing.

| Entirely cold analyses/month | RapidAPI + Google subtotal | Average per analysis |
| --- | ---: | ---: |
| 100 | $40 | $0.400 |
| 1,000 | $95 | $0.095 |
| 2,000 | $360 | $0.180 |
| 3,000 | $645-$675 | $0.215-$0.225 |

**Add RentCast if configured**, plus fallbacks, excess bandwidth, and infrastructure.

For uniform-request subscription billing:

```text
RentCast monthly cost =
  plan fee + max(0, 3*N - included requests) * overage rate
```

At 1,000 analyses/month:

| RentCast plan | RentCast monthly cost | Total with $95 RapidAPI + Google | Average per analysis |
| --- | ---: | ---: | ---: |
| Developer | $590 | $685 | $0.685 |
| Foundation | $194 | $289 | $0.289 |
| Growth | $199 | $294 | $0.294 |
| Scale | $449 | $544 | $0.544 |

The lowest overage rate does not necessarily produce the lowest bill at a given volume.

For realized cost per successfully completed analysis, include failed-attempt costs in the numerator. Allocate shared account subscriptions consistently across products.

### Included-quota capacity

- Zillow: approximately **2,000-2,500 cold analyses**, at 5 versus 4 calls each.
- AirDNA: **3,000** primary-path analyses, or **1,500** if every analysis attempts both AirDNA endpoints.
- Warm shared caches increase these capacities; unrelated provider usage reduces them.

## 7. Cache behavior

| Data | Cache and TTL |
| --- | --- |
| Zillow property by ZPID and similar properties | Process memory, 24 hours. Similar-properties prose says 30 minutes, but executable shared TTL is 24 hours. |
| Zillow property by address | No property-level cache check/write in this function; area caching still applies. |
| Zillow housing/rental market | PostgreSQL snapshots refreshed after 7 days; additional 1-hour process cache, keyed by city/state. |
| RentCast rent/comps/records | Process memory, 24 hours; ownership records also persist on the saved analysis. |
| RentCast ZIP market | Process memory, 7 days. |
| AirDNA | Process memory, 24 hours for successful estimates. |
| Furnished Finder | Process memory, 24 hours, including null results. |
| Proximity scoring | Process memory, 7 days, rounded-coordinate key. |
| Geocoding | PostgreSQL address cache, no expiry in this service. |
| Xome nationwide listings | Process memory, 4 hours; prewarm and in-flight refresh deduplication. |
| Xome market trends | Process memory, 7 days by ZIP. |

Most caches are per process/dyno, not distributed. Scaling or restarts can duplicate provider usage even when another process is warm. Persistent PostgreSQL caches behave differently.

## 8. Other actions and browser traffic

- Financing, cash flow, ROI, tax benefits, expense defaults, and strategy math are local calculations.
- Sale-comparable rents are calibrated locally, not separately fetched for each comparable.
- No LLM inference is required for the traced new single-property analysis. Ask Will and AI comparisons are separate workflows.
- Ownership records load only on explicit user action.
- Leaflet uses OSM tiles, not a Google Dynamic Maps load. Tile/photo request counts vary with viewport, navigation, and browser caching.
- Street View is an on-demand keyless embed in this path, not a keyed Street View API call. Do not automatically assign it a Street View API SKU.
- Loading saved analyses reads stored data, but result-page Xome widgets can still incur upstream calls when their caches miss.
- Parameter edits calculate locally and may autosave to the database.
- Explicit re-analysis has its own provider behavior and is not guaranteed free after service caches expire.

## 9. Cost-reduction opportunities

No implementation changes were made as part of this analysis.

1. **Reuse available coordinates.** Preserve valid subject coordinates during normalization and avoid geocoding comps that already have them. With usable coordinates for all properties, this could save **21 requests and $0.105** at first-paid-tier rates.
2. **Revisit five eager Places searches.** They cost **$0.160** per uncached analysis at the first paid tier. Consider lazy loading or a shared, carefully keyed demand-data cache.
3. **Consolidate RentCast valuation and comps.** The AVM response already includes rental comparables, which the current mapper discards. Prefer evaluating an AVM-first bundle, with the listings endpoint retained when active-only listings are required. Simply skipping unused AVM calls is a lower-change alternative. See the detailed RentCast review below.
4. **Share expensive process-only caches across instances.** Proximity, RentCast ZIP data, and AirDNA are candidates, with appropriate freshness policies.
5. **Separate optional Xome data from analysis completion.** Prewarming shifts request attribution but does not eliminate traffic; open-endpoint access still has bandwidth and operational cost.
6. **Validate provider entitlements.** Realty-in-US is user-confirmed enabled; retain its fallbacks and confirm account pricing/quotas before assigning costs.

## 10. RentCast consolidation, data enrichment, and reuse

This follow-up compares the current integration with RentCast's official endpoint and schema documentation, checked October 16, 2026. These are recommendations, not implemented behavior. Availability of optional fields must be verified using representative fixtures or authorized responses.

### 10.1 Prioritized opportunities

| Priority | Opportunity | Benefit | Important qualification |
| --- | --- | --- | --- |
| P0 | Correct the market-response mapping | Recover rental statistics already paid for, rather than potentially storing zeros | Documented response nests values under `rentalData`; production response not inspected |
| P1 | Use the rent AVM response as a valuation-and-comps bundle | Reduce primary RentCast requests from **3 to 2** while retaining an estimate and supporting comps | AVM comps can be inactive; not equivalent to today's active-only listings query |
| P1 | Persist ZIP market snapshots and property valuation bundles across processes | Reuse data across users, saved analyses, apps, restarts, and dynos | Cache provider facts, not user assumptions; confirm storage/display rights |
| P1 | Retain safe, useful fields from existing responses | Better comp quality, maps, market charts, and property facts without additional calls | Expand typed contracts and explicit public projections, not raw response forwarding |
| P2 | Add complete-query keys and single-flight refreshes | Prevent incorrect cache reuse and concurrent duplicate requests | In-process promises do not deduplicate separate dynos |
| P2 | Reuse a broader listing pool where justified by traffic | Serve multiple nearby subjects from one successful list request | Geographic/query coverage and pagination must be tracked |
| P3 | Evaluate RentCast as a property-data fallback | Potentially reduce reliance on separate property/history sources | Additional call unless records were already loaded; not a drop-in Zillow replacement |

### 10.2 Combine the rent estimate and comparable retrieval

Current primary flow:

```text
/listings/rental/long-term -> active comps
/avm/rent/long-term       -> retain only rent/range; discard comps and subject
/markets                  -> ZIP statistics
```

The documented AVM response already contains:

- `rent`, `rentRangeLow`, and `rentRangeHigh`.
- `subjectProperty`: identity, address, coordinates, and available structural attributes, with some last-sale fields.
- `comparables[]`: rental prices, property attributes, coordinates, listing status/dates, distance, age, and correlation with the subject.

Proposed primary flow:

```text
Cached or fresh AVM bundle -> estimate + selected comps + subject facts
Cached or fresh ZIP data   -> rental AND sale market statistics
Listings endpoint         -> conditional active-listing supplement
Property records endpoint -> explicit on-demand private records
```

**Primary reduction: 3 to 2 successful RentCast requests per uncached analysis (33%).** The full-page primary request scenario becomes **36-37 instead of 37-38**, assuming the listings supplement is not needed and everything else is unchanged.

Controls and behavior decisions:

- AVM comparables are ranked by similarity (`correlation`); the listings endpoint is sorted by recent `lastSeenDate`. These are different datasets/selections.
- Official AVM examples include **inactive** listings. Do not label all AVM comps "currently available rentals"; show status and last-seen age.
- If active-only comps are a product requirement, filter the AVM bundle and conditionally supplement with `/listings/rental/long-term`. Call reduction then depends on the usable active-comp hit rate.
- `maxRadius`, `daysOld`, and `compCount` control AVM selection. Documented `compCount` range is **5-25**. Set values explicitly: documentation prose and embedded schema defaults differ.
- Keep `lookupSubjectAttributes=true` for address-based lookups unless there is a reason not to. Automatic attribute lookup is unavailable for coordinate-only requests.
- Current code sends invented defaults when facts are missing (`bedrooms || 3`, `bathrooms || 2`, `sqft || 1500`), overriding provider lookup; it also turns a valid studio bedroom count of zero into three. A future implementation should distinguish missing values from zero and omit unknown attributes rather than claiming defaults are facts.
- RentCast's multi-family rent AVM is **per unit**, not whole-building income. Do not send building totals as unit attributes or silently use unit rent for the entire building.
- An initial compatibility mode can feed AVM comps into the existing local blending logic. Switching the displayed central estimate directly to the provider AVM is a separate, testable financial-behavior change.
- AVM range is documented as an 85% confidence interval. Keep the provider interval distinct from the platform's local plus/minus-10% range; comp correlation is similarity, not statistical confidence.
- If AVM fails, retain active-listing/other-provider/local fallbacks. Record attempts and result provenance.

**Lower-change alternative:** keep the listings-first flow and call AVM only if usable comps are absent. This removes an often-unused request but does not capture the AVM bundle's extra information.

### 10.3 Recover market data already returned

The current `/markets` request sets `zipCode` and `historyRange=12`, but not `dataType`. Official documentation states that omitted `dataType` defaults to **All**, returning:

```text
saleData:   price statistics, inventory, listing durations, breakdowns, history
rentalData: rent statistics, inventory, listing durations, breakdowns, history
```

The current parser instead reads top-level `medianRent`, `averageRent`, `totalListings`, and `history`, and expects history to be an array. Documented rental history is an object keyed by `YYYY-MM` under `rentalData.history`.

**Likely correctness issue:** a successful response matching the documented schema yields zero-valued statistics and a "stable" trend in the current mapper, then caches that object for seven days. Fixing this is higher priority than adding a new market-data request. This conclusion is based on code versus documentation, not a live production response.

Recommended mapping:

- Read rental metrics from `rentalData`, separately preserving `saleData`.
- Keep provider `lastUpdatedDate`, local `fetchedAt`, geographic scope, and available sample counts.
- Sort history by month/date and handle gaps explicitly.
- Calculate YoY only with observations approximately 12 months apart. A first/last comparison over twelve entries can span eleven months, not a year. Request enough history (for example 13 months), verify actual dates, and report unavailable growth rather than inventing it when coverage is insufficient.
- Distinguish missing metrics from real zero values. An absent rental section must not become a confident zero-dollar market.
- Invalidate/version previously cached malformed projections when correcting the mapper.

Useful data from the same successful request:

| Available data | Platform use |
| --- | --- |
| `rentalData.dataByBedrooms` | Compare subject rent against matching bedroom-count benchmarks |
| `rentalData.dataByPropertyType` | Compare against a relevant property-type market instead of a mixed ZIP average |
| Rent per square foot | Property-size-adjusted benchmarks and comparable calibration |
| Rent history | Rental-market charts and observed growth, separate from user growth assumptions |
| New/total listings and days on market | Supply and marketing-duration indicators with clear definitions |
| `saleData` and its breakdowns/history | ZIP asking-price context, price-per-square-foot benchmarks, market comparison |

Bedroom and property-type groups are separate marginal breakdowns; do not claim a joint "three-bedroom single-family" segment unless actually supported by the data. ZIP averages are not neighborhood appraisals.

RentCast market statistics are derived from **listing** data. Sale asking-price trends do not replace recorded-sale evidence, Zillow ZHVI, sale-to-list ratios, or Xome auction data. Rental days on market is not occupancy, vacancy, or time-to-signed-lease. Do not remove other providers until feature coverage and semantics are compared.

### 10.4 Preserve more from existing responses

| Existing response | Currently retained | Additional useful data | Possible platform use |
| --- | --- | --- | --- |
| Rent AVM | Three rent numbers | Subject ID/address/coordinates/facts; AVM comps; distance, age, correlation, status | Rental comp maps, source transparency, subject-fact gap filling, quality filtering |
| Rental listings | Address, rent, beds, baths, sqft | Stable ID, coordinates, property type, listing dates/status, days on market, listing history when supplied | Deduplication, recency labels, rent-change timelines, reusable local listing pools |
| ZIP market | Six scalar metrics, with mapping concerns above | Both market sections, time series, segment statistics, update dates | Shared market dashboards, comparison context, segment-aware rent benchmarks |
| Property records, when explicitly loaded | Owner fields and sale history | Coordinates, structural facts, `hoa.fee`, `propertyTaxes[year].total`, assessments, features | Tax/HOA gap filling, property fact checks, richer authorized detail view |

Property-record tax assessments include land/improvement values, but those are not automatically acquisition basis or a professional cost-segregation result. County tax history is not a guarantee of the future tax bill.

RentCast AVM subject/comparable coordinates can avoid some new geocoding, but only if obtained before geocoding and matched confidently to the same address/unit. Rental comps are not the same set as Zillow sale comps: this change alone does **not** eliminate all 21 geocoding calls.

Property records are currently fetched on demand after the analysis completes. Using their tax/HOA data later requires explicit re-analysis or an offered update; do not silently overwrite saved assumptions or user overrides.

Do not automatically retain/display listing contacts just because a provider returns them. Retain necessary fields through an allowlist. Ownership/mailing details remain private; public shared analyses must not gain them through nested `property_data`, `analysis_results`, or `rental_comps`. A generic key blacklist is not a sufficient design for expanding these payloads.

### 10.5 Shared cache design

Use a server-side provider cache separate from owner-specific saved analyses. PostgreSQL is already used for persistent market/geocoding caching, so it is an available starting pattern rather than requiring a new cache product.

Suggested freshness policies below are **design proposals**, not verified provider rights or guarantees:

| Dataset | Reuse key | Suggested fresh window | Reuse boundaries |
| --- | --- | --- | --- |
| Rent AVM bundle | Canonical property/unit + all effective AVM inputs + schema/model version | 24 hours | Same property and assumptions used in provider request, not all homes in a ZIP |
| Rental listing entities | Provider property ID + source observation timestamps | 6-24 hours for active status | Share property facts; retain query-coverage metadata separately |
| Listing search result | Complete normalized query including geography, filters, sort, limit, offset | 6-24 hours | Only satisfies queries whose coverage is demonstrated |
| ZIP market snapshot | Provider + ZIP + data type + requested history coverage + schema version | 1-7 days | Share across subjects/users/apps with the same geographic scope |
| Public-record facts | Canonical property/unit + field scope + schema version | 7-30 days | Preserve private-field access controls and explicit refresh |
| Authoritative empty result | Same complete key | Shorter, e.g. 15-60 minutes | Never confuse "no match" with an authentication or provider failure |

Important details:

1. **Canonical identity:** normalize spacing/case and retain unit identifiers; reconcile address aliases to provider IDs without collapsing separate units.
2. **Correct keys:** today's estimate cache uses address only although attributes change the request; the comps key omits bedrooms, bathrooms, limit, and exact geographic query; the market key omits history/data-type coverage. Include those parameters or prove a cached superset can satisfy them.
3. **Shared data, private calculations:** cache provider observations, not user financing, overrides, tenant ownership, sharing settings, or derived assumptions.
4. **Single-flight:** share an in-process pending promise per exact key and use a database-backed refresh lease/lock for cross-dyno deduplication. Recheck after acquiring the lease and bound lease lifetime.
5. **Stale data:** if allowed, serve explicitly labeled stale facts during refresh with an upper stale limit. Do not quietly represent stale or failed refreshes as fresh success.
6. **Provider errors:** do not cache 401/403/429/5xx or malformed data as empty successful results. Surface configuration/rate-limit failures and use controlled retry/backoff.
7. **Refresh semantics:** bypass-cache requests should be explicit, budgeted, and observable. Saved records currently return their persisted snapshot until refresh; adding a provider TTL alone will not refresh that saved snapshot automatically.
8. **History and provenance:** retain source update date, observation date, expiry, endpoint/query version, coverage, and normalization version. Keep immutable analysis snapshots distinguishable from the latest shared facts.
9. **Storage rights:** confirm RentCast retention, cross-user/cross-app display, derived-data use, and deletion requirements before broad persistent reuse. The reviewed billing docs establish per-request billing, not unlimited redistribution rights.
10. **Eviction:** bound cache size/retention and index identity/expiry fields; current in-memory Maps are not a long-term provider-data store.

### 10.6 Broader listing pools: more data per successful call

RentCast documents up to **500 records per page** for rental listings and property records. Its billing documentation states that a successful HTTP 200 response with a body counts as **one request regardless of returned data volume**; non-200 error responses are not billed.

Therefore, selectively requesting more than the current ten listings can improve reuse without increasing successful-request count for that page. It still increases payload, processing, storage, and privacy responsibilities.

Potential pattern:

- Retrieve a bounded area pool only where demand justifies it.
- Store listing entities once by provider ID.
- Track the query's geography, filters, page offsets, result count, timestamps, and whether coverage is complete.
- Select subject-specific comps locally by distance, size, beds, type, freshness, and plausibility.
- Preserve an explicit distinction between locally selected comps and a RentCast-generated AVM.

Do not treat the most recent ten listings as a complete ZIP dataset or use them to calculate authoritative ZIP statistics. A capped 500-row page is also incomplete when more results exist; each additional page is another request. Do not use a subject A radius search as complete coverage for subject B unless the requested region and filters actually cover B's required search.

RentCast's documented endpoints do not establish a single arbitrary multi-property AVM batch request. Area searches combine returned records, not independent rent estimates for many subject homes.

### 10.7 Quantified savings

Let `N` be new analyses and `U` the number of distinct fresh-window ZIP market cache fills.

| Design | Approximate successful RentCast requests |
| --- | ---: |
| Current all-cold primary path | `3N` |
| AVM bundle + uncached market each time | `2N` |
| AVM bundle + shared ZIP market cache | `N + U` |
| Above with repeated property/input reuse | Distinct valuation-bundle misses + market misses + conditional supplements |

Example: **1,000 analyses over 100 ZIPs**, all within one market freshness window, distinct valuation inputs, no fallbacks, no active-listing supplements:

- Current all-cold counterfactual: **3,000** requests.
- AVM consolidation alone: **2,000**.
- Consolidation plus one shared market fill per ZIP: **1,100**, a **63.3% reduction** versus the all-cold counterfactual.
- Current same-process ZIP caching can already achieve some of this market reuse. Do not attribute all 900 market calls saved to new work if existing caches already hit.

Marginal value of eliminating 1,900 over-quota requests:

| Plan | Savings at published overage rate |
| --- | ---: |
| Developer | $380.00 |
| Foundation | $114.00 |
| Growth | $57.00 |
| Scale | $28.50 |

These are overage equivalents, not guaranteed invoice reductions; fixed fees and included quotas remain. For example, Foundation's actual request bill changes from **$194 at 3,000 requests to $80 at 1,100**, while Growth stays **$199** inside its quota. Use existing cache hit rates to calculate the incremental benefit.

### 10.8 Recommended implementation sequence and acceptance criteria

1. **Validate and correct market mapping.** Add sanitized fixtures for nested sale/rental data, object history, missing sections, null metrics, and gaps. Confirm no zero-filled success on unsupported shapes.
2. **Introduce a typed AVM bundle behind a behavior flag.** Preserve existing financial logic initially; compare usable comp coverage, active status, rent estimates, latency, and fallbacks before changing defaults.
3. **Implement shared provider snapshots and refresh coordination.** Keep provider data separate from analysis ownership and assumptions.
4. **Expose selected enriched fields.** Start with comp provenance/recency/maps and market trends; extend shared types and explicit private/public contracts.
5. **Measure before expanding area pools or replacing providers.** Retain only fields with a defined use and approved retention.

Verification should include:

- Exactly one AVM request and no listings request when the bundle satisfies the configured comp policy.
- A listings supplement only when required, and preserved fallbacks when AVM fails.
- Stable behavior for studios, unknown attributes, multi-family unit inputs, and address/unit aliases.
- Correct cache misses for changed bedrooms/sqft/radius/history coverage.
- One upstream refresh for concurrent identical misses, including requests handled by separate server processes.
- Correct expiration, explicit refresh, stale labeling, error reporting, and authoritative empty-result handling.
- Unchanged user overrides and no private/contact fields in shared/public analysis output.
- Vendor billable-call metrics distinguished from total HTTP attempts.

## 11. What is needed to verify production unit cost

1. Confirm the deployed revision and provider/feature configuration without exposing credential values.
2. Confirm RentCast's enabled status and plan, plus actual RapidAPI account quotas, endpoint weights, unsuccessful-request billing, and bandwidth treatment.
3. Add per-analysis correlation IDs to outbound request accounting: provider, endpoint, cache layer/hit, status, fallback reason, duration, and billable units.
4. Do not log authorization headers, keys, or credential-bearing URLs.
5. Reconcile request accounting against provider dashboards and Google billing by SKU.
6. Separate new analyses, saved views, record refreshes, re-analysis, comparisons, chat, startup warming, and failed attempts.
7. Report both cost per attempt and cost per completed analysis.
8. Use isolated controlled cache misses to validate cold behavior; do not clear production caches or generate unapproved paid traffic.

Saved `dataSources` describes the selected result source, not every attempted provider request. It is not a billing ledger.

## 12. Sources and validation

### Repository evidence

- [Analysis submission and saved-slug navigation](packages/property-analyzer-core/src/components/PropertyAnalyzer.tsx)
- [Analysis orchestration, ownership records, and re-analysis](server/src/routes/propertyAnalyzer.ts)
- [Input resolution and property fallback](server/src/services/propertyInputResolver.ts)
- [Zillow lookups, normalization, enrichment, and comparables](server/src/services/propertyDataService.ts)
- [Persistent market cache and ZIP retries](server/src/services/areaMarketService.ts)
- [RentCast calls and configuration gates](server/src/services/rentCastService.ts)
- [AirDNA primary and fallback requests](server/src/services/airDnaService.ts)
- [Google Places proximity searches](server/src/services/mtrEstimationService.ts)
- [Furnished Finder requests and endpoint caveats](server/src/services/furnishedFinderService.ts)
- [Geocoding cache, batch logic, and fallback chain](server/src/services/geocodingService.ts)
- [Realty-in-US fallback requests](server/src/services/realtyInUsService.ts)
- [Xome requests, caching, and prewarming](server/src/routes/xome.ts)
- [Automatic market snapshot](packages/property-analyzer-core/src/components/RentalTabs.tsx)
- [Automatic foreclosure search](packages/property-analyzer-core/src/components/ForeclosureCard.tsx)
- [On-demand ownership records](packages/property-analyzer-core/src/components/OwnershipHistory.tsx)
- [OSM tile display](packages/property-analyzer-core/src/components/MapView.tsx)
- [Wrapper feature flags](apps/property-analyzer/src/wrapper/AssetDashboardAnalyzerContext.tsx)

### Pricing evidence

Public prices checked October 16, 2026:

- [Private-Zillow pricing](https://rapidapi.com/oneapiproject/api/private-zillow/pricing)
- [AirDNA pricing](https://rapidapi.com/s.mahmoud97/api/airdna1/pricing)
- [Google Maps global pricing](https://developers.google.com/maps/billing-and-pricing/pricing), specifically Geocoding and Legacy Places - Nearby Search.
- [RentCast API pricing](https://www.rentcast.io/api)
- User-supplied subscription screenshot confirms both $20 PRO plans; user clarification establishes the $0 direct API assumption for Xome.

### RentCast schema and consolidation evidence

- [Rent estimate endpoint](https://developers.rentcast.io/reference/rent-estimate-long-term): estimate, subject attributes, comparables, and selection parameters.
- [Property valuation schema](https://developers.rentcast.io/reference/property-valuation-schema): range confidence, coordinates, distance, recency, and correlation.
- [Property valuation behavior](https://developers.rentcast.io/reference/property-valuation): automatic attribute lookup and per-unit multi-family rent semantics.
- [Rental listings](https://developers.rentcast.io/reference/rental-listings-long-term): active/inactive listings, sorting, and up to 500 listings per page.
- [Property listings schema](https://developers.rentcast.io/reference/property-listings-schema): listing attributes, dates, status, history, and contacts.
- [Market statistics endpoint](https://developers.rentcast.io/reference/market-statistics): default All data type and nested sale/rental sections.
- [Market data schema](https://developers.rentcast.io/reference/market-data-schema): segment breakdowns, object-keyed monthly history, and listing-based metric definitions.
- [Property records](https://developers.rentcast.io/reference/property-records) and [property data schema](https://developers.rentcast.io/reference/property-data-schema): property facts, taxes, assessments, HOA, ownership, and sale history.
- [Billing and pricing](https://developers.rentcast.io/reference/billing-and-pricing): successful-request billing independent of response volume; non-200 responses not billed.

Counts were traced through route orchestration, provider fetch sites, and automatic component effects. Arithmetic was checked with local Node calculations. This document is a static scenario model, not a production trace, invoice reconciliation, or load test.
