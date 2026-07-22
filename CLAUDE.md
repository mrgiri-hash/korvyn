# CLAUDE.md — KORVYN dashboard

Guidance for Claude Code working in this repo. Read this fully before editing.

## What this is

The repo holds **two independent things**. Almost all of this document is about the first.

| | |
|---|---|
| `korvyn_dashboard.html` | the illustrative prototype — hardcoded data, no build step |
| `korvyn-core/` | a real TypeScript package: canonical accounting model + ERP integration boundary |

They share no code and neither imports the other. The dashboard does **not** run on
`korvyn-core`; its numbers are still hardcoded. Rules below about deriving-not-duplicating,
render dispatch, nav and the design system apply to the **dashboard only** unless stated.

### `korvyn-core/` in one paragraph

A typed GAAP domain model (`src/domain` — accounts, entities, dimensions, periods, journal
entries, and the validation invariants) plus the adapter seam (`src/integration`) that
external systems must enter through. **The architectural rule is one-directional:**
`integration/` may import `domain/`, never the reverse, and no vendor field name may appear
outside an adapter's private translation code. `tools/check_boundary.py` enforces that
without needing Node. Money is `bigint` minor units; a journal line carries one signed
amount; balance is checked per currency; `ValidatedJournalEntry` is a branded type so
posting something unvalidated is a compile error. Verified: `npm run check` (typecheck src +
tests, 43 tests, boundary) is green. See `korvyn-core/README.md` for the tradeoffs and the
PATH note. Deliberately not built: sync engine, persistence, real API calls, any UI.

Note the boundary with the dashboard rule below: Korvyn never *posts* to the ERP, but the
core does model journal entries, because reading, validating and reconciling them requires
representing them faithfully.

---

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
| Home | **Overview is now a customizable Workspace** (widget framework — see the Workspace section), My Work, Approvals, Exceptions, Activity, Documents, Controls |
| Accounting | **Complete.** Overview, Close, General Ledger, Reconciliations, Intercompany, Consolidation, Continuous Close, Exceptions, Accounting Issues, Policies — every page built to its written spec, no known defects |
| Fixed Assets | Capital lifecycle, Capitalization, Capitalized labor, PP&E rollforward, Placed-in-service |
| Procurement | Commitments/Invoices/Payments/Bank confirmation, Vendors |
| FP&A | Eight functions, Executive Overview through Management Reporting |
| Treasury | Reuses the Cash & Liquidity component (five sub-tabs) |
| Reporting | SEC filings group: dashboard, index, filing workspace, XBRL, reports |

**Not yet built to standard** — these are the obvious next pieces:

- Nothing outstanding in Accounting. Reconciliations' `RECON_SCALE` defect is **fixed** —
  see the note under `GL_RECON`.
- Accounting has no routing stubs left. `acctStub` itself has been **deleted** — Continuous
  Close was its last caller. If a future page needs a placeholder, write it fresh rather than
  resurrecting that helper.
- Fixed Assets, Procurement, FP&A and Reporting have not had a written spec pass like
  Accounting did; their pages predate the current design standard.

**Fixed defect, kept as a cautionary tale — never scale sample data into a headline.**
Reconciliations used to keep 7 `GL_RECON` rows and multiply the headline counts by
`RECON_SCALE=35`, so the page showed "Total reconciliations 245" above a 7-row table footed
"Showing 1 to 7 of 245", and Accounting > Overview paired a scaled open count (140) with an
*unscaled* difference ("1,250.00 — 1 account with a difference"), asserting a 245-account book
with exactly one open variance. It survived a long time because every view rendered fine.
`GL_RECON` is now the real 45-row book and the multiplier is gone. If a page looks too small,
add rows — never a scale factor, and never scale the differences to match the counts (that
keeps the original lie and adds a second one).

**Working agreements established with the user**

- Work incrementally. Never rebuild or redesign an existing page unless asked.
- **`HOME_PREVIEW` is quarantined placeholder data — never mix it with derived figures.**
  Home now carries forward-looking cards for modules that do not exist yet (performance,
  liquidity, FP&A variance, capital structure, entity explorer, governance, knowledge,
  evidence, enterprise graph, integration integrity). Those figures describe the *scale of
  enterprise Korvyn targets* — 248 entities, 14 ERP systems, 1,842 projects — and flatly
  contradict the live book (4 entities, 4 ERP systems, 8 projects). They are therefore
  confined to the single `HOME_PREVIEW` constant and **every card built from it renders a
  `Preview` chip**, so nothing illustrative can be mistaken for a derived number. When a
  module gets built, delete its block from `HOME_PREVIEW` and derive instead. Do not add a
  number to Home without deciding which side of that line it sits on.
  The sections above it — Enterprise pulse, Needs your attention, Korvyn detected — remain
  fully derived and carry no Preview chip. That contrast is the whole point.
- **Home > Overview was restructured on request** (enterprise command centre) and its old
  3,374-character regression check is retired. The live check is now **Home > Exceptions =
  3,395 chars**, plus the whole-app sweep. Home leads with enterprise status → Needs your
  attention → Korvyn detected → capital position; the four-measure and cost-to-cash analyses
  are preserved verbatim, just moved below the operational queue. `homeAttention()` /
  `homeDetected()` derive from the owning modules and are **reused by Accounting > Overview**,
  so the two pages cannot disagree — change them in one place.
- The ERP is the system of record. Never build journal-entry creation, approval or posting.
- Numbers must derive, never duplicate. Statements derive from `COA` + `FINREP_SUPP`;
  close roll-ups derive from `CLOSE_TASKS`; the GL ledger derives from `COA`. If a figure
  appears in two places, derive it once.
- No dead controls. If an affordance cannot act, do not add it.

## Design system: tokens and primitives (Phases 1–3 of the UI refactor)

**The ramp is the palette.** `:root` leads with a 10-step neutral ramp `--n-0` (surface) →
`--n-9` (ink), and every structural alias (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, …)
resolves through it. Dark mode redefines **only the ten ramp values**. If a new hue seems
necessary, the answer is a different ramp step, not a new colour.

- **One accent (cobalt). Red/amber/green are STATE ONLY** — never decoration, never series.
  Budget→committed→incurred→paid is a *sequence*, so it uses `--series-1..4` (ramp into accent).
  It previously used raw green and coral, which read as good/bad on figures carrying no state.
