# CLAUDE.md — LocusOS dashboard

Guidance for Claude Code working in this repo. Read this fully before editing.

## What this is

`locusos_dashboard_v12.html` is a **single self-contained HTML file** (~6,100 lines): an
illustrative prototype of a capital-accounting dashboard for a fictional data-center / CRE
REIT ("Meridian Global Portfolio"). No backend, no build step, no dependencies at runtime.
All data is hardcoded. It runs by opening the file in a browser. Dark/light mode via CSS
variables.

**Product thesis (keep edits in this lane):** own the construction-in-progress →
placed-in-service (CIP → PIS) determination-and-defense layer — the ASC 360 / 835-20
capitalization judgment between project-cost systems (Procore, Adaptive) and the GL.
Features should serve that spine. Deliberate non-scope: it is **not** a Workiva replacement
(no XBRL/EDGAR/MD&A), **not** enterprise planning (no general three-statement/NOI planning).

## File layout

Everything is in the one HTML file, in three parts:
1. `<style>` — all CSS, including `:root` (light) and `[data-theme=dark]` variable blocks.
2. `<body>` — the shell: top ribbon (`#ribbonSections`), left rail (`#railTabs` + `#railUtil`),
   filter bar (`#filterCtrls`), nav strips (`#secnav`, `#subnav`, `#subnav2`), and one
   `<div class="view" id="view-{tabid}">` per tab.
3. `<script>` — all logic (data, render functions, nav, state).

There is no separate CSS/JS file. Edits happen in place.

## Core architecture

- **Sections** ("lenses") live in `LENSES` + `LENS_ORDER`. Current order:
  `portfolio` (Home), `assets` (Fixed Assets), `procure` (Procurement), `fpa` (FP&A),
  `ledger` (General Ledger), `filings` (SEC filings). Each lists its `tabs`.
- **Workspace destinations** live in the same `LENSES` map but are listed in `UTIL_ORDER`,
  **not** `LENS_ORDER`: `tasks`, `issues`, `archives`, `admin`. They are single-tab lenses.
  Keeping them out of `LENS_ORDER` is deliberate — the top ribbon and any `LENS_ORDER`
  sweep stay limited to the six real sections. Iterate `[...LENS_ORDER,...UTIL_ORDER]`
  when you want every destination.
- **Tabs** are defined in the `TABS` catalog array (id, label, icon path). Each section's
  `tabs` array references these ids.
- **Render dispatch:** a series of `if(TAB==='x')renderX();` calls (search `if(TAB===`).
  There are 34 `renderX()` functions, one per view (e.g. `renderFinRep`, `renderFiling`,
  `renderFIndex`, `renderFDetail`). Each writes into its `#view-{tab}` container's `innerHTML`.
  (The filing workspace additionally has nine `fdXxx(f)` sub-renderers that **return HTML
  strings** rather than writing to the DOM — `renderFDetail` composes them, along with
  `fdTree()` / `fdItemPane()` / `fdCommentBlock()` for the two-column work area.)
- **Rail structure:** `RAIL_SPEC[lens]` optionally overrides the plain tab list with a
  structured rail (`kids` for an expandable group, `badge:()=>n` read live, `sub` to land on
  a specific `fDetailTab`). Only `filings` has one; every other section falls back to its
  tab list. `railExpanded` holds group open/closed state.
- **Per-tab titles/crumbs:** `VIEW_META`.
- **Two-level nav (this is the important bit):**
  - **Top ribbon** `#ribbonSections` = the six *sections*.
  - **Left rail** `#railTabs` = the **active section's** destinations, labelled with the
    section name (`#railTabsLbl`); `#railUtil` = the cross-cutting Workspace group.
  - Both are painted by `paintRailRoles()`. `paintRailNav` is wrapped so the rail
    highlight follows `pickTab`, not just `pickLens`.
  - `#secnav` (the old row-1 section strip) is **force-hidden** — its content moved to the
    rail and rendering it would duplicate the list. `#subnav` / `#subnav2` remain, and are
    the *within-record* tab strips (flux statement picker, filing workspace tabs).
  - Procurement is special-cased: it is a single-tab section whose `PROC_SUBS` render in
    the rail.
  - The rail collapses (212px ↔ 60px, `body.rail-collapsed`, persisted to `localStorage`)
    and becomes an off-canvas drawer under 860px via `body.nav-open` + `.menu-btn`.
