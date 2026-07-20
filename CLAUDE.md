# CLAUDE.md — KORVYN dashboard

Guidance for Claude Code working in this repo. Read this fully before editing.

## What this is

`korvyn_dashboard.html` is a **single self-contained HTML file** (~8,700 lines): an
illustrative prototype of **KORVYN**, an enterprise finance / accounting / capital
intelligence layer sitting on top of an ERP, for a fictional data-center / CRE REIT
("Meridian Global Portfolio"). No backend, no build step, no dependencies at runtime.
All data is hardcoded. It runs by opening the file in a browser. Dark/light mode via CSS
variables.

**The ERP is the system of record.** Korvyn reads it and adds visibility, workflow,
controls, close, reconciliation, analytics and AI. Do **not** build journal-entry posting
or other routine ERP transaction processing.

## Where the build currently stands

Repo: `C:\Korvyn` · remote `github.com/mrgiri-hash/korvyn` (private) · branch `main`.

**Built and verified**

| Module | State |
|---|---|
| Home | Overview (do not redesign), My Work, Approvals, Exceptions, Activity, Documents, Data Room, Controls |
| Accounting | Overview, Close, General Ledger, Intercompany — all four built to their written specs |
| Fixed Assets | Capital lifecycle, Capitalization, Capitalized labor, PP&E rollforward, Placed-in-service |
| Procurement | Commitments/Invoices/Payments/Bank confirmation, Vendors |
| FP&A | Eight functions, Executive Overview through Management Reporting |
| Treasury | Reuses the Cash & Liquidity component (five sub-tabs) |
| Reporting | SEC filings group: dashboard, index, filing workspace, XBRL, reports |

**Not yet built to standard** — these are the obvious next pieces:

- **Accounting > Reconciliations** — still the older `glrecon` page, and it carries a known
  integrity defect (see below). Referenced from both Accounting > Overview and the GL
  workspace, so building it completes several drill-downs.
- **Accounting > Continuous Close** — a routing summary (`acctStub`), not a full workspace.
- **Accounting > Consolidation** — older `consol` page. Intercompany > Elimination now links
  into it and treats it as the place elimination entries are produced, so it has an
  established contract to honour when it gets built.
- Fixed Assets, Procurement, FP&A and Reporting have not had a written spec pass like
  Accounting did; their pages predate the current design standard.

**Known defect — Reconciliations headline counts do not tie.** `RECON_SCALE=35` multiplies
the 7 `GL_RECON` rows to fabricate portfolio-sized headline counts, so `renderGLRecon` shows
"Total reconciliations 245" above a 7-row table footed "Showing 1 to 7 of 245". Accounting >
Overview compounds it: "Open reconciliations 140" (scaled) sits beside "Unreconciled balance
1,250.00 — 1 account with a difference" (unscaled), claiming a 245-reconciliation book with
exactly one open variance. Fix by expanding `GL_RECON` to a real book and deleting
`RECON_SCALE` — copy the Intercompany approach: derive the roll-ups, assert the tie, drop the
multiplier. Do not fix it by scaling the differences too; that keeps the lie and adds a
second one. The page also has three inert `<select>`s (Entity / Account / Period) wired to
`renderAll()`, a "New reconciliation" button calling `toggleFilters()`, and every row's
`onclick` going to `glact` regardless of which account was clicked.

**Working agreements established with the user**

- Work incrementally. Never rebuild or redesign an existing page unless asked.
- Home > Overview is off-limits; it renders 3,374 characters and that is the regression check.
- The ERP is the system of record. Never build journal-entry creation, approval or posting.
- Numbers must derive, never duplicate. Statements derive from `COA` + `FINREP_SUPP`;
  close roll-ups derive from `CLOSE_TASKS`; the GL ledger derives from `COA`. If a figure
  appears in two places, derive it once.
- No dead controls. If an affordance cannot act, do not add it.

## Navigation architecture (read before touching nav)

- **KORVYN wordmark = Home.** It is a `<button class="ribbon-brand">` that calls
  `pickLens('portfolio')`. There is deliberately **no Home tab** in the top nav;
  `paintRailRoles` filters `portfolio` out of the ribbon.
