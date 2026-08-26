# CLAUDE.md — Korvyn monorepo

Orienting guidance for the whole repo. **Working detail lives in a `CLAUDE.md` next to the code** —
Claude Code auto-loads the one for whatever subtree you're editing. Read that one before you edit
there; this file is the map and the shared rules.

> **`index.html` at the repo root is the main project file** (owner's direction, 2026-08-14). It is
> the product. Everything under `apps/` is now a predecessor kept for reference — read from them,
> edit them only if asked by name.

| You're working in… | Read |
|---|---|
| **`index.html` — THE main file** | this document, then the file's own token/system comments |
| the merge — which app survives, and why it changed | [`apps/CONVERGENCE.md`](apps/CONVERGENCE.md) (plan + decisions) |
| `apps/review/` — superseded 2026-08-14; still holds the live GL engine | [`apps/review/CLAUDE.md`](apps/review/CLAUDE.md) |
| `apps/dashboard/` — the prototype `index.html` descends from | [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md) |
| `packages/core/` — the domain model | [`packages/core/CLAUDE.md`](packages/core/CLAUDE.md) · [README](packages/core/README.md) |
| `packages/agent/` — the LLM agent | [`packages/agent/CLAUDE.md`](packages/agent/CLAUDE.md) · [README](packages/agent/README.md) |
| any UI | the token layer at the top of [`index.html`](index.html), then [`design-system/design-system.md`](design-system/design-system.md) (written record) |

## Editors and AI tooling

**This file and its four subtree siblings are the source of truth.** Cursor does not read
`CLAUDE.md`, so the same guidance is mirrored into [`.cursor/rules/`](.cursor/rules/) as six
scoped `.mdc` rules:

| Rule | Scope |
|---|---|
| `project.mdc` | always on — the map, the thesis, shared conventions, toolchain, checks |
| `design-system.mdc` | `index.html`, `apps/**/*.html`, `design-system/**` |
| `main-file.mdc` | `index.html` |
| `core.mdc` · `agent.mdc` | `packages/core/**` · `packages/agent/**` |
| `legacy-apps.mdc` | `apps/**` |

Those rules carry the non-negotiables inline and link back here for detail. **When you
change a rule in a `CLAUDE.md`, change it in the matching `.mdc` too** — a mirror that has
drifted is worse than no mirror, because each editor then enforces a different repo.

## UI / Design System — read before any UI work

**The system is the token layer at the top of `index.html`** (`:root`, ~line 20 onward), called
**"Instrument"**: structured monochrome slate, one accent, engineered numerics, light + dark.
It is heavily self-documenting — the comments there explain *why* each value is what it is, and they
are the authority. Read them before editing any screen.

**Scope note (2026-08-14).** This replaces the **gold/teal/navy** system that this block used to
describe. That system, its `--k-*` tokens in
[`design-system/design-tokens.css`](design-system/design-tokens.css), and its "no blue accents" /
"teal for positive" rulings are **withdrawn** — they described `apps/review/`, which is no longer the
main file. `design-system/design-system.md` is kept as the dated record of how the system got here;
where it and `index.html` disagree, **the file wins** and the doc gets a new dated block.

**Non-negotiable rules**
1. **The ramp is the palette.** Twelve neutral steps (`--n-0` … `--n-900`) carry the whole
   instrument. If a new hue seems necessary, the answer is a different ramp step.
2. **ONE accent: cobalt `--accent` `#2F62D4`**, and it carries interaction. `--accent-2` (teal-slate)
   is admitted for the "incurred/actual" measure alone. Indigo `--ai` is reserved for AI surfaces
   (Ask Korvyn, Insight, generated recommendations) and must never become a second UI accent.
3. **Red / amber / green are STATE ONLY** — never decoration, never a series colour. Series step
   through the ramp into the accent (`--series-1` … `--series-4`).
4. **Two planes, named by role, not lightness:** content (the ramp) and chrome (`--chrome-*`).
   Chrome is a true *neutral*, never blue-tinted; header and sidebar share one base and separate by
   a hairline, never by lightness. Chrome themes are gated by `tools/check_chrome_themes.mjs`.
5. **Separation is lightness and hairlines, never shadow.** Shadow is reserved for true overlays —
   popovers, menus, modals, drawers. Cards, panels, tables and strips are flat.
6. **Six type sizes and only these six** (`--fs-label` … `--fs-page`). `--fs-micro` is for counts and
   badge numerals that carry no sentence, never prose. `--fs-hero` has exactly one caller.
7. **TWO font weights: 400 and 500.** The 11px uppercase label is a treatment of size, tracking and
   colour — not weight. Spacing is the 4px scale (`--s-1` … `--s-12`).
8. Severity is a 3px left border and nothing else — never a dot, never a pill, never both.
   Provenance dots are the one element allowed semantic colour at rest, and only when stale or
   unreachable, so a healthy screen stays monochrome.

**Rules carried forward unchanged from the previous system** (they are about structure, not colour,
and still hold)
9. On any data table, colour AT MOST two columns — the primary variance and its direction. Gray all
   supporting columns (Organic, FX, CTA, NCI).
10. Subtotal rows outrank detail rows. Never equal weight.
11. One card per screen REGION, not per table or row. Tables use row hairlines, never card borders or
    per-cell borders. No box-in-box.
12. Badges mean "action required from the user," not "count of items." Inventory counts render as
    quiet gray text.
13. One filled primary button per screen. All others outline.
14. All money, dates, IDs, deltas: monospace, tabular-nums, right-aligned. Chrome uses Inter.
    Never blend them.
15. Every table and form ships with empty, loading, error, hover, and visible keyboard-focus states —
    not just the happy path.

**Consolidation-scale screens (600+ entities)**
16. The roll-up tree is a status instrument: every node shows its own completion (mini-bar + fraction)
    AND an exception count rolled up from everything beneath it.
17. Tables default to exceptions + material movements only ("5 of 214 lines"); full detail sits
    behind a filter chip.
18. Multi-currency/elim/NCI data lives behind column-set toggles (Local / Reporting / FX-CTA /
    Eliminations / NCI split), never one wide table.

**Before calling any screen done:** run `node tools/check_chrome_themes.mjs` if chrome was touched,
and report which of the rules above the screen passes. Never introduce a colour, font size, weight or
spacing value that is not already a token in `index.html`.

## What's in the repo

```
Korvyn/
├─ index.html                 ← THE MAIN FILE. Single self-contained page, ~24k lines,
│                               ~60 views, the "Instrument" system. Open it in a browser.
├─ apps/                      predecessors, kept for reference (single-file HTML, no build)
│   ├─ dashboard/             korvyn_dashboard.html — what index.html grew out of
│   └─ review/                the Financial Review Platform — superseded 2026-08-14,
│       ├─ index.html           but still the only home of the live GL engine
│       └─ mocks/             design explorations, reference only
├─ packages/                  real TypeScript libraries
│   ├─ core/                  canonical GAAP domain model + ERP integration boundary
│   └─ agent/                 server-side LLM agent over the domain (tools, approvals)
├─ design-system/             dated written record of how the UI system got here
├─ assets/                    brand (logo)
├─ tools/                     repo-wide tooling (check_chrome_themes.mjs)
└─ archive/                   superseded snapshots (git-ignored)
```

`index.html` and `apps/` are prototypes; `packages/` are the real code. They share **no runtime
code**. The one bridge is build-time and one-directional: `packages/core/tools/emit_enterprise_gl.mjs`
serialises a validated GL snapshot into `index.html`'s `<script id="egl-data">` (data, not an
import). It is read by exactly one view, `view-egl`.

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
- **The main file stays single-file** (`index.html`, and likewise `apps/*`): no build step, no
  external runtime dependencies. It is ~2 MB — read the region you need, never the whole file.
