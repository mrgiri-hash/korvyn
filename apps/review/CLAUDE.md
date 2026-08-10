# CLAUDE.md — Korvyn Review Platform (`apps/review/index.html`)

**This is the active front-end.** The Financial Review Platform — a single self-contained HTML file
(inlined wordmark + tokens, no build step). Open it in a browser, or serve it live with the agent
(below). For the monorepo map see the [root CLAUDE.md](../../CLAUDE.md); for the UI system see
[`design-system/design-system.md`](../../design-system/design-system.md) — read it before any UI work.

## The organizing idea

The unit of work is a **Financial Review Package** (Operating Expense, Cash, Revenue, Fixed Asset,
CIP, Debt, Lease, AP…), **not a module**. The home answers *"what reviews need me today?"* and every
review opens a consistent workspace: Executive Summary · AI Analysis · Trend · Reconciliation ·
Transaction Drilldown · Workpapers · Supporting Evidence · Journal Entries · Discussion · Review
History · Approvals · Audit Readiness.

**Flux review is the most developed surface.** Operating Expense and Revenue reviews are wired
**live** to an embedded GL trending engine (interactive chart, materiality-flagged variance table,
transaction drill-down, derived exec + AI narrative). Other reviews show honest "connects as we go"
stubs naming their real engine — never mocked numbers.

## The 2026-08-09 reconstruction (owner's specimen) — read this before touching flux chrome

The owner supplied a screenshot of the intended Flux Review page and asked for it to be
reconstructed. Several rules below were written against the *previous* layout and are now amended;
where a bullet further down conflicts with this section, **this section wins**. What changed:

- **ONE chrome band.** `#topnav` (the 42px light-grey module nav) now lives **inside** `.ribbon`.
  There is one bar (`--rb-h`, 52px after the density pass) carrying brand · history · module nav ·
  search · Ask Korvyn · alerts · identity, and **Favourites stays in it** (owner's explicit
  instruction). `--rb-h` is the single
  source for that height — every panel that hangs below the chrome and everything that sticks under
  it reads it. Two hard-coded numbers (52px "under the ribbon", 94px "under both bars") were
  repeated across a dozen rules; don't reintroduce either.
  - The bar cannot hold everything at every width, so optional pieces shed in priority order:
    history → the role caption → the Ask Korvyn label → the label text on Materiality / Entity.
    `.topnav` is `flex:0 0 auto` deliberately: its dropdowns are absolutely-positioned children, so
    shrinking it does not clip, it draws the tabs on top of the search box.
- **Palette: the pre-existing theme stands** (slate `--chrome`, teal `--fx-sec-tx`, navy
  `--accent`). A navy-chrome / action-blue pass was built and then reverted at the owner's
  direction on 2026-08-09. Don't re-apply it.
- **The flux top section is: crumb · identity line · attribute line · ONE KPI card · ONE control
  bar.** This supersedes the "three bands" rule below.
  - The **close-context bar does not render on the flux pages at all** now. Its three jobs moved to
    where they read: the period became the pill in the identity line's right cluster, the close
    state became the badge beside it, the completion figure became the first KPI cell. Same
    functions, one band instead of two. It still leads Flux Overview and Close Periods.
  - The **ownership strip is gone as a strip** — back, star, state badge and Submit all sit in the
    identity line, which had unused width on the right.
  - The **attribute line** (`Balance Sheet · Meridian EMEA · USD · US GAAP · Actual`) is new. Those
    facts were previously scattered across a scope chip, the toolbar and the print header, so
    nothing on screen answered "which basis is this?" without opening a menu. `FX_REPORTING`
    declares currency / framework / basis once.
  - **One KPI card, five cells** (Reviewed · Material items · Unexplained variance · Overdue ·
    target date), replacing seven bordered mini-cards. The seven violated design-system rule 4 and
    mixed two questions — the movement bridge and the sign-off state — so neither read as an
    instrument. The card answers only *where does the sign-off stand*; the bridge figures live in
    the method footnote and the Organic / FX columns that already carry them per line. It mounts
    through a `<!--KPIS-->` placeholder because half its figures are derived further down.
  - **One control bar** (`.fxcb`): Statement segmented · comparison-window readout · Basis ·
    Materiality · Entity … search · Columns · Export · Filters · expand. Density left the bar for
    the drawer's presentation tier.
    **Nothing on it is ever hidden to make it fit.** Below ~1600px it splits into two rows, and it
    splits **at the spacer** so the break lands on the seam already there: population controls
    above, reading tools below. An earlier pass wrapped wherever it ran out — stranding Export and
    Filters on a second line while Columns stayed on the first — which is why `nowrap` plus
    hide-on-narrow was tried and then rejected in turn.
    Breakpoints are calibrated for the **expanded 248px rail**, the default; a collapsed rail just
    leaves slack. A container query would be the exact tool and is deliberately NOT used:
    `container-type:inline-size` applies `contain:layout`, making the element a containing block for
    fixed-position descendants — it would tear the Filters drawer, the line-detail panel and the AI
    panel off the viewport.
  - The **comparison window is a READOUT, not a control** — no border, no chevron, no hover. It is
    Period × Basis, and both of those have real controls inches away; making it a dropdown would
    put a third writer on variables two controls already own. It **stays visible at every width**
    (an attempt to hide it below 1520px was reverted at the owner's direction — it is the first
    thing a reviewer checks). What yields instead is the search field, then the Materiality /
    Entity word labels. It prints the year once when both endpoints share it (`Jun → Jul 2026`),
    and a single month when the basis leaves nothing to compare against — a `Jul 2026 → Jul 2026`
    readout states a comparison that is not happening.
  - **THE GRID STARTS AT y≈273, AND THAT IS THE BUDGET.** Everything above it is chrome on the one
    thing the page exists to show. Measured with `.fx-gridwrap`'s `getBoundingClientRect().top` at
    1440 and 1800 — check it after any header change. It was 430, then 344, then 293; each pass
    only found the next band by measuring, so measure. Where the budget goes: ribbon 56 · spine 36 ·
    wrap padding 18 · identity block 53 · KPI card 62 · control bar 48.
    Three structural rules hold it there, in order of how much they saved:
    1. **The crumb is a PREFIX on the title line, not a band.** Its last node was the review's name
       and the next line was an H1 of the review's name — two bands saying one thing, which is the
       defect the 2026-08-08 rebuild removed and which came back by following the specimen's layout
       literally. Its handler is scoped `#view .rp-cr[data-go]`, NOT `.rp-crumb .rp-cr[data-go]` —
       the crumb-scoped selector would leave it dead.
    2. **The attribute line lives INSIDE the identity block**, as line two under the title, with the
       right-hand cluster centring against the pair. As its own band it cost 28px to print five
       words of context belonging to the title above it.
    3. **The control bar's word labels go before the bar splits** (≤1640px), because a second row
       costs 44px on every render and "≥ 8%" / an entity name already read as what they are.
    Type is sized to match: 20px title, 19px KPI value, 7px card padding. The target-date cell is
    the one value NOT in the mono face — a date is not a figure you column-align, and Plex Mono
    spaced "Aug 5, 2026" across its whole cell.
    The **spine is 34px, not 44** — it is persistent chrome on every screen, so its height is a tax
    paid on every page; it needs to be readable, not comfortable.