- **Global filter bar:** fund / region / ownership / period / currency, plus a
  context-specific "Flux range" group shown only on the flux tab. Period model on `F`
  (`periodType`: itd/ytd/quarter/month). `renderAll()` re-renders the active view.

## Key data structures (all `const`, near where they're used)

- `COA` — chart of accounts (each entry `{acct, name, type, tb}`; `tb` is signed:
  assets +, liab/equity −, expense +). `coaBal(acct)` looks up a balance.
- `FINREP_SUPP` — supplemental P&L / cash-flow inputs the statements need beyond the TB.
- `FLUX_CAL` — monthly (`m`) and quarterly (`q`) period calendars for Flux review.
- `FC_PROJECTS` — FP&A forecast project book (EAC inputs).
- `CL_STAGES` / `CL_PROJECTS` — capital-lifecycle stage rail data.
- `FILINGS` + `FILING_SECS` — the SEC filings book and per-filing working-paper sections.
  **Filing progress is derived, never stored:** `filingSections(f)` / `filingProgress(f)`
  compute it from the section rows, so the index bar, the Overview donut and the section
  counts cannot drift. Do not reintroduce a `progress:` field on a filing record.
- `FILING_TEAM`, `FILING_COMMENTS`, `FILING_NOTES`, `FILING_DISCLOSURES`,
  `FILING_APPROVALS`, `FILING_ACTIVITY` — the filing workspace's supporting data.
- Workspace views (`renderTasks`/`renderIssues`) derive from `CIP_PROJECTS`; `renderArchives`
  reads the live `fluxComments` store. None of them keep their own copies of these numbers.

Financial statements (Financial reporting, Filing view, Flux review) all **derive from
`COA` + `FINREP_SUPP`** — do not invent parallel numbers; reuse the derivation so views tie.

## Flux review (the most complex feature — read before touching it)

Financial reporting has two modes via `TAB_PIPELINES.finrep`: `flux` and `trend`
(trend is a placeholder). Flux review:
- Statement picker (`fluxStmt`: bs/is/cf/eq) rendered in the third-tier strip.
- Period is a **From/To range** (`fluxRange` = {m:{from,to}, q:{from,to}}); `fluxPeriodInfo()`
  resolves endpoints and a stable `tag`. Range controls live in the **filter bar**
  (`#fluxRangeGrp`), synced by `paintFluxFilter()`. Adjacent periods → MoM/QoQ label.
- BS/Equity are point-in-time (`model.point`): columns are ITD balances at each endpoint,
  Δ is the change. IS/CF are flows: activity summed across the span vs a prior baseline.
- GL-level expand: `fluxGLOpen`, `toggleFluxGL()`.
- Comments at **every level** (category/GL/subtotal): store `fluxComments`, keyed
  `${stmt}::${periodTag}::${lineId}`, each `{text, locked, by, at}`. Inline textarea editor
  (`openFluxEditor`/`saveFluxEditor`/`cancelFluxEditor`) — **do not** reintroduce
  `prompt()`/`confirm()`; they are blocked in the sandbox.
- Lock/sign-off with audit trail: `lockFluxComment`/`unlockFluxComment` record `FLUX_REVIEWER`
  + `fluxNow()`. Locked comments surface in the Filing view as read-only "Disclosure notes".
- `fluxModel(stmt, S, derived)` defines each statement's lines + GL breakdown.

## Editing patterns & gotchas

- **`str_replace` that consumes the next function header:** the single most common bug in
  this file. When replacing the body of a render function, if your `old_str` ends near the
  next `function renderY(){ ... }` header, it's easy to consume that header, leaving an
  orphaned body and a syntax error at the next `}`. **After replacing any render function,
  verify:** `grep -c "function renderY(){" file` equals the expected count, and re-check the
  junction. This has happened repeatedly (renderCIP, renderBudget, renderFinRep, renderFiling).