- **Top ribbon = enterprise domains** (`#ribbonSections`, from `LENS_ORDER`):
  Accounting · Fixed Assets · Procurement · FP&A · Treasury · Reporting · ⋯
  The `⋯` menu (`#moreMenu`) holds Data & Controls / Integrations / Administration.
- **Left rail = functions within the active domain** (`#railTabs`, from `RAIL_SPEC`).
- **Ask Korvyn** = persistent contextual AI, four states (docked / rail / full screen /
  closed). Do not redesign it without being asked.

Lens ids kept their original names through relabelling: `ledger` renders as
**Accounting**, `filings` as **Reporting** (SEC filings is a group inside its rail).

**Product thesis (keep edits in this lane):** own the construction-in-progress →
placed-in-service (CIP → PIS) determination-and-defense layer — the ASC 360 / 835-20
capitalization judgment between project-cost systems (Procore, Adaptive) and the GL.
Features should serve that spine. Deliberate non-scope: it is **not** a Workiva replacement
(no XBRL/EDGAR/MD&A), **not** enterprise planning (no general three-statement/NOI planning).

## File layout

Everything is in the one HTML file, in three parts:
1. `<style>` — all CSS, including `:root` (light) and `[data-theme=dark]` variable blocks.
2. `<body>` — the shell: top ribbon (`#ribbonSections`), left rail (`#railTabs`),
   filter bar (`#filterCtrls`), nav strips (`#secnav`, `#subnav`, `#subnav2`), and one
   `<div class="view" id="view-{tabid}">` per tab.
3. `<script>` — all logic (data, render functions, nav, state).

There is no separate CSS/JS file. Edits happen in place.

## Core architecture

- **Domains** ("lenses") live in `LENSES` + `LENS_ORDER`. Current order:
  `portfolio` (Home, hidden from the ribbon), `ledger` (**Accounting**), `assets`
  (Fixed Assets), `procure` (Procurement), `fpa` (FP&A), `treasury` (Treasury),
  `filings` (**Reporting**). Each lists its `tabs`.
- **Workspace destinations** live in the same `LENSES` map but are listed in `UTIL_ORDER`,
  **not** `LENS_ORDER`: `tasks`, `issues`, `archives`, `admin`. They are single-tab lenses
  reached from Home's left nav. Iterate `[...LENS_ORDER,...UTIL_ORDER]` when you want
  every destination — that is what the verification sweep does.
- **Tabs** are defined in the `TABS` catalog array (id, label, icon path). Each section's
  `tabs` array references these ids.
- **Render dispatch:** a series of `if(TAB==='x')renderX();` calls (search `if(TAB===`).
  There are 64 `renderX()` functions, one per view (e.g. `renderFinRep`, `renderFiling`,
  `renderFIndex`, `renderFDetail`). Each writes into its `#view-{tab}` container's `innerHTML`.
  (The filing workspace additionally has nine `fdXxx(f)` sub-renderers that **return HTML
  strings** rather than writing to the DOM — `renderFDetail` composes them, along with
  `fdTree()` / `fdItemPane()` / `fdCommentBlock()` for the two-column work area.)
- **Rail structure:** `RAIL_SPEC[lens]` optionally overrides the plain tab list with a
  structured rail. Entry forms: `{head:'…'}` renders a group heading; `kids` an expandable
  group; `badge:()=>n` a live count; `act`/`on` let an entry target existing state instead
  of forcing a new tab (that is how Flux review reaches `finrep`+`finRepSub`, and how
  Treasury reuses the Cash & Liquidity component). Specs exist for `portfolio`, `treasury`,
  `fpa`, `ledger`, `filings`; other domains fall back to their tab list. `railExpanded`
  holds group open/closed state.
