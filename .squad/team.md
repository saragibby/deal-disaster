# Squad Team

> deal-disaster

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Roma | Lead | .squad/agents/roma/charter.md | 🏗️ Active |
| Blake | Frontend Dev | .squad/agents/blake/charter.md | ⚛️ Active |
| Moss | Backend Dev | .squad/agents/moss/charter.md | 🔧 Active |
| Williamson | Data/Integration Engineer | .squad/agents/williamson/charter.md | 📊 Active |
| Levene | Tester | .squad/agents/levene/charter.md | 🧪 Active |
| Scribe | Session Logger | .squad/agents/scribe/charter.md | 📋 Always-on |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Always-on |
| Rai | RAI Reviewer | .squad/agents/Rai/charter.md | 🛡️ Always-on |
| Fact Checker | Fact Checker | .squad/agents/fact-checker/charter.md | 🔍 Always-on |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Project:** deal-disaster
- **Created:** 2026-07-11
- **Owner:** Sara Gibbons
- **Stack:** npm workspaces monorepo, Node 24.x, TypeScript, React + Vite frontends, Express backend, PostgreSQL via raw SQL, Playwright E2E tests
- **Apps:** dashboard, deal-or-disaster game, property-analyzer
- **Shared packages:** shared-types, shared-auth, shared-ui
