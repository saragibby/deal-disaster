# Copilot Instructions for Deal Platform

## Build & Run

This is an **npm workspaces** monorepo (Node 24.x). Packages must build before apps.

```bash
# Install all workspace dependencies from root
npm install

# Development (all services concurrently)
npm run dev

# Development (individual)
npm run dev:server      # Express backend on :3002
npm run dev:dashboard   # Portal hub on :5200
npm run dev:game        # Deal or Disaster game on :5201
npm run dev:analyzer    # Property Analyzer on :5202

# Build (order matters: packages → apps → server)
npm run build           # Full build
npm run build:packages  # shared-types → shared-auth → shared-ui
npm run build:apps      # All three frontend apps
npm run build:server    # Express backend

# Database
cd server && npm run db:setup   # Create/migrate PostgreSQL tables
```

### Testing

E2E tests only (no unit test suite). Tests use Playwright against running dev servers.

```bash
npm run test:e2e               # Headless Chromium
npm run test:e2e:headed        # Visible browser
npm run test:e2e:ui            # Interactive Playwright UI
npx playwright test e2e/auth.spec.ts              # Single test file
npx playwright test -g "should show login form"   # Single test by name
npm run test:seed              # Seed E2E test user
```

Tests auto-start three dev servers (backend :3002, dashboard :5200, game :5201). Email tests require [MailPit](https://mailpit.axllent.org/) on localhost:1025. Global setup (`e2e/global-setup.ts`) seeds a test user and clears the Mailpit inbox before each run.

## Architecture

### Monorepo Layout

```
packages/          → Shared libraries (build first)
  shared-types/    → TypeScript interfaces for the entire platform
  shared-auth/     → AuthProvider, useAuth hook, ApiService (all API calls), SSO helpers
  shared-ui/       → AppShell layout, AskWill chatbot, Footer, GameCard (components only)

apps/              → Three React + Vite + TypeScript frontends
  dashboard/       → Portal hub: game nav, leaderboards, resources, admin (port :5200, route: /)
  deal-or-disaster/→ Foreclosure evaluation game with timed challenges (port :5201, route: /deal-or-disaster)
  property-analyzer/→ Investment analysis: ROI, comps, maps, PDF export (port :5202, route: /property-analyzer)

server/            → Express + PostgreSQL backend (no ORM, raw SQL via pg)
  src/routes/      → Route files (auth, game, chat, portal, property, analyzer, etc.)
  src/services/    → Business logic (chat, property data, email, foreclosure generation, AI)
  src/middleware/   → JWT auth (authenticateToken, authenticateOptional) and requireAdmin
  src/db/          → Connection pool, table setup, and migrations (SQL files)
  src/scripts/     → Admin CLI tools (makeAdmin, generateNewCase, etc.) — run via `npm run <script>` in server/

e2e/               → Playwright E2E tests (auth flows, SSO, email verification)

src/               → ⚠️ LEGACY — deprecated copy of the game. Do not modify; use apps/deal-or-disaster/ instead.
```

### Data Flow

All three frontend apps share one auth context and one API service from `shared-auth`:

1. Components call methods on `ApiService` (from `@deal-platform/shared-auth`)
2. ApiService makes authenticated fetch requests to Express routes on `:3002`
3. Routes delegate to service files for business logic
4. Services query PostgreSQL directly (raw SQL, no ORM)
5. Responses flow back through the component tree via `useState` / context updates

For long-running operations (e.g., chat), the server uses **SSE streaming**: set `Content-Type: text/event-stream` headers, send chunks via `res.write('data: ...\n\n')`, and end with `data: [DONE]`.

### Authentication

- **Email/password**: Register → email verification (24h token) → login → JWT
- **OAuth**: Google and Microsoft via Passport.js → JWT
- **Cross-app SSO**: Dashboard appends token + user as URL params → child app injects into localStorage
- **Middleware**: `authenticateToken()` requires valid JWT; `authenticateOptional()` validates if present but doesn't reject anonymous requests; `requireAdmin` gates admin-only endpoints
- **Token storage**: localStorage (token + user JSON), auto-logout on 401/403

### Production Serving

Express serves all built frontends as static files with route-based mapping:
- `/deal-or-disaster/*` → Deal or Disaster dist
- `/property-analyzer/*` → Property Analyzer dist
- `/*` → Dashboard dist (catch-all)

Deployed to Heroku via `heroku-postbuild` script + `Procfile`.

## Key Conventions

### TypeScript & Modules
- **TypeScript strict mode** and **ES modules** (`"type": "module"`) across the entire stack.
- All shared types live in `packages/shared-types/src/index.ts`. Import from `@deal-platform/shared-types`.
- Shared packages must build before apps: `shared-types` → `shared-auth` → `shared-ui`. The root `build:packages` script handles this order.

### Server Patterns
- **No ORM** — raw SQL with the `pg` library. Always use parameterized queries: `pool.query('SELECT * FROM users WHERE id = $1', [id])`.
- **Route files** (`server/src/routes/`) handle request parsing, validation, and responses. Business logic belongs in `server/src/services/`.
- **Inline validation** at route entry — check required fields with `if (!field)` and return `400` immediately. No separate validation library.
- **Error responses** use `{ error: 'message' }` format. Standard status codes: `400` (bad input), `401/403` (auth), `409` (conflict/duplicate), `500` (unexpected). All route handlers wrap logic in `try/catch`.
- **Route typing**: Routes define scoped request interfaces extending `AuthRequest` (e.g., `ChatRequest extends AuthRequest`). Client timezone is sent via the `X-User-Timezone` header.
- **Database migrations** are SQL files in `server/src/db/migrations/`. Index naming convention: `idx_<table>_<column>`.

### Frontend Patterns
- **All API calls go through `ApiService`** in `shared-auth`. Do not create per-app API clients.
- **State management is intentionally simple**: React Context for auth (`AuthProvider`), `useState` for everything else. No Redux or external state library.
- **CSS**: One `.css` file per component (not CSS modules). App-specific styles live alongside their components.
- **Environment variables**: Frontend uses `VITE_` prefix (e.g., `VITE_API_URL`). Backend env is in `server/.env`. See `server/.env.example` for required variables.

### Property Analyzer Core Guardrails
- `@deal-platform/property-analyzer-core` must stay reusable and adapter-driven. It may import React, analyzer UI dependencies, and `@deal-platform/shared-types`, but it must not import app wrappers, server code, dashboard shell code, or auth globals directly.
- Forbidden dependency categories for analyzer core:
  - Dashboard or Property Analyzer app wrapper code from `apps/*`, including dashboard routes, navigation, shell state, or local route assumptions.
  - Shared auth globals from `@deal-platform/shared-auth`, including `AuthProvider`, `useAuth`, the singleton `api`, token storage, or SSO/localStorage assumptions.
  - Platform shell UI from `@deal-platform/shared-ui`, including `AppShell`, shared navigation, footer/chat chrome, or dashboard-owned layout.
  - Server routes, middleware, database services, or Express-only modules from `server/*`.
  - Browser persistence/navigation globals that imply platform coupling, including `localStorage`, `sessionStorage`, `document.cookie`, and dashboard route reads/writes via `window.location`.
- Run `npm run check:property-analyzer-guardrails` from the repo root before changing analyzer extraction boundaries. This check is also part of `packages/property-analyzer-core` builds.
- When reviewing Property Analyzer extraction PRs, confirm new behavior is passed through explicit core adapters/contracts instead of importing dashboard/auth/platform shell modules directly.
- The top-level `src/` directory is a deprecated legacy game copy. Do not modify it for Property Analyzer extraction or guardrail work.

### Testing Conventions
- **E2E test helpers** (`e2e/helpers.ts`) provide `loginViaAPI()`, `registerUserViaAPI()`, and `clearAuth()` to bypass UI for test setup. Use these instead of driving the login form in non-auth tests.
- Tests run sequentially (`workers: 1`, `fullyParallel: false`) against Chromium only.