- **Per-tab titles/crumbs:** `VIEW_META`.
- **Two-level nav (this is the important bit):**
  - **Top ribbon** `#ribbonSections` = the *domains*, with `portfolio` filtered out
    (the wordmark is Home).
  - **Left rail** `#railTabs` = the **active domain's** functions. A spec carrying its own
    `head` entries suppresses the generic `#railTabsLbl`. There is no global Workspace
    group any more — Workspace and System live in Home's left nav.
  - Both are painted by `paintRailRoles()`. `paintRailNav` is wrapped so the rail
    highlight follows `pickTab`, not just `pickLens`.
  - `#secnav` (the old row-1 section strip) is **force-hidden** — its content moved to the
    rail and rendering it would duplicate the list. `#subnav` / `#subnav2` remain, and are
    the *within-record* tab strips (flux statement picker, filing workspace tabs).
  - `#subnav` is painted from `TAB_PIPELINES[TAB]`: `{steps:[{id,label,n,q}], get, set}`,
    where `n` is a live count and `q` picks the quiet badge style. This is how a tab gets
    sub-views **without adding tabs or touching navigation** — `icomp` uses it for all eight
    Intercompany views, and it is the right mechanism for any future multi-view workspace.
    Drill-down state (`icPairSel`, `icEvSel`) lives outside the pipeline and short-circuits
    the renderer before the sub-view dispatch.
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
- `CLOSE_TASKS` — the 76 close tasks. **`GL_CLOSE` and `GL_CLOSE_FN` derive from it**, so
  the Close checklist and Accounting > Overview cannot disagree. The list was fitted to
  reproduce the previously hand-written entity and function totals exactly; if you edit it,
  re-check those roll-ups.
- `glAccounts()` — the GL ledger, derived from `COA` so ending balances equal the trial
  balance and debits − credits equals period activity. `glTxns(acct)` synthesises the
  postings behind an account's movement; `glUnusual()` runs the anomaly rules over them.
  Korvyn never posts: transaction rows link out via `erpLink()` ("View in ERP").
- `IC_EVENTS` — the intercompany event book, and the single source of truth for the whole
  Intercompany module. Each entry is one connected economic event carrying the accounting
  `legs[]` recorded in **every** entity it touches (within an entity `dr` must equal `cr`, or
  the ERP would reject the journal). An event with legs for only one entity is a
  missing-counterparty exception; `inst[]` holds Korvyn's draft instruction for the absent
  side. Pair balances, match rate, differences, aging, settlement amounts, elimination
  readiness and the exception ranking **all derive from those legs** via memoised accessors
  (`icxPairs`, `icxKpi`, `icxExcep`) — nothing is stored twice.
  **`icxTie()` is the guard rail:** the derived pair roll-ups are fitted to reproduce `GL_IC`
  exactly, because Accounting > Overview reads `GL_IC`. Run `icxTie()` in the console after
  any edit to `IC_EVENTS`; it must return `{ok:true, pairs:5}`. If you change a leg amount,
  either keep the pair total intact or update `GL_IC` in the same commit — otherwise the two
  pages silently disagree, which is exactly the failure `RECON_SCALE` represents.
  Naming: everything new is prefixed `icx`/`icv` specifically to avoid colliding with the
  pre-existing `icDiff` / `icUnmatched` / `icTotalDiff` / `icReady` helpers that Overview uses.
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
- **Never anchor an edit on a string you have not proved is unique.** This file repeats
  key names across unrelated structures — `ledger:` appears in both `KPI_SETS` and
  `RAIL_SPEC`, `.railrole` is shared by the ribbon nav and the left rail. A slice taken
  from the *first* match of `  ledger:[` once deleted 104KB (the rest of `KPI_SETS`,
  `renderConsol`, and the whole `RAIL_SPEC` declaration) and the page stopped executing.
  Assert `count(anchor) == 1` before every replacement, and prefer a longer anchor that
  includes surrounding context.
- **Derived data must be lazily evaluated, not eagerly.** `const X = (()=>…)()` runs at
  parse time. Twice now a derived structure referenced a `const` declared hundreds of
  lines lower and hit the temporal dead zone, throwing before any view rendered — with
  no console error surfaced by the preview pane. Prefer a memoised accessor
  (`let _x=null; function xs(){ if(!_x) _x=…; return _x; }`) so declaration order stops
  mattering. `glAccounts()` is the pattern to copy.
