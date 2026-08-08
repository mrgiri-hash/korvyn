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
- **THE FLUX REVIEW HEADER IS THREE BANDS, ~150px** (rebuilt 2026-08-08). It was eight bands and
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