- **The Filters drawer is a FORM of labelled fields**, not label-left/value-right accordion rows.
  The principle survives unchanged — each group is shut by default and shows the value in force, so
  the whole filter state reads top to bottom without opening anything — only the clothes changed:
  the label moved above the control so the value owns the field's width, and the field took a
  select's border. Expansion is still **in place**; do not turn these into nested popups inside a
  scrolling panel. Order: population fields · two switches · a `Presentation & views` band · the
  presentation fields · Active filters · sticky Cancel/Apply + `n of m rows shown`.
  - The switches (Unexplained only / Missing evidence only) write the **same `fluxLens`** the
    Reviewer-status field writes, through the one `.fxm-status` handler, so they cannot contradict
    it.
  - **Deviations from the specimen, deliberate:** no separate `Region` select — region is a
    dimension of the Entity picker's own browse, and a second writer on `fluxScope` is exactly the
    duplication this module keeps removing. Reporting basis renders Budget and Forecast **disabled**
    because no such version is loaded; an option that silently does nothing is worse than an absent
    one.
  - Statement, Comparison basis and Materiality now appear **both** on the bar and in the drawer.
    That relaxes the "nothing in the panel may also sit on a bar" rule below, at the owner's
    direction. It is safe only because chips derive from state (`fxFilterChips`), so a change made
    on the bar still produces its chip — verify that stays true.
