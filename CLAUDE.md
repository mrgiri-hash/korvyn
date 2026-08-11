# CLAUDE.md — Korvyn monorepo

Orienting guidance for the whole repo. **Working detail lives in a `CLAUDE.md` next to the code** —
Claude Code auto-loads the one for whatever subtree you're editing. Read that one before you edit
there; this file is the map and the shared rules.

| You're working in… | Read |
|---|---|
| **either app — they are being merged** | [`apps/CONVERGENCE.md`](apps/CONVERGENCE.md) (plan + decisions) |
| `apps/review/` — the active front-end, and the one that survives the merge | [`apps/review/CLAUDE.md`](apps/review/CLAUDE.md) |
| `apps/dashboard/` — the original prototype, being folded in | [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md) |
| `packages/core/` — the domain model | [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) · [README](packages/core/README.md) |
| `packages/agent/` — the LLM agent | [`packages/agent/CLAUDE.md`](packages/agent/CLAUDE.md) · [README](packages/agent/README.md) |
| any UI | [`design-system/design-system.md`](design-system/design-system.md) (rules) + [`design-tokens.css`](design-system/design-tokens.css) (the only colors/fonts/spacing) |

## UI / Design System — read before any UI work

**Canonical, go-forward design system for Korvyn UI.** Full rules:
[`design-system/design-system.md`](design-system/design-system.md). Tokens (the ONLY colors, fonts,
spacing values allowed): [`design-system/design-tokens.css`](design-system/design-tokens.css). Read
both before building or editing any screen. If a request conflicts with these rules, follow the
rules and say so.

**Scope note.** This system governs all *new or edited* UI and is being applied in `apps/review/`.
It is a **gold/teal/navy** system and **directly contradicts** the older **cobalt/graphite** system
the dashboard shipped on (documented in [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md), kept
as the record of that app, not a mandate for new work). When the two disagree on new/edited UI, this
block wins.

**Non-negotiable rules**
1. THREE accent colors only: gold (needs attention/pending), teal (approved/matched/tied out), red
   (exception/overdue/unfavorable). Everything else is neutral gray or navy chrome. **No blue accents.**
2. On any data table, color AT MOST two columns — the primary variance and its direction. Gray all
   supporting columns (Organic, FX, CTA, NCI).
3. Subtotal rows outrank detail rows: bold + a 2px heavy bottom border vs. 1px on detail rows.
   Never equal weight.
4. One card per screen REGION, not per table or row. Tables use row hairlines, never card borders or
   per-cell borders. No box-in-box.
5. Badges mean "action required from the user," not "count of items." Inventory counts render as
   quiet gray text.
6. One primary (filled **navy** `--k-ink-900`) button per screen. All others outline.
7. All money, dates, IDs, deltas: monospace (`--k-font-data`), tabular-nums, right-aligned. Chrome
   uses `--k-font-ui` (Inter). Never blend them.
8. Every table and form ships with empty, loading, error, hover, and visible keyboard-focus states —
   not just the happy path.

**Consolidation-scale screens (600+ entities)**
9. The roll-up tree is a status instrument: every node shows its own completion (mini-bar + fraction)
   AND an exception count rolled up from everything beneath it.
10. Tables default to exceptions + material movements only ("5 of 214 lines"); full detail sits
    behind a filter chip.
11. Multi-currency/elim/NCI data lives behind column-set toggles (Local / Reporting / FX-CTA /
    Eliminations / NCI split), never one wide table.

**Two rulings on ambiguities in the token file:**
- It defines gold/teal **and** a separate `--k-success-600` green + `--k-warning-600` orange. Rule 1
  is authoritative: use **teal** for approved/matched and **gold** for pending; do **not** use the
  green/orange tokens as accents.
- The primary button is **navy** (`--k-ink-900`), not teal.

**Before calling any screen done:** run the checklist at the bottom of `design-system/design-system.md`
and report which items pass. Never introduce a color, font, or spacing value not in the token file.

## What's in the repo

```
Korvyn/
├─ apps/                      runnable prototypes (single-file HTML, no build step)
│   ├─ dashboard/             the original illustrative dashboard (korvyn_dashboard.html)
│   └─ review/                the Financial Review Platform  ← ACTIVE FRONT-END
│       ├─ index.html
│       └─ mocks/             design explorations, reference only
├─ packages/                  real TypeScript libraries
│   ├─ core/                  canonical GAAP domain model + ERP integration boundary
│   └─ agent/                 server-side LLM agent over the domain (tools, approvals)
├─ design-system/             the canonical UI system (gold/teal/navy) — one home
├─ assets/                    brand (logo)
├─ tools/                     repo-wide tooling (check_chrome_themes.mjs)
└─ archive/                   superseded snapshots (git-ignored)
```

`apps/` are prototypes; `packages/` are the real code. They share **no runtime code**. The one
bridge is build-time and one-directional: `packages/core/tools/emit_enterprise_gl.mjs` serialises a
validated GL snapshot into `apps/dashboard/korvyn_dashboard.html` (data, not an import).

**Product thesis (keep edits in this lane):** own the construction-in-progress → placed-in-service
(CIP → PIS) determination-and-defense layer — the ASC 360 / 835-20 capitalization judgment between
project-cost systems and the GL. Deliberate non-scope: not a Workiva replacement (no XBRL/EDGAR/MD&A),
not enterprise planning.

## Shared conventions (apply everywhere)

- **The ERP is the system of record.** Korvyn reads it and adds visibility, workflow, controls,
  close, reconciliation, analytics and AI. **Never build journal-entry creation, approval, or
  posting.** (The core *models* journal entries because validating/reconciling them requires
  representing them faithfully — that is not posting.)
- **Numbers derive, never duplicate.** If a figure appears in two places, derive it once. Never scale
  sample data into a headline (see the `RECON_SCALE` cautionary tale in the dashboard CLAUDE.md).
- **No dead controls.** If an affordance can't act, don't add it.
- **AI narrates, never computes a number** — every figure comes from an engine/tool; the AI layer
  only explains and cites.
- **Prototypes stay single-file** (`apps/*`): no build step, no external runtime dependencies.
- **Work incrementally.** Never rebuild or redesign an existing page unless asked.

## Toolchain

**Node is installed but not on `PATH`** — it lives at `C:\Users\mitragiri\tools\node22\` (v22.23.1,
npm bundled). Prepend it or things look broken:

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"
```

Before concluding a tool is absent, search the filesystem, not just `PATH`. Python is also available.

## Checks

```bash
node tools/check_chrome_themes.mjs     # dashboard chrome themes pass WCAG AA (10 themes)
cd packages/core && npm run check      # core: typecheck + 78 tests + import boundary
cd packages/agent && npm run dryrun    # agent: all tools resolve, no API call
```

For `apps/*` the browser-preview sweep is the end-to-end check (drive every tab, assert each view
rendered, console clean) — the per-app CLAUDE.md has the specifics.

## Git

Repo `github.com/mrgiri-hash/korvyn` (private). Requires Node (checks use `node --test`) and Python
(the boundary checker).