- **Type scale is five sizes and only five**: `--fs-label` 11px (uppercase, `--tracking-label`,
  `--fw-label` 600), `--fs-table` 12, `--fs-body` 13, `--fs-card` 15, `--fs-page` 20. Body text
  is 400/500 only; 600 exists solely for the 11px label, which the spec defines at that weight.
- **Spacing is `--s-1..--s-12` in 4px steps.** `--pad-card`, `--pad-content`, `--row-h` are
  expressed in it, not in literals.
- **`--border` is the default separator** (`0.5px solid var(--line)`). Below 2dppx the hairline
  steps to 1px, because a half-pixel border rounds to zero in some engines and disappears.
- **Shadow is for true overlays only** — popovers, menus, modals, drawers. `--shadow-sm` is
  deliberately `none`; cards, panels and tables separate through the hairline alone.
- `font-variant-numeric:tabular-nums` is global, not per-table.

### The three primitives

- **`provChip(provFor({entity, diff, offBook, recordId}))`** — provenance is DERIVED, never
  authored: source system from `ERP_ENTITY` (entity→system map), freshness from that system's
  own `GL_ERP` record, tie-out from the figure's own difference. Four states:
  `matched | unmatched | stale | unavailable`. **It is the only element allowed semantic colour
  at rest**, and only when stale/unavailable — so a healthy screen stays monochrome. Where no
  source link exists it says `unavailable` and explains why rather than showing a confident chip
  over a number Korvyn cannot trace.
- **`etScopeHTML()` / `etOpen()` / `etPick()` / `etIn(entity)`** — the EntityTree scoping
  control. Ownership %, elimination pairs and per-node close status derive from `CONS_ENT`,
  `icxPairs()` and `csxEntities()`. Selecting a node sets `F.entity`; **`etIn()` is the shared
  scope test** every surface must use so they filter identically. Consumed today by the
  workspace widgets and DataTable; legacy pages do not read it yet.
- **`dataTable(spec)`** — one table for every list surface. 40px rows, sortable, right-aligned
  tabular numerics, per-user column config and saved views (persisted, `korvyn.datatable.v1`),
  multi-select with bulk actions, and **a preview that must be confirmed before anything
  commits**. **Severity is a 3px left border — never a pill, never a dot**; neither is available
  in this primitive.
  **A cell is ONE line.** 40px rows are a hard constraint, so a value needing a second line
  needs its own column instead — that is exactly why the card list was replaced. The flexible
  column carries `flex:true` (`max-width:0`) and truncates with a title tooltip.
  `dtRepaint(id)` swaps a single table in place, so sort/selection do not re-render the page.

### MetricCard and the number rule (Phase 4)

- **One card treatment.** `.mc` (new), `.kpi` and `.stat` are all *defined by the same CSS
  block* — 11px uppercase label, 20px value, basis line, hairline divider, drill link. There
  were two divergent variants across 163 call sites; rather than rewrite each, `.kpi`/`.stat`
  are now that treatment, so every strip conforms and there is one place to tune. New surfaces
  call `metricCard(m)` / `metricRow(list)`; `wsStat()` emits MetricCards, so Home's variant is
  gone rather than duplicated.
- **`basis` is mandatory; `delta` is optional and only where a prior value truly exists.**
  A value with nothing qualifying it is the orphaned number this primitive exists to prevent —
  **verified zero orphans app-wide**, and the check is worth re-running: query every
  `.mc,.kpi,.stat` and assert each has a non-empty `.mc-b,.d,.sd`.
  Korvyn holds a real prior-close series in `CC_TREND.pri` and nothing else, so close readiness
  is the only card with a delta (`closeDeltaVsPrior()`). Do **not** add "vs prior close" to the
  others — there is no prior value behind them.
- **THE NUMBER RULE, by figure type, not per card:**
  magnitude → `money()` / `money0()` / `homeAmt()` (abbreviated);
  reconciliation-grade → `glK()` (long-form, two decimals, parens for negative).
  `money()` takes **millions** and below $0.1M now drops to whole dollars — it used to render a
  real $1,250 variance as `$0.0M`, which reads as nil on the one screen where a controller is
  hunting exactly that number. Exact zero keeps `$0.0M`, because zero really is zero: the five
  remaining `$0.0M` in the app were each verified to be genuine nil (residual, variance, an
  exception with no misstatement).
  Sign leads the symbol — `-$2.3M`, never `$-2.3M`. `fpM()` was fixed to match.

## Home is a WORKSPACE, not a dashboard (read before touching Home)

`renderOverview()` is now one line: `wsRender()`. Home is composed from a widget registry, and
**Home knows nothing about any individual widget** — it renders whatever `WS_REG` holds, in the
order the active workspace lists. That is the architectural point; keep it true.

- **Registering a widget is the extension point.** A future module calls `wsRegister({...})`
  from its own code. Do **not** add a widget by editing Home, and do not hardcode a layout.
  ```js
  wsRegister({id, cat, title, desc, ic, sizes:['m','l'], def:'l', bare?, src?, filters:[],
              render:(cfg)=>htmlString})
  ```
  `render` returns an HTML **string** and must derive from the accessor its owning module
  already uses — the derive-never-duplicate rule applies here exactly as everywhere else.
  33 widgets across 13 categories today.
- **`WS_SPAN` is the size model**: `s`=3, `m`=4, `l`=6, `xl`=8, `full`=12 columns of a 12-column
  CSS grid. A widget only offers the sizes it declares, so drag-resize can never produce a width
  it does not support, and because the grid reflows, **widgets can never overlap**.
- **The default workspace reproduces the old Home exactly** — `pulse, attention, detected,
  fin-row, ctx-row, graph-row, capital, budget, cost2cash, activity`. The old page was not
  redesigned, it was decomposed; the three `HOME_PREVIEW` rows are `bare:true` widgets and keep
  their Preview chips. `bare` means "no widget header outside edit mode", which is what makes a
  composed Home look identical to the Home it replaced.
- **Workspaces and templates are data.** `WS_BOOK` holds the user's workspaces; `WS_TEMPLATES`
  holds 15 starters (6 scenario, 9 role). Adding a template needs no code. `wsFromTemplate()`
  always creates a NEW workspace — it never overwrites one.
- **Edit mode is snapshot-based.** `wsEdit()` deep-copies the item list; `wsCancel()` restores
  it. Anything that mutates layout sets `WS.dirty`. Outside edit mode, actions persist
  immediately; inside it, only `Save layout` does.
