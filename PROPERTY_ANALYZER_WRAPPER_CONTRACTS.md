# Property Analyzer Wrapper Contracts and Compatibility Baseline

Status: accepted baseline for pre-extraction planning

## Context

The Property Analyzer currently runs as an Asset Dashboard sub-application at `/property-analyzer` with shared authentication, shared API access, dashboard entry points, saved analysis history, comparison workflows, PDF/print export, and public shared views. Before moving analyzer code into a reusable `property-analyzer-core`, extraction must preserve these behaviors while defining seams for future SaaS wrappers.

This note defines the wrapper/core boundary, API compatibility strategy, backend ownership model, tenancy rules, share-link policy, cache/provider credential policy, and the golden E2E baseline that should be green before extraction starts.

## Current Asset Dashboard compatibility baseline

### Routes and navigation

| Route | Current behavior to preserve |
| --- | --- |
| `/property-analyzer/` | Authenticated analyzer home. Shows Analyze, Compare, and History navigation. Redirects unauthenticated users to `/login`. |
| `/property-analyzer/analysis/:slug` | Authenticated deep link that loads a saved analysis owned by the current user via `api.getAnalysis(slug)`. |
| `/property-analyzer/compare` | Authenticated comparison selector/dashboard. Supports query-string deep links with `?props=slug1,slug2`. |
| `/property-analyzer/shared/:slug` | Public read-only shared analysis view. Does not require auth; only loads rows where sharing is enabled. |
| Dashboard `/` recent cards | Authenticated dashboard fetches `api.getAnalysisHistory(1, 2)` and links cards to `/property-analyzer/analysis/:slug`. |
| Dashboard tools | Internal tool URLs that start with `/property-analyzer/` use `buildAppUrl()` so same-origin proxying and direct-port fallback keep working. |

The app uses `basename: '/property-analyzer'`; any extracted wrapper must keep route generation relative to a configurable base path while preserving these Asset Dashboard URLs.

### Auth and session behavior

- Auth state comes from `AuthProvider` in `@deal-platform/shared-auth`.
- The authenticated wrapper redirects unauthenticated users to `/login`.
- API calls that require ownership use the auth header generated from localStorage through `ApiService.getHeaders(true)`.
- `ApiService.handleResponse()` treats `401` and `403` as session-expired conditions and delegates to the configured unauthorized handler.
- `buildAppUrl()` returns same-origin paths in production and dashboard-proxied local dev, with token/user URL params only as a direct-sub-app fallback.
- Public shared analysis views may render without auth and must not initialize AskWill with private user context.

### Analyzer behaviors

- Users can enter an address or URL from Zillow, Redfin, Realtor.com, or Trulia.
- `api.runAndSaveAnalysis(url, params?)` posts to `POST /api/analyzer/run`, runs lookup, estimates LTR/MTR/STR, finalizes strategy comparison and verdict, saves the analysis, and returns a full `PropertyAnalysis`.
- Successful analysis navigates to `/analysis/:slug`, making the saved analysis reloadable.
- Results include adjustable loan, rent, operating-cost, furniture, appliance, strategy, and depreciation assumptions.
- User adjustments are auto-saved through `PATCH /api/analyzer/history/:slug/overrides`; saved overrides are reapplied on reload.
- Re-analysis uses `POST /api/analyzer/re-analyze/:slug` and updates the saved analysis in place.
- The result view supports print/PDF export with `html2canvas` and `jsPDF`.
- AskWill receives a summarized property-analysis context from the active result and must remain wrapper-provided, not core-owned.

### History, comparison, and public sharing

- History lists the current user's analyses from `GET /api/analyzer/history?page=&limit=`.
- A single saved analysis loads from `GET /api/analyzer/history/:slug` and is scoped by `user_id`.
- Deleting an analysis uses `DELETE /api/analyzer/history/:slug` and is scoped by `user_id`.
- Sharing is opt-in through `PATCH /api/analyzer/history/:slug/share` with `{ shared: boolean }`.
- Public shared views load `GET /api/analyzer/shared/:slug`, returning only `slug`, `property_data`, `analysis_params`, `analysis_results`, `rental_comps`, and `created_at`.
- Comparison selection can add properties by new analysis, by history selection, or by saved comparison.
- Comparison URLs use private slugs in `?props=slug1,slug2`; they currently require the viewer to own/load each slug.
- Saved comparisons use `/api/comparisons` and are scoped by `user_id`; each comparison stores 2-6 property slugs.
- AI comparison summary/narratives use `/api/ai/comparison-summary` and `/api/ai/property-narratives` with authenticated property slugs.

