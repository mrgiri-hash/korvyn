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
- **Flux Analysis is real, except Scenario.** Trending (`renderTrending`) and Variance
  (`renderVariance`) compute from `glLedger()` through `fxScopedVal()` — the same source the flux
  review reads, so they honour the entity scope and cannot disagree with the statement. Scenario
  Analysis stays an honest stub: what-if modelling is **enterprise planning**, which the product
  thesis puts out of scope. Don't fill it with numbers the ledger cannot produce.
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
- **ONE Flux Analysis rail, for the whole module.** `FLUX_NAV` defines it (Overview · My work ·
  Reviews · Analysis · Management · Configuration · Planned · Favorites) and `navIsFlux()` decides
  which routes get it — including `mtrend`, so opening a close does **not** swap navigation. Flux
  used to run two competing navigators and entering a close felt like a different application.
  `REV_TABS` is deliberately empty and `renderReviewsNav` is now unreachable; don't wire it back.
  The reporting period is **context applied to these pages**, never a hierarchy you descend into.
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
- **One filter row: essentials up front, everything else inside.** Search · Period · Statement ·
  Entity · **Material only** · **Filters (n)**, with Columns and density on the right (hidden in
  worklist mode). Basis, Rows, Insights and the materiality standard live inside the Filters panel,
  which shows a live count of non-default filters and a **Reset all**. Filters apply live, so the
  panel deliberately has no Apply button — a staged Apply over controls that already update
  instantly is a button that does nothing. My Views and Share sit beside the title, not in the row.
- **The statement grid is the single flux view.** A ranked "worklist" mode was built and then
  removed at the owner's direction (2026-08-07) — don't reintroduce a second mode or a
  Worklist/Statement toggle. The signal it carried lives in the metrics strip and the coverage bar.
- **The toolbar is one box** (`.fx-fbar-ctx`): search · period · entity · **Filters (n)** · My Views ·
  Share · Columns · View. Nothing floats outside it — My Views and Share sat in the titlebar and had
  to move in. The titlebar keeps only title, status, star and Submit.
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
- **Tie-out gates sign-off, in proportion.** `fxTieOut()` asserts GL↔TB on the review itself. A
  difference **at or above** the materiality floor blocks submission and cannot be overridden — you
  would be explaining movements in numbers that are themselves wrong. A difference **below** the
  floor is a documented difference and must not block, or every close with a rounding variance
  stalls. Note the floor is statement-dependent, so the same variance can block the IS and not the BS.
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
