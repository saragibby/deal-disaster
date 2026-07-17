# Squad Decisions

## Active Decisions

### 2026-07-11T09:33:01.468-04:00: Property Analyzer wrapper sequencing baseline (consolidated)
**By:** Scribe
**What:** Property Analyzer external-wrapper work begins with a contract/tenancy/compatibility-baseline phase. The dependency-aware order starts with deterministic Property Analyzer E2E fixtures (#6), then the expanded golden E2E compatibility gate (#7), before shared contract types (#8), compatibility shims, OwnerContext/backend tenancy, schema/cache migrations, wrapper adapters, and core extraction issues (#19-#27) proceed.
**Why:** Fixtures and golden compatibility coverage establish a stable behavioral baseline for both the existing app and future wrappers, reducing extraction risk and giving downstream issues a regression gate before API contracts and core package boundaries change. The team review converged that the core + thin wrappers direction is sound only if reusable core boundaries have zero Asset Dashboard assumptions, all integration seams are explicit, backend work starts from factory router/OwnerContext patterns, provider data sharing has tenant/cache policy boundaries, and final validation includes dual-wrapper compatibility coverage.

### 2026-07-15T19:24:31.031-04:00: Investor Lab uses server-side Xome routes
**By:** Blake, Moss, Levene
**What:** Investor Lab now calls the real server-side Xome integration for foreclosure search and market trend data. The wrapper overrides `searchForeclosures()` to POST `/api/investor-lab/xome/search` and `getMarketTrends()` to GET `/api/investor-lab/xome/market-trends`; the backend mounts the Xome router under `/api/investor-lab` with runtime auth instead of stubbing these routes.
**Why:** This lets Investor Lab pull live Xome foreclosure and market trend data while keeping Xome credentials and provider access on the server side. It preserves Investor Lab dev auth behavior and avoids exposing provider credentials to the frontend.

### 2026-07-17T12:49:38.523-04:00: Investor Lab branding must stay wrapper-scoped and additive
**By:** Williamson
**What:** Investor Lab rebrand work must treat `packages/property-analyzer-core` as shared by both `apps/property-analyzer` and `apps/reference-saas-wrapper`. Theme changes should be introduced additively behind wrapper scoping such as `themeClassName` and opt-in tokens/overrides instead of global `:root` rewrites or core-wide default brand swaps. Any branding API or prop expansion that reaches the core must update the shared contracts and both wrapper implementations together.
**Why:** Planning analysis confirmed the analyzer core is consumed by two apps, and some views already bypass wrapper scoping paths. A global brand change in the core would risk regressions in the existing Property Analyzer experience and create wrapper divergence. Additive, wrapper-scoped theming preserves reuse while still allowing the Investor Lab brand refresh.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
