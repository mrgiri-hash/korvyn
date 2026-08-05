# Korvyn

An enterprise finance / accounting / capital-intelligence layer that sits **on top of an
ERP**. The ERP is the system of record; Korvyn reads it and adds visibility, workflow,
controls, close, reconciliation, analytics, and AI. It never posts routine ERP transactions.

**Product thesis:** own the construction-in-progress → placed-in-service (CIP → PIS)
determination-and-defense layer — the ASC 360 / 835-20 capitalization judgment between
project-cost systems and the GL.

> Working guidance for this repo lives in [`CLAUDE.md`](CLAUDE.md). Read it before editing.

## Layout

```
Korvyn/
├─ apps/                      runnable prototypes (single-file HTML, no build step)
│   ├─ dashboard/             the original illustrative dashboard
│   │   └─ korvyn_dashboard.html
│   └─ review/                the Financial Review Platform (current front-end)
│       ├─ index.html         ← the active file
│       └─ mocks/             design explorations, kept for reference
├─ packages/                  real TypeScript libraries
│   ├─ core/                  canonical GAAP domain model + ERP integration boundary
│   └─ agent/                 server-side LLM agent over the domain (tools, approvals)
├─ design-system/             the canonical UI system (one home)
│   ├─ design-tokens.css      the ONLY colors / fonts / spacing allowed
│   ├─ design-system.md       the rules
│   └─ design-system-preview.html
├─ assets/                    brand (logo)
├─ tools/                     repo-wide tooling
│   └─ check_chrome_themes.mjs
└─ archive/                   superseded snapshots (git-ignored)
```

`apps/` are prototypes; `packages/` are the real code. They share **no runtime code** — the
one bridge is build-time and one-directional (see `packages/core` below).

## The pieces

### `apps/review/index.html` — Financial Review Platform *(active work)*
A single self-contained HTML file. The unit of work is a **Financial Review Package**, not a
module; every review opens a consistent workspace (Executive Summary · AI Analysis · Trend ·
Reconciliation · Drilldown · Workpapers · Evidence · Journal Entries · Discussion · History ·
Approvals · Audit Readiness). Flux review is the most developed surface. Just open the file in
a browser — no build, no dependencies.

### `apps/dashboard/korvyn_dashboard.html` — the original prototype
The earlier single-file dashboard for a fictional data-center / CRE REIT ("Meridian Global
Portfolio"): Accounting, Fixed Assets, Procurement, FP&A, Treasury, Reporting. Hardcoded data,
dark/light mode. Open it directly.

### `packages/core` — the domain model
A typed GAAP model (`src/domain`) plus the adapter seam (`src/integration`). The architectural
rule is one-directional: `integration/` may import `domain/`, never the reverse, and no vendor
field name may appear outside an adapter. Money is `bigint` minor units; posting something
unvalidated is a compile error. Also models the CIP→PIS capital-asset lifecycle and a
deterministic multinational GL fixture. The **only** bridge to the dashboard:
`tools/emit_enterprise_gl.mjs` serialises a validated GL snapshot into
`apps/dashboard/korvyn_dashboard.html` (data, not an import).

```bash
cd packages/core && npm install && npm run check   # typecheck + 78 tests + boundary
```

### `packages/agent` — the LLM agent
A separate package so the LLM dependency and API key live server-side. Exposes the domain as
agent tools with human-approval gating, and serves the review UI.

```bash
cd packages/agent && npm install && cp .env.example .env   # paste your Anthropic key
npm run agent      # interactive REPL
npm run dryrun     # exercise all tools with NO API call
npm run serve      # serves apps/review/index.html (REVIEW_UI_PATH to override)
```

## Design system

Gold / teal / navy. `design-system/design-tokens.css` is the only source of colors, fonts, and
spacing; `design-system/design-system.md` is the ruleset. Read both before building or editing
any UI. A condensed pointer sits at the top of `CLAUDE.md`.

## Checks

```bash
node tools/check_chrome_themes.mjs     # dashboard chrome themes pass WCAG AA (10 themes)
cd packages/core && npm run check      # core: typecheck + tests + import boundary
```

## Conventions

- **The ERP is the system of record.** Never build journal-entry creation, approval, or posting.
- **Numbers derive, never duplicate.** If a figure appears twice, derive it once.
- **No dead controls.** If an affordance can't act, don't add it.
- Prototypes stay single-file (`apps/*`); no build step, no external runtime dependencies.

## Git

Requires Node (the checks use `node --test`) and Python (the boundary checker). Node lives at
`~/tools/node22` if it isn't on `PATH`.
