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
├─ index.html                 ← THE MAIN FILE. Just open it in a browser.
├─ apps/                      predecessors, kept for reference (single-file HTML)
│   ├─ dashboard/             the prototype index.html grew out of
│   │   └─ korvyn_dashboard.html
│   └─ review/                the Financial Review Platform (superseded 2026-08-14)
│       ├─ index.html         still the only home of the live GL engine
│       └─ mocks/             design explorations, kept for reference
├─ packages/                  real TypeScript libraries
│   ├─ core/                  canonical GAAP domain model + ERP integration boundary
│   └─ agent/                 server-side LLM agent over the domain (tools, approvals)
├─ design-system/             dated written record of how the UI system got here
│   ├─ design-tokens.css      superseded — the live tokens are in index.html
│   ├─ design-system.md       the rulings and reversals, newest first
│   └─ design-system-preview.html
├─ assets/                    brand (logo)
├─ tools/                     repo-wide tooling
│   └─ check_chrome_themes.mjs
└─ archive/                   superseded snapshots (git-ignored)
```

`index.html` and `apps/` are prototypes; `packages/` are the real code. They share **no runtime
code** — the one bridge is build-time and one-directional (see `packages/core` below).

## The pieces

### `index.html` — the main file *(all active work)*
A single self-contained HTML page, ~24k lines, ~60 views, for a fictional data-center / CRE REIT
("Meridian Global Portfolio"): Accounting, Fixed Assets, Procurement, FP&A, Treasury, Reporting,
plus the capital-lifecycle screens (CIP → PIS) that carry the product thesis. Hardcoded and
illustrative data, except `view-egl`, which reads a GAAP-validated snapshot emitted from
`packages/core`. Light + dark, ten chrome themes. No build, no dependencies — open it directly.

### `apps/review/index.html` — Financial Review Platform *(superseded)*
The unit of work is a **Financial Review Package**, not a module; every review opens a consistent
workspace (Executive Summary · AI Analysis · Trend · Reconciliation · Drilldown · Workpapers ·
Evidence · Journal Entries · Discussion · History · Approvals · Audit Readiness). Flux review is its
most developed surface, and it is the **only** place with a live GL engine — a 152-account REIT chart
that foots. Superseded as the front-end on 2026-08-14; porting that engine into the main file is the
open increment. See [`apps/CONVERGENCE.md`](apps/CONVERGENCE.md).

### `apps/dashboard/korvyn_dashboard.html` — the original prototype
The earlier dashboard that `index.html` descends from. Kept as the ancestor.

### `packages/core` — the domain model
A typed GAAP model (`src/domain`) plus the adapter seam (`src/integration`). The architectural
rule is one-directional: `integration/` may import `domain/`, never the reverse, and no vendor
field name may appear outside an adapter. Money is `bigint` minor units; posting something
unvalidated is a compile error. Also models the CIP→PIS capital-asset lifecycle and a
deterministic multinational GL fixture. The **only** bridge to the UI:
`tools/emit_enterprise_gl.mjs` serialises a validated GL snapshot into the main file's
`<script id="egl-data">` (data, not an import).

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

**"Instrument"** — structured monochrome slate, one cobalt accent, engineered numerics, light +
dark. It lives in the `:root` token layer at the top of `index.html`, which is exhaustively
commented and is the authority. `design-system/design-system.md` is the dated record of how it got
there; `design-system/design-tokens.css` is the superseded gold/teal/navy set. A condensed ruleset
sits at the top of `CLAUDE.md` — read it before any UI work.

## Checks

```bash
node tools/check_chrome_themes.mjs     # index.html chrome themes pass WCAG AA (10 themes)
cd packages/core && npm run check      # core: typecheck + tests + import boundary
```

## Conventions

- **The ERP is the system of record.** Never build journal-entry creation, approval, or posting.
- **Numbers derive, never duplicate.** If a figure appears twice, derive it once.
- **AI narrates, never computes a number.** Every figure comes from an engine; AI explains and cites.
- **No dead controls.** If an affordance can't act, don't add it.
- The main file stays single-file; no build step, no external runtime dependencies.

## Git

Requires Node (the checks use `node --test`) and Python (the boundary checker). Node lives at
`~/tools/node22` if it isn't on `PATH`.
