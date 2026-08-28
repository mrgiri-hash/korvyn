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

The header leads with a **hero variance** (owner's direction, 2026-08-25 — "push
the visual language"): the movement is the subject of a flux review, so it is the
big signed figure with a direction glyph and its Δ%, over a quiet `prior → current`
balance flow with the period labels. `.rw-hero` replaced the four-equal-cell grid,
which replaced a 2×2 hero+mute grid before it — the figure is one step larger on
the full page. Colour lands only on the variance (rules 2/3). Key drivers render as
a **contribution visualization** — each driver's share of the movement as a bar,
carrying the same up/down the value does — so the shape of the variance reads at a
glance instead of being decoded from three percentages. The hero also carries a
**trailing-period sparkline** (`dwHeroSpark`, accent — a trend is a series, not a
state), and the review-state block a **coverage bar**: the explained share as a
fill with a tick at the coverage the tolerance demands, so "past the tick" reads as
signable. Every one is derived from the same `dwCtx` figures the text states.

No seeded line starts submitted or approved. Locked is reachable only by walking
a line through the workflow. `CMT` is in-memory; a reload restores the book.

## 2026-08-26 — the left rail moved to the content plane (amends design rule 4)

The left rail (`.rail` / `#railNav`) was dark chrome, sharing the ribbon's base so
the two read as one "midnight L". At the owner's direction it now sits on the
**content plane** — a **light rail** in light mode (white surface, cobalt active
state), following the theme (dark in dark mode), while the **ribbon stays dark
chrome**. Reasoning: a close tool is used all day, a light rail is calmer and the
familiar finance-software pattern, and the ribbon's dense status still reads best on
dark. This **amends design-system rule 4** ("header and sidebar share one base,
separate by a hairline, never by lightness") for the sidebar only — header and rail
now differ by plane by intent. Implementation: the `.railrole`/`.railkid`/`.rbadge`
classes are shared with the dark ribbon nav, so the light treatment is added as
`.rail`-scoped overrides onto content tokens (`--surface`, `--ink`, `--accent-bg`,
`--accent-ink`, `--accent`), never by editing the shared base. Every pairing is AA.

## 2026-08-28 — Flux filters moved inline (the drawer is gone on Flux)

At the owner's direction, Flux analysis no longer uses the shared collapsible
`#filterbar` drawer. Every filter it held is now a **persistent inline field row**
(`fxFilterFields()` → `.fx-fields` inside `#fxRoot`), directly under the period
navigator — the Zendesk Support reporting pattern. `paintTopbar()` hides
`.filterbar` when `fxHere`; **every other page keeps the drawer unchanged**.

**ONE TAB ARCHITECTURE — the whole command surface** (`FX_FTABS`, `fxFTab`,
`setFilterTab()`). Eight tabs over ONE contextual row, each named for the question
it answers. A tab marked `cfg:1` configures rather than filters and never carries
a count:

| Tab | The question it answers | Row |
|---|---|---|
| **Period** | when, against what | Period · Compare · Cadence |
| **Scope** | which part of the enterprise | Entity · Segment · Region · More · Find |
| **Workflow** | what needs action | Status · Explained · Reason code |
| **Variance** | what kind of movement | Materiality · Direction · Movement over |
| **Basis** | how figures are stated | Eliminations · Units |
| **Display** `cfg` | how to view it | Mode · Table |
| **Saved Views** `cfg` | which saved configuration | View · ☆ · Save current… |
| **Actions** `cfg` | what to perform | Requests · Audit log · Export · Memo · Print |

**There is no second toolbar and there must not be one.** The old
`Review|Financials|Narrative · Table · ☆ · Views · •••` strip is gone as a
standalone object: `pageActions()` and `viewControls()` are retired, Display owns
the mode and the Table menu, Saved Views owns the star and the Views menu, Actions
owns the ellipsis. Placements already tried and rejected: a row above the tabs (the
row this design removed), a row below the fields (still a second toolbar), and the
shell topbar (squeezes `#tbScope` and wraps the title).

**Naming is deliberate.** The filter family is **Workflow**, not "Review" — Review
is also a display mode, and one word cannot name two unrelated controls on one
surface. **Variance**, not "Movement" — the page is a variance analysis.

**Submit is the one CTA, and it appears only when it can act** (2026-08-28). It used
to render unconditionally, so the loudest control on the page — the only filled
cobalt button — spent most of the close inert, answering a click with "Nothing is
ready to submit". That is the "no dead controls" rule, and a permanent primary
button that usually does nothing also teaches the preparer to stop reading it. It
now renders only when lines are ready and states the count: **"Submit 3 ready
lines"**.

**The count and the action share one predicate** (`readyToSubmit()`), so a button
reading "Submit 3" can never submit two or five. Verified end to end: claimed 1,
submitted 1, then removed itself.

**Two submits, two right places — do not merge them.** `submitAll()` acts on every
ready line in the current view, so it belongs on the STATEMENT: a bulk action
launched from inside one line's working paper would submit lines the reviewer cannot
see. The per-line Submit already lives in the review panel's footer (`exSubmit`),
gated on coverage and stating *why* when it is withheld.

**Progressive disclosure at enterprise scale.** Entity · Segment · Region lead the
Scope row because they are the cuts a group controller actually makes; Property and
Cost center sit behind **More** (`FX_MOREDIMS`), which opens the same standard
popover. A dimension behind More still counts against the Scope tab — a filter does
not stop existing because it is one level deeper. Country, fund, HoldCo, project,
ERP source and ownership join `FX_MOREDIMS` as the model carries them.

**The review panel is a full-height dock** (owner's direction, 2026-08-28), running
the same band as the Korvyn assistant — top ≈ 94px to the foot of the viewport,
854px against the assistant's 874px. It used to open at y≈365 on a 960px viewport,
so the working paper lived in the bottom 60% of the screen.

The mechanism is still **geometry, not z-index**: `sizeDrawer()` pins the panel
below whatever still occupies its column, so the fix is to make the full-width rows
yield that column, never to raise the panel over live controls. Two insets, because
there are two containers — rows inside `#fxRoot` (`.fx-work`, `.fx-focusline`) take
`--fx-dw-w + 12px`; shell rows above it (`.topbar`, `.secnav`, `.subnav`) sit in a
wider box and take `+48px`. Both are **declared, not measured**: computing them in
`sizeDrawer()` from the drawer's own left edge is a feedback loop — the inset moves
the layout the next pass measures, and the panel walks off the bottom of the screen
(observed). Two traps worth knowing: `body.fx-mercury #fxRoot .fx-work` sets a
`margin` shorthand later in the sheet that silently zeroes an earlier reservation
(hence the `#fxRoot.aw` specificity), and the tab strip must be `white-space:nowrap`
+ `overflow-x:auto` — with the panel open the bar loses ~450px and "Saved Views"
broke onto a second line. The insets clear on close and are disarmed in
`S.dwPage` mode; verified untouched on GL overview, Trial balance, Consolidation
and Overview.

**Full screen takes the screen, and its tabs SWAP** (owner's direction, 2026-08-28).
This reverses "PAGE MODE NAVIGATION IS A SCROLL, NOT A SWAP": every region used to
be mounted at once as one ~2,400px document with the tab bar jumping between them,
so a tab told you where you were rather than what you were looking at. Full screen
now shows the active tab's content — Overview keeps the three-column argument
(judge · comp · rec), which is what the full page is *for*; every other tab is its
parts in one wide column, read from **the drawer's own registry** (`RW_LAYOUT.drawer`
via `dwPageCols()`), so a part added to a drawer tab appears on the full screen
automatically and an unknown tab falls back to Overview rather than rendering blank.
`FX_PAGETABS` uses the drawer's tab ids so one vocabulary drives both densities.
The scroll spy is gone with the scrolling index — it would have fought the
reviewer's tab choice on the first scroll; only its `scrolled` shadow survives.

The page chrome stands down with the statement it describes: `.fx-filters`,
`.fx-work`, `.topbar`, `.secnav`, `.subnav` all hide under `body.fx-dw-page`, so
the paper opens at y≈117 (88% of a 960px viewport) instead of y≈363 (62%). Two
traps: `paintSubnav()` writes `style.display='flex'` **inline**, so hiding the
statement tabs needs `!important`; and `S.dwPage` survives navigation while
`sizeDrawer()` runs from a resize observer on every page — the body class must be
toggled on `#fxRoot.offsetParent!==null`, or the topbar stays hidden on the General
Ledger and the Trial balance (observed). The sheet is framed with `--rule-strong`,
not `--rule`: the docked panel gets its edge from white-on-gray lightness, but the
full-screen sheet keeps the gray body, so its border does the separating alone.

**The full-screen header is a two-column grid** (237px → ~160px). The identity and
the movement share the left column; the review state owns the right for both rows,
so the two facts a reviewer scans — what moved, and whether it is signable — sit
side by side instead of leaving a wide hole beside a 2-line name opposite a 4-line
verdict. `display:contents` on `.rw-idrow` is what makes it CSS-only: `.rw-id`,
`.rw-state` and `.rw-hact` are its children, not the header's, and cannot be placed
in the header's grid until the wrapper stops generating a box. **The window
controls share the return strip's cell** (`grid-area:from` + `justify-self:end`,
with `padding-right` on `.ws-from` reserving the corner) — giving them a column of
their own put them at the LEFT edge of a column the state block had widened to
34ch, which floated collapse and close in the middle of the header instead of in
the panel's corner. Under 1360px the
state drops to its own full-width row and reads left. The sparkline is `flex:1 1
110px` because it is the one part of the hero that can give — a shape cue, not a
figure — and without that it wrapped the whole hero onto a second line once the
state took a column (+42px).

Removed from the header, all at the owner's direction: the return strip's metadata
(section · "line 1 of 16" · "N still need review" — the section heads the row in the
statement behind the page, the position is what the ‹ link and Next move *through*,
and the count is the worklist bar's job; `owed` still gates the Next button, only
its text went), `CONSOLIDATED` under the line name (the Scope tab states scope), and
"· star to require an explanation" from the below-materiality verdict — an
instruction living in a status line, teaching a control instead of reporting where
the line stands.

**Earlier in the same pass** (237px → 158px).
The shortcut legend is hidden (`#fxRoot.dw-page .ws-from .keys`) — it spent a band
teaching five keys above the line the reviewer came to read, and the "‹ Income
statement flux" link is the same exit Esc is. The verdict sentence gets 78ch rather
than 46ch, which stopped a 72-character line wrapping into two ragged right-aligned
rows. And **the hero reads across in page mode, not down**: its three sub-rows
(figure · prior→current flow · sparkline) are stacked for the 440px drawer, where
stacking is the only option; on a full screen they fit one row, so `FAVORABLE` and
`MAY '26 → JUN '26` drop their `margin-left:auto` and trail the fact each qualifies
rather than stranding themselves mid-line. Drawer hero unchanged at 121px.

**Dark-mode hairlines were resolving to the light value.** `--rule` /
`--rule-strong` are ramp-derived aliases declared at `:root`, so they substituted
`:root`'s light `--border` and every dark-mode hairline drew `rgba(20,24,36,.10)`
— a dark line on a dark surface. They are now redeclared in the dark block beside
`--border`, exactly as that block's own comment instructs for ramp-derived aliases.
App-wide fix; all 10 chrome themes still pass AA.

**The topbar entity-tree scope (`#tbScope`) is hidden on Flux.** It was not merely
duplicating the Scope tab — it was a dead control that contradicted the page.
`sliceOk()` filters on `S.ent/seg/prop/cc/reg` and never on `F.entity`, so setting
the tree to one entity left every figure identical (Total revenue 88.1 before and
after). The two do not even share a vocabulary: the tree lists 4 legal entities
(Meridian DC Holdco, Fleet DC OpCo …), the Scope tab 5 property entities (Meridian
Ashburn Holdings …). The header could therefore read "Fleet DC OpCo · 1 of 4
entities" over a statement narrowed to three entirely different entities. Same
precedent and same treatment as Fund / Region / Ownership: **hidden on Flux,
untouched on every other page** — verified on Overview, Trial balance, Account
activity, Consolidation, Trending review and GL overview. If flux is ever wired to
`F.entity`, wire it before restoring the control, not after.

**Controls only for what the prototype supports.** Currency, owner, approval-stage,
GAAP basis, mapping version, and movement-type (organic/FX/acquisition) were all
specified but are NOT rendered: flux consolidates to USD only, there is one preparer
constant, and no movement decomposition exists. A control that cannot act is a dead
control (shared conventions) — add them when the engine carries them.

**`glHead()` and `periodNav()` are gone from Flux.** The header's `h1` duplicated
the shell's "Flux analysis" title (already `display:none`) and its context line
restated scope · comparison · cadence · currency — four facts the Period, Scope and
Basis tabs now each carry as an editable field. The arrows-and-months navigator
became the Period field, which reaches **any** period in one click rather than only
a neighbour. `pLabel()` keeps the Period field honest under cadence: quarterly reads
"Q2 2026", not "Jun 2026".

**Display mode is a FIELD, not a segmented control** (2026-08-28). It was the only
control in the command surface with a different shape — twelve 180px dropdowns and
one 199px three-button capsule — the exact inconsistency the tabs exist to remove. A
segmented control earns its width when the choice is flipped constantly and the
alternatives must be visible at rest; this one is set once a session, and each option
needs a sentence to explain it, which a segment cannot carry and a menu row can. The
`fxGroup` labels went with it: every field states its own name.

**TWO modes, not three** (owner's direction). Review and Financials had converged to
a single column of difference: the mode was built to strip four (`REVIEW_CHROME` =
`cmt · status · owner · resid`) but only `cmt` still ships in the default set, so
"Financials" had become "Review minus the Explanation column" — a whole display mode
to hide one column that Table › Columns already toggles. They merged into
**Statement**; **Narrative** is unchanged and is the one mode that still sheds review
chrome, because it prints the explanation under the line and the column beside it
would be the same words twice. Measured: Statement 6 columns / 25 rows, Narrative 5
columns / 27 rows.

`DISP_MODES` is now `[['stmt','Statement'],['full','Narrative']]`. **Every retired
key migrates on READ** in `dispMode()` — `status` (Review), `nums` (Financials) and
the pre-2026 `compact`/`review`/`cmt` all resolve to Statement, so a saved view
stored under any of them still opens without a migration pass over stored state.
Anything unrecognised falls back to Statement, never Narrative: a corrupt value must
not open the statement with a paragraph under every line. Verified for all nine
inputs including `undefined` and garbage. The `1–n` keyboard legend and the shortcut
handler both derive from `DISP_MODES.length`, so retiring a mode cannot leave the
legend promising a key that does nothing (verified: `1`/`2` switch, `3` is inert).

**One field shape on every tab** (2026-08-28). Measured before the fix, the row
changed shape whenever the tab changed: widths of 150 · 156 · 168 · 216 across the
five filter tabs, and a **14px radius on a 28px control — a perfect capsule**, which
is both the "giant pills / rounded capsules" the brief rules out and a mismatch with
the Submit button beside it drawing its own 6px. The cause was
`body.fx-mercury #fxRoot.aw{--radius:14px}`: any control asking for `var(--radius)`
in this subtree gets rounded into a pill. **Pin 6px explicitly on `.fxf` and on
`.fx-fields .seg`** — do not inherit `--radius` here.

Fields are now a fixed **180px × 28px × 6px** on all eight tabs, so a long value
ellipsises and the tooltip carries `label · value` to keep it recoverable — which is
what the Zendesk reference does too ("Requester organ…"). Action buttons (Saved
Views, Actions) stay content-width by design: they are actions, not filters, and
match on height and radius. Verified across all eight tabs: one radius, one height,
one field width.

**The strip carries tabs and the CTA, nothing else.** Find is a field in Scope,
Clear all sits at the right of the field row. Do not re-attach controls to the
strip. **Every control states its active selection** — `Entity · 3 selected`,
`Currency · USD`, `More · 2 active` — one short value if there is one, a count
otherwise; a field at its default reads "All"/"Any". Accent marks only a field
actually narrowing the population, so an untouched row is monochrome (rules 2/3);
fields are flat and only the popover, a true overlay, has a shadow (rule 5).

**Each tab shows a count of its live filters, and this is load-bearing, not
decoration.** Tabs hide filters; on a surface whose numbers get signed, a reviewer
must never read a filtered statement with no visible reason why. The counts mean
the strip still answers "is anything filtering this?" from any tab. Materiality
and Units never count — they are context, not narrowing. Do not remove the counts
without replacing the guarantee.

**ONE POPOVER SYSTEM for every selector on the page** — `pop()` / `paintPop()`
into the single global `#pop`. Anchored under its trigger, never a modal or a
drawer, one open at a time, closes on outside-click and Escape. Multi-selects are
**staged**: Search · **Included | Excluded** · Select all · checkbox list ·
**Clear (left) / Apply (right)**. They edit a draft (`popDraft`/`popDraftX`) and
commit on Apply — closing abandons it. Staging exists because picking four entities
one at a time meant four full recomputes of the consolidation, and because
Included-vs-Excluded cannot be read mid-build. Select all acts on **what the search
is showing**, never the hidden options. Single-selects (Status, Direction, Explained,
Eliminations, Units, Cadence, Period, Materiality) commit on click and close — an
Apply step for one choice is a second gesture for one intent. **The shell is
constant; the content varies** — do not force a threshold editor or a period list
into the checkbox model.

**`S.excl` is real filtering, not a label.** Per-dimension exclusion flags run
through `dimOk()` in `sliceOk()`; Selected and Excluded are arithmetically
complementary (verified: 24.4 + 63.7 = 88.1 total revenue). Because the same list
means the opposite thing under the flag, `excl` rides in `snapshot()` with the
dimension arrays, and every place that renders a scope — `fxDimField()`,
`activeChips()`, `scopeWord()`, `ctxSummary()`, `scopeSentence()` — spells the
exclusion ("Excl. 2", "All except 2 entities"). An empty selection always clears
the flag: there is no exclusion of nothing.

Statement order (`S.sort`) moved into the **Table** menu — it is table
configuration, not a filter, and hiding the drawer would otherwise orphan it.

## 2026-08-28 — the narrative and the comments are ONE conversation

At the owner's direction, redesigned across both densities. The thesis: a flux
line's explanation and its comment thread are not two features, they are **one
argument over time** — Korvyn or a preparer states the movement, entities
contribute, a reviewer questions, someone answers, it is signed. They were being
rendered as a wall of prose with its authorship demoted to a caption, plus a
separate tab that opened with a compose box and then spent 830px on a chase-list.

**One grammar, `.rw-msg`, for every voice.** Avatar in the gutter, identity on one
line with the time pushed right, words against a rail, quiet metadata beneath:

| Voice | Treatment |
|---|---|
| **Explanation** (`.lead`) | the opening statement — author, provenance beside the name, prose against a rail |
| Korvyn draft | indigo `--ai` avatar + rail, never the cobalt accent (rule 2) |
| A person | ramp rail, cobalt avatar |
| **You** (`.mine`) | accent rail + a quiet "you" label — so your own questions are findable among four entities' answers |
| **Awaited** (`.owed`) | a silhouette: same geometry, dashed hollow avatar, no rail |
| **Composer** (`.comp`) | your avatar and a field, at the END of the thread |

**Order is the fix, not decoration.** The tab now reads: who is talking → what was
said → the box to reply → who has not answered. The composer used to lead, asking
the reviewer to write before reading a word; it now closes the thread, stays a
single growing line, and reveals its byline and Post/Clear only once there is a
draft — so an empty box invites rather than demanding to be filled in. `cmtField()`
toggles that class and autosizes **without repainting**, because a repaint takes the
caret with it (same contract `exField` holds).

**"Awaiting a comment" is a worklist, not the conversation.** Seven silent entities
rendered seven full cards — the tab measured 1,079px with an empty thread. It
collapses to one line (`S.cmtOwedOpen`) stating the count and the share of the
movement still silent, plus an overdue count; opening it returns every action
unchanged (Request · Chase · Record on behalf · withdraw). Comments tab: **1,079px →
342px**.

**Threaded replies, ONE level deep** (2026-08-28). Every message carries a stable
id — a lineage contribution by the scope that authored it (`k:<key>`), a discussion
comment by its own `id`, backfilled in `commentStream()` so nothing downstream meets
an id-less message. A reply stores `parent`.

**One level is a decision, not a limit.** `cmtRootOf()` re-parents a reply aimed at
a reply to the root of its branch, in `cmtSave()` — so the *stored* shape can only
ever be two deep and the renderer is never asked to flatten a tree it did not
create. A review thread's question is "what was said about this line"; a reply four
levels in is unreadable at 440px and tells an auditor nothing a flat answer does
not. Verified: aiming at a reply produces a sibling, never a third level.

The reply box renders **inside the group it belongs to** (`cmtComp` stands down
while `S.cmtReplyTo` is set — two composers is two carets). The filter applies to
**roots only**: hiding a corporate reply that answers an entity's contribution would
orphan the answer and make the thread read as though nobody responded. The draft is
**discarded** when aiming and un-aiming — text written as a general note is not the
same statement once filed as an answer to one person. `S.cmtReplyTo` clears in
`pick()`, `pickAt()` and `closeDrawer()`: a reply aimed at a message on one line
must never file its answer under a stranger on the next.

`cmtComp` is a new part in the registry, so it is in both `RW_LAYOUT.drawer.comments`
and `RW_LAYOUT.page.rec` — add parts in both or the full page silently drops them.
`.rw-cm`, `.rw-cstream` and `.rw-comp` are retired with the card layout they styled.
One trap: the base avatar rule is `#fxRoot.aw .fx-detail .rw-av`, so `.rw-av.ai`
must match that specificity or every avatar stays cobalt.

## 2026-08-28 — the statement grid: status column, star gutter, default columns

**The Explanation column has ONE subject: where the line stands.** `cmtIndicators()`
used to emit up to six indicators — needs-explanation, item count, coverage percent,
inherited/draft, document count, review status — in five visual languages, so the
column meant something different on every row. Measured on the seeded income
statement: **14 of 16 cells empty**, and the two that were not carried two entirely
different compositions ("4 · 100% expl · In review" and "⚠ Needs explanation"). A
column whose meaning changes row to row cannot be scanned, only read cell by cell.
It now emits one word from a closed vocabulary (`FXST`): Needs explanation ·
Returned · Draft ready · Inherited · In review · Reviewed, first-true-wins, because
a line is in exactly one place in the review. Counts and coverage moved to the
workspace where they can be acted on — they are inventory, and rule 12 says
inventory does not compete with status.

**The warning glyph is gone.** Rule 8: severity is a 3px left border and nothing
else, never a dot, never a pill, never both. The row already carries that border, so
`⚠ Needs explanation` was the second and third mark for one fact.

**The star holds its gutter but not its ink.** 15 stars rendered, 0 set — a
permanent column of grey outlines immediately left of the line name, the most
valuable horizontal position in the table, for an action taken on maybe one line a
period. It is NOT removed: starring forces a line to require an explanation even
below materiality, which is a materiality override and a real control. A SET star
stays visible at rest (amber) — that is what a watchlist is for; an unset one
appears on row hover or focus. **`opacity:0`, never `visibility:hidden`** — the
latter takes the button out of the tab order and silently removes a real control
from every keyboard user (caught in test).

**Contribution is RETIRED** (owner's direction), removed from `COL_DEFS` as well as
the default so a known-wrong measure is not one click away in the column picker. It
computed `|Δ line| ÷ Σ|Δ detail lines|` and did not survive being read:

- the **name** promised contribution to net income or contribution margin, and
  delivered share of gross movement;
- **unsigned** — `+1.4` and `−1.4` both read 27% with identical bars, two movements
  in opposite directions that partly cancel, shown as equal;
- **subtotals shared the detail lines' denominator**, so Total revenue 40%, Total
  opex 40% and Net income 12% double-counted and the column summed well past 100%;
- the **bar drew at 2.2× the true share**, pegging full at 45.5%.

If it returns it needs a stated basis and a signed reading. The `case 'contrib'` in
the cell renderer is kept deliberately — see the guard below.

**A retired column must not take the table down with it.** `S.cols` is persisted in
saved views, so a view stored before a retirement still names the dead column;
`hcell()` then ran `COL_DEFS.find(...).nm` on `undefined` and threw, taking the whole
statement with it. `renderGrid()` now filters `S.cols` against `COL_DEFS` in the ONE
place header and body both read from, so the two can never disagree about how many
cells exist. Verified: a stale `[…,'contrib','trend',…]` view drops contrib, keeps
trend, and renders 7 header cells against 7 data cells.

**12-period trend is off by default** (owner's direction). A sparkline on every row
is a second chart competing with the figures beside it, and "how has this line
behaved over time" is a question asked of one line in the workspace, not of sixteen
at once. Still one click away under Display › Table › Columns.

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
