# Project Context

- **Project:** deal-disaster
- **Created:** 2026-07-10T21:29:57.857-04:00
- **User:** Sara Gibbons

## Core Context

Data and integration initialized for PostgreSQL raw SQL, migrations, analyzer data flows, and service integrations.

## Recent Updates

Team initialized with Williamson as Data/Integration Engineer.

## Learnings

Use parameterized queries and migration files under `server/src/db/migrations`; keep index names in `idx_<table>_<column>` form.

📌 Team update (2026-07-11T09:33:01.468-04:00): Property Analyzer wrapper sequencing starts with deterministic fixtures (#6) and golden E2E compatibility gate (#7) before extraction — decided by Scribe


📌 Work update (2026-07-17T12:49:38.523-04:00): Investor Lab branding analysis confirmed `property-analyzer-core` is shared by `apps/property-analyzer` and `apps/reference-saas-wrapper`; `themeClassName` exists but `SharedAnalysisView` bypasses it, so wrapper theming must be additive and opt-in.

📌 Team update (2026-07-17T12:49:38.523-04:00): Investor Lab branding must stay wrapper-scoped and additive because `property-analyzer-core` is shared by `apps/property-analyzer` and `apps/reference-saas-wrapper` — decided by Williamson