- **Grid items need `min-width:0` or they set the track's minimum.** `.ribbon` shares a
  column with `.main`; without it, the ribbon's intrinsic width (brand + nav + utilities,
  ~1240px) forced every page wider than the viewport. Same class of bug hit `.main`,
  `.content` and the card grids. Any new flex/grid child holding wide content needs it.
- **Test responsive at the band boundaries, not just desktop and mobile.** The rail was
  unreachable between 861px and 1200px for several commits because the sweep only ran at
  one width. The shell has three bands — ≥1201 (full grid), 861–1200 (assistant floats,
  rail stays), ≤860 (rail off-canvas + hamburger) — and each needs checking.
- **Shared class names cut both ways.** `body.rail-collapsed .railrole .lbl{display:none}`
  looked rail-scoped but also stripped the ribbon nav's labels. Scope state rules to their
  container (`.rail .railrole`).
- **Light mode is an inert attribute — never set `data-theme` on `<html>`.** The stylesheet
  defines `[data-theme="dark"]` but there is no `[data-theme="light"]` rule; light values live
  in `:root`. So `<body data-theme="light">` declares nothing, and a `data-theme="dark"` on any
  ancestor cascades down uncontested — the in-app toggle cannot undo it. This bit a debugging
  session: setting dark on `documentElement` to test dark mode left the page stuck dark through
  every subsequent reload, because navigating to the same file URL does not hard-reload the DOM.
  If you set it for a test, remove it afterwards. A robustness fix would be to give
  `[data-theme="light"]` the same variable block as `:root` so light re-declares rather than
  inherits — not done, as it touches the design system.
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
check anyway.

**Preview sandbox:** the preview pane only serves files from the *session's* working directory.
If the session is rooted at `C:\Korvyn` this file loads directly. If it is rooted elsewhere
(older sessions ran from the iCloud path), `file:///C:/Korvyn/...` is refused and you need a
copy of the HTML in the session directory instead — compare hashes before trusting what you see,
and re-copy after every edit or you will be validating a stale file.

```
# 1. Load it in the preview pane and confirm the console is clean
#    preview_start file:///C:/Korvyn/korvyn_dashboard.html
#    read_console_messages(onlyErrors: true)   -> must be empty

# 2. Behavior sweep: drive every tab and assert each view rendered.
#    Run in the page via javascript_tool, wrapped in an IIFE — the tool reuses one
#    JS context, so bare `const` redeclarations throw on the second run:
#      (function(){ const res={};
#        for (const L of [...LENS_ORDER,...UTIL_ORDER]) { pickLens(L);
#          for (const t of LENSES[L].tabs) { pickTab(t);
#            res[t]=document.getElementById('view-'+t).innerHTML.length; } }
#        return JSON.stringify(Object.entries(res).filter(([k,v])=>!v||v<500)); })()
#    52 tabs, none under 500 chars, none throwing. Then reset to portfolio/overview
#    and confirm view-overview is exactly 3374 chars (the regression check).

# 2a. Tabs with sub-views need their own sweep — the tab-level check only renders the
#     default sub-view. Intercompany: drive setIcSub over
#     net/events/match/diff/settle/elim/excep/audit, then setIcPairSel over icxPairs()
#     and setIcEvSel over IC_EVENTS. Also run icxTie() -> must be {ok:true,pairs:5}.

# 2b. Responsive: check ≥1201, 861-1200 and ≤860 separately by asserting
#     documentElement.scrollWidth <= clientWidth. Known: at 375px every page reports
#     552>375 — a pre-existing shell floor, not a per-page regression.

# 3. If Node is ever installed, the old route still works:
#    extract <script>...</script> to a .js and run `node --check` on it.
```

Always run steps 1-2 before considering a change done. After editing a render function,
additionally confirm its own header and the next function's header still exist.

## Delivery

The working file is the deliverable. When done, the human opens the HTML directly. Keep it a
single file — do not split into separate assets or add a build step.