## Frontend core contract

`property-analyzer-core` should be a framework-level React package that owns analyzer domain UI and pure calculations, but does not own platform auth, API transport, routing roots, shell chrome, localStorage keys, feature availability, or public URL generation.

### Core input

```ts
export interface PropertyAnalyzerCoreProps {
  basePath: string;
  initialRoute: AnalyzerRoute;
  adapters: PropertyAnalyzerAdapters;
  features: PropertyAnalyzerFeatureFlags;
  branding: PropertyAnalyzerBranding;
  shellSlots?: PropertyAnalyzerShellSlots;
  onAnalysisContextChange?: (context: AnalyzerAssistantContext | null) => void;
}

export type AnalyzerRoute =
  | { kind: 'analyze'; slug?: string }
  | { kind: 'history' }
  | { kind: 'compare'; propertySlugs?: string[] }
  | { kind: 'shared'; slug: string };
```

### Core output/events

```ts
export interface PropertyAnalyzerCoreEvents {
  navigate(route: AnalyzerRoute, options?: { replace?: boolean }): void;
  analysisCompleted(analysis: PropertyAnalysis): void;
  analysisUpdated(analysis: PropertyAnalysis): void;
  shareLinkCopied(url: string): void;
  exportStarted(kind: 'analysis-pdf' | 'analysis-print' | 'comparison-pdf' | 'comparison-print'): void;
  error(error: AnalyzerError): void;
}
```

Core must receive persistence and navigation through adapters and emit meaningful events instead of directly manipulating app-global URLs, auth, storage, or shell UI.

## Required wrapper adapters

### Auth adapter

```ts
export interface AnalyzerAuthAdapter {
  getSession(): Promise<AnalyzerSession | null>;
  requireSession(reason: 'private-analysis' | 'history' | 'comparison' | 'export' | 'assistant'): Promise<AnalyzerSession>;
  onUnauthorized(error: unknown): void;
}

export interface AnalyzerSession {
  userId: string;
  email?: string;
  displayName?: string;
  token?: string;
  tenantId?: string;
  roles: string[];
  permissions: AnalyzerPermission[];
}
```

Asset Dashboard implementation: wrap `useAuth()` and `ApiService` unauthorized handling; redirect to `/login` for private routes.

### API adapter

```ts
export interface AnalyzerApiAdapter {
  runAnalysis(input: RunAnalysisInput): Promise<PropertyAnalysis>;
  getHistory(input: PageInput): Promise<PagedResult<PropertyAnalysis>>;
  getAnalysis(slug: string): Promise<PropertyAnalysis>;
  deleteAnalysis(slug: string): Promise<void>;
  reAnalyze(slug: string, params: Partial<AnalysisParams>): Promise<PropertyAnalysis>;
  saveAdjustments(slug: string, payload: SaveAdjustmentsPayload): Promise<void>;
  setShared(slug: string, shared: boolean): Promise<{ slug: string; isShared: boolean }>;
  getSharedAnalysis(slug: string): Promise<PropertyAnalysis>;
  saveComparison(name: string, propertySlugs: string[]): Promise<SavedComparison>;
  getSavedComparisons(input: PageInput): Promise<PagedResult<SavedComparison>>;
  getSavedComparison(id: number): Promise<SavedComparison>;
  updateComparisonSlugs(id: number, propertySlugs: string[]): Promise<SavedComparison>;
  deleteSavedComparison(id: number): Promise<void>;
  getComparisonSummary(propertySlugs: string[]): Promise<{ summary: string; generatedAt: string }>;
  getPropertyNarratives(propertySlugs: string[]): Promise<Array<{ propertyId: string; address: string; narrative: string }>>;
}
```

