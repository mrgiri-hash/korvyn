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

- **Data Room** is the module `droom` (lens), reached from the **⋯ menu**, not the ribbon. It
  lives in `UTIL_ORDER` but — unlike the other util lenses — declares a `RAIL_SPEC`, so it gets
  a contextual left nav (Overview / Requests / Evidence / Workspaces / External Access, tabs
  `drover|drreq|drevid|drwork|drext`). This required the one shared-code change:
  `paintRailRoles` now blanks a util lens's rail only when it has **no** spec
  (`inUtil && !spec`) — `tasks`/`issues`/`archives`/`admin` still render empty rails.
  **`dataroom` is a different thing**: an existing *tab* in Home. Do not conflate them.
  Data Room is an evidence & diligence workspace — requests and evidence linkages, **never a
  folder tree**; evidence points at source records rather than replacing them. Phase 1 is
  Overview only (`renderDrOver` over `DR_REQUESTS`/`DR_ACTIVITY`/`DR_EXT`); the other four are
  `renderDrStub` placeholders showing live counts.
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