- **Template-literal escaping:** these render functions are giant template strings. Don't use
  `\\'` inside them for apostrophes — use a plain word or `&#39;`. A stray backslash-escape
  breaks the whole script.
- **Colors/spacing:** use the existing CSS variables (`--accent`, `--ink`, `--muted`,
  `--line`, `--line2`, `--surface2`, `--bg2`, `--pos`, `--neg`, `--warn`, `--hint`). Don't
  hardcode hex; it breaks dark mode. Reuse existing classes (`.card`, `.tbl`, `.kpis/.kpi`,
  `.seg`, `.pill`, `.note`, `.subhead`, `.subnav`, `.expander`, `.row-click`, `.flux-*`,
  `.segbar`, `.pager`, `.avatar`, `.mini-bar`, `.btn-primary`, `.btn-ghost`).
- **FILL vs TEXT color tokens — read before styling anything filled.** `--accent` and
  `--neg` are the *text* hues (links, labels on page surfaces). `--accent-fill` /
  `--neg-fill` are the *background* hues, with `--on-accent` / `--on-neg` as their
  foregrounds. They diverge in dark mode on purpose: a hue light enough to read as text on
  a dark surface is too light to carry white text (white on dark `--accent` is 3.05:1,
  below the 4.5:1 AA floor). **Never use `background:var(--accent)` with white text** —
  use `--accent-fill` + `--on-accent`. Same for `--pos` vs `--pos-ink` (text on `--pos-bg`).
- **Density tokens:** `--pad-card`, `--pad-content`, `--row-h`, `--radius`, `--radius-sm`,
  `--radius-pill`, and shell geometry `--rail-w` / `--rail-w-collapsed` / `--ribbon-h`.
- **Collapse controls:** only add an expand/collapse-all button where there is genuinely
  nested detail to hide. Flat tables (e.g. Overview) get no inert button — this is a
  deliberate rule, don't "fix" it by adding dead controls.
- **No dead controls, generally.** The same rule killed two tempting additions: sortable
  carets on tables that have no sort implementation (only `#findex` sorts, and it sorts for
  real via `fSort`/`fRows()`), and an "Apply filters" button — filters apply live on
  `change`, so the footer button is an honest `Done` (re-render + collapse) next to a
  functional `Reset`. If you want true staged apply, buffer the controls into a pending
  object and merge into `F` on commit; don't just relabel the button.
- **New tab checklist:** (1) add id to the section's `tabs` in `LENSES`; (2) add to `TABS`
  catalog; (3) add `<div class="view" id="view-{id}">` in the body; (4) add
  `if(TAB==='{id}')renderX();` to dispatch; (5) add `VIEW_META` entry; (6) write `renderX()`.
- **New section:** add an icon to `ICON`, a `LENSES` entry, and include it in `LENS_ORDER`.

## Validate every change (required)

The file has no test runner, so validation is manual but fast:

**Note: Node is not installed on this machine** (Python is). The `node --check` / jsdom route
below is therefore unavailable; use the browser-preview sweep, which is a better end-to-end
check anyway. The file lives in this directory, so the preview pane runs its JS.

```
# 1. Load it in the preview pane and confirm the console is clean
#    preview_start file:///.../Locus Spine_Claude/locusos_dashboard_v12.html
#    read_console_messages(onlyErrors: true)   -> must be empty

# 2. Behavior sweep: drive every tab and assert each view rendered.
#    Run in the page via javascript_tool:
#      for (const L of LENS_ORDER) { pickLens(L);
#        for (const t of LENSES[L].tabs) { pickTab(t);
#          document.getElementById('view-'+t).innerHTML.length } }
#    All 17 tabs should return a substantial length (~2.3k-9.4k chars), none throw.
#    Re-check the console for errors afterward, then reset to portfolio/overview.

# 3. If Node is ever installed, the old route still works:
#    extract <script>...</script> to a .js and run `node --check` on it.
```

Always run steps 1-2 before considering a change done. After editing a render function,
additionally confirm its own header and the next function's header still exist.

## Delivery

The working file is the deliverable. When done, the human opens the HTML directly. Keep it a
single file — do not split into separate assets or add a build step.