Asset Dashboard implementation: delegate to `packages/shared-auth/src/ApiService.ts` methods. Future SaaS wrappers can provide their own transport while preserving payload semantics.

### Navigation adapter

```ts
export interface AnalyzerNavigationAdapter {
  currentUrl(): URL;
  toUrl(route: AnalyzerRoute): string;
  navigate(route: AnalyzerRoute, options?: { replace?: boolean }): void;
  external(path: string): string;
}
```

Asset Dashboard implementation: preserve `/property-analyzer` basename, `/analysis/:slug`, `/compare?props=`, `/shared/:slug`, and `buildAppUrl()` for cross-app links.

### Branding adapter

```ts
export interface PropertyAnalyzerBranding {
  productName: string;
  platformName: string;
  logoText?: string;
  homeLabel: string;
  themeClassName?: string;
}
```

Asset Dashboard defaults: product name `Property Analyzer`, platform name `Passive Income Club`, logo text `⚡ Property Analyzer`.

### Shell slots adapter

```ts
export interface PropertyAnalyzerShellSlots {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  assistant?: (context: AnalyzerAssistantContext | null) => React.ReactNode;
  loadingFallback?: React.ReactNode;
  publicSharedBanner?: React.ReactNode;
}
```

Asset Dashboard implementation: wrapper owns App header, `Footer`, and `AskWill`. Core only supplies assistant context.

### Storage adapter

```ts
export interface AnalyzerStorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}
```

Core may use this only for analyzer-scoped UI preferences such as collapsed sections or last selected tab. It must not read or write platform auth keys (`token`, `user`).

### Feature flag adapter

```ts
export interface PropertyAnalyzerFeatureFlags {
  askWill: boolean;
  comparisons: boolean;
  savedComparisons: boolean;
  publicSharing: boolean;
  pdfExport: boolean;
  streetView: boolean;
  aiComparisonSummary: boolean;
  aiPropertyNarratives: boolean;
}
```

Asset Dashboard baseline: all above are enabled except features explicitly disabled by environment variables such as `VITE_DISABLE_ASK_WILL`.

### Share URL builder

```ts
export interface AnalyzerShareUrlBuilder {
  analysis(analysisSlug: string): string;
  publicAnalysis(sharedSlug: string): string;
  privateComparison(propertySlugs: string[]): string;
}
```

Asset Dashboard policy:

- Private analysis deep link: `/property-analyzer/analysis/:slug`
- Public shared analysis: `/property-analyzer/shared/:slug`
- Private comparison: `/property-analyzer/compare?props=slug1,slug2`

## Analyzer API client boundary and compatibility shim

Introduce a new `AnalyzerApiClient` interface that mirrors the API adapter above. The Asset Dashboard compatibility shim should be implemented inside `packages/shared-auth` so existing callers can keep importing `api` while core receives a narrower analyzer-only client.

Compatibility strategy:

1. Keep current `ApiService` analyzer methods and response shapes stable until extraction is complete.
2. Add an `createAnalyzerApiClient(apiService: ApiService): AnalyzerApiClient` factory that maps current snake_case backend fields to the core-facing names only at the boundary when needed.
3. Preserve existing methods as deprecated pass-throughs during migration:
   - `runAndSaveAnalysis`
   - `getAnalysisHistory`
   - `getAnalysis`
   - `deleteAnalysis`
   - `reAnalyze`
   - `toggleShareAnalysis`
   - `saveAnalysisAdjustments`
   - `getSharedAnalysis`
   - saved comparison and AI comparison methods
4. Core code should depend on `AnalyzerApiClient`, not the platform-wide `ApiService`.
5. Do not move general auth, portal, game, resources, tools, or chat methods into analyzer core.

## Backend OwnerContext

Before schema/module extraction, all analyzer-owned backend services should accept an explicit `OwnerContext` instead of reading only `req.userId`.

```ts
export interface OwnerContext {
  actorUserId: string;
  ownerUserId?: string;
  tenantId: string;
  platform: 'asset-dashboard' | 'property-analyzer-saas';
  permissions: AnalyzerPermission[];
  roles: string[];
  requestId?: string;
}

export type AnalyzerPermission =
  | 'analysis:read'
  | 'analysis:write'
  | 'analysis:delete'
  | 'analysis:share'
  | 'comparison:read'
  | 'comparison:write'
  | 'provider-cache:read'
  | 'provider-cache:write'
  | 'admin:tenant';
```

