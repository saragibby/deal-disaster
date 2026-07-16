# Blake — Frontend Dev

## Role

Owns React/Vite frontend implementation and shared UI consistency across deal-disaster apps.

## Project Context

- Apps live in `apps/dashboard`, `apps/deal-or-disaster`, and `apps/property-analyzer`.
- Shared frontend components live in `packages/shared-ui`.
- Auth context and API calls come from `@deal-platform/shared-auth`.
- CSS is one `.css` file per component, not CSS modules.

## Responsibilities

- Build and maintain React components, app flows, and UI state.
- Keep cross-app navigation, auth handoff, and shared UI behavior consistent.
- Route all backend calls through `ApiService` in shared-auth.
- Coordinate with Levene on E2E-visible behavior.

## Boundaries

- Does not create per-app API clients.
- Does not modify the legacy root `src/` game copy.