- **Every widget-menu action is real** — Refresh, Configure, Duplicate, Pin to top, Open source,
  Resize, Move, Hide, Remove. `Configure` is only drawn when the widget declares `filters`, and
  a widget only shows filters its own render consumes (`WS_FILTERS` + `wsFilterRows`). Do not
  add a filter to the menu that the render ignores.
- **Pin to Workspace lives in the global topbar** (`#tbPin`), not in `glActions`. It was in
  `glActions` first and that covered only the 11 pages using that constant; the topbar covers
  all 62 with one control, which is also the right level (a page-frame action, not a module's).
  It is hidden on Home itself. `wsPin()` auto-adds the `pins` widget so a pin cannot vanish.
- **`localStorage` works in the current preview** (verified: full save → wipe → `wsRestore()`
  round trip). Everything is still wrapped in try/catch and the in-memory book stays
  authoritative, so a sandbox where it no-ops degrades to session-only rather than breaking.
  `wsRestore()` drops items whose widget id no longer exists, so removing a module cannot brick
  someone's saved Home.
- **Publish** copies the layout into a `department`-scoped workspace in the same book. Real
  cross-user distribution needs a backend; the label says "shared" rather than implying it
  reached anyone. `WS_CAN_PUBLISH` is where a role check belongs.
- **Not built, deliberately:** cross-user/global workspace distribution, per-widget data refresh
  against a live source, and drag-to-position free layout (the grid reflows instead, which is
  what guarantees no overlap).
- **Reloading the preview does not always re-execute the script** — module state such as
  `WS_BOOK` survives what looks like a reload. When testing boot behaviour, reset in memory
  (`WS_BOOK=[];wsRestore()||wsSeed()`) rather than trusting a navigate.

## Navigation architecture (read before touching nav)

- **Home is a global ribbon destination AND the wordmark.** `paintRailRoles` no longer filters
  `portfolio` out — Home leads the ribbon with a thin-line house icon, and the
  `<button class="ribbon-brand">` wordmark still calls `pickLens('portfolio')` as a convenience.
  (This reverses the earlier "deliberately no Home tab" rule; it was changed on request.)
  Accounting's rail keeps its own **Overview** (`acctover`) — that is the Accounting module
  overview, not a duplicate of global Home, and must not be removed as "redundant".
- **Top ribbon = enterprise domains** (`#ribbonSections`, from `LENS_ORDER`):
  Home · Accounting · Fixed Assets · Procurement · FP&A · Treasury · Reporting · ⋯
- **The `⋯` More menu is a MODULE LAUNCHER, not an overflow bucket.** It is painted by
  `renderMoreMenu()` from the `MODULE_LAUNCHER` array — grouped (Enterprise workspaces /
  Platform), each entry an icon, a module name and a one-line statement of what that module
  owns. Rules it encodes, which must hold as Korvyn grows:
  **modules only** — enterprise configuration belongs to the Settings gear, personal
  preferences to the profile menu, view controls to the page toolbar, search to global search.
  It is rendered from data so a module can later be *pinned* into the ribbon by changing the
  array rather than rewriting markup; `pinnable`/`perm` are the hooks for that. Navigation
  personalization is **not implemented** and no pin affordance is drawn — a control that
  cannot act does not belong in the UI.
- **The five-level navigation model** (the foundational rule — check a new destination against
  it before adding it anywhere):
  1. global module nav (ribbon + More) · 2. module-specific left rail ·
  3. page/view controls (filters, density, columns) · 4. personal (profile menu) ·
  5. enterprise configuration (**Settings gear, and only the gear**).
  Do not duplicate one destination across two levels without a deliberate, stated reason.
- **Left rail = functions within the active domain** (`#railTabs`, from `RAIL_SPEC`).
- **Ask Korvyn** = persistent contextual AI, **four** states (closed / collapsed / open / full).
  Do not redesign it without being asked. See the Ask Korvyn section below before touching it.

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

- **Data Room** is the module `droom` (lens), reached from the **More launcher**, not the
  ribbon. It lives in `UTIL_ORDER` but — unlike the other util lenses — declares a `RAIL_SPEC`,
  so it gets a contextual left nav. That rail is **grouped** (Data Room / Diligence / Content /
  Governance) because a module owns its own navigation: Home's rail and Data Room's rail are
  different navigations, not variants of one list.
  **Data Room appears in exactly ONE place.** It used to sit in both Home's rail and the ⋯
  menu, which left it ambiguous whether it was part of Home, a global module, or a utility.
  Do not put it back into Home's rail. Home's `Documents` is the user's *working* surface
  (assigned to them, recently touched, attached to their tasks); Data Room is the *enterprise
  evidence* environment. Different concepts — do not merge them, and do not delete Documents
  because Data Room exists.
  **The `dataroom` TAB now belongs to this lens**, titled **Retained Records** (locked periods,
  determinations, lineage to source). It used to be Home's "Data Room" tab, which is precisely
  the duplicate label that was removed; it renders through the untouched `renderDataRoom()`.
  Review Queue and Activity are not new tabs — they reach the Evidence pipeline's own
  sub-views via `act`/`on`, the same mechanism Treasury and Flux review use. Further target
  groups (Supporting Schedules, ERP References, Contracts, Audit Trail) are **deliberately not
  listed** until they render something.
  The droom `VIEW_META.c` strings must **not** begin "Data Room · " — the crumb renders as
  `<lens label> · c`, so that read "Data Room · Data Room · …".
  Tabs: `drover|drreq|drevid|drwork|drext|dataroom`. This required the one shared-code change:
  `paintRailRoles` now blanks a util lens's rail only when it has **no** spec
  (`inUtil && !spec`) — `tasks`/`issues`/`archives`/`admin` still render empty rails.
  **`dataroom` is a different thing**: an existing *tab* in Home. Do not conflate them.
  Data Room is an evidence & diligence workspace — requests and evidence linkages, **never a
  folder tree**; evidence points at source records rather than replacing them.
  **Overview** (`renderDrOver`), **Requests** (`renderDrReq` + `drReqDetail`) and **Evidence**
  (`renderDrEvid`) are built; Workspaces / External Access are still `renderDrStub` placeholders
  showing live counts. `DR_ITEMS` is the important structure: an evidence item is a claim plus
  `links[]` to real records, and those links resolve to actual policies (`ACC-CAP-001`) and
  accounting conclusions (`AI-2026-011`) — keep them resolving if you renumber anything. A sweep
  that executes all 18 distinct `go` strings and asserts the destination view renders is the
  cheap way to prove that; it is worth re-running after any renumbering.
  A request's `items`/`done` are the aggregate; the detail enumerates a representative tracked
  subset and **says so on screen**. Do not "fix" that by inflating counts (see RECON_SCALE).
  **Evidence** is a 4-step pipeline (`TAB_PIPELINES.drevid`: `reg|link|gaps|act`, `drevSub`) plus
  an item detail (`drevSel` → `drevDetail`). Everything derives from `DR_ITEMS`; the sub-views are
  `drevRegister` / `drevLinkage` / `drevGapView` / `drevActivity`. Three things there are
  deliberate and should survive edits:
  - **Two populations, never bridged.** Page figures count the 33 *tracked* items in `DR_ITEMS`;
    the request aggregate is 1,116 items / 850 done. Both appear, each labelled, and the "Where
    the gaps sit" cardfoot says outright that the two are not reconciled. Do not scale either
    into the other.
  - **One lateness rule, `drevLate(i)`** — past due and not yet accepted. It deliberately covers
    provided-and-unreviewed items, so `EV-4211` (in review, 22 days past due) reads as late. The
    5 late items partition cleanly: 3 are counterparty gaps in `drevGaps()`, 2 are ours and get
    their own "Provided but not yet accepted" card. An earlier version keyed lateness off
    `drevOpen` and silently showed those 2 as on time, and the detail view labelled an in-review
    item "closed".
  - **`drevRecords()` is the cross-request payoff** the Requests page cannot show: a record is
    identified by the text before the first ` · ` separator, so `ACC-06` and
    `ACC-06 · Capitalized Labor` are one record cited twice — and `ACC-06` turns out to be
    load-bearing for both an investor-diligence and a SOX request. The rule is stated on screen.
  **The old ~1085px overflow note is obsolete — that bug is fixed.** Every page used to report
  scrollWidth 1141 at 1085px client width because `#copilot` sat in the body grid. The panel is
  now `position:fixed` and out of layout, so there is zero horizontal overflow at any width.
- **Data & Governance** is the module `datagov` (lens + `dgover` tab, `renderDataGov`), also in
  `UTIL_ORDER` with its own `RAIL_SPEC`. It replaced the old **"Data & Controls"** launcher
  entry, which pointed at Home's Controls page — a label promising data governance while
  delivering control tests. Four concepts are kept architecturally distinct and must stay that
  way: **Controls** (financial control framework, testing, monitoring), **Data & Governance**
  (data quality, lineage, definitions, mappings, ownership), **Data Room** (evidence and
  diligence), **Integrations** (connectivity and sync). Everything on the page derives from
  `GL_ERP`, `COA` and `CONS_ENT`; the capabilities that are *not* built (lineage, mappings,
  quality rules, master-data monitoring, glossary) are **named on screen as scope**, not
  mocked up. Do not add a number there that does not derive.
- **Administration/Settings has exactly one entry point: the Settings gear** in the ribbon
  utilities (`pickLens('admin')`). It was previously reachable from four places — Home's rail,
  the ⋯ menu, the user menu, and the **Help** button. The Help icon was replaced by the gear:
  it routed to Administration, which is a mislabelled control, and there is no help content to
  route it to. If Help returns, give it a real destination first.
  A **second** global Settings was also found later, inside `RAIL_SPEC.filings` — a
  `{lens:'admin', label:'Settings'}` entry in the Reporting rail. Removed. When auditing routes
  into `admin`, paint **every** lens's rail before scanning the DOM; scanning only the rail that
  happens to be painted is how that one was missed the first time.
  Known leftovers, deliberately not touched because they are page-level controls in an
  unrelated module: the Reporting filing page's **"Manage filing"** button and its team
  **"View all"** link both still call `pickLens('admin')`.
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
  - **Left rail** `#railTabs` = the **active domain's** functions. There is no generic rail
    label any more (`#railTabsLbl` was deleted — see the icon/label rules below). There is no
    global Workspace group either — Workspace and System live in Home's left nav.
  - Both are painted by `paintRailRoles()`. `paintRailNav` is wrapped so the rail
    highlight follows `pickTab`, not just `pickLens`.
  - `#secnav` (the old row-1 section strip) is **force-hidden** — its content moved to the
    rail and rendering it would duplicate the list. `#subnav` / `#subnav2` remain, and are
    the *within-record* tab strips (flux statement picker, filing workspace tabs).
  - **A tab id can be shared by two lenses.** `exceptions` belongs to *both* Home and
    Accounting — same id, same `#view-exceptions` div, same `renderExceptions()`. Rebuilding
    it for one lens silently replaces the other. The fix already in place: `renderExceptions()`
    branches on `LENS`, and the TAB-keyed registries accept a **lens-scoped key** —
    `TAB_PIPELINES[LENS+':'+TAB]`, `VIEW_META[LENS+':'+TAB]`, and a `LENS` check inside the
    `CP_CARDS` function (returning nothing falls through to the other lens's defaults). Look
    for `'ledger:exceptions'`. Before touching any shared-looking tab, grep its id in `LENSES`
    and count how many lenses list it.
  - **Any setter that changes a pipeline step must call `navRepaint()`.** `renderAll()` does
    *not* repaint `#subnav`, so a setter that only re-renders leaves the highlight stuck on
    whichever step was active when the tab was opened. The page still works and every view
    renders, which is why a length-based sweep will not catch it — it shipped that way in
    Intercompany and Consolidation before being spotted by eye. `setCipSub` / `setFinRepSub`
    had this right all along; the six new setters now call the shared `navRepaint()` helper.
    To verify: change each sub-view and assert `#subnav button.on` matches the expected label.
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
- `GL_RECON` — the reconciliation book, 45 rows, one per account per entity across the four
  entities. **Headline counts are row counts** (`reconCount` / `reconTotal` no longer scale
  anything). Account numbers and names follow `COA` so the recon book and the trial balance
  share a vocabulary; `reconOffTB()` marks the four accounts outside the illustrative
  capital-only TB (10000, 10100, 11000, 13500/23500) rather than letting them mismatch
  silently. Two differences deliberately tie to other modules — 13500 at Meridian DC Holdco
  carries the 2,300.000 intercompany difference, and 20000 keeps its -1.250 AP variance — so
  Intercompany's Traceability link lands on something real. `bal` is thousands, rendered by
  `glK(bal*1000)`.
  Consumers that derive from it: Accounting > Overview, `glAccounts()` (`recSt` override),
  Consolidation (`csxEntity`), and Continuous Close (workstream readiness, ready-now,
  pull-forward, blockers, `ccvReady` buckets). Adding or restatusing rows moves all of them —
  that is intended, but re-run the sweep.
- `CONS_ENT` / `CONS_FX` / `CONS_STAGES` — Consolidation's own data, deliberately thin.
  Entity **status is not stored**: `csxEntity()` rolls it up from `GL_CLOSE`, `GL_RECON`,
  `icxPairs()` and `GL_CONSOL`, so Consolidation cannot disagree with Close, Reconciliations
  or Intercompany. The only genuinely new data is FX rates (nothing else owns them), the
  region/country/BU metadata, and `CONS_DELTA` (a change feed, which by definition cannot be
  derived from current state). `GL_CONSOL` and `consolReady()` are **left alone** because
  Accounting > Overview reads them; **`csxTie()`** asserts the page agrees and must return
  `{ok:true, entities:4, submitted:2}`.
  The readiness score is a weighted roll-up of six gates and falls automatically as any gate
  slips — do not hand-set it. Timeline stage status likewise derives, so the first amber stage
  really is where the delay originates.
  **Deliberate behaviour, not a bug:** an entity marked submitted-and-eliminated in `GL_CONSOL`
  while still carrying critical blockers is surfaced as an *Entity inconsistency* exception.
  Meridian DC Holdco is that case today. Do not "fix" it by suppressing the exception.
  Calibration: an overdue reconciliation degrades the score and raises an exception but does
  **not** mark an entity Blocked — Blocked is reserved for things that actually stop
  consolidation (blocked close tasks, out-of-balance eliminations, missing submission).
- `AM_MATTERS` / `AM_TOPICS` — Accounting > Accounting Issues (`renderAcctIssues`, the
  `LENS==='ledger'` branch of `renderIssues`). **This one is authored, not derived** — the
  deliberate opposite of Exceptions. An accounting matter is a judgment record, so the
  research, analysis, conclusion and approvals ARE the content and live in `AM_MATTERS`
  (8 matters: 4 open, 4 resolved). Only the roll-ups compute over them: `amKpi`,
  `amTopicRoll`, and `amPrecedents(m)` (prior CLOSED matters on the same topic — Korvyn
  surfaces them but never assumes the prior applies; the facts-differ note is intentional).
  The 4 resolved matters ARE the precedent library; two are the exact priors the open matters
  cite (AI-2025-031, AI-2025-018), so don't renumber them without updating the `res[].src`
  citations that reference them. `AM_TOPICS` is the configurable taxonomy. Same shared-tab-id
  split as Exceptions (`'ledger:issues'` in VIEW_META; the Accounting rail badge is
  `amKpi().open.length`, the standalone Issues lens keeps `wsIssueCount()`).
  **Phase 2** added a lens-scoped 3-tab pipeline (`'ledger:issues'` in TAB_PIPELINES:
  matters / precedents / recurring, `amSub` state) plus derived intelligence — all still
  computed over `AM_MATTERS`, no new stored data: `amSimilar(m)` (reuses each matter's
  `res.k==='prec'` entry — its note IS the key difference — labelled Korvyn AI analysis,
  never auto-applied), `amImplVal(i)` (validation is `ok` ONLY where `i.ev` evidence exists,
  never assumed), `amRecurring()` (topic patterns), `amPrecedentBook()` (closed + concluded).
  New detail sections were inserted surgically into `amvDetail` (FS impact estimated-vs-actual,
  validation column, version-history table, policy-action, and a knowledge-graph chain reusing
  `ic-spine` inside a native `<details>` for progressive disclosure). The matters queue and the
  pre-Phase-2 detail sections were left unchanged — the design mandate was enhance, not rebuild.
- `POL_POLICIES` — Accounting > Policies (`renderPolicies`, the `LENS==='ledger'` branch of
  `renderAdmin`; the standalone Administration lens keeps its Settings/thresholds view). Another
  **shared tab id** (`admin`): lens-scoped `'ledger:admin'` in VIEW_META, and a `LENS` guard in
  the CP_CARDS `admin` function. 13 authored policy records (categories, levels, statuses,
  versions, applicability, source docs), including a Global → EMEA → Germany capitalization
  hierarchy (`parent` builds it) and the **ACC-06 / ACC-09 / ACC-14 records that AM_MATTERS
  cite** — do not renumber them without updating those matters' `polNote`/`res` references.
  Everything derives from `POL_POLICIES` (`polKpi`, `polCatRoll`, `polParentChain`,
  `polChildren`); one authoritative record each, never duplicated across categories (a policy
  has one `cat` plus `rel[]`). `aiEx` marks records whose standardized content is still
  AI-extracted and awaiting validation — labelled, never treated as approved.
  **Detail view** is 4 tabs (Overview / Applicability / Versions / Source documents) plus a
  right-side Related Information sidebar — `polvDetail`, `polTab` state, scoped `.pol-*` CSS.
  **Policy Inbox** (`POL_INBOX`, `polvInbox` / `polInbDrawer`) is the governance review queue
  for AI-processed documents, reached via the Library/Inbox sub-nav (`polSub`,
  `'ledger:admin'` pipeline). Nine documents, each with proposed metadata (editable in the
  drawer — mutates the in-memory item), review flags, one `proc` status, and an optional
  `match` to a real `POL_POLICIES` record. **Korvyn proposes; a human validates** — no action
  in the inbox approves, publishes, merges or auto-decides a relationship; that boundary is the
  point of the page. Still NOT built (later phases): document upload/OCR/extraction, an
  approval/publication workflow, a rules/applicability engine.
- `AX_STATE` / `AX_RECUR` / `AX_TREND` — Accounting > Exceptions. The exceptions themselves
  are **not stored**: `axExceptions()` derives all 25 from `GL_RECON`, `IC_EVENTS`,
  `csxEntities()`, `CC_SIGNALS`, `CIP_PROJECTS`, `GL_ERP` and `CLOSE_TASKS`, and every row
  links back to its source. Only workflow lives in `AX_STATE` (status, assignment, validation
  result, root cause, comments), keyed by exception id and merged on — same facts/workflow
  split as `IC_SETTLE` and `CONS_FX`. Owners are inherited from the underlying item via
  `srcOwn`; the meaningful backlog signal is `untriaged` (status still `det`), not "no owner".
  `axScore()` holds **all** the weights and returns its own `drivers` array, which the detail
  view renders line by line — if you change a weight, the explanation follows automatically.
  Do not add a weighting that is not in that function.
  **`amt` and `mis` are different things on purpose:** `amt` is the balance or transaction an
  exception touches, `mis` is the part that could actually misstate. An overdue reconciliation
  on a $78M payable is a control issue, not a $78M error. Never collapse the two.
  Validation is a gate, not a status field: a resolution that does not verify against source
  comes back as `val:'fail'`, still ranks as unresolved, and must never render a green
  "Resolved" pill (that regression was caught in review once already).
- `CC_SIGNALS` / `CC_TREND` / `CC_WS` / `CC_DEPS` — Continuous Close, also deliberately thin.
  The nine workstream readiness figures are **measured** by `ccxWorkstreams()` from
  `GL_CLOSE_FN`, `GL_RECON`, `icxPairs()`, `csxEntities()`, `CIP_PROJECTS`, `GL_ERP` and
  `CLOSE_TASKS`. `CC_SIGNALS` is the exception and the reason the page exists: *detection
  history* — work that was validated and has since been disturbed — genuinely cannot be
  derived from current state.
  **Measured vs estimated is the organising principle of this page.** Anything Korvyn
  assesses rather than measures (emerging risks, days-to-close, effort, time saved) carries
  a confidence and is rendered as a **range** with the `.cc-tag.est` badge; measured figures
  carry `.cc-tag.meas`. Do not add a single-number days-to-close — the absence of one is
  deliberate, not an omission.
  `CC_TREND` stores the trajectory shape, but the final current-period point is overwritten
  at render time with the live score, so the chart and the hero number cannot disagree.
  Dependency-map nodes each read their **own** measure (`cipr`, `pisd`, `icdiff`, `icelim`
  are separate derivations). An earlier version pointed three fixed-asset nodes at one
  workstream and they all showed 55%, which located nothing — the whole value of the map is
  showing where a chain breaks.
- `FILING_TEAM`, `FILING_COMMENTS`, `FILING_NOTES`, `FILING_DISCLOSURES`,
  `FILING_APPROVALS`, `FILING_ACTIVITY` — the filing workspace's supporting data.
- Workspace views (`renderTasks`/`renderIssues`) derive from `CIP_PROJECTS`; `renderArchives`
  reads the live `fluxComments` store. None of them keep their own copies of these numbers.

Financial statements all **derive from `COA` + `FINREP_SUPP`** through **one function,
`finDerived()`** — do not invent parallel numbers; call it. Financial reporting, Flux review
and Consolidation > Consolidated results all read it, so the three cannot disagree. It is
memoised (`_finD`), so declaration order does not matter. It was extracted out of
`renderFinRep` when Consolidation needed the same figures; note that `renderFinRep` still
keeps its own `const S=FINREP_SUPP` because `fluxModel(stmt,S,derived)` takes `S` bare.

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

## Density, copy and icon rules (the "calm density" pass)

- **Scale lives in tokens, never in zoom or transforms.** Base `font-size:13px`;
  `--pad-card:16px`, `--pad-content:20px`, `--row-h:40px`, `--ribbon-h:50px`, `--rail-w:200px`.
  Page title 21/650, section heading 15/600, table 12.5px with 11px headers, KPI value 21px.
  KPI cards land ~126px. If a future pass needs more density, move these — do not add a
  wrapper transform.
- **The workspace is not capped at a consumer width.** `.content` max-width is 1760px because
  1440/1600/1920 desktops are the primary target. It used to be 1360px, which wasted a 1920 display.
- **One meaning per icon: the house is GLOBAL HOME and nothing else.** Every "Overview" entry
  uses the 2×2 grid glyph. Eleven house paths were swapped; only `ICON.home` keeps it.
  **No two entries in the SAME rail may share a glyph** — that is the case a user actually sees,
  and it reads as "these are the same thing". Four pairs were fixed: Exceptions/Issues (Home),
  Continuous Close/Data-sync (Accounting), Capital-lifecycle/Lifecycle and
  Capitalization/Placed-in-service (Fixed Assets). Current assignments worth preserving:
  ⚠ triangle = Exceptions (detected by the system) · ⚑ flag = Issues (raised by a person) ·
  ⟳ sync arrows = Integrations/sync · ∞ = Continuous Close · 🛡 shield = Controls and Policies ·
  document+check = Evidence · archive box = Retained Records/Archives · sparkline = Activity.
  Reusing one glyph across *different modules* is tolerated (never seen side by side); reusing
  it inside one rail is not. To check, group every `RAIL_SPEC` entry's `ic` per lens and assert
  no path maps to two labels.
- **A rail never names its own module.** The module is already named twice above the rail —
  highlighted in the ribbon and spelled out in the topbar crumb — so a third copy is noise.
  `#railTabsLbl` (which printed `LENSES[LENS].label`) has been **deleted**, along with the
  `lbl` handling in `paintRailRoles`; do not reintroduce it. Group heads name GROUPS, never the
  module: Home is My Work / Workspace / System, Accounting is Close & ledger / Governance /
  Reports, Data Room is Diligence / Content / Governance with Overview ungrouped at the top.
  `filings` keeps `{head:'SEC filings'}` because that is a group *inside* Reporting, not the
  module's own name.
- **No internal product vocabulary in user-facing copy.** "Spine", "edge types", "phantom cost"
  and similar are out of visible UI. The decorative "provenance depth" bars in the topbar were
  removed outright — they rendered an unexplained 1–5 scale — and the footer is now scope and
  period only, not product philosophy. `VIEW_META.depth` still exists but is not drawn.
- **Summary amounts use `homeAmt()`**, which switches to whole dollars under $0.1M. `glB()`
  alone renders a real 1,250 variance as "$0.0M", which reads as nil. Detail pages keep `glK()`.

## Design system — Midnight + Cobalt (read before styling anything)

The palette is **four planes**, and the tokens are named for their plane. Keeping them separate
is the whole design; blurring them is the failure mode.

| Plane | Tokens | Owns |
|---|---|---|
| **Midnight** | `--rail` `#08111F`, `--rail2` `#0D1726` | platform chrome — ribbon, module rail |
| **Cobalt** | `--accent` `#2563EB` + `--accent-*` | interaction, navigation, selection |
| **White** | `--bg` `#F7F8FA`, `--surface` `#FFFFFF` | the financial workspace |
| **Indigo** | `--ai` `#6366F1`, `--ai-bg` `#FAFAFF`, `--ai-line`, `--ai-ink`, `--ai-deep` | **Korvyn Intelligence, and nothing else** |

- The two midnight planes are deliberate: the ribbon sits deepest, the module rail one step up,
  so they read as connected but distinct. `.rail` uses `--rail2`, `.ribbon` uses `--rail`.
- **Never use `--ai` to decorate a non-intelligence surface.** Indigo marks Ask Korvyn, Korvyn
  Insight, AI indicators and generated recommendations. Cobalt owns everything interactive. If
  indigo starts appearing on ordinary UI the palette stops meaning anything.
- **Active nav is an indicator, never a filled block.** `.railrole` is shared by the ribbon and
  the left rail, so each scopes its own treatment: `.ribbon-nav .railrole.on` gets a 2px cobalt
  underline; `.rail .railrole.on` gets a subtle lighter navy plus a 2.5px cobalt left indicator.
  The bare `.railrole.on` only sets weight/colour. This keeps the ribbon quiet as domains are added.
- **Rail badges are open-item counts, not alarms.** The default `.rbadge` is a neutral chip;
  red on every badge is alarm fatigue and buries the genuinely critical.
- **Cards are flat.** `.card` carries a 1px border and no shadow. Elevation is reserved for
  things that actually float — menus, overlays, dialogs, drawers, intelligence surfaces.
- Radii: `--radius` 10px (panels), `--radius-sm` 8px (cards), `--radius-xs` 6px (inputs/buttons).
- **`.spark` is already the 170px sparkline chart.** The intelligence spark is `.ki-spark`.
  Defining a bare `.spark` silently resizes every chart in the app — this was caught once.

### The split workspace: BROWSE → INSPECT → WORK

`.wsplit` is a **reusable record-investigation pattern**, not a Reconciliations one-off. Use it
anywhere a record needs inspecting without losing its list.

- **BROWSE** — `.wsplit` single column, list at full width.
- **INSPECT** — `.wsplit.on` becomes `1.7fr / 1fr` (~63/37). The detail pane `.wdetail` is a grid
  **sibling** of the list, never an overlay, so nothing is ever occluded. Under 1100px it
  linearises rather than crushing the table; `.rec-hide` columns drop in split mode.
- **WORK** — the record takes the primary working area (`glvReconWork`), with a back link.

Reconciliations wires this via `glReconSel` (keyed `acct|ent` — **account alone is not unique**,
the same account is reconciled in several entities), `glReconWork`, `glReconTab`. Clicking the
selected row again toggles the pane shut. `reconDrill()` is preserved and reachable from the
detail pane's Related tab, so the old GL-intelligence route still works.

**Everything in the detail pane derives** — `glTxns()`, `IC_EVENTS`, `DR_ITEMS`, `POL_POLICIES`,
`axExceptions()`. `glReconRel()` omits a row when a relationship does not resolve rather than
inventing a count, which is why account 13500 shows no "ERP transactions" line: it is outside the
illustrative capital-only TB, so `COA` has no entry and `glTxns` would be fiction. Do not
"fix" that by hardcoding a number (see the RECON_SCALE note). `glReconInsight()` is derived
from the row's own facts, labelled Korvyn analysis, and states that it is never auto-applied.

## Ask Korvyn (read before touching the assistant)

`#copilot` is an **overlay**, never a layout participant. This is the load-bearing rule:

- The body grid is **two columns** (`rail main`). The assistant deliberately has no grid
  column, so opening it cannot reflow, resize or restyle the page underneath — the page keeps
  its full width in every state. Do not reintroduce a `copilot` grid area or a `--copilot-w`
  column; that is what caused the old 1085px overflow.
- `.copilot` is `position:fixed`, right edge, `top:var(--ribbon-h)`, width `var(--copilot-w,440px)`.
  Hidden is `transform:translateX(100%)` — **not** `width:0`.
- **Four presentation states over one live session.** Go through the helpers, never toggle the
  classes by hand:

  | State | Classes | Affordance | Helper |
  |---|---|---|---|
  | Closed | `copilot-collapsed` | ribbon icon only | `cpClose()` |
  | Collapsed | `copilot-collapsed copilot-min` | small edge tab `.cp-mintab` | `cpMinimize()` |
  | Open | *(none)* | 440px workspace | `cpOpen()` |
  | Full | `copilot-full` | expanded workspace | `cpWide()` |

  `copilot-collapsed` means "panel not visible" in **both** hidden states; `copilot-min` is what
  distinguishes a parked session from a dismissed one. Every place that used to open the panel
  with a bare `classList.remove('copilot-collapsed')` now calls `cpOpen()`, because it must clear
  `copilot-min` too or the edge tab is left stranded. `cpToggle()` is still the ribbon icon's
  handler and still means open ↔ close.
- **Session continuity is the point of Collapse, and it is structural, not saved state.** The
  conversation lives in `#cpThread`; no state transition touches it, and `.cp-scroll` is never
  re-rendered on a transition, so scroll position survives too. `renderCpHome()` already yields
  the panel to the thread whenever one exists, so a parked session comes back rather than being
  replaced by the suggestions home. **Close does not destroy the thread either** — nothing a
  user generated should vanish silently; `cpNewChat()` is the one explicit way to clear.
  If you add a state, verify the thread survives it.
- An earlier build had a 56px `copilot-rail` icon strip; it was removed along with `cpRail` /
  `cpSetRail` / `renderCpStrip` / `cpExpandTo` and its CSS. Do not resurrect it — `copilot-min`
  now covers the "get out of my way but keep my work" case properly.
- **Closed state has no on-page affordance at all.** No rail, no pill, no reserved width —
  the workspace is completely unobstructed. Korvyn AI is reached from exactly one place: the
  `.ribai` icon in the ribbon utilities (`#ribAi`, order Search · Help · Notifications ·
  **Korvyn AI** · user). Three earlier designs were rejected and should not come back: a floating
  bottom-right pill, a 34px vertical right-edge rail with a rotated "Korvyn AI" label, and a
  three-connected-nodes glyph that read as a funnel at 16px.
  The icon is a 32px `.ribicon` carrying `--rail-ai` — a blue that reads on the dark ribbon,
  since `--accent` is a light-surface hue and is unreadable there. The ribbon is dark in both
  themes, so `--rail-ai` is one value in both.
- **The AI glyph is a two-spark AI mark** (large four-point spark plus a small companion),
  shared verbatim by `.ribai` and `.cp-mintab` — if you change one, change both. This was
  chosen by the user from four rendered candidates, over three options that carried more Korvyn
  identity, so **do not "restore" the brand mark here**: the earlier "no sparkle" instruction
  was explicitly superseded. The **panel header** (`.cp-mark`) still carries the Korvyn brand
  PNG, and that split is intentional — the affordances say "AI", the panel says "Korvyn".
  Two PNGs are inline if you need the source artwork: the wordmark lockup (557×96) and the
  symbol alone (141×128, the ring with a line through it and a node at the left, used by
  `.cp-mark`). Rendering that PNG at 16px goes muddy — its soft glow does not survive the
  downscale next to crisp stroked icons — which is why ribbon-scale glyphs are drawn as SVG.
- `.ring` is a **shared class name**: `.tree-hd .st .ring` / `.tree-kid .st .ring` are the
  filing-tree status dots and are unrelated to anything AI. A previous icon carried
  `class="ring"` with `.ribai .ring` rules; those were removed with it. Keep any future rule
  scoped to its container.
- **`#ribAiDot` is availability, not alarm:** a 6px `--rail-ai` dot, never the red `.ribdot`
  used by notifications, and hidden while the panel is open. It is repainted inside
  `paintRailRoles` next to the `ribNotif` badge, so it tracks nav changes for free.
- **The panel separates from the workspace through boundary, shadow, spacing and type — never
  through a tinted background.** `--surface-ai` is within a hair of `--surface` in both themes
  (`#FCFDFE` / `#151C29`) and must stay that way. It exists only so the two planes are not
  byte-identical; it is not a colour accent.
- Header carries the identity block (mark, "Korvyn AI", and the grounding line with its green
  check) plus exactly two controls: full screen and close. Starred/History moved to the quiet
  `.cp-util` row **below** the input so they cannot compete with it. Every control in that row
  does something real — `cpNewChat()` clears the thread, and there is no Upload/Settings stub,
  because dead controls are against house rules.
- `cpUserName()` reads the first name off `.um-nm` in the user menu; if that is ever removed the
  welcome falls back to a generic "How can I help?" rather than rendering "Hi, ".
- Suggestions are capped at three (`cards.slice(0,3)` in `renderCpHome`) — the underlying
  `CP_CARDS` / `CP_SUGS` data is untouched, only the render is trimmed.
- Dragging the resize handle narrower than `CP_SNAP` (200px) now snaps the panel **shut**,
  since there is no rail to snap to.
- `localStorage` silently no-ops under `file://` in the preview sandbox (all the writes are
  already wrapped in try/catch), so open/closed state will not persist across a preview reload.
  That is the sandbox, not a bug — do not "fix" it with a different storage mechanism.

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
- **Spreading then re-keying silently shadows.** `return {...meta, fx}` where `meta.fx` is the
  functional-currency *string* and the local `fx` is the rate *object* leaves `e.fx` as the
  object. The header rendered `[object Object]` and — worse, because it was silent — the
  currency filter compared a string against an object and matched nothing. It shipped through
  a full render sweep because the views still produced plenty of characters. When you spread a
  metadata object and then add keys, check the key names do not already exist; give the new one
  a distinct name (that is why it is `fxr`, not `fx`).
- **Duplicate keys in an object literal silently win.** `VIEW_META` already had a `consol:`
  entry far below where a second one was added; last-one-wins meant the new title never
  applied and nothing errored. Before adding an entry to `VIEW_META`, `LENSES`, `TABS`,
  `CP_CARDS` or `TAB_PIPELINES`, grep for the key first.
- **Grepping for `X.` misses `X` passed bare.** Before extracting `finDerived()` out of
  `renderFinRep`, a grep for `S\.` said `S` was unused downstream — but the function passes it
  bare into `fluxModel(stmt,S,derived)`, so removing the declaration threw at runtime. When
  checking whether a local is still needed, grep for the bare identifier with word boundaries,
  not just its property accesses.
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

**Node IS installed — it is just not on `PATH`.** An earlier session recorded "Node is not
installed on this machine" here, `where node` agreed, and 1,217 lines of TypeScript were
committed uncompiled on the strength of it. It lives at:

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"   # v22.23.1, npm bundled
```

Before concluding a tool is absent, search the filesystem, not just `PATH`. Python is also
available. For the dashboard the browser-preview sweep is still the better end-to-end check,
but `node --check` on the extracted script now works too.

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
#     and setIcEvSel over IC_EVENTS. Consolidation: drive setCsSub over
#     status/entities/elim/fx/results/excep/timeline, setCsEnt over CONS_ORDER, and
#     setCsStmt x setCsCmp across the results grid.
#     Continuous Close: drive setCcSub over
#     now/ready/changed/risks/activity/deps/pull/block.
#     Exceptions: drive setAxSub over queue/exposure/aging/recur/close/valid/trend and
#     setAxSel over axExceptions(). ALSO assert Home > Exceptions is unchanged —
#     pickLens('portfolio');pickTab('exceptions') must still render the old
#     control-test page (~3,395 chars, no #subnav), since the tab id is shared.
#     Tie assertions: icxTie() -> {ok:true,pairs:5}; csxTie() -> {ok:true,entities:4,submitted:2}.

# 2d. Sub-nav highlight: after each setXSub, assert
#     document.querySelector('#subnav button.on').textContent matches the step you set.
#     Views render correctly even when the highlight is stale, so nothing else catches it.

# 2c. A render sweep proves nothing about CONTENT. Both bugs found in the Consolidation
#     build (a shadowed key rendering "[object Object]", a filter matching nothing) passed
#     the length check comfortably. Spot-check the rendered HTML for "[object Object]",
#     "undefined" and "NaN", and exercise at least one filter per page and assert the row
#     count actually changes.

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