Asset Dashboard mapping:

- `actorUserId` and `ownerUserId` are the authenticated `users.id`.
- `tenantId` is a reserved default tenant, for example `asset-dashboard`.
- `platform` is `asset-dashboard`.
- Permissions are derived from authenticated user/admin status.

Future SaaS mapping:

- `actorUserId` is the logged-in member.
- `ownerUserId` can differ for delegated/team access.
- `tenantId` identifies the SaaS account/workspace.
- Permissions come from tenant membership and plan entitlements.

Backend routes should pass `OwnerContext` into analyzer services and persistence queries. Query predicates should evolve from `WHERE user_id = $1` to owner-aware predicates such as `WHERE tenant_id = $1 AND owner_user_id = $2` while retaining the existing Asset Dashboard migration path.

## Data tenancy categories

| Category | Examples | Tenancy rule |
| --- | --- | --- |
| Global provider cache | Geocoding cache, public market trend responses, normalized provider property payloads without user notes/overrides | Shared across Asset Dashboard and SaaS when provider terms allow it. No user-specific fields. Keyed by normalized provider identity/address plus provider and freshness metadata. |
| Tenant-owned analysis data | Saved analyses, analysis params, user overrides, saved comparisons, share enabled flag | Tenant/user scoped. Never visible across tenants unless a public share token grants read access. |
| User-owned private data | Dashboard recent cards, history list, comparison membership, assistant context, manual adjustments | Scoped to owner user within tenant. Deletion follows user/tenant retention policy. |
| Public shared projection | Read-only shared analysis response | Public only when explicitly enabled. Return a sanitized snapshot, not owner IDs, private overrides metadata beyond rendered numbers, auth tokens, or provider credentials. |
| Provider credentials | Zillow/RentCast/AirDNA/Furnished Finder/RapidAPI keys | Platform/tenant configuration only. Never exposed to frontend or stored on analysis rows. |
| Derived analytics | Aggregate usage, provider hit rates, cache hit rates | Tenant-level or platform-level metrics. Must not leak property addresses across tenants unless aggregated/anonymized. |

## Share-link and route/base policies

- Core routes must be base-path relative. Asset Dashboard continues to use `/property-analyzer`.
- Public shared analysis links should remain stable at `/property-analyzer/shared/:slug` for existing Asset Dashboard links.
- New SaaS wrappers may choose a different public base path, but must implement `AnalyzerShareUrlBuilder.publicAnalysis()`.
- Public shared views should use opaque public identifiers in future schema work. Existing `slug` links can remain as compatibility aliases, but new SaaS shares should prefer non-guessable `share_id` or tokenized slugs.
- Private comparison links using `?props=slug1,slug2` remain authenticated and owner-scoped; they are not public share links.
- If public comparison sharing is introduced later, it must use a separate public comparison token and a sanitized payload, not private analysis slugs.

## Reference SaaS wrapper smoke harness

Issue #26 adds `apps/reference-saas-wrapper` as the Investor Lab wrapper foundation for future SaaS wrapper work. It mounts `@deal-platform/property-analyzer-core` at `/investor-lab/` with injected SaaS adapters, `Investor Lab Analyzer` / `Reference SaaS Platform` branding, and disabled optional features (`askWill`, comparisons, saved comparisons, public sharing, PDF export, Street View, and AI comparison/narrative helpers). Core analysis/history/detail/re-analysis calls use the real analyzer backend under the `investor-lab` tenant/platform, while disabled or not-yet-productized optional surfaces still use local fixture behavior. The wrapper intentionally does not depend on `@deal-platform/shared-auth`, `@deal-platform/shared-ui`, dashboard shell components, or dashboard auth storage.

Run `npm run smoke:reference-saas-wrapper` from the repo root to verify the harness constraints and build it. The regular Asset Dashboard wrapper remains the production wrapper at `/property-analyzer`.

### Productized SaaS wrapper gaps

