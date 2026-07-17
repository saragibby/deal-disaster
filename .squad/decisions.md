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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