- **The statement grid's indentation ladder is 20px per level**, and the position IS the level:
  `x=28` section captions **and the totals that close them** (a subtotal belongs *to* its section,
  so aligning them is what makes the total scan as the section's own line) · `x=48` categories,
  behind a caret gutter reserved even on leaf rows · `x=68` GL accounts. A first pass used 4px and
  read as inconsistent alignment rather than depth. Tree-elbow connectors were removed: at three
  levels the indent alone is unambiguous, and 100+ hairline elbows read as a second grid.
  - **A caret only where expanding reveals something.** A category mapped to one GL account
    expanded to a copy of itself — a dead control. Those rows keep the caret's width as a spacer.
  - Δ% is now coloured. It and Variance are the two columns design-system rule 2 allows; the
    current-period column lost its tint because it competed with them.
  - The Explanation cell is **one clipped line** with the full text in `title` and the detail panel.
    A four-line note used to set its whole row's height. The column is a fixed 330px — `auto` plus a
    nowrap cell let one long note widen the table and shove the money columns left.
- **The line-detail panel is Overview · Comments · Evidence · History**, and it **opens on
  Overview** (`fluxInspDefaultTab='overview'`). It used to open straight into the conversation,
  which answers "what has been said about this" before it has answered "what is this and where does
  it stand" — the two questions a reviewer has, in that order.
  - The header is **four labelled figures** — current · prior · variance · Δ% — not one big balance
    with the delta trailing it in parentheses. In a flux review the movement is the subject, not a
    footnote to the balance. Colour lands only on the two variance cells, the grid's rule.
  - Tabs carry their own counts. "Comments" and "Comments 5" are different invitations. A count is
    inventory, so it is quiet grey — never the gold badge (design-system rule 5).
  - **Overview** is five cards: Explanation (with a derived classification chip and Accept / Edit) ·
    Key drivers (footing to the header's variance, which is what the Total row is for, with FX
    translation on its own line rather than folded silently into the scopes) · Workflow & review ·
    Evidence and Comments as **summaries with a chevron through to their tabs**. "Is there anything
    behind this line?" is a different question from "let me work the thread".
  - The classification chip is **derived, never typed**: below materiality → `Routine`; material and
    accepted → `Material · explained`; material and unaccepted → `Needs review`.
  - **One tab, one job.** The explanation, the people row and the drivers left Comments for
    Overview; prior-period explanations and the activity log left it for History, where they belong
    — they used to trail the live thread, so the conversation you were reading ran straight on into
    last quarter's signed-off notes. Rendering the note in both places had put the same explanation
    on screen twice behind two Edit buttons writing one variable.
  - A **sticky `Open in review`** footer is the one action that leaves the panel. It closes the panel
    when a review is already open rather than navigating to the page you are on.
  - Anything a user writes is stamped with `fxNowLabel()`. `cm.at` feeds both the byline and the
    Workflow card's "Last updated"; an explanation with no date on it is not an audit record.
- **Cash is a category of Current assets, not a peer section of it.** It used to carry its own `fs`,
  so the balance sheet opened with a "Cash & equivalents" line floating above the CURRENT ASSETS
  heading and outside the "Total current assets" it foots into — a presentation the balance sheet
  does not have.

## Platform-wide type & density (2026-08-09 overhaul — owner's picks)

- **Inter is EMBEDDED** — a latin-subset variable woff2 (wght 100–900, ~97KB base64) beside the
  Plex Mono faces. Before this the stack *declared* Inter but shipped nothing, so every machine
  rendered Segoe UI against embedded Plex Mono — a mismatched lockup nobody chose. If the type ever
  looks "off", first verify the face actually loads (`document.fonts.check('16px Inter')` and a
  canvas width probe against a bogus family) before adjusting sizes; that was the real defect here.
- **Compact density** ("Bloomberg/ERP", owner's pick): base 13px/1.4 body · statement rows 32
  (GL 30, totals 36, grand 40, thead 28) · `.rp-tbl` register rows 32 to match — the two big tables
  side by side with different row heights is what reads as "inconsistent" without anyone saying
  why · controls 30px · ribbon `--rb-h` 52px. Comfortable/Executive per-user modes still layer on.
- **Type scale tokens are now truthful and distinct** (11/12/13/14/15/18/24px). The old scale had
  `--fs-11` ≡ `--fs-12` (both 0.75rem) and `--fs-28` at 2rem — sizes set by name were not the sizes
  that rendered. Names are historical; the rem value is authoritative.
- **Width: data runs full-width, prose caps itself.** `.wrap` has no max-width; the settings shell
  (`.rd`) caps at 1320px. Don't reintroduce a global cap — it wasted the right third of a wide
  monitor on exactly the screens that need columns.

## ONE page-header pattern, platform-wide (2026-08-10)

Every page's header is the flux identity block: **[grey 13px context prefix] / [18px/700/-.016em
sentence-case title]** on one line, a 12px muted sub beneath, actions at the right centring against
the pair. Implemented on the SHARED classes (`.kv-hd` + `.k` + `h1` + `.kv-sub`, `.hm-*`, `.fx-h1`,
`.rvc-title`) so no renderer's markup changed — the kicker `.k` renders inline before the title
with a `::after "/"`, exactly the flux crumb-prefix. What this killed: `.kv-hd h1` was UPPERCASE
24px over a rule-off band ("ALL REVIEWS", "SETTINGS"), Home ran 27px mixed case, flux 18px — three
dialects, so switching tabs read as switching products. Crumb bands (`.rp-crumb`), where a page
still has one, are retyped to the same 13px grey so they read as the same voice one line taller.
Don't reintroduce a per-surface title treatment; if a page needs more hierarchy, it gets it below
the header, not by growing the title.

## ONE page grammar + ONE filter home, platform-wide (2026-08-10, the KD engine)

The flux review page (the owner's specimen) is now the **platform grammar**, and every list page
renders it: **header · ONE `.fxk` KPI card · ONE `.fxcb` control bar (population pills left,
search / Columns / Filters right) · `.fx-chips` active-filter chips · content card · `.ldg-note`
footnote.** Converted: My/All Reviews (`renderReviewRegister`), Review Packages, Close Periods /
Overview archive, Trial Balance (`renderLedger`, whose search/section/tie filters are real), and
Trending + Variance (via `fxaChrome`'s new `o.right` slot). The old per-page dialects — `.rp-sumbar`,
`.rp-chips` status chips, `.rp-filt` select rows, `.rp-gbbar` on periods, `.rvw-vbar` — are gone;
don't reintroduce one.

**FILTERS live in ONE place on every page: the right-hand 440px drawer** (`.fx-fdrawer`, the flux
drawer's own CSS), driven by the shared **KD engine** (`kdReg`/`kdOpenDrawer`/`kdAttach`, beside
`fxaChrome`). Each page registers a REGISTRY — `{id, noun, fields:[{k,label,val(),body(),tier,
when()}], get/set/reset/clear, chips(), rows(), rerender()}` — so the drawer is written once and
pages cannot drift. Semantics are the flux drawer's, deliberately: controls apply **live**; the
drawer **snapshots on open** (`kdSnapshot`); Cancel / × / scrim / Escape restore; Apply commits.
Rules that must hold:

- **Bar pills and drawer fields emit the SAME data attributes** (`data-regchip`, `data-pfstatus`,
  `data-fxawin`…). `kdAttach(id)` is called immediately after `#view.innerHTML=` and **before** the
  page wires its handlers, so one `querySelectorAll('#view …')` pass serves both surfaces. Wire a
  drawer control through a second handler and the two surfaces can disagree.
- **Registry closures must read live state.** A field/rows() that captures a per-render local counts
  against a stale value forever (the `ldgPass` bug: it was in-render, the registry kept the first
  render's copy — it is module-level now). Keep predicates at module level.
- `navTo` calls `kdRouteChange()`: a route change **commits** whatever is applied (filters are live)
  and drops the drawer; the shared `fx-filt-open` body class is only cleared when flux doesn't own it.
- On the analytics lenses, control handlers go through `fxaGo(route)` — while a drawer is open a
  change re-renders in place; `navTo` would close the drawer mid-edit.
- **Pills carry their NAME as the value while at default** ("Status", "Package") and the selection
  once one is made — `.fxcb-l` labels hide below 1640px, and three bare "All" pills say nothing.
  The chips row states every non-default selection in full, so nothing is ambiguous.
- **Saved views (`KVIEWS`, per page, in every drawer's Presentation tier)** are named snapshots of
  that page's registry state. Unlike flux Review Sets they MAY carry filters — a list page's filters
  are not a sign-off population, and the chips row always says what is active. The flux review keeps
  its own drawer/engine (suggestions, tiered fields, review sets); KD mirrors its behaviour and CSS
  — change the interaction pattern in one, change it in the other.
- Pages with nothing to filter (stubs, settings, reporting stubs) get **no bar** — a bar of dead
  controls is worse than no bar (repo rule). The KPI card is for list pages with population stats;
  content pages lead with their content.

## ONE left rail, ONE config, every module (2026-08-10)

**`renderRail(rail)` is the only rail renderer, and NAV_CFG is the only rail definition.** It
replaced three renderers that produced three different structures: `renderFluxRail` (hardcoded
`FLUX_NAV`: groups + badges + per-group Planned), `renderSectionRail` (off `NAV_SECTIONS.kids`: one
flat list, one Planned, no badges) and `renderModulesNav` (NAV_CFG, **Home only**). The rail changed
shape as you moved between modules — and the real defect: **Settings → Navigation governed Home
alone**, so for every other module the role×item matrix, reordering and custom items were a dead
control. Every rail is now: header → sections → per-section `Planned (n)` → Favourites → Customize
foot. Rules:

- A section declares its `rail`. **`rail:'*'` renders on every rail** — that is how Favourites stays
  the one organiser without being duplicated eight times in the editor. `head:false` suppresses the
  heading (the Flux entrances lead ungrouped). `count:` names a figure in the **`navCount` registry**;
  the rail never computes one, so it cannot disagree with the page it leads to. Only `mine` is the
  gold action badge — `close`/`all` are quiet grey inventory (design-system rule 5).
- **`navRailFor(route)`** resolves the rail; `navIsFlux` stays an explicit test because `mtrend` and
  `frov` are not NAV_SECTIONS kids and the Flux rail must survive opening a close. `FLUX_ROUTES` is
  derived from **`navDefaultCfg()`, never the saved config** — which rail a route belongs to is a
  property of the product, so an admin hiding an item must not strand its route.
- **`renderReviewsNav` was a live landmine and is now a delegation.** It was already unreachable, but
  ~20 callers still invoked it (favToggleGrp, ctToggle, orgMutated, folderToggle*, navSecToggle…) and
  every one silently wiped whatever rail was up — the defect the old "never call orgSetGroupBy /
  orgMutated from a Flux page" warning describes. It now repaints the current rail, so those callers
  became correct instead of dangerous. **Do not give it a body again.**
- The editor **groups by rail**, offers a per-section **rail picker** (a section can be moved between
  modules), previews **per role AND per rail**, and repaints the live rail on every edit — an edit
  that only updated the preview read as not having taken. Sections on a rail that no longer renders
  (the retired `reviews` navigator) are skipped rather than offered.
- **Migration:** the existing "insert missing builtins once, tracked by id" pass carries saved configs
  onto the new rails. A **one-time rail adoption** (`korvyn.navcfg.railver.v1`) then makes builtin
  sections take the default rail — before this build `rail` was not user-editable, so a stored rail
  carries no admin intent. That is what moves Favourites from `modules` onto `*`. After the flag is
  set the rail is the admin's to own. Verified: renames, deliberate hides and custom items survive.
- A rail with nothing visible renders an **empty state naming why** (no sections vs hidden for this
  role) — a blank sidebar reads as a broken app.
- **Each module keeps its OWN list.** A flat rail listing every module's pages at once was built to
  the owner's standard-layout specimen and **reverted at their direction** on 2026-08-10. What
  "standard" means here is that every rail has the same **anatomy**, config and renderer — not the
  same links. Don't rebuild the flat rail. The things that follow you across pages are the two
  global panels below.

## GLOBAL Filters + GLOBAL Settings slide-overs (2026-08-10, owner's specimen)

Two panels hang off the **ribbon**, so they open at the same coordinates from every screen —
including the ones that draw no control bar at all (Close Overview, Reporting, the stubs). Both
reuse `.fx-fdrawer`, the same 440px slide-over the page Filters use, so "a panel slides in from the
right with its actions at the foot" means one thing platform-wide.

- **Filters** lists the five KCTX dimensions (period · entity · statement · basis · materiality)
  plus Consolidation · Currency · GAAP · Data view. Options carry the same `data-kctx` hooks the
  page bars use, so the panel and any bar are **one writer**. Live apply, snapshot on open; the
  footer is `[Reset all] [Apply filters]` per the specimen, so **Reset all genuinely resets** —
  cancelling (restore the snapshot) is the ×, the scrim and Escape. A ribbon badge counts how many
  dimensions are off default. `kgfCount()` drives it.
- **HONESTY RULE.** Exactly one value of Consolidation / Currency / GAAP / Data view is loaded, so
  those render the stated value with the alternatives **disabled and a reason** — the same treatment
  the flux drawer already gives Budget/Forecast. A filter that claims to reshape numbers it cannot
  reach is worse than an absent one. If real multi-currency or a budget version ever loads, enable
  them there.
- **Settings** carries Display (chrome theme · density), Table preferences (row numbers, freeze
  first column, wrap cells, show totals — persisted to `korvyn.tblprefs.v1` and applied as `tp-*`
  body classes) and Default landing page. It writes the existing `SETTINGS` / `setChrome` /
  `applyDensity`, so it cannot disagree with the full Settings page.
- Both mount into `#kgHost` **outside `#view`** — they are app chrome, not a page, which is what
  lets them survive a page render and appear on screens that draw no bar.

## GLOBAL filter context — KCTX (2026-08-10)

Five dimensions mean the same thing on every screen: **period · entity · statement · basis ·
materiality**. Three were owned twice — the review held `fluxScope` / `fluxStmt` / `fluxMat`, the
analytics lenses held `FXA_ENT` / `FXA_STMT` / `FXA_MAT` — and `fxaApplyScope()` copied **one way**
(FXA_ENT → fluxScope). So setting EMEA in Trending carried into a review, but scoping a review to
EMEA did not carry back: returning to Trending silently showed Consolidated.

- **KCTX is not a sixth copy.** The existing variables stay the source of truth; `kctxSet(k,v)` is a
  **write-through** that sets every mirror at once, and `kctxSyncFromReview()` (top of both analytics
  renderers) is the back-link that never existed. `fxaApplyScope()` no longer overwrites a review's
  scope, and **bails out entirely when the scope is a custom set or a single entity** — no cons id
  can express those, and it used to flatten them to Consolidated.
- **THE GUARDRAIL: an open review pins its own scope.** Context flows *outward* from a review; a
  context set elsewhere never reaches into an open one (`rpOpenReview` scopes from the review record).
  Same argument as review sets: silently moving a reviewer to a different population than the one they
  opened is how someone signs off on lines they never saw. Verified — global APAC, opening an EMEA
  review lands on EMEA.
- **One fixed spot: the cluster leads the `.fxcb` bar**, in `KCTX_KEYS` order, separated from the
  page's own controls by a hairline — everything left of the rule follows you across the platform,
  everything right of it belongs to this page.
- **A page declares only the dimensions it reads** (`ctx:[…]` on its KD registry, `o.ctx` on
  `fxaChrome`). A context pill on a page whose numbers ignore it is a dead control. **Period is
  deliberately not in the cluster on the analytics pages** — its documented home there is the
  identity-line pill (`.fxhd-per`), and rendering it twice puts two writers on one dimension.
- **The drawer now has THREE tiers, and the order is the argument:** Context (global) → Filters (this
  page) → Presentation & views. All five context dimensions are listed there even when their control
  lives elsewhere, so the tier means the same thing on every page.
- **Saved views never store context.** A view restores the page's own controls only — same rule as
  review sets, same reason.
- `reRenderCurrent()` now covers every surface that reads context. A period or entity change on a
  page it did not list left that page showing the previous context's numbers under the new label.

## Rules that must hold

- **AI narrates, never computes a number.** Every figure comes from the engine; the AI layer only
  explains and cites. This is the product thesis — do not let a generated number appear un-derived.
- **Numbers derive, never duplicate; no dead controls** (the repo-wide conventions apply here too).
- **The chart of accounts is a real engine.** `index.html` carries a built-from-spec ~152-account
  REIT chart that foots (A = L + E via cash-plug + retained earnings in the GL ledger); the
  taxonomies all derive from it. Don't hardcode a number a taxonomy should derive.
- **Enterprise period lock:** locked periods are read-only everywhere — a banner plus guards on
  every edit surface; reopen is role-gated (Controller / Administrator) with confirm + audit log.
- **Config-driven left nav** (`NAV_CFG`) with an admin Settings → Navigation editor (role × item
  matrix, reorder, custom items, preview-as-role). Roles: Preparer / Reviewer / Controller /
  Administrator / External auditor. **Two rails, one config:** a section declares
  `rail: 'modules'` (renders on every non-review screen — Home, Close, GL, Reconciliations) or
  `rail: 'reviews'` (the collections navigator inside the review workspace). `railMode` picks which
  one renders; both go through `renderNav()`, and shared pieces (the favourite pins) wire once in
  `favNavWire()`. A section missing `rail` is treated as `'reviews'` — that is the migration for
  configs saved before the split, so an admin's customisation survives.
- **Flux Analysis is real, except Scenario.** All three analytics lenses compute from `glLedger()`
  through `fxScopedVal()` — the same source the flux review reads, so they honour the entity scope
  and cannot disagree with the statement. Scenario Analysis stays an honest stub: what-if modelling
  is **enterprise planning**, which the product thesis puts out of scope. Don't fill it with numbers
  the ledger cannot produce.
- **Trending and Variance share the `fxa*` chrome**: `rpCrumb` → `rpCloseContextHTML` → question-led
  `.kv-hd` H1 → `fxaFocusChip` → `fxaStmtBar(route)` → **one** `.card.rp-card` with one
  `.rp-tbl.fxa-tbl` → `.ldg-note` method footnote → `fxaScopeNote`, wired by `fxaWire(route)`.
  Trending answers *how has this line behaved over time?* (sparkline + volatility); Variance answers
  *where did THIS period's movement come from?* (one step, decomposed with contribution share).
  **Render a control only where it changes something** on that route — Window is meaningless on
  Variance, which compares one step; a control that cannot act is a dead control.
- **Monthly Flux (`mflux`) is the flux review's OWN page in the `fxa` chrome — not a second
  dataset.** `renderMonthlyFlux()` sets `FX_PAGE='analytics'` and calls **`renderMonthlyTrend()`**.
  The statement grid, the GL-account expansion, the Explanation / comments column, the line-detail
  panel, the drill and Remap affordances, and the **whole filter set** are literally the same code
  and the same state — so the two surfaces cannot drift or disagree about a number. `FX_PAGE` swaps
  **only** the page chrome: `rpCrumb` + question-led H1 + scope/period at the header's right
  (`.fx-hd-sc`) instead of the review's `.fx-hd` identity line, plus the `.ldg-note` method footnote
  and `fxaScopeNote()` at the bottom. **The sign-off action is dropped there** — signing off belongs
  to a review you opened, not to an analytics entry point.
  - **Never reimplement the flux grid for a new surface.** An earlier attempt at this page invented a
    month-by-month matrix from `fxaLines`; it had no comment column and no GL expansion, and it was a
    second computation of numbers the review already owns. If a new surface needs the flux content,
    add a `FX_PAGE` mode.
  - `FX_PAGE` is reset to `'review'` in **both** `navTo('mtrend')` and `renderReviewCanvas()` —
    filter handlers call `renderMonthlyTrend()` directly, so the flag has to be cleared at the funnel
    into the workspace or a review could render wearing the analytics chrome.
  - The Analytics crumb is wired inside `renderMonthlyTrend`, not only in `navTo`: every filter
    change re-renders directly and would otherwise leave a dead crumb.
  - Its footnote's Organic/FX clause is conditional on `fluxShowSplit` — those columns live behind
    **View → Currency detail**, and a footnote explaining columns that are not on screen misleads.
- **Clicking through the three Analytics lenses must FEEL identical — and there is now ONE function
  that guarantees it: `fxaChrome()`** (2026-08-10). It emits the flux page's exact markup —
  `.fxhd` identity block (crumb prefix / title / attribute line, period pill right) · `.card.fxk`
  five-cell KPI card · `.fxcb` pill control bar — and Trending and Variance both call it. Verified
  by position: **header y=104 · KPI card y=154 · control bar y=213 · content y=257** on all three.
  Check those four numbers after any change here.
  - What it replaced: Flux had been rebuilt to the owner's specimen while these two still ran the
    pre-rebuild stack — a separate `rp-crumb` band, the `rp-ctxbar` close-context bar Flux had
    dropped, a `.kv-hd` title band and a `.rp-gbbar` of labelled button groups. Five bands against
    four, none in the same place, which is exactly what "why doesn't it feel the same?" was.
  - **`fxaChrome` never computes.** Every KPI cell is passed in by the renderer that already
    derived it from its own data (`rows` for Trending, `secs`/`absTot`/`total` for Variance), so a
    card cannot disagree with the table beneath it.
  - Controls are `fxaPill()` menus (the `.fxcb-m` pill), not `.rp-gb-b` groups, and Entity is a
    pill menu (`data-fxaent`) rather than a `<select>`. `fxaStmtBar()` and the `#fxaEnt` handler
    are kept only so any surface still calling the old bar keeps working — don't build on them.
  - Section rows in `.fxa-tbl` wear the statement grid's caption treatment (teal, uppercase,
    letterspaced) because all three lenses read the same chart of accounts.
- *(superseded — kept for the reasoning)* The three lenses were previously aligned at: crumb
  **y=167** · close-context bar (period on the **left**) **y=202** · question-led H1 **y=265** ·
  control bar **y=372**. On the
  Analytics page the primary bar *is* the other two lenses' bar — the same `.rp-gbbar.fxa-bar`
  container, `.rp-gb-l` labels and `.rp-gb-b` buttons, in the same order (**Statement · Basis ·
  Material at · Entity**) — but wired to the **flux review's own state** (`fluxStmt`, `RP_COMPARE`,
  `fluxMat`, `fluxScope`), because this page *is* the review. Format shared, variables the page's own.
  Flux has controls the other two lack (search, the Filters panel, review sets, Share, View), so
  those sit on a **second, quieter row** (`.fx-fbar-2`) rather than being crammed into the shared bar
  or dropped. The period lives only in the close-context bar there — the header's own period control
  is not rendered, because two controls writing one variable is the thing we keep removing.
- **FILTERS IS THE ONE HOME FOR FILTERS.** The panel carries everything in two labelled tiers:
  **tier one** (Focus · Materiality · Comparison · Review scope) changes the population or which of it
  you see; **tier two**, under a `Presentation & views` band (Columns · Display · Views), changes only
  how the statement is drawn. The band says so out loud because the split is load-bearing — a review
  set restores presentation only, and silently moving a reviewer to a different population than the
  one they opened is how someone signs off on lines they never saw.
  - **Nothing that lives in the panel may also sit on a bar.** Materiality and Basis were in both,
    i.e. two controls writing `fluxMat` / `RP_COMPARE`, and a filter changed from the bar produced no
    chip. The Analytics bar now holds only **Statement · Entity** — the population selectors the panel
    does *not* own. Trending and Variance keep their own Material / Basis groups because they have no
    Filters panel to move them into; the thing shared across the three lenses is the **format**.
  - **The right-hand cluster is gone.** My Views and View folded into the panel; **Share** became a
    small icon at the top right (`.fx-icob`, menu opens leftward) because it is an *action* that leaves
    the app, not a filter. Only the **expand / collapse pair** stays at the bar's right: it acts on the
    tree in front of you, one level at a time, and belongs beside it.
  - *(amended 2026-08-09 — the rows are labelled FIELDS now; the structural argument below is why
    they must stay collapsed, and it still holds)*
    **It is a RIGHT-HAND SLIDE-OVER of collapsed accordion rows** (`.fx-fdrawer`, 440px, full height).
    Three containers were built and rejected first, all for one structural reason: **nine control
    groups will not fit any box that shows them all at once.** A full-width in-flow band was ~830px of
    "full screen filter"; a 560px anchored popup crammed them into two 264px columns with a scrollbar
    inside the page's own and still overhung the viewport. **Collapsing each group to one row carrying
    its own applied value** is the fix — shut, the drawer is a readable summary of the entire filter
    state; you expand only what you came to change. Nine rows, in this order: Focus · Materiality ·
    Comparison · Benchmark · Review scope · Group rows by · By section · Columns & view · Other.
  - **Every summary derives from the state its controls write**, so a collapsed row can never describe
    something other than what is applied.
  - **`Cancel` and `Apply` are real.** Controls apply **live** (you watch the statement change, and the
    suggestion cards say *View lines*), so instead of buffering edits the drawer **snapshots state on
    open**: `fxFiltSnapshot` / `fxFiltRestore`. Cancel — and the ×, the scrim, and Escape — restore that
    snapshot; Apply commits and closes. That is what earns them a sticky footer, and it is why the
    repo's "no staged Apply over live controls" rule is not violated: the button does real work.
  - Only the drawer scrolls (`body.fx-filt-open{overflow:hidden}`) — no double scrollbars. The page
    stays visible and dims under a 10% scrim. The page's own chip row hides while the drawer is open,
    since the drawer owns *Active filters*; it returns on close as the persistent indicator.
- **ONE selection language, and it is a SOLID DARK fill: `--ink` (#141824), the `.rp-gb-b.on`
  treatment.** Filters are rendered as labelled rows of inline `.rp-gb-b` buttons (`.fxfb-btns`) —
  the actual Trending/Variance class, not a lookalike, so the two cannot drift. This replaced vertical
  checkmark lists: a set of mutually exclusive options reads faster as a row you scan than a column
  you tick, and a filled state says "this is on" without needing a tick to explain it. A filter
  changes the **population you are about to sign off on**, so its selected state should be the
  loudest "on" the system has. Two traps this closed:
  - The panel contradicted itself — segmented controls filled dark while the option lists beside them
    showed only accent-coloured text.
  - **Basis filled a *different* dark.** Those buttons also carried `.rp-tl-bseg`, whose `.on` uses
    `--accent` (#0B1F3A navy), so two darks sat side by side in one panel. The hook is now
    `.fxm-basis-b`, wired in `renderMonthlyTrend` — `rpWireTimeline` binds `.rp-tl-bseg` and no
    longer reaches them, so **don't rename it back without moving the handler**.
  - Materiality stays **three** labelled groups (relative rule · absolute floor · benchmark), not one
    row: they are three separate decisions and a line is material only when it breaches *both* rules,
    so one row would imply they were alternatives.
  - **Review scope stays a list**, not inline buttons — it is a 20+ item hierarchy carrying per-section
    counts, and wrapping that into button rows would lose the hierarchy.
  - The Entity picker's own `.fxm-k` is hidden inside `.fxa-bar`: the `.rp-gb-l` label already says
    "Entity", and printing both read *"ENTITY Entity Consolidated"*.
- **Review Sets change presentation, never population.** A saved set (`FLUX_VIEWS`, My Views menu)
  stores only the keys in `FXV_KEYS` — density, lens, columns, expansion. It must never restore the
  statement, entity scope, period or review id: silently moving a reviewer to a different population
  than the one they opened is how someone signs off on lines they never saw. When a set is applied
  the toolbar says whose it is and offers one click back (`fxvClear`).
- **Favourites is the one organiser.** Pins live at the top of the rail; browsable things (org tree,
  recent reviews) sit under **Browse** and collapse. Don't add a parallel list of reviews to pick
  from — the work spine pages through a list that already exists.
- **One close-progress number.** `closeProgress()` — reviews signed off over reviews in the close,
  read from the period record — is the *only* answer to "how complete is this close?", and Home,
  Close Overview and the Flux Overview band all render it. Three screens once gave three different
  figures (6% / 30% / 41%), each defensible, which is precisely what destroys trust in a product
  whose pitch is defensibility. The close checklist keeps its own count but is labelled **Close
  checklist · n of m steps** — a different measure, named as one.
- **The work spine** (`renderSpine`, the `#spine` strip above `#view`) is the app's flow: what you
  have open, where it sits in your assigned queue, what's next, how much is left. It persists on
  every screen — that is the whole point, so never scope it to one surface, and never let a screen
  grow its own pager beside it. It stays chrome-quiet: no accent colour, no badge, and it hides
  entirely when you have no assigned reviews.
- **ONE Flux Analysis rail, for the whole module.** `FLUX_NAV` defines it and `navIsFlux()` decides
  which routes get it — including `mtrend`, so opening a close does **not** swap navigation. Flux
  used to run two competing navigators and entering a close felt like a different application.
  `REV_TABS` is deliberately empty and `renderReviewsNav` is now unreachable; don't wire it back.
  The reporting period is **context applied to these pages**, never a hierarchy you descend into.
- **The rail is three groups, and the two entrances lead it ungrouped** (2026-08-08): `My Reviews`
  (for the people doing the work) and `Overview` (for the people who own the close), then
  **Reviews** · **Analytics** · **Setup**, then Favorites. What this fixed: the rail listed 11 items
  over 9 renderers, and *both* duplicate pairs sat in different groups — `Overview`/`Close Periods`
  are one `renderClosePeriods`, `My Reviews`/`All Reviews` are one `renderReviewRegister` — so the
  grouping actively hid that they were the same surface. `My work` was a heading over exactly one
  item (two lines of chrome for one destination, pushing the most-used link down the rail), and
  `Analysis` was a group heading inside a module already called Flux *Analysis*. Setup sits last
  because that is its frequency. **Roadmap stubs live in the category they'd ship into**, behind that
  category's own `Planned (n)` disclosure (`NAV_PLANNED_OPEN['flux:<group>:planned']`) — a top-level
  Planned group gave two stubs the structural weight of a whole section.
- **In the rail, a badge means "action required from you"; a count is quiet grey text.** Only
  `My Reviews` earns the gold badge (`.nc-act`). `Overview`'s close completion and `All Reviews`'
  inventory render as plain `.nc` — design-system rule 5. Every figure comes from the same function
  its own screen renders (`myReviewCount()`, `closeProgress()`, `RP_REVIEWS.length`) via
  `fluxNavCount()`, so the rail cannot disagree with the page it leads to.
- **Scope lives with scope, not in the rail.** Statement, Entity and the organization browse
  (Entities / Regions / Business units / Currencies / Countries + the consolidation tree) all sit in
  the flux toolbar — they answer *what am I looking at*, which is a page control, not navigation.
  Putting any of them back in the sidebar recreates the original defect: the same question
  answerable in two places. Periods are context (`rpCloseContextHTML`), never nav.
- **Never call `orgSetGroupBy` / `orgMutated` from a Flux page.** Both repaint the retired
  collections navigator into `#nav` and will silently wipe the Flux rail. Set `RP_ORG_GROUPBY`
  directly, persist it, and re-render the page (see the Entity picker's `data-fxorgdim` handler).
- **My Reviews and All Reviews are one component** (`renderReviewRegister`) over `RP_REVIEWS`,
  differing only in default scope; **Review Packages** (`renderReviewPackages`) is the separate
  consolidation-package surface. Team scope is a filter inside All Reviews — never a nav item.
- **Overview and Close Periods share `renderClosePeriods(mode)`** but must never print the same
  crumb and H1; two nav items that look like one page is what that split fixed.
- *(superseded — kept for history)* The reviews rail was: My workspace · Reviews · Organization ·
  Pinned reviews · Recent.
  Statement selection lives in **Reviews** (`NAV_STATEMENTS`) because which statement you are
  reviewing is *where you are*, not a filter — the toolbar dropdown mirrors the same `fluxStmt`, so
  the two cannot disagree. **Organization** turned the old "Organize by" dropdown into the section's
  own items (`ORG_GROUPBYS` → Entities / Regions / Business units / Currencies / Countries); the
  tree below regroups on the dimension you pick. Funds and Projects from the mock are not
  dimensions the entity master carries — don't invent them.
- **One filter row: essentials up front, everything else inside.** Filters apply live, so the panel
  deliberately has no Apply button — a staged Apply over controls that already update instantly is a
  button that does nothing.
- *(amended 2026-08-09 — see the reconstruction section above; kept for the reasoning, which still
  holds)* **THE FLUX REVIEW HEADER IS THREE BANDS, ~150px** (rebuilt 2026-08-08). It was eight bands and
  442px — the grid started at y=609 of a 910px viewport, so 67% of the first screen was chrome and
  only ~8 statement rows were visible. Now: **identity line** · **control bar** · **status line**,
  and the grid starts at ~y=317 with ~15 rows visible. The five moves, each with its reason, so none
  of them gets undone by accident:
  1. **Crumb + titlebar merged** into `.fx-hd`. They were two bands saying one thing — the crumb
     ended in the review's name and the H1 *was* the review's name. The **period switcher lives in
     the trail** (`<!--PERIOD-->` placeholder → `dPeriod`), because a control sitting where it reads
     costs no vertical space.
  2. **The control bar cannot wrap.** It held two unrelated families — population (search ·
     Statement · Entity · Filters, 692px) and presentation (577px) — which overflowed a 1160px bar.
     **Columns folded into View** (both answer "how is this drawn", never what is in it) and the
     right-hand summaries dropped their current-value text. Nothing left the box; the one-box rule
     holds.
  3. **`fx-metrics` + `fx-cover` merged** into `.fx-status`. 128px saying one thing, and they read as
     contradicting each other ("Material 1" beside "Coverage 0%"). The 545px materiality
     restatement that forced the wrap was a read-only echo of a setting; it is now the Coverage
     tooltip, editable only in Filters → Materiality.
  4. **Healthy gates collapse to a glyph.** See the tie-out rule below.
  5. **The close-context bar does not render inside a review.** `Day 4 of 8 · 41% · 53 of 128` is
     close-LEVEL status; inside one review it was 61px answering a question the reviewer didn't ask,
     and the work spine already carries queue position. It still leads Overview and Close Periods.
- **The smart filter is a disclosure, not a dropdown, and its collapsed state names what is on.**
  Collapsed (`FX_FILT_OPEN`, persisted): active filters render as **removable chips**
  (`fxFilterChips`) carrying `n of m lines` and `Clear all` — a `Filters (3)` badge says how many are
  active and never *which*, so you open the panel purely to find out. Only non-default state makes a
  chip, so a clean review costs nothing. Expanded: the panel opens **in flow** beneath the bar, never
  as an overlay — an overlay hides the rows you are filtering, which is the one signal that tells you
  the filter did what you meant. `.fx-filtpanel .fxfb-grid` is height-capped for the same reason: a
  panel tall enough to push the grid off the fold is an overlay with extra steps. It leads with
  **suggestions derived from this review's own engine output** (`_sug`), ordered by what stops a
  sign-off first; each only sets lens state that already exists, so nothing there computes a number.
  Suggestions and the Focus list share one handler, so they cannot disagree.
- **The statement grid is the single flux view.** A ranked "worklist" mode was built and then
  removed at the owner's direction (2026-08-07) — don't reintroduce a second mode or a
  Worklist/Statement toggle. The signal it carried lives in the metrics strip and the coverage bar.
- **The toolbar is one box** (`.fx-fbar-ctx`): search · Statement · Entity · **Filters (n)** on the
  left; My Views · Share · **View** · expand on the right. Nothing floats outside it — My Views and
  Share sat in the titlebar and had to move in. The identity line keeps only trail, title, state
  badge, star and Submit.
- **Every menu in the view shares one behaviour.** The open/close wiring is scoped to `#view .fxm`,
  NOT to `.fx-fbar .fxm`. When it was bar-scoped, titlebar menus escaped it and needed a double
  click to dismiss a rival menu. Opening one closes the others, hovering another switches to it,
  Escape and outside-click close, and leaving with the cursor closes after a ~340ms grace period
  (long enough to survive a diagonal path to an option).
- **The period directory is an archive, not an entrance.** Flux Overview leads with the current
  close; the 235 prior periods sit behind the **All periods** disclosure (`RP_ARCHIVE_OPEN`).
- **Materiality is a stated standard, not a constant.** A line is material only when it breaches
  **both** a relative rule (`fluxMat` %) and an absolute floor (`matFloor()`), and the floor derives
  from a benchmark that **follows the statement** — total assets for the BS, revenue or pre-tax
  income for the IS. One floor cannot serve both (here total assets ≈ $11B vs monthly revenue
  ≈ $72M, so an assets-derived floor silently suppresses every IS line). `matStandard()` renders the
  sentence an auditor reads off the screen. Never reintroduce a hard-coded dollar anchor.
- **Coverage, not counts.** `Coverage %` (share of *absolute* movement carrying an accepted
  explanation) plus the unexplained residual against the floor is what a sign-off rests on —
  "7 material, 1 needs explanation" never says whether the remainder is trivia or the whole story.
  So on the status line **coverage leads**, followed by only the two counts that represent
  outstanding work (`Needs expl.`, `No evid.`). The material total and the ready count moved into
  the Coverage tooltip and the Filters panel's suggestions, where they are one click from the lines
  they describe — four equal-weight counts diluted the instrument this rule exists to protect.
- **Tie-out gates sign-off, in proportion.** `fxTieOut()` asserts GL↔TB on the review itself. A
  difference **at or above** the materiality floor blocks submission and cannot be overridden — you
  would be explaining movements in numbers that are themselves wrong. A difference **below** the
  floor is a documented difference and must not block, or every close with a rounding variance
  stalls. Note the floor is statement-dependent, so the same variance can block the IS and not the BS.
  **The display is proportionate too.** A healthy tie-out is a `✓ ties to TB` pill in the status line
  (a green full-width band reporting that nothing happened is the definition of chrome). A
  below-floor difference stays a visible gold clause — it is a *documented* difference and a tooltip
  is not documentation — but does not take a band. Only `_tie.blocks` gets the full red band, because
  it stops sign-off and nothing below it is signable. Both the pill and the band open the Trial
  Balance; `.fx-tie-go` had never been wired at all.
- **Submit is a control.** It refuses on open comments, a material tie-out break, and unexplained
  material lines. The last is overridable exactly once, via an explicit confirm that writes a
  **named exception** (`rpAudit(..., sod=true, fid)`) to the folder's append-only trail. Always pass
  `fid` — an audit entry no surface renders is not an audit trail.
- **Planned pages stay reachable but don't crowd.** `ph-` routes are roadmap stubs; each category
  rail lists its working pages, then one collapsed **Planned (n)** disclosure. Nearly half of all
  destinations are stubs — listing them beside real pages made the whole product read unfinished.
  Never hide them outright, and never style them gold: they are not "needs attention".

## Design-system status

The go-forward system is **gold/teal/navy** (`design-system/`). This file historically used a cobalt
accent and is being brought into line — check any UI change against the design-system checklist and
the "no blue accents" rule. When a request conflicts with the design system, follow the system and
say so.

## `mocks/` — design explorations, kept for reference

`gl-trending-review.html` (one review package end-to-end: MoM/QoQ trending, data-vintage
versioning, evidence, approve-&-freeze immutable versions) and the flux mock explorations. Reference
only — the platform is `index.html`.

## Running it with the live agent (the full chatbot)

Opened on its own, the **Ask Korvyn** panel falls back to a grounded, deterministic engine that
still cites its source. For the full streaming LLM agent, run [`korvyn-agent`](../../packages/agent),
which serves this UI and the agent on one origin:

```bash
cd ../../packages/agent
cp .env.example .env      # add ANTHROPIC_API_KEY
npm install && npm run serve      # → http://localhost:8787  (serves this index.html + POST /ask)
```

A published claude.ai artifact can never reach a live LLM (sandbox CSP), so the agentic chatbot only
runs here, not from an artifact link.
