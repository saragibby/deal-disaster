# Project Context

- **Project:** deal-disaster
- **Created:** 2026-07-10T21:29:57.857-04:00
- **User:** Sara Gibbons

## Core Context

Frontend initialized for the Deal Platform monorepo. Primary surfaces are dashboard, Deal or Disaster, Property Analyzer, and shared-ui.

## Recent Updates

Team initialized with Blake as Frontend Dev.

## Learnings

All API access should go through `ApiService` from `@deal-platform/shared-auth`; avoid touching deprecated root `src/`.

📌 Team update (2026-07-11T09:33:01.468-04:00): Property Analyzer wrapper sequencing starts with deterministic fixtures (#6) and golden E2E compatibility gate (#7) before extraction — decided by Scribe

📌 Team update (2026-07-15T19:24:31.031-04:00): Investor Lab now uses server-side Xome routes for foreclosure search and market trends; Xome credentials remain server-side — decided by Scribe

📌 Team update (2026-07-15T19:43:28.059-04:00): Investor Lab sticky header offset fix reduced wrapper header spacing/button padding, restored header z-index above sticky section nav, and kept mobile header compact via hamburger/dropdown behavior — logged by Scribe

📌 Work update (2026-07-15T20:08:31.776-04:00): Investor Lab sticky results nav now sits flush against the wrapper header with no visible gap by offsetting `.results__nav-bar` and extending its background fill; Asset Dashboard/core styles stayed untouched, and `npm run build:reference-saas-wrapper` passed.


📌 Work update (2026-07-17T12:49:38.523-04:00): Investor Lab rebrand feasibility review found hardcoded colors deep in analyzer core styles, font loading via CSS `@import`, no current logo image rendering support, and a shared favicon path across the three apps.

📌 Team update (2026-07-17T12:49:38.523-04:00): Investor Lab branding must stay wrapper-scoped and additive because `property-analyzer-core` is shared by `apps/property-analyzer` and `apps/reference-saas-wrapper` — decided by Williamson