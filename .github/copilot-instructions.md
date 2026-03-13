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

Tests auto-start three dev servers (backend :3002, dashboard :5200, game :5201). Email tests require [MailPit](https://mailpit.axllent.org/) on localhost:1025.

## Architecture

### Monorepo Layout

```
packages/          → Shared libraries (build first)
  shared-types/    → TypeScript interfaces for the entire platform
  shared-auth/     → AuthProvider context, ApiService (all API calls), SSO helpers
  shared-ui/       → AppShell layout, AskWill chatbot, Footer, GameCard

apps/              → Three React + Vite + TypeScript frontends
  dashboard/       → Portal hub: game nav, leaderboards, resources, admin (route: /)
  deal-or-disaster/→ Foreclosure evaluation game with timed challenges (route: /deal-or-disaster)
  property-analyzer/→ Investment analysis: ROI, comps, maps, PDF export (route: /property-analyzer)

server/            → Express + PostgreSQL backend (no ORM, raw SQL via pg)
  src/routes/      → 10 route files (auth, game, chat, portal, property, analyzer, etc.)
  src/services/    → Business logic (chat, property data, email, foreclosure generation, AI)
  src/middleware/   → JWT auth (authenticateToken, authenticateOptional) and admin auth
  src/db/          → Connection pool and table setup/migrations
  src/scripts/     → Admin CLI tools (makeAdmin, generateNewCase, etc.)

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

### Authentication

- **Email/password**: Register → email verification (24h token) → login → JWT
- **OAuth**: Google and Microsoft via Passport.js → JWT
- **Cross-app SSO**: Dashboard appends token + user as URL params → child app injects into localStorage
- **Middleware**: `authenticateToken()` requires valid JWT; `authenticateOptional()` validates if present but doesn't reject anonymous requests
- **Token storage**: localStorage (token + user JSON), auto-logout on 401/403

### Production Serving

Express serves all built frontends as static files with route-based mapping:
- `/deal-or-disaster/*` → Deal or Disaster dist
- `/property-analyzer/*` → Property Analyzer dist
- `/*` → Dashboard dist (catch-all)

Deployed to Heroku via `heroku-postbuild` script + `Procfile`.

## Key Conventions

- **TypeScript strict mode** across the entire stack. All shared types live in `packages/shared-types/src/index.ts`.
- **No ORM** — the server uses raw SQL with the `pg` library. Database setup is in `server/src/db/setup.ts` with dynamic table creation.
- **All API calls go through `ApiService`** in `shared-auth`. Do not create per-app API clients. The service handles auth headers, token refresh, and streaming.
- **State management is intentionally simple**: React Context for auth (`AuthProvider`), `useState` for everything else. No Redux or external state library.
- **Shared packages must build before apps** — `shared-types` first, then `shared-auth` (depends on types), then `shared-ui` (depends on both). The root `build:packages` script handles this order.
- **Route files in `server/src/routes/`** handle request parsing and responses. Business logic belongs in `server/src/services/`.
- **Environment variables**: Frontend uses `VITE_` prefix (e.g., `VITE_API_URL`). Backend env is in `server/.env`. See `server/.env.example` for required variables.
- **E2E test helpers** (`e2e/helpers.ts`) provide `loginViaAPI()` and `registerUserViaAPI()` to bypass UI for test setup. Use these instead of driving the login form in non-auth tests.