The Investor Lab wrapper now shares the real analyzer pipeline and database tables for core analysis behavior, but these items are still required before shipping a real standalone SaaS product:

1. Replace mock auth/session adapters with tenant-aware SaaS identity, membership, plan entitlement, and logout flows.
2. Mount the analyzer backend factory with SaaS-specific `OwnerContext` creation, tenant routing, rate limits, and provider/cache policy selection.
3. Add persistent SaaS storage for analyses, comparisons, user overrides, billing/plan state, and opaque public share identifiers.
4. Define production SaaS navigation, marketing/home/profile routes, error pages, loading states, and support/feedback surfaces.
5. Add branded design tokens/assets and accessibility/visual regression coverage for the SaaS shell.
6. Add SaaS E2E coverage for auth, disabled plan features, base-path deep links, sharing policy, comparison entitlements, and export behavior.

## Cache and provider credential sharing policy

Decision: share provider caches between Asset Dashboard and future SaaS only for non-user-specific public/provider data, and keep credentials centrally managed unless a future tenant plan requires bring-your-own-provider keys.

Rules:

- Provider API keys remain server-side and are selected by platform/tenant configuration.
- Cache rows must record provider, normalized cache key, freshness timestamp, source platform, and terms-sensitive metadata.
- User-owned analysis rows store provider-derived snapshots needed for reproducibility, but not credentials or raw private request headers.
- A tenant may read global cache entries but may not read another tenant's saved analyses, overrides, comparisons, dashboard cards, or assistant context.
- Cache invalidation/freshness should be provider-specific; extraction must not make Asset Dashboard and SaaS freshness policies diverge silently.
- If a provider forbids cross-product cache reuse, mark that provider cache as platform-scoped and require separate entries per `platform`.

## Golden E2E smoke tests before extraction

The current `e2e/property-analyzer.spec.ts` covers basic page load, input, invalid URL error, tabs, and empty-input button state. Before extraction starts, expand the golden smoke suite to cover:

1. Authenticated `/property-analyzer/` loads the analyzer shell, header navigation, AskWill availability when enabled, and Analyze/History/Compare tabs.
2. Unauthenticated `/property-analyzer/` redirects to `/login`.
3. Authenticated `/property-analyzer/analysis/:slug` deep link loads a saved analysis owned by the current user.
4. Missing or non-owned `/property-analyzer/analysis/:slug` shows the existing error path and does not expose another user's data.
5. Running an analysis saves history and redirects to `/property-analyzer/analysis/:slug`.
6. History tab lists saved analyses, opens a selected analysis, and deletes an analysis.
7. Share toggle enables public access, copies/builds `/property-analyzer/shared/:slug`, and disabling share makes the public view unavailable again.
8. Public `/property-analyzer/shared/:slug` renders read-only results without auth and hides private controls such as re-analyze, autosave edits, and AskWill private context.
9. Dashboard recent analysis cards load from history and link to `/property-analyzer/analysis/:slug`.
10. Comparison selector can load two saved analyses, update the URL to `/property-analyzer/compare?props=...`, and reload from that URL.
11. Saved comparison create/load/delete flows work and enforce the 2-6 property rule.
12. Comparison share-copy uses the private comparison URL and remains auth-required.
13. Analysis PDF/print export starts without throwing for a saved analysis.
14. Comparison PDF/print export starts without throwing for a comparison dashboard.
15. Cross-app navigation uses `buildAppUrl('/property-analyzer/...')` correctly in dashboard-proxied local dev and production-like same-origin paths.
16. Feature flags can disable AskWill without breaking analyzer rendering.

These tests should be considered compatibility gates; extraction work should not proceed if they fail on the existing Asset Dashboard analyzer.

## Extraction guardrails

- Do not modify or extract from the legacy top-level `src/` game copy.
- Keep shared TypeScript domain types in `@deal-platform/shared-types` until a deliberate type-package split is planned.
- Keep frontend API calls flowing through `packages/shared-auth` for the Asset Dashboard wrapper.
- Keep server routes parameterized and owner-scoped; do not introduce broad unauthenticated analyzer endpoints except public shared views.
- Preserve current persisted response fields while adding future fields behind additive migrations.