- **Work incrementally.** Never rebuild or redesign an existing page unless asked.

## 2026-08-25 — Flux inspect panel: four modes and the in-review freeze

The docked inspect panel (`#fxDetail` in `index.html`) composes itself to the line
through `dwModeOf` / `dwOverviewKeys`. `RW_LAYOUT.drawer.sum` is the material-line
default those keys return — not the only Overview. Do not restore a single
composition for every line.

| Mode | When | What the panel does |
|---|---|---|
| **inspect** | `!r.req`, not submitted/approved | Reads. Drivers lead; a quiet `explainCue` if nothing is on the line; no footer. |
| **explain** | `r.req`, draft/returned | The explanation is the subject and owns Save/Accept. Footer is Submit only once coverage clears. |
| **review** | `rc.status==='submitted'` | Reports. Footer is Return / Mark reviewed, gated by `canReviewLine`. |
| **locked** | `rc.status==='approved'` | Reports. No Needs attention. Footer is Reopen (Controller/CAO) or a quiet “Controller or CAO to reopen”. |

**Overview carries a common tail (2026-08-25, later).** Below the mode-specific
parts, every mode's Overview now ends with three summaries — **Workflow & review**,
**Evidence**, **Comments** — mirroring the reference (`apps/review/`) inspector's
fuller Overview. Each is a collapsed block: its count and a chevron through to its
own tab, never a second copy of that tab. Comments shows the last message *inside*
the same block (`.rw-peekwrap`); Evidence shows its count and expected-gaps.
`dwOverviewKeys` appends `['reviewer','evidRow','cmtPeek']` to each mode's keys.
The full page composes these from `RW_LAYOUT.page` in its three columns. Both
densities now read as a **light dashboard** (owner's direction, 2026-08-25): the
drawer is a stack of white hairline blocks on a soft-gray (`--bg2`) body; the full
page is a white header band over a gray body with the three argument columns
floating as elevated white cards. Depth is lightness plus a soft shadow, never the
heavy overlay shadow — this deliberately relaxes the old "one card, hairlines
inside, no shadow" ruling for this panel. The drawer-specific block CSS stays
scoped `:not(.dw-page)` and the page card CSS is scoped `.dw-page`, so the two
treatments never leak into each other. Two touches of colour, both over facts already stated: the
Review-owner row carries an initials avatar (`rwInitials`) beside the spelt-out
name, and the Explanation header carries a **derived** classification pill —
Routine (below materiality) · Material · explained (accepted and within tolerance) ·
Needs review (otherwise; a Korvyn draft is not acceptance). It is never typed.

**Freeze rule.** Submitted reads exactly like locked in the explanation card
(`canPrep = !lock && !frozen && caps().prepare`). A preparer must not rewrite the
words a reviewer is reading — the sign-off would attach to text nobody reviewed.
The way back is the reviewer’s Return, a recorded transition. Name the freeze
rather than silently dropping Edit.

The header is **four equal figure cells in one row — current · prior · variance ·
Δ%** (the reference inspector's order), separated by hairlines, with colour on the
two variance cells only (rules 2/3/5). It replaced a 2×2 hero+mute grid that made
variance one oversized number over two greyed balances; equal weight reads as an
instrument. The movement is still the subject — it just no longer needs to shout.

No seeded line starts submitted or approved. Locked is reachable only by walking
a line through the workflow. `CMT` is in-memory; a reload restores the book.

## Toolchain

**Node is installed but not on `PATH`** — it lives at `C:\Users\mitragiri\tools\node22\` (v22.23.1,
npm bundled). Prepend it or things look broken:

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"
```

Before concluding a tool is absent, search the filesystem, not just `PATH`. Python is also available.

## Checks

```bash
node tools/check_chrome_themes.mjs     # index.html chrome themes pass WCAG AA (10 themes)
cd packages/core && npm run check      # core: typecheck + 78 tests + import boundary
cd packages/agent && npm run dryrun    # agent: all tools resolve, no API call
```

For `index.html` the browser-preview sweep is the end-to-end check: open
`file:///C:/Korvyn/index.html`, drive every tab, assert each view rendered, console clean.

## Git

Repo `github.com/mrgiri-hash/korvyn` (private). Requires Node (checks use `node --test`) and Python
(the boundary checker).
