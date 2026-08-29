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

> **Partly superseded 2026-08-29** — the hero and the contribution-bar drivers are
> gone; see *the inspect panel takes the reference's shape* below. The four MODES,
> the freeze rule and the part registry still govern.


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

> **Amended 2026-08-29** — `FXST` gains `Ready` and `Explained`, and "Draft ready" is
> now "Korvyn drafted". The one-word closed vocabulary is unchanged.


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

## 2026-08-28 — UI/UX Phase 1: Corporate Flux is the reference implementation

Owner's direction: refine the Flux **page shell and controls** — not the statement
table, not the review panel, not the narrative — into the interaction language the
rest of Korvyn will adopt. Zendesk is the reference for *discipline* (compact
enterprise density, restrained borders, predictable menus), never for branding or
IA. **The shell is unchanged**: dark ribbon, global module nav, contextual
Accounting rail, Search / Ask Korvyn, notifications, profile, scope architecture.

**The page states its identity once, in the shell's own title row.** `paintTopbar()`
writes both halves for Flux: the name — **Corporate Flux** — and one quiet context
line beneath it, `KFX.pageContext()` → *"Jun 2026 vs May 2026 · Consolidated · USD"*.
It replaced the crumb *"Income statement · variance analysis"*, which named the
statement the tabs directly beneath already name, and restated what the page is
called where its context belongs. Every clause comes from the function the matching
control reads (`cmpPhrase` · `scopeWord` · `ccyWord`), so the header and the Period,
Scope and Basis fields cannot drift. The cadence word drops out of a plain
prior-period comparison — "Jun 2026 vs May 2026 · Monthly" says monthly twice.
**Do not add a header inside `#fxRoot`.** That is why `glHead()` was retired; the
page name would then be on screen twice.

The stack now reads **A: what view you are in → B: how it is filtered**:

| y | Region |
|---|---|
| 86 | **Corporate Flux** + context line (the shell title row) |
| 161 | Income statement · Balance sheet · Cash flows · Equity — level 1 tabs |
| 223 | Period · Scope · Workflow · Variance · Basis · Display · Saved Views · Actions — level 2 |
| 255 | the one contextual field row |
| 358 | the statement (was 365) |

**ONE TAB LANGUAGE — `.ktabs` / `.ktab`, a design-system primitive.** The same idea
was drawn three ways on one screen: the statement picker at 36px on 8/14 padding,
the Flux command bar at 30px on 0/10, and the popover's Included|Excluded pair at
28px on 0/2. All three now draw from one primitive — 32px, `0 12px`, `--fs-table`,
2px underline, no pill, no fill, no shadow, no radius; the strip scrolls before it
wraps. **Two levels, one vocabulary:** level 1 (where you ARE) takes the accent;
`.lvl2` (the command surface) is identical geometry with an **ink** underline. Two
accent underlines 60px apart is the competing-tab-rows problem — with one accent on
the screen the hierarchy reads without a second colour, size or shape. `#subnav2`
and the Flux bar both emit `.ktab`; **add a tab row by using the primitive, never by
restyling buttons.** Tab rows are keyboard-driven: roving `tabindex`, ←/→/Home/End
through one delegated handler (all eight Flux tabs previously had `tabindex=0`, so
reaching the field row took nine presses of Tab).

**ONE DROPDOWN LANGUAGE — `.pop` is now the app-wide standard.** Measured before:
seventeen menus hanging off seventeen identical 180px fields opened at **eleven
widths between 230px and 330px**; the internal inset was 11 / 9 / 11 / 7px across
header, search, footer and rows; **0 of 6 rows were focusable** and none carried a
role; and the menu **never re-placed**, so one scroll left it 228px from its
trigger. Now:

- **Two fixed widths** — 300px standard, 340px `.wide` (dimension multi-selects and
  the materiality editor, which carry a second column of figures or a form). Never
  narrower than the control it hangs off.
- **One inset**, `--pop-x`, for header, search, rows and footer, so a section label
  and its rows start on the same pixel.
- **`--shadow-md`, not `--shadow-lg`** — an anchored menu is not a modal. A 44px
  blur under a 1px border is two separations doing one job.
- **Anchoring is live**: re-placed on scroll and resize, right-aligns to the trigger
  rather than sliding along the viewport, closes when the trigger leaves the screen.
- **Single-select is a TICK, multi-select is a CHECKBOX.** A box that fills in reads
  as "one of several"; drawing it on Period or Cadence promised a choice the menu
  does not offer. A single-select also carries the selection on the **row**
  (`--accent-bg`) — one row can be selected, so it is obvious the moment the menu
  reopens. A multi-select keeps the row neutral and lets the ticked box carry it,
  because twelve accent-filled rows is the loud state this pass removes. Reason code
  moved to the checkbox, where it always belonged.
- **Keyboard throughout**: ↑/↓/Home/End/Enter/Space, Escape closes and returns focus
  to the trigger. Roles are assigned after paint (`popEnhance()`) rather than at the
  twenty call sites that emit rows, so any menu added later is covered.
- Section separators are `.pop-h.sec` / `.pop-l.sec`, not an inline `border-top`
  written at ten call sites. Long lists get a search — Period had **30 rows and no
  search**.

**THE ACCENT MARKS THE OPEN FIELD, NOT THE FILTERED ONE.** This **amends** the
2026-08-28 ruling above that "accent marks a field actually narrowing the
population". A Scope row with three dimensions set was three cobalt tablets in a row
of five — the loud selected state the owner ruled out, and a misuse of the accent
besides: rule 2 says the accent carries *interaction*, which is what it does now, on
the field whose menu is open. A narrowing filter is stated by its **value**: `--hint`
"All"/"Any" at rest, `--ink` at 500 against a stronger border once it narrows. The
guarantee that a filtered statement always says so is unchanged and never rested on
colour — **every tab carries a live count of its own filters**, and Clear all
appears at the end of the row.

**The field row is ONE row and stays one row.** `flex-wrap:wrap` made it two the
moment the review panel took 440px (measured: 36px → 72px, pushing the statement
down at exactly the moment a reviewer needs it). It scrolls instead, on the same
discipline as the tab strip.

**Tab counts follow the tab that owns the filter.** `syncFilterChrome()` read the
*first* tab in the DOM and scored it against `FX_FTABS[0]` (Period) while its own
comment said the query belongs to Scope — so typing in Find updated the wrong tab's
count and Scope's never moved. Counts are now looked up by `data-tab` and refreshed
together.

**`#fxRoot.aw` no longer redefines `--radius`.** `--radius:14px` was a parallel
design system inside one page: every control asking for the token got rounded into a
capsule, which is why `.fxf` and `.seg` each had to pin 6px back by hand. The card
declares its own corner (10px); nothing inherits it.

**Deliberately NOT done in this phase** (owner's direction — later phases): the
statement table, the variance column treatment, the comments/support panel, the
narrative experience, row hierarchy and account-group presentation. The eight-tab
command architecture, its names, and the two-submits rule are unchanged — the
existing IA already answers the questions the brief listed.

**Open question for the owner:** the left rail still reads **"Flux analysis"** while
the page now reads **"Corporate Flux"**. Renaming a nav item is a navigation change,
so it was not made unasked.

## 2026-08-28 — BOXY: the surface is a ground, its regions are the cards

> **Superseded 2026-08-29 FOR THE INSPECT PANEL AND THE ASSISTANT**, which are
> full-width bands on a sheet. The statement page still reads as cards on a ground,
> and the `overflow:hidden` / sticky-header trap below still holds everywhere.


Owner reviewed the pass above and its verdict was **"I don't feel any changes"** —
fairly. Everything in it was structural, behavioural or sub-pixel: real fixes, but
a reviewer opening the page saw the same screen with a different title. What
follows is the visible half, and it **supersedes the "4b UNBOXED" direction**
recorded in the mercury block.

**The inversion.** `#fxRoot.aw` was ONE flat white card holding un-boxed bands. It
is now a **ground**: `background:none`, no border, no radius, `padding:0`. Each
region standing on it is its own white card with a real edge — the command
surface, the worklist tiles, the statement. This is the reference's own structure
(a light canvas carrying bordered white cards), and it honours **rule 11** more
literally than the flat version did: exactly one card per region, rather than one
card for the whole screen. **Rule 5 is intact** — the cards separate by *lightness
and a hairline*, never by shadow.

| Region | Treatment |
|---|---|
| statement picker | **folder tabs** — `.ktabs.lvl1`, selected tab is a white box whose bottom edge IS the panel's top edge |
| command surface | one white card, radius `0 6px 6px 6px`, joined to the folder tab above it |
| worklist | a row of **stat tiles** — figure over label, one card each (was a strip between two hairlines) |
| statement | a framed card; the line count is its header band; filled `thead`, filled section rows |

**A CARD EDGE AND AN INNER DIVIDER ARE NOT THE SAME LINE.** This is the rule to
carry forward. `--line` (n-200) is a hairline *between things sharing a surface*;
against the darker page it all but vanished, so a card read as white paint rather
than an object. **Outer edge of a region → `--line2` (n-300). Dividers inside a
card → `--line`.** Nothing new was introduced; both are ramp steps.

**Planes.** Light-mode `--bg` moved `var(--n-50)` → `var(--n-100)`. At `#F7F8FA`
the page was three percent off the white cards standing on it. **The dark block is
unchanged and must stay so** — the ramp inverts there, so `--n-50` is already the
darkest step and is correctly the page.

**The UI face is no longer Inter.** `--sans` leads with `"Segoe UI Variable Text"`,
then `-apple-system`, then the usual descent; `--num` is now `var(--sans)` so
chrome and figures share one face (rule 14). Two reasons this is right rather than
merely different: the reference screens themselves run system faces (San Francisco
/ Segoe / Helvetica Neue / Lucida Grande), not a licensed brand face; and it keeps
the file self-contained — no `@font-face`, no CDN. **Inter is deliberately absent
from the stack**: leaving it first would make the change invisible on any machine
that has it installed, which is exactly how the previous pass failed. Measured on
the review machine: Segoe UI Variable Text renders 9% narrower than Inter, and
**tabular figures are exact — 0.000px spread across all ten digits**, so numeric
columns still align. IBM Plex Sans and Source Sans were considered and rejected:
neither is installed locally and neither can be embedded without breaking
self-containment.

`--h-field:32px` is a new token — a filter-row field is an input-shaped box you
read a value out of, not a chip you press, so it is taller than `--h-btn` and
borders at `--border-strong`.

**Trap: never put `overflow:hidden` on `.card.fx-table`.** The column heads are
`position:sticky; top:var(--fx-stick)`, and an `overflow:hidden` ancestor becomes
their containing block — the header row lands ~147px down the middle of the
statement, under rows it is supposed to label. Observed and fixed. `#fxRoot
.fx-table{overflow:visible}` exists for this reason; do not out-specify it. The
sticky head also stopped painting `var(--bg)`: borrowing the page colour for a band
inside a white card was only ever invisible because the page was near-white. It is
`--n-50` now, a step lighter than the `--bg2` section rows, so the two filled bands
never read as one.

Verified: 60/60 views render, console clean, all 10 chrome themes pass AA, dark
mode holds the boxy structure, numeric columns align, dropdowns still anchor under
the taller fields.

## 2026-08-28 — contrast, and ONE named FILTERS region

**"The header and filter pretty much blends. There's no contrast"** (owner, on the
boxy pass). Two planes were doing nothing:

- **The header painted a tint, not a plane.** `.topbar` was
  `color-mix(--bg 82%, transparent)` — once the page darkened it became a slightly
  lighter wash of the page a few pixels above cards of a third colour. It is
  `--surface` at 92% with a `--line2` edge now: the header is the top of the
  CONTENT plane, so it takes the content surface.
- **White fields on a white card behind an invisible hairline.** Measured: a field
  against its ground was **1.06:1**. The command card is **two bands inside one
  border** now — the tab band keeps the card's surface, the field band is a control
  ground (`--n-100`) under a real rule, and the fields are white boxes standing on
  it at 1.13:1 fill plus a 1.34:1 border. This is what the reference does: the
  fields are the objects, the band is what they stand on.

**ONE FILTERS REGION HEADER — `.kfh`** (owner's direction). The shell already drew
a filter icon and the word *Filters* on the collapsible drawer that every non-Flux
page uses; Flux had neither, so the same idea was named on 59 screens and anonymous
on the one that is the reference for the rest. It is a primitive now — same icon
(the shell's own path, `M2 3h12M4 8h8M6 13h4`, exported as `KFILT_IC`), same word,
same band — sitting above whatever tabs and fields the surface carries:

```
⇶ FILTERS   2 active                              Clear all
Period  Scope ¹  Workflow ¹  Variance  Basis │ Display  Saved Views  Actions
[Period Jun 2026 ⌄]  [Compare May 2026 ⌄]  [Cadence Monthly ⌄]
```

The band owns the two facts that are region-wide, not tab-wide: **the count of
every live filter across every tab** (the tab badges say *where* a filter is; this
says whether the page is filtered at all), and **Clear all**, which reaches across
all tabs and so belongs beside the count rather than trailing whichever row happens
to be open. It repaints on its own in `syncFilterChrome()` via `fxHeadInner()` —
safe, because unlike the field row it holds no input a reviewer could be typing
into.

**The strip says where the filters stop.** `.ktab-div` is a hairline before the
first `cfg:1` tab. Display, Saved Views and Actions configure rather than filter and
never carry a count, so one word must not claim all eight — the divider is what lets
the band be called *Filters* honestly.

`.filterbar-hd` (the platform drawer's header) was aligned to the same band — same
icon size, same label type, `--line2` border, no shadow. It stays a button while it
still opens a drawer.

**Not yet done — the platform filter still uses the collapsible drawer.** The
analysis is complete and the finding matters: of ~25 control groups in that drawer
only **five are real** (`fundScope` · `regionScope` · `ownType` · `ccyMode` ·
`periodType`/`periodVal`, bound to `F`). **Seven are dead controls** — `gfClassGrp`,
`gfPeriodGrp`, `gfCompareGrp` on GL financial statements and `gtCatGrp`,
`gtEntityGrp`, `gtViewGrp`, `gtRangeGrp` on Trending review are every one a
`<select onchange="renderAll()">` with no id and no state binding, so choosing "By
entity" or "Operating expenses" changes nothing. Nine more (`fx*Grp`) are Flux
legacy that never render, because the drawer is hidden on Flux.

## 2026-08-28 — the FILTERS band folds, and the platform adopts the format

**The band is the toggle** (owner's direction). It reverses the "persistent inline
fields" ruling for the OPEN/CLOSED state only — the fields are still one row under
one tab strip, they just start folded, the way the drawer this band replaced always
behaved. Folded on Flux the region is 35px and the statement opens 73px higher.

**The count survives the fold, and that is load-bearing.** On a surface whose
numbers get signed a reviewer must never read a filtered statement with no visible
reason why. Collapsing hides WHICH filters are set, never THAT they are — the band
keeps `N active` and Clear all. Clear all sits inside the toggle and so calls
`event.stopPropagation()`; the band is a `role="button"` div, not a `<button>`,
because a nested button is invalid (the same construction the shell's header used).
`setFilterTab()` opens the region — choosing a category is asking to see its
controls. `Alt+F` toggles it; on Flux that shortcut previously called the shell's
`toggleFilters()`, which opened a drawer that is `display:none` there, so it did
nothing at all.

**THE PLATFORM FILTER IS NOW THE SAME OBJECT** (`#gfBar`), on every non-Flux
surface. What it replaced was a three-column grid with a titled but empty
"Comparison" column, native OS selects, a blue segmented capsule and a
Reset / chip / Save-as-preset / Apply footer.

- **`#filterCtrls` stays in the DOM and stays hidden.** `readFilters()` reads `F`
  straight off those `<select>` elements, so they remain the state store and the
  new fields drive them by setting `.value` and dispatching `change` — which fires
  the control's own inline `onchange`. `readFilters()`, `onPeriodType()`,
  `resetFilters()` and every downstream figure are untouched. **No handler is
  duplicated and no data path moved.** Verified end to end: picking Fund II through
  the field set `F.fund='F2'`.
- **Options are read from the control being driven**, never restated in the
  registry — the same "derive, never duplicate" rule the figures follow.
- Tabs are per page: **Scope** (Fund · Region · Ownership) · **Period** ·
  **Basis** (Currency), plus **Ledger** (`GL_DIMS` → `glSet`) on GL overview and
  Account activity, so the ledger's four real dimensions became a tab instead of
  being lost with the chips.
- **A field with nothing to choose does not render.** "Which" exists only for a
  single quarter or a single month.
- The menu is the same `.pop`: a generic `g:<key>` branch, so the shell declares
  its filters as data and the rendering, keyboard, anchoring, width and
  selected-state all come from one place. Long lists get the search automatically.

**SEVEN DEAD CONTROLS DELETED, not ported.** `gfClassGrp` · `gfPeriodGrp` ·
`gfCompareGrp` (GL financial statements) and `gtCatGrp` · `gtEntityGrp` ·
`gtViewGrp` · `gtRangeGrp` (Trending review) were each a
`<select onchange="renderAll()">` with no id and no state binding — choosing "By
entity" or "Operating expenses" changed not one figure on screen. A control that
cannot act is a dead control.

**The field CSS no longer belongs to Flux.** `#fxRoot .fxf` / `#fxRoot .fx-fields`
became `:is(#fxRoot,#gfBar) …` — 27 rules, rewritten in place so compound selectors
stay correct, and specificity is unchanged because `:is()` takes the highest of its
arguments. Add a third surface by adding it to that `:is()`, never by copying the
block.

Verified: 60/60 views render, console clean, 10/10 chrome themes pass AA, the field
→ select → `F` path works, the ledger field drives `GLF`, and reset clears both.

## 2026-08-28 — the thread is a TIMELINE

> **Superseded 2026-08-29** — the connector and full-bleed rows went with the card
> treatment; a message is a bordered card now. The `.rw-msg` grammar and the
> one-level reply shape are unchanged.


Owner's direction, from the reference's Interactions panel. The `.rw-msg` grammar
of 2026-08-28 stands; four things about how it is drawn changed.

**ONE vertical line, in the gutter.** Every message carried its own 2px rail beside
its prose, so a thread of six was six short rails at six different heights with
nothing connecting them — six marks for one idea. A single connector now runs
behind the badges (`.rw-msg::before`, 1px `--line2`, at
`calc(var(--rw-bleed) + 11px)`), which is what makes a thread read as one exchange
over time rather than a stack of cards. The per-message rail is gone with it: a
second vertical line beside the first is the box-in-box rule applied to strokes.
`.rw-thread` and `.rw-grp` are **`gap:0`** and the spacing is padding — a gap would
cut the connector between every pair.

**The voice moved to the badge.** The rail carried it (accent for you, indigo for a
Korvyn draft) while every avatar was cobalt — so the one element that could carry
identity did not, and the accent marked a *message* rather than an interaction.
Now: **a person is ramp (`--n-500`), YOU are the accent, a Korvyn draft is indigo**
(rule 2 — indigo is the AI marker and never a second UI accent), an awaited voice
stays a dashed hollow circle. The badge is a 22px rounded square (18px on a reply),
opaque and `z-index:1`, so it covers the connector without needing a ring.

**Title over meta.** The header was one baseline row with the time pushed to the far
right, so on a 440px panel a long name and its timestamp sat at opposite edges with
a void between them. `.who` is now `flex:0 0 100%` at `--fs-ui`; role and time fall
to a quiet `--fs-label` line beneath, `.hd .sp` is retired, and the separator is
drawn by `.role ~ .at::before` so it appears only when both halves exist.

**Full-bleed, not inset.** Rows run to the panel's own edge — `--rw-bleed` is set on
`.dw-body` and the row negates it with symmetric margins — so the tint reads as
"this row" and not as a card that grew a background. Hover is `--surface2`; the
message the composer is aimed at takes `--accent-bg` via a new `.aim` class, which
is the one row genuinely *in play*.

Verified in both densities: connector 1px at the badge centre, badge 22px/5px,
`.who` full width with meta on its own line, message left edge = body left edge,
`.tx` rail removed, `.aim` tint on the replied-to message, page mode unchanged,
60/60 views, 10/10 themes AA.

## 2026-08-28 — ONE filter affordance per surface

**Collapsed on arrival.** Both regions already defaulted to folded, but the flag is
session state, so a band left open while adjusting one page's filters greeted you
open on the next. `paintTopbar()` now folds both whenever `TAB` changes
(`_lastFiltTab`), through `gfOpen=false` and `KFX.collapseFilters()`. Switching the
**statement** on Flux is not a page change and leaves the band as the reviewer set
it.

**Duplicate entry points removed** (owner: "I see quite a few double filter
options"). Six surfaces carried a page-level **Filters** button *inside the content*
that opened the very same panel the FILTERS band above it opens — `glActions`,
`glSurfActions`, the comments toolbar, and the Requests / Data Room / Evidence
headers — plus the GL chip bar's **+ Filter** button and its **Advanced context**
link. All removed. The GL chips themselves stay: they are a display of what is on
with per-chip removal, not a second way in.

**`toggleFilters()` is this file's placeholder handler — 37 callers, and most have
nothing to do with filtering.** After removing the duplicates, ~25 remain wired to
it: **Actions ⌄**, **···** (More), **Export**, **Columns**, **New request** ×2,
**+ New Report**, **Run Report**, **View calendar**, **+ Add / Plan**, **Save
view**, **Save review**, **Assign owner**, **Download** ×2, **Link as related**,
**Open source document**, the FP&A header's *All entities / USD / May 2026* pills,
and several `<tr onclick>` rows. Each opens the filter panel instead of doing what
it says.

These were **deliberately left alone**: they are mislabelled placeholders, not
duplicate filters, and deleting a primary CTA like "New request" or "Export" is a
product decision, not a UI-consistency one. They are the largest remaining
"no dead controls" debt in the file — worth a pass of their own, either wiring them
or removing them.

## 2026-08-28 — the page header's command cluster moves into the band

Owner's direction: *"the export s/b inside filter tabs. Also, the ... + action
button."* On the precedent Flux already set — **"Actions absorbs the ellipsis menu.
The tab IS the menu, so its contents are the row; putting a menu inside a tab would
be two clicks to reach one action."**

The platform band gains a **cfg** tab, **Actions**, after the `.ktab-div` (added to
`gfBarInner` too — it had only been in Flux's strip). `Export` and `···`/`Actions ⌄`
are gone from every page header.

**`glExport` and `glActions` are now empty strings.** That retires them at all 26
call sites in two edits and with no change to any of them — they are interpolated,
so an empty string is inert. Do not re-add a command cluster to `glHead()`.

**`···` and "Actions ⌄" were not ported as buttons**, because neither ever had
contents: both called `toggleFilters()`. The Actions *tab* is what they were
pretending to be.

**Export is real now.** `gfExport()` walks the page's primary visible `table.tbl` —
after the filters, in the order on screen — and downloads a properly quoted CSV
named from `VIEW_META`. `gfTable()` gates it: a page with no table offers Print
alone, because a control that cannot act is a dead control, which is exactly what
the button this replaced was. Verified: `account-activity.csv`, headers plus rows,
commas inside dates and figures correctly quoted.

One `···` survives, on `fdetail` — it calls `pickTab('findex')`, real navigation,
not a filter placeholder.

## 2026-08-28 — a collapsed rail must not hide navigation

Reported by the owner: *"when I collapse left panel, GL options further expands.
Shouldn't I have an extra drawer?"* — and the instinct was right; this was a real
defect, not a cosmetic one.

**What was wrong.** `body.rail-collapsed` sets `.railkids{display:none!important}`,
but the group button still ran `toggleRailGroup(k); pickTab(...)`. So in a 56px
rail, clicking **General Ledger**:

1. flipped `railExpanded[k]` with **nothing visible to show for it** — the change
   only surfaced the next time the rail was expanded, which is exactly the
   "further expands" that was reported;
2. **navigated to `glintel`**, a page nobody asked for; and
3. left the group's **six children unreachable** — GL overview, Trial balance,
   Account activity, Financial reporting, Flux analysis and Trending review had no
   route at all until the rail was expanded again.

**The fix is a flyout, in the product's ONE popover language.** `pop()` takes a
third argument, `side`, and `popPlace()` honours it: beside the trigger, top
aligned, flipping to the trigger's left if the right edge cannot take it and
lifting off the bottom rather than running past the viewport. A 56px icon has no
useful "under". The flyout therefore inherits the shared anchoring, widths,
keyboard, roles and selected-row treatment for free.

**`toggleRailGroup(k,el)` now returns false when it has handled the click itself**,
and the inline handler reads `if(!toggleRailGroup('…',this))return;` — so a
collapsed rail opens the children and does **not** navigate or flip hidden state,
while an expanded rail behaves exactly as before. The group button also carries
`data-pop`, so the outside-click handler leaves it alone and a second click closes
its own flyout rather than reopening it.

**`railFlyoutRows(label)` reads the rows off the rail the shell already painted** —
never a second copy of the nav config — so an item added to the rail appears in the
collapsed flyout with no further wiring.

Verified: opens 6px to the right, top-aligned; lists all six children with the
current page ticked; does not navigate; leaves `railExpanded` untouched; ↓ moves to
the next row; Escape closes and returns focus to the rail button; a second click
toggles it shut; picking a row navigates and closes. Covers every grouped rail item
in the product, not just GL — `ledger` has one group of 6, `filings` two of 3 and 2.
Expanded-rail behaviour unchanged. 60/60 views, 10/10 themes AA.

**Note for a later pass:** the outside-click dismissal is bound to **`mousedown`**,
not `click`. A synthetic `.click()` in a test will not trigger it — that cost a
false "second click does not close" reading here.

## 2026-08-28 — ONE PAGE TEMPLATE: title once, options in the band, then content

Owner: *"when I click on each tab they have different views… have the standard
options on top and the content will be based on the options."* Measured before the
pass: **35 distinct opening shapes across 60 views**, and three causes.

**THE PAGE STATES ITS NAME ONCE.** 23 views printed the title twice — once in the
shell's title row from `VIEW_META`, again as an `h1` a few pixels below. `glHead()`
now suppresses the `h1` when `glDupTitle()` says it repeats the topbar, comparing
against `VIEW_META` directly so it does not depend on which paints first. A
drill-down whose header names a *record* rather than the view keeps its title. This
generalises the ruling Flux already had. **23 → 0.**

**ONE HEADER COMPONENT.** `.fp-hd` was a second header with the same shape and its
own class, so FP&A's seven views drifted from the other twenty-five. `fpHead()`
delegates to `glHead()` and keeps only what is genuinely FP&A's — the
illustrative-data marker. **`.fp-hd` in use: 7 → 0.**

**THE PAGE'S OWN FILTERS MOVED INTO THE BAND.** Nine views rendered their own row
of controls *inside the content*, below the band that is supposed to own options —
GL intelligence alone had ten selects. They appear as a **More filters** tab (the
owner's own vocabulary from the Phase 1 brief). **9 → 0.**

They are **discovered, not registered**: every `.grp` in the current view holding a
`<label>` and a bound `<select>` — the exact shape the retired shell drawer used, so
the pages were already speaking this vocabulary. A page that adds a filter gains it
in the band with no wiring, and no handler is duplicated: the field sets the select
and the select's own `onchange` runs. Verified end to end on `glintel` — picking
Entity through the band moved `gliEnt` from `all` to `Meridian DC Holdco`.

45 of the 52 in-page selects are genuinely bound (`setGliF`, `setClFilter`,
`setAxF`, `setAmF`, `setPolF`, `setDrF`, `setDrevF`, `setGlRecon*`). The 7 that are
not carry no `onchange` and are **skipped rather than redrawn** — no dead controls.

Two traps worth keeping:

- **`gfPageGrps()` must NOT test visibility.** The source row is hidden once it has
  moved, so a visibility test would stop finding it on the very next paint. It is
  scoped to `#view-<TAB>` instead, which is what keeps the hidden `#filterCtrls`
  store out of the result.
- **`renderAll` is wrapped as `_renderAll(); paintTopbar();`** (line ~30593), so the
  view has already re-rendered by the time `paintGfBar()` → `gfHidePageRow()` runs
  and the fresh row is there to be stood down. `renderAll()` itself does not call
  `paintTopbar`.

The source row is hidden with `[data-gf-moved]`, never deleted, and a card left
holding nothing but the row is hidden with it.

Field values normalise `"All " + label` to just **"All"** — the page rows write
their default as "All entity", and the label is already on the field.

**What this pass deliberately did NOT do:** the content region itself. Distinct
opening shapes went 35 → 33, because the variance that remains is `kpis` /
`statrow` / `card` combinations *inside* the content, not the frame around it.
Collapsing those needs a single `page({options, strip, body})` builder every view
calls — the "full page template" option, which the owner deferred. The frame is
standard now; the body is not.

## 2026-08-29 — the inspect panel takes the reference's shape: bands, one rail, one control set

Owner's direction throughout, against `apps/review/index.html` — the inspector this
panel is meant to match. **Read that file's `.fxi-*` CSS before changing this panel**;
it is the specimen, and several rulings below are its own comments rather than new
argument. The Flux review panel, its full-screen page and the Korvyn Assistant are
now one object at three densities.

**Overview is FIVE cards, the reference's five** — Explanation · Key drivers ·
Workflow & review · Evidence · Comments. `state` (the NEEDS REVIEW band) and `attn`
(Needs attention) are **not** among them, and their absence is the point: the
reference has neither. Nothing they carried was lost, it moved where the reference
carries it — the verdict is the classification pill on the Explanation card,
coverage and residual are rows in Workflow & review, and the itemised blockers still
render in full on the FULL PAGE (`RW_LAYOUT.page.judge`), which has the room a 440px
dock does not. `cmtPeek` was deleted when the thread merged into Overview and
**restored** when Comments went back to its own tab; it is a summary of a tab, so it
only earns its place while that tab exists.

**EVERY SECTION IS A FULL-WIDTH BAND ON A SHEET.** This **supersedes the 2026-08-28
BOXY ruling** ("the surface is a ground, its regions are the cards") *for the inspect
panel and the Assistant* — the statement page keeps its cards. A floating card needs
a gutter, the gutter needs a scrollbar allowance, and the card needs its own padding
inside that, which is how one panel ended up with **three left rails**: header text
at 16, card edge at 27, card content and tabs at 42. Running the band edge to edge
collapses all of it — the band pads to `--s-4` exactly as the header does, so every
word in the panel starts on the same pixel. Separation is a hairline between bands,
which is what rule 5 asks for anyway.

Three traps, all of which cost a round of "still not aligned":

- **Compare content to the HEADER, never cards to other cards.** A stack that is
  uniformly wrong is uniformly symmetric. Full screen was inset 16px on both sides
  while its header spanned the sheet, and every card-vs-card check passed.
- **`.rw-col.solo{max-width:120ch}` capped the card, not the prose.** Every
  single-column tab stopped ~500px short of the header. The measure limit belongs on
  the paragraph (96ch); the card fills the sheet. The `judge` column already worked
  this way — follow it.
- **A scrollbar takes layout width, so chrome outside the scroller is wider than
  bands inside it.** `scrollbar-gutter:stable` makes the reserve constant and the
  header, tabs and footer take it as a right margin. `--dw-sbw` / `--cp-sbw` are
  **measured at runtime** — a scrollbar's width is a platform fact, not a token.

**The header is a FOUR-FIGURE BAND**, which **supersedes the 2026-08-25 hero**
("push the visual language"). Current · Compared · Variance · Δ%, equal billing under
their own labels, colour on the two variance cells alone. The hero said the same
thing three rows deep and left the two balances a reviewer ties back to as the
smallest text in the block. Weight is `--fw-medium`, not the reference's 700 — rule 7
admits two weights and 700 is not one. The favourable/unfavourable word rides in the
Variance cell's LABEL, and drops when the line did not move (`Variance · no movement`
overflowed the band and said nothing the `0.0` did not).

**Key drivers is a list that FOOTS**, which **retires the contribution bars** of
2026-08-25. The reference's own note is the argument: the drivers foot to the header's
variance, and that is what the Total row is for. The bars restated a percentage
printed beside them and broke the footing — four independently scaled widths do not
visibly add to a whole. Two things that must not come back:

- **The unexplained residual is NOT a driver.** Drivers decompose what moved; the
  residual measures how much of that movement nobody has ACCEPTED an explanation for.
  Different axes over the same total — printing `0.9 + 0.3 + 0.2 + 1.4` under a Total
  of `1.4` asks the reader to believe 2.8 = 1.4.
- **The plug absorbs the rounding.** Deriving the remainder from true values leaves
  the PRINTED column off by a tenth. A reviewer checking a column is not holding the
  unrounded figures.

**Evidence is a workpaper index** — File · Uploaded by · Ref. · Status. `Ref.` and
`Status` are derived and honest about what this model knows: Ref. counts the accepted
items citing a document, and the line's own sign-off IS the verification event, so an
approved line reads Verified and everything else Pending. There is no separate
document-approval workflow and inventing a badge for one would assert a control that
does not exist. `evidenceDocs()` dedupes by name and is read by the tab count, the
table AND the Overview card — `evidenceFor()` returns one row per CITATION, so
counting it made the tab say 3 while the table listed 2.

**History reads: the series → the memory → the log.** Balance & movement by period
(two columns, newest first), prior-period explanation with its framing note, then
Activity as a timeline with a round type badge per event. The badge is a tinted disc
with a coloured glyph, **not** the reference's saturated disc with a white one:
`--warning` is a dark amber in light mode and a LIGHT amber in dark, so a white glyph
reads ~2:1 on half the themes. `histFocus` no longer reorders the sections — a tab
whose sections move depending on how you arrived cannot be learned.

**THE REVIEW CONVERSATION**

- **A return posts its reason INTO the thread**, tagged at the preparer, marked
  `Changes requested`. It went to `rc.revNote` — a field surfaced as a status caption
  — so the trail read: Korvyn drafted, a preparer explained, and then the line was
  inexplicably back with the preparer. `rc.revNote` is still written, so the footer
  and grid are untouched. `cmtPost()` is the single writer for the thread.
- **Every message states which side of the review is speaking** (`cmtRole`), derived
  from the RECORD, never from a job title — a Controller is preparer on one line and
  reviewer on the next, which is what `canReviewLine()` is about.
- **A status pill renders only where a status exists.** The reference shows
  Superseded / Included in rollup / Approved / Excluded because its rollup carries
  them; a discussion comment here carries none and gets no pill rather than a
  decorative one.

**KORVYN DRAFTS EVERY LINE, not only the material ones.** The gate was `r.req`, so
the population a reviewer most wants a fast read on — the lines nobody will work by
hand — was the one place with no machine help. Materiality decides whether an
explanation is REQUIRED; it was never a statement about whether Korvyn can write one.
Strictly additive; the surviving guards are that a dismissed draft stays dismissed and
that a line which did not move has nothing to explain. `bestExplanation(r,rc,noGen)`
takes a third argument because the GRID asks about every visible row and only wants to
know whether something is inherited — generating there would run `explainObj()` per
row and materialise a `CMT` record for every line as a side effect of rendering.

**The statement column gains `Ready` and `Explained`** (`FXST`), and this closed a
hole rather than adding a word: with items accepted and the record still in draft,
**no branch fired and the cell rendered EMPTY** — explaining a line erased its status.
A written narrative with no items was worse, reading "Needs explanation" over an
explanation somebody had written. `Ready` vs `Explained` is whether anyone is waiting:
only a `req` line can be handed over. "Draft ready" was renamed **"Korvyn drafted"** —
it meant the near-opposite of ready. `fxStateKey()` is the one derivation; the column
and the hover peek both read it.

**A HOVER PEEK on the Explanation cell** reads the words without opening anything.
Deliberately NOT the `pop()` system — a pop traps focus and swallows the click heading
for the panel underneath; this is a transient read. On an immaterial line the mark is
a quiet indigo **K**, absent at rest and revealed on row hover or focus, the same
discipline the star gutter uses (`opacity:0`, never `visibility:hidden`).

**FULL SCREEN gains a General ledger tab** — every entry behind the line, NOT the
drilled slice. The drill reaches journal entries only under the node you pinned and
only after five clicks; this is the question a reviewer asks before signing. Rows link
out through `erpLink()`, the app's existing "View in ERP" language.

**WINDOW CONTROLS ARE ONE PRIMITIVE** across every docked panel — `#fxRoot .rw-ib`
and `.cp-head .cp-tool` on one rule. They were drawn five ways: 26 vs 24px targets,
15 vs 14px glyphs, `--muted` vs `--n-400`, two hover fills, a 2px cluster gap against
9px. **A third panel joins that rule; it never copies the values.** The collapse
chevron is gone in both — a chevron says "next", the arrow-into-a-bar says "fold this
panel to the edge", which is what the control does.

**THE KORVYN ASSISTANT TAKES THE SAME FORMAT.** Same bands, same rail at `--s-4`,
same window controls, sentence-case section titles (the labels were already written in
sentence case — only the CSS was shouting them), suggestions as rows in the band
rather than boxes in it. The greeting keeps its indigo wash: that is Korvyn's own
voice (rule 2), not decoration.

**THE STATEMENT SHEDS COLUMNS RATHER THAN RUNNING UNDER THE PANEL.** With the review
panel and the Assistant both open the table was **691px inside a 487px box**. Every
column is `white-space:nowrap` so it cannot compress, and `.fx-table` is deliberately
`overflow:visible` (an overflow ancestor breaks the sticky column heads — see the trap
in the BOXY block), so the extra 204px drew *underneath* the panel with nothing on
screen saying so. `fxShed()` drops columns by CLASS in a stated order — Δ%, then the
analytics columns, then Explanation last because it is the column a reviewer scans —
down to a floor of line + current + compared + Δ amount. Two rules:

- **Hide by class, never by rebuilding the column set.** `S.cols` is what the reviewer
  chose and must survive a resize.
- **Measure the TRACK, not the table.** Hiding a column changes the table's width and
  never the track's, which is what keeps this from looping.

Body cells carry `data-c="<col>"`, injected at the one place cells are built, because
the headers had `col-*` classes and the cells had nothing — a column could not be
addressed as a column, and `:nth-child` is unsafe when the column SET is user-chosen.

**`.ai` IS A GLOBAL COMPONENT, NOT A MODIFIER.** It is the AI answer panel (~line
1469) and carries `display:none` until `.ai.show`. Used as a local modifier it renders
the element at 0×0 with opacity 1. This bit twice in one session — once on the
statement's Korvyn mark, once on the explanation prose. The token for the colour is
`--ai`; the local modifier is `krv`. `.rw-av.ai` and `.rw-msg.ai` survive only because
their own rules re-declare `display`.

**Specificity notes worth keeping.** Three fixes failed silently before landing:
`#fxRoot.dw-page .fx-detail .dw-body` ties with `#fxRoot.aw .fx-detail .dw-body` and
loses on source order (use `#fxRoot.aw.dw-page`); the card-vs-inner-box override ties
with `#fxRoot.aw:not(.dw-page) .fx-detail .rw-wf` and must sit BELOW it in the sheet;
and `.rw-rg:first-child{border-top:none}` stripped a card's own top border until it
was scoped `:not(.rw-card)` — invisible in light mode, a bright line in dark.

**Verified:** 63 view keys render, 0 console errors, 10/10 chrome themes AA, dark mode
holds in both densities. Band edges, rail identity, box-in-box, nested and collapsed
cards, uppercase titles, truncated figures and header/body cell counts asserted across
21 lines × 4 dock tabs, 6 page tabs and both Assistant tabs.

**THE 200% DUPLICATION IS FIXED** (later the same day). `kdAccept()` and
`exPropose()`/`sugAccept()`/`sugAllAccept()` each pushed into `rc.items` from the same
decomposition and neither knew the other existed — `suggest()` walked
`drivers(id).bySeg`, which IS `byDim(id,'seg')`, the very call `explainObj()` already
made, then applied its own reason map and its own sentence. Using both, which the UI
invited, took a line from 100% explained / 0.0 residual to **200% explained / 1.4
residual** with no warning.

Three changes, in this order of importance:

1. **A driver carries a stable key onto the item it becomes** (`kdKey`, from
   `kdKeyOf`), and every path that turns a driver into an item goes through
   `kdAddDriver()`. Accepting the same driver twice is now impossible rather than
   discouraged — the guard is in the WRITER, not in each call site. There are exactly
   two `rc.items.push` sites left: that writer, and `exSave()` where a person types
   an item from nothing.
2. **`suggest()` builds from `explainObj(r).drivers`** with `kdReason` and
   `kdItemNote` — one source, one reason mapping, one wording. It also filters out
   drivers already on the line, so regenerating after accepting a draft proposes what
   is genuinely left instead of offering the same four again. The unattributed
   remainder is keyed `gap:rest` and measured against what the LINE holds, not against
   the proposal list, or accepting a draft first would leave a gap that double-counts.
3. **The key survives the item editor.** Without `kdKey` carried through `exSave()`,
   editing a suggestion and then accepting the same driver from the draft would put it
   on the line twice — the edit would have laundered away the only thing the guard
   reads.

Every path now **reports what it skipped** rather than quietly doing less than its
button said ("3 drivers accepted, 1 already on the line").

Verified across all 21 statement lines with the orders interleaved — draft→suggestions,
suggestions→draft, draft twice, and edit-a-suggestion→draft: coverage never exceeds
100%, no line accumulates duplicate items, and the edited item stays edited while the
draft adds only the drivers it does not already hold.

## 2026-08-29 — the full screen is brought onto the dock's grammar

Owner's direction: refine the inspect panel and **review the full-screen version**,
"make everything consistent". The pass above brought the DOCK onto the reference's
shape and left the full page behind it on eight counts. Every one below was measured
before it was changed, and every one is a case of the same rule being enforced at one
density and not the other.

**OVERVIEW MEANS THE SAME THING AT BOTH DENSITIES.** `RW_LAYOUT.page` mounted the FULL
contents of four other tabs into the page's Overview — the drill, the evidence table
and its financial source, the whole comment thread and composer, the period trend, the
prior-period explanation and the activity log: **thirteen regions** against the dock's
five. Since full screen started swapping rather than scrolling (2026-08-28), that left
six tabs of which one contained five, so `evid`, `drill`, `prior`, `trend`, `trail` and
the thread were each reachable two ways — which is exactly how the two compositions
drifted apart in the first place.

It is now the reference's five, in the three columns' own argument:

| Column | Parts |
|---|---|
| **judge** — is this defensible, and what is stopping it | `explain` · `attn` |
| **comp** — the decomposition and its support | `drivers` · `evidRow` |
| **rec** — the record and the conversation | `reviewer` · `cmtPeek` |

`attn` is the ONE page-only addition and that stays deliberate: the itemised blockers
need room a 440px dock does not have. `evidRow` and `cmtPeek` are the same summaries
the dock uses — a count and a chevron through to the tab, never a second copy of it.
Everything that left is one click away on the tab that owns it, and each is now in
exactly one place. **Do not re-mount a tab's full contents into Overview.**

**`drivers()` had a hard `if(X.page)return ''`.** So the card the reference calls Key
drivers — one of its five — did not exist at the density with the most room for it, and
`drill` stood where it should have been **with no section title at all**: a nameless
band in a stack of named ones. The guard is gone; the drill is the Drivers tab's own
content, which is what that tab is for.

**A SOLO TAB'S BANDS ARE THE SAME BANDS OVERVIEW'S COLUMNS DRAW.**
`#fxRoot .rw-col.solo .rw-rg+.rw-rg` is one id and FOUR classes and so beat the page's
card rule (one id, three) — so from the second band down every solo tab drew a 20px
margin, a 20px top padding **and** a top border directly under the previous band's
bottom border. Measured: Evidence and History at `20px 16px 16px` against Overview's
flat `16px`, and History's middle band carrying `border-top:1px` *and*
`border-bottom:1px` — **two hairlines 20px apart** where every other band in the panel
has one. The `:not(.rw-card)` guard had been carried over from the rule above it, where
it exists to stop a card losing its own top edge; here it excluded precisely the
elements that needed the reset. Two rules now: the reset undoes the `.solo` separation,
and a second restores the card's own `padding-top` — zeroing it for everything put the
title hard against the hairline (caught on the first pass).

**THE CARD TITLE IS ONE COLOUR.** `.rw-card .rw-sec` declares `color:var(--ink)` where
the card treatment is defined and **neither density was getting it**:
`#fxRoot.aw .fx-detail .rw-sec` (`--hint`) and `#fxRoot.aw:not(.dw-page) …` (`--muted`)
are each declared later and each wins its tie on source order, so the same title
rendered **n-600 in the dock and n-500 on the page** — two ramp steps apart, which reads
as two kinds of heading rather than as a drift. Restored to the declared intent rather
than picking a winner between the two accidents: a card states its own name, so the
name is ink; the quiet tracked label those rules were written for is a BARE `.rw-sec`
on a band, which they still govern.

**ONE TAB ORDER AND ONE BADGE RULE.** The dock read Overview · Comments · Evidence ·
History; the page read … Evidence · Comments · History — one vocabulary presented in
two orders, so the tab a reviewer reaches for moved when the panel changed size. The
page also showed a bare gap dot on Evidence and **nothing at all** on History, so the
same tab answered "how much is here?" in the dock and refused to on the full screen.
Both strips are declared as data now (`FX_DOCKTABS` beside `FX_PAGETABS`) and read one
`badgeOf()` — the two hand-written literals with two badge rules inside them are what
let the orders and the counts diverge. Rule 12 is unchanged: a `.ct` count is quiet
inventory, the dot is the one thing action-owed. The two page-only analytical tabs sit
together straight after Overview, which is the order the drill-down is walked.

**THE WORKLIST TILES NEVER STOOD DOWN.** `#fxRoot.dw-page>.fx-work{display:none}` is one
id and two classes; `body.fx-mercury #fxRoot .fx-work{display:flex}` is one id, two
classes **and an element**, and later in the sheet — so the tiles out-specified their own
stand-down and stayed on screen (measured `display:flex`, 64px) above a sheet whose
whole point is to take the screen. Exactly the family of trap the neighbouring comment
already warns about for the margin shorthand: **that subtree restyles rows page mode has
already retired, so scope the restyle to the density that has the rows**
(`#fxRoot:not(.dw-page)`), never by adding `!important` to the stand-down.

**"Conversation" was still a second name for the thread.** The 2026-08-29 ruling above
records that the tab, the header and the Overview peek all say *Comments*; the tab was
renamed and **the card header was not**. Renamed at the one call site.

**An empty state is still a band.** `cmtStream` is in `RW_NOCARD` because its normal
output is a list of message cards — but with nothing to say it returns a bare
`.rw-quiet`, which inherited padding from nothing and printed "Nothing said yet." hard
against the panel edge, **16px left of every other word in the panel**. Same fault on the
page, where the part mounts in a bare `.rw-rg`. One rule covers both.

**The panel's one segmented control takes the panel's control shape.** Inherited from
the global `.seg`, the General ledger filter was the only control in the inspector at
`--h-btn` (28px) while every button beside it is a `.sm` at `--h-btn-sm` (26px), and its
selected segment was a **filled cobalt** — a second filled primary competing with the
footer's real one, which is rule 13. It takes the tinted selected state this app already
uses for a chosen option everywhere else (`#fxRoot .tbtn.on`, the `.pop` single-select
row).

**Checked and found already correct**, so they are recorded rather than re-fixed: the
tab strip's text rail (the button box starts 10px left of the rail, its *text* lands on
it — `padding:0 calc(var(--s-4) - 10px)` plus the button's own 10px, by design); the
`--s-4` content rail across header, bands and footer in both densities (237 on the page,
982 in the dock, every element); and the scrollbar gutter reservation.

**Verified:** 60/60 views render; **160/160** combinations of 16 statement lines × 4 dock
tabs and 6 page tabs render with content; console clean; 10/10 chrome themes pass AA;
dark mode holds in both densities with the ink title reading light-on-dark and no
bright-line artifacts. Every band in every tab at both densities now measures
`padding:16px` with a single bottom hairline and the last band in a column carrying
none.

**Still open, and deliberately not changed here** — the full page's solo tabs draw one
bordered, 12px-radius column card on the gray body. That is the documented page
treatment (three columns side by side each have to read as their own document), but with
only ONE column it is a box inside the panel frame. Worth an owner's call rather than a
unilateral change.

## 2026-08-29 — comments follow the explanation they answer (peek and reply, not the thread)

Owner: *"wouldn't it be much better from the UX perspective that the comments are right
below the explanation — user/reviewer are making comments based on the explanation?"*
Correct about the defect, and this is the third time this has been in play, so the
numbers are recorded with the decision.

**What was wrong.** `cmtPeek` closed Overview, fifth of five. Measured on a typical
line in a 572px dock body: Explanation 0–229, Key drivers 229–441, Workflow & review
441–637, Evidence 637–704, **Comments 704–771** — the last thing said about the line
sat **132px below the fold and four cards away from the words it is about**. A reviewer
who had just read an explanation and wanted to question it scrolled past the whole
panel to find the box.

**Why not the whole thread**, which is what the 2026-08-29 pass above briefly did before
the reference composition was restored. The Comments tab measures **346px with an empty
thread and 789px** on `ga`, the one seeded line with three messages. Mounted under the
Explanation card that pushes Workflow & review — status, coverage, residual, who is
next — from y=441 to **y≈1150: two screens below the words being judged**. The panel
would bury the verdict under the conversation, which is the opposite failure.

The argument that carried the inline version has also since been retired by another
change: **a Return already posts its reason into the thread**, so the reviewer standing
at the point of decision is no longer without a way to say why.

**What shipped.** `cmtPeek` is SECOND — `['explain','cmtPeek','drivers','reviewer',
'evidRow']` — and carries the last message plus `cmtComposer()`, the same one-line
composer the Comments tab uses, which reveals its byline and Post/Clear only once there
is a draft. The archive, the filters, the threaded replies and the "awaiting" worklist
stay on the tab that owns them. Measured cost: the Comments card goes 67px → 145px
(188px with a message), so Workflow & review moves 441 → 586 in the dock. **The verdict
was already below the fold at 441 in a 554–613px body**; the state band at the top of
the panel and the footer's actions are what is pinned, and neither moved.

**The page follows** — `page.judge` is `['explain','cmtPeek','attn']`, `comp` is
`['drivers','evidRow']`, `rec` is `['reviewer']` alone. On 1184px the three columns are
all in view, so the peek was below no fold there — but the panel must not answer "where
do I reply to this?" two different ways depending on its width.

**THE REFERENCE'S CARD ORDER IS WHAT THIS TRADES AWAY**, knowingly: `apps/review` reads
Explanation · Key drivers · Workflow & review · Evidence · Comments. Adjacency to the
explanation beat matching that order. The five cards and their contents are otherwise
untouched. **If this is ever reversed again, reverse the ORDER, not the composer** —
the reply box beside the explanation is the thing that was actually asked for.

**Standing down is not the same as disappearing.** `cmtComp` may render nothing while
`S.cmtReplyTo` is set, because the composer it defers to is three rows above it inside
the group it is aimed at. From Overview that box is on another tab, so the same silent
stand-down just deletes the reply affordance — click Reply, come back to read the
explanation, and the box is gone. The peek renders `.rw-peekaim` instead: one quiet line
naming where the reply is, with a button back to it. Round-trips verified, including
Cancel restoring the composer.

**One composer, one caret** — the peek and `cmtComp` both emit `#cmtIn`, and they are on
different tabs in both densities. Asserted: across **160** combinations of 16 lines × 4
dock tabs and 6 page tabs there is never more than one `#cmtIn` in the document.

**Verified end to end:** typing sets `.live` with no repaint (the caret contract
`cmtField` holds); posting from Overview writes to the thread, moves the peek count
0 → 1, updates the last-message line to what was written, updates the Comments tab
badge, clears the draft and leaves the reviewer on Overview. 60/60 views · 160/160
tab/density combinations · console clean · 10/10 chrome themes AA · dark mode holds in
both densities · band grammar unchanged (every band still `padding:16px` with one bottom
hairline).

## 2026-08-29 — Overview, Evidence and History against the reference, card by card

Owner's direction with the reference inspector's three screenshots. Everything here is
either a structural gap against that specimen or a rule the panel was breaking to get
closer to it. **Where the reference uses colour and this system does not, the system
wins** — that ruling is made three times below and it is the through-line of the pass.

**KEY DRIVERS FOOT IN PLAIN INK.** Every driver row and the Total carried
`.dlt.up`/`.dlt.dn`, so a card whose entire job is a decomposition adding to a total
rendered as four or five green figures over a green Total. Rule 3 read backwards: red,
amber and green are STATE, "never decoration, never a series colour", and a driver
amount is exactly a series value. The one state on the line is already coloured, once,
in the header band's Variance cell. The explicit `+`/`−` sign carries direction
losslessly — which is what a footing schedule uses — and survives greyscale and all ten
chrome themes. The reference prints them plain too.

**WORKFLOW & REVIEW GAINS A CLOCK, AND IT IS A REAL ONE.** The reference closes on
"Target sign-off · Aug 5, 2026 · 4 days left"; this model has **no per-line sign-off
target**, and inventing one would assert a control nobody built — the same reason the
evidence table derives Verified/Pending from the line's own sign-off rather than badging
a document-approval workflow that does not exist. What does exist is the explanation
REQUEST raised on the line, with a real due date and a real lateness instant. The row is
**Response due**, under its own honest name, and it is absent when no request is open
rather than printing a placeholder. Matched on line AND statement AND period — a request
raised against another comparison is not this line's clock.

*Count days end-of-day to end-of-day.* `dueParts()` sets `dueTs` to 23:59:59.999 of the
due day, so `Math.ceil((dueTs - Date.now())/864e5)` turns a request the controller chose
as "In 5 days" into "**6 days left**" for all but the last second of today (observed).
Measured against the end of today it is a whole number by construction and reads back
exactly what was chosen.

**A FILE STATES ITS TYPE.** Every document rendered the same `▤` glyph, so a reviewer
scanning evidence could not tell the PDF approval from the XLSX rollforward without
reading the extension off the end of a name the table truncates. The reference
distinguishes them **by colour** — a red PDF icon, a green spreadsheet — which is not
available here (rule 3; a file format is not a state). `fileKind()` renders a short
monochrome tag instead: it sits at the START of the row so truncation cannot eat it, and
gives the names a common left edge. One helper, read by the Overview card and the
Evidence table both, so the two speak one vocabulary. 5.73:1 light, 6.62:1 dark.

**"+ Add document" WAS AN EMPTY FIELD.** Its rule sits inside the comment composer's
block and had picked up the composer's shape — solid hairline box, left-aligned muted
text, `cursor:text` — on a control whose only act is to open a file picker. Dashed,
centred, accent ink: what the reference draws and what the pattern means everywhere
else. An outline, not a fill, so the footer's Submit is still the panel's one filled
primary (rule 13).

**THE ACTIVITY TIMELINE: THE GLYPH CARRIES THE KIND, COLOUR CARRIES THE STATE.** Four of
`RW_ACTS`' seven rules painted a state colour on an event that is not a state —
submitting and reassigning were amber, **attaching a document was green**, a comment took
the accent — so a line worked normally for a week read as a column of alarms and
successes, and three attachments in a row said "three things passed". Colour is now the
two events that ARE states (approved; returned or reopened), so a healthy review reads
monochrome and the one amber disc in a timeline is worth looking at.

The table grew to ten rules and **every act string `logA()` actually writes now maps to a
specific glyph — nothing falls through to the generic bullet** (asserted by evaluating
the shipped `RW_ACTS` against all 27 of them). Order is precedence and three pairs were
wrong or missing:

- `/withdraw/` **never matched anything** — `logA` writes "with**drew** the explanation
  request", which the longer stem misses; it fell through to `/request/` and reported a
  withdrawal as a request. Match the stem, `/withdr/`.
- `/request/` must precede `/explan/` — "requested an explanation from …" contains both.
- "completed the review at …" reached no rule at all: `/reviewed/` does not match "the
  review". It is named in the approval rule now.

**A DENSITY CHANGE IS NOT AN AUDIT EVENT.** `dwPage()` logged "opened the full review
page" / "returned to the docked workspace" into the LINE'S append-only record — a view
toggle in a trail whose own caption promises that edits record the value before and
after. Nothing changed, so there was nothing to record, and it was not harmless: reading
one line at both densities during a single session drove its History count **from 0 to
9** (observed), burying the two entries that were real. Worse, "returned to the docked
workspace" matches `/return/`, so every collapse badged itself amber as though the
reviewer had sent the line back to its preparer.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · band grammar unchanged (226 + 186 + 32 across the three shapes) ·
never more than one `#cmtIn` · the trail holds at 4 entries across two full-screen
round trips · new elements measured in both modes — type tag 5.73/6.62, Add document
7.29/8.63, the due pill 6.32/7.32, the neutral activity badge 6.32/7.32.

## 2026-08-29 — the content plane had no contrast gate, and it showed

Owner, comparing a BlackLine screenshot: *"why does it look so clear — is it the font or
the background?"* Neither, mostly. Their Analytics tab shows six objects; the Flux page
renders 204 text nodes, 194 of them at 12px or smaller. That part is a product difference
and not fixable by styling. What WAS fixable is the second cause: **a large share of this
app's small text was painted in greys that fail WCAG AA**, and nothing checked it.

**`check_chrome_themes.mjs` covers the CHROME plane — ribbon, rail, close strip — and it
has been passing 10/10 the whole time.** The content plane had no gate at all. A DOM sweep
of all 60 views in both modes found **3,641 text elements below the AA floor**, including
the four period labels under the inspect panel's header figures (2.36:1), "Korvyn draft —
not yet accepted by a preparer" (2.36:1) and the statement's "3 lines · 1 open" (2.09:1).

**THE RAMP ALREADY SAID SO.** `--n-400`'s own comment is *"placeholder, disabled, trailing
glyphs"* — and `--faint` pointed at it while **141 CSS rules and 9 JS literals used it as
`color:` for real words**. This was documented misuse, not a judgment call. `--faint` is no
longer a foreground: the only two survivors are a `::placeholder` and one `[disabled]`
control, which are the two contrast exemptions WCAG actually grants.

**`--hint` PASSED ON A CARD AND FAILED ON THE PAGE.** `#6B7285` reads 4.80:1 on `--surface`
but **4.25:1 on `--bg` / `--n-100`** — so the same label cleared AA inside a card and failed
on the page background and on every section-header bar. Light `--n-500` is nudged 30% toward
n-600 (`#656C7F`): worst 4.64:1 across all six content surfaces, still a visible 1.24:1 step
from n-600, dark ramp untouched. That makes the step's own stated role — "secondary text,
labels" — true for the first time.

**WHITE INK ON A SEMANTIC FILL INVERTS AND NOBODY HAD NOTICED.** `--on-accent` / `--on-neg`
are `#FFFFFF` in BOTH token blocks. That is right in light mode (white clears AA on every
semantic: warning 5.42, pos 5.40, neg 5.62, accent 5.50, accent-2 4.95) and wrong in dark,
where the semantics go LIGHT: **2.19:1 on the dark amber, 2.21 on green, 2.68 on the
accent** — measured on the close-timeline segments and the `.n.q` count badge, the two
places a fill is coloured from DATA so no CSS rule states the pairing. New token
**`--on-fill`**: white in light, `#141824` in dark, worst 5.40/5.77. It cannot be
`var(--n-900)` — that step inverts too.

Also: `.th-sort .ar` (the sort caret, an affordance) was painted in `--n-300`, a BORDER
step, at 1.43:1; `.t.krv` used `--ai` (the surface hue) where `--ai-ink` is the reading
colour, 4.47:1; and light `--accent-2` read 4.37:1 as a figure colour on `--bg`, nudged
`#0E7C86` → `#0D757E` (4.83 on `--bg`, 5.47 on white).

**Result: 3,641 → 0.** What remains is 21 elements across two separator classes — a `·`
between two labels and a `›` between two lifecycle stages. Those are decoration, WCAG
exempts decoration, and making them legible would make them compete with the text they
separate. They are named in the checker's `DECORATIVE` list so the decision is recorded
rather than passing silently; if either ever carries meaning it leaves that list rather
than gaining an exception.

### `tools/check_text_contrast.mjs` — the gate that was missing

Three gates, one per way this happened, all static and all reading the tokens out of
`index.html` rather than restating them:

| Gate | Catches |
|---|---|
| **ROLE** | a TEXT token failing AA on any content surface in either mode — the `--hint` case |
| **USE** | a NOT-A-FOREGROUND token appearing as a `color:`, in CSS **or in a JS style string** |
| **ON-FILL** | `--on-fill` failing AA on any saturated semantic in either mode |

The JS-literal arm is not belt-and-braces: after every CSS rule had been moved off
`--faint`, the statement still rendered "Not applicable" at 2.36:1 because its colour was
assembled in a template (`c:'var(--faint)'`). A CSS-only scan would have declared victory.

**Negative-tested, because a gate that only ever passes is worthless.** Each of the three
was re-broken in turn against a backup and each failed with the right message and exit 1 —
ROLE reported `--hint on --bg = 4.25:1`, USE named both the CSS line and the JS literal,
ON-FILL listed all five fills at 2.19–3.07.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes still AA · 0 content text failures in light and dark. One scanner lesson
worth keeping: **kill transitions before measuring computed colour.** `.cp-ubtn` and others
carry `transition:` on all properties, so a sweep that flips the theme and measures
immediately reads mid-transition values — that produced ~1,200 phantom failures until
`*{transition:none!important}` went in.

## 2026-08-29 — the card title steps up: `--fs-card` 15px → 17px

Owner's direction, and the third of the three causes behind *"why does BlackLine look so
clear"*. The first is density and is a product question; the second was contrast and is
fixed above; this is the last one that is purely typographic.

**A card has to resolve as ONE OBJECT before any of it is read**, and what carries that is
the jump from its title to its body. At 15px/500 over 12px/400 the jump was **1.25× and one
weight step** — which is why a screen of six cards read as one continuous field of text
beside a reference whose titles step roughly 1.6×. 17px takes it to **1.42× on size alone.**

**No third weight, deliberately.** Design rule 7 admits two — 400 and 500 — and the
reference gets its jump partly from a heavier face. Buying the same effect with size keeps
the rule intact; if 1.42× still reads soft, the next move is the owner's call to amend rule
7, not a quiet 600 slipped in here.

**Still six type sizes.** This changes a value in the scale, it does not add one:
10 / 11 / 12 / 13 / **17** / 20.

**What actually moved, checked rather than assumed.** `--fs-card` has 78 callers and is not
only titles — the CSS also points figures, two search inputs and the rail wordmark at it, so
the bump could have enlarged the wrong things. Swept every view for elements now computing
to 17px: **115 card `h2`s, the panel's `.rw-sec` titles, `fr-title`, `trace-title`,
`trace-chain-h`, `cp-title`, `cp-lbl`, `card-hd`** — all titles — plus the inspect panel's
four header figures (`rw-met-v`) and one hero delta, where a step up suits them, and the
Evidence/Comments jump rows, which are card titles. The at-risk callers I was watching
(`.ai-body`, `.cmd input`, `.cmdk-in input`, `.residual`, `.det-c .v`, `.rail-name`) are
**not in the DOM in any reachable state** — dead CSS for surfaces that no longer render. So
nothing visible was wrongly enlarged, and nothing needed pinning back after all.

**No layout gave way.** Overflow sweep over 13k elements across all 60 views before and
after: **the same 10 groups both times**, every one pre-existing (SVG attribute artifacts
and three 3px card-rounding cases). No new clipping, no new wrapping.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content text gate clean · panel band grammar unchanged (128 bands at
`padding:16px` with a bottom hairline, 61 last-in-column without).

**What this step did NOT touch:** the font stack, the spacing scale, the weights, density.
Verified against the diff — no `--sans`, `--num`, `--s-*`, `--fw-*` or `--h-*` token
changed. (The two steps below then took the weight and the colour deliberately.)

## 2026-08-29 — a third weight, and the quiet text scale one step darker

Owner: *"complete all 3 steps"* — the remaining two levers from the BlackLine comparison,
taken knowingly rather than by default.

**A THIRD WEIGHT. THIS AMENDS DESIGN RULE 7**, which said "TWO font weights: 400 and 500".
`--fw-strong:600` exists now and is spent on ONE thing: the title of a card or panel
region. With `--fs-card` at 17px that puts a title at 1.42× its body on size and the rest
of the distance on weight.

- **It is not for figures.** Several `--fs-card` callers are amounts, not titles
  (`.residual`, `.gltr-hero-d`, `.radar-card .capcol .amt`, `.fr-row.tot .fr-val`,
  `.hm-node .n`). A heavier numeral says "this number is emphasised", which is a different
  claim from "this block is called X". They stay at 500, which is why the rule that applies
  600 **lists its selectors** instead of keying off `font-size:var(--fs-card)`.
- **FONT-WEIGHT INHERITS, and a title is usually a flex row.** Bolding `.card h2` bolded
  everything the card hangs beside its name: measured — "View by:", "($214M)", a
  "Quarterly" button, the ▸ fold caret, six SVG percentages, and in the panel the jump
  row's count, its "7 awaiting" and its "›". Only the title's own TEXT takes the weight;
  `.card h2 > *` and friends reset element children to 500, and the jump row is targeted at
  `.l` rather than at the button.
- **The rule sits at the FOOT of the sheet.** Each member ties with what it overrides —
  `.card h2` against `.card h2` — and a tie breaks on source order. `.rw-sec` needed one id
  and FOUR classes to clear `#fxRoot.aw:not(.dw-page) .fx-detail .rw-sec`, which sets 500;
  written with three it silently lost (caught in the sweep, not by reading).

**AND THE BROWSER'S OWN BOLD WAS ALREADY A FOURTH WEIGHT.** `b`/`strong` are set to
`--fw-medium` in about a dozen SCOPED rules, so a `<b>` inside those was fine and a bare one
anywhere else fell through to the UA default `bolder` = **700**. Measured: **543 elements**
across the app, undeclared, under a rule that admitted two. They now take `--fw-strong` —
they are emphasis and are meant to be heavier, and de-bolding 543 of them would be a change
made for tidiness rather than for reading. **The app now renders exactly three weights:
400 (4,728) · 500 (2,303) · 600 (680). Nothing arrives from the user agent.**

**THE QUIET TEXT SCALE MOVED ONE RAMP STEP DARKER.** `--muted` is the most-used text colour
in the app — 61 of 204 text elements on the Flux page, more than `--ink` — and at 6.48:1 it
was why a screen of labels read soft. Both quiet aliases step down one:

| | was | now |
|---|---|---|
| `--ink-strong` n-900 | 17.71:1 | unchanged |
| `--ink` n-800 | 14.12:1 | unchanged |
| `--muted` | n-600 · 6.48 / 5.73 on `--bg` | **n-700 · 10.00 / 8.84** |
| `--hint` | n-500 · 4.80 / 4.25 | **n-600 · 6.48 / 5.73** |

Four levels, all clear of AA on every content surface in both modes, and the whole scale
darker rather than one rule patched. n-500's own tuning (`#6B7285` → `#656C7F`) still stands
and is still load-bearing — **85 rules name `var(--n-500)` directly** rather than going
through `--hint`, and at the old value those read 4.25:1 on `--bg`.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content gate clean, worst `--muted` 8.84 and `--hint` 5.73 · band grammar
unchanged · dark mode holds · **overflow sweep identical to baseline** — the one panel row
that overflows (`.rw-idrow`, 411>407) measures the same with `--fs-card` and `--fw-strong`
forced back to their old values, so it is pre-existing and nothing is clipped (controls at
1725 inside a panel edge at 1737).

## 2026-08-29 — the type and density passes go PLATFORM-WIDE, and the CDN font dependency goes

Owner: *"I need you to update the fonts/density etc for the entire platform — I can see that
you did not [make] platform wide changes."* Correct on both counts, and the second one had a
specific cause worth recording.

**THE CHROME PLANE WAS EXCLUDED, AND THE CHROME IS WHAT YOU SEE ON EVERY SCREEN.** The
contrast, weight and size passes above moved `--muted` / `--hint` / `--fs-card` /
`--fw-strong`. The ribbon, rail and close strip do not use any of them — they run on
`--chrome-text*`, driven by the ten theme definitions, and only **6 of 152** chrome rules
reference `--muted`/`--hint` at all. So every one of those passes was genuinely platform-wide
*across the 60 content views* and changed nothing about the frame around them. Measured
before: ribbon nav 13px/400, rail items 12px/400, close strip 11px/500 — untouched.

### The font was never the app's own

`index.html` declared **zero `@font-face`** and carried
`@import url('https://fonts.googleapis.com/css2?family=Inter&family=Newsreader&family=IBM+Plex+Mono')`.
So two recorded claims were false: *"no build step, no external runtime dependencies"* and
*"it keeps the file self-contained — no `@font-face`, no CDN"*. Every open made a network
request, and offline or behind a locked-down network the whole type system silently fell
back. **Inter was already being fetched and then not used**, because `--sans` led with Segoe.

- **Inter is embedded** (71KB variable woff2, lifted from `apps/review`, which has shipped it
  all along) and leads `--sans`. This does not overrule the 2026-08-28 decision, it retires
  its reason: *"leaving it first would mean the change is invisible on any machine that has
  it installed"* was an argument against relying on a LOCAL install. Embedded, every machine
  renders the same face.
- **IBM Plex Mono is embedded**, three weights — 400/500/600, matching the declared scale.
  700 is deliberately not shipped: `b,strong` is pinned to 600, so nothing asks for it.
- **Newsreader is dropped** and `--serif` falls back to Georgia. Three callers, all AI-panel
  prose. A network dependency for three italic paragraphs is not a trade worth making.
- **The `@import` is deleted.** `document.fonts` now lists exactly two families, both from
  embedded payloads, and the page issues **no font network requests**. Self-containment is
  true for the first time. +167KB on a 2.6MB file.

**Inter is 6.5% wider than the face it replaced**, which in a `white-space:nowrap` app is a
real risk. Swept all 60 views: overflow groups went **10 → 7** — the extra card padding
resolved three pre-existing ones and Inter introduced none. **Tabular figures are exact,
0.000px spread across all ten digits**, so every numeric column still aligns (rule 14).

### Density, at the tokens

Every value below was OFF the 4px `--s-*` scale the system declares, which is why the app
read tight and slightly arbitrary rather than tight and deliberate. Each moves to the nearest
step up, so the platform gains air in one place rather than in 800 rules:

| token | was | now | reach |
|---|---|---|---|
| `--pad-card` | 13px | **16px** (`--s-4`) | 129 cards |
| `--pad-cell` | 0 10px | **0 12px** (`--s-3`) | every table |
| `--pad-kpi` | 9px 16px | **12px 16px** | every KPI strip |
| `--pad-toolbar` | 7px | **8px** (`--s-2`) | every toolbar |
| `--h-section` | 28px | **32px** | equal to `--h-tab` now |
| `--row-h` | 40px | **44px** | 459 rows |

**`--row-h` is the one that costs something** and it is the biggest single lever on how the
product feels: +4px on every row in the product. Dial it back HERE, never in the rules that
read it.

**The reference implementation was opting out.** `#fxRoot .fx-tbl td{height:34px}` was the
one table in the product ignoring `--row-h` — so the density pass would have moved every
table except the screen the rest of the product is measured against. It derives from the
token now (`calc(var(--row-h) - 4px)` = 40px), one step tighter for a stated reason: a flux
statement puts 25 lines on screen and the review panel takes 440px of it.

**Chrome joined the same scale**: rail items 12px → 13px (`--fs-ui`, matching the ribbon nav
they belong to), rail rows 6px → 7/8px vertical, and the rail wordmark onto `--fw-strong`.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · **overflow 10 → 7** · rows 44 (459) / 40 (Flux) · card
padding 16px on all 129 · no font network requests · digit spread 0.000px.

**Still deliberately untouched:** how much is on a screen. Six objects versus 204 text nodes
is a decision about what a flux reviewer needs in front of them, and it belongs to the
product, not the stylesheet.

## 2026-08-29 — control heights, line-height and the close strip onto the scale

The token pass above moved the platform's look; this is the rule layer behind it, which
had not moved. Three things, all measured before and after.

**EIGHT CONTROL HEIGHTS BECAME THREE.** Across all 60 views, controls rendered at 22, 23,
26, 28, 30, 31, 33 and 36px against four declared tokens — because **almost nothing set
`height`**. The button family derived its box from `padding:9px` plus a line-height, so a
control's size was whatever the font happened to make it; only ~9% landed on a token.

Fixed at both ends. The tokens moved toward the air the density pass took —
**`--h-btn` 28 → 32** (so a standard button, a tab and a filter field are finally the same
height) and **`--h-btn-sm` 26 → 28**, with `--h-chip` 24 unchanged. Then the strays were
given a height *from* a token and horizontal padding only: `.btn-out`, `.btn-primary`,
`select`/`input[type=date]`, `.pgbtn`, `.det-b`, `.dt-btn`, `.selpill`, `.trace-act`,
`.trace-open`, `.pipe-allbtn`, `.btn-x`, `.ftabs button`.

**Result: 92% of controls on a token (241 of 261), three heights — 32 · 24 · 28.** The
remaining 20 are unclassed one-offs in single views (bare `<button>` at 33/38/29, three bare
inputs, `.trace-seg`); they are named here rather than swept, because each needs its own
view opened to place it and none is a shared component.

`.ftabs button` is on `--h-tab` now but is still **a second tab language** — the design
system says to add a tab row with the `.ktabs` primitive, never by restyling buttons.
Converting it is an HTML change across several views and is not in this pass; putting it on
the token at least stops the product's two tab rows measuring 44px and 32px.

**SIXTEEN LINE-HEIGHTS BECAME THREE.** `--lh-tight` / `--lh` / `--lh-relaxed` already
existed with sensible values (1.2 / 1.5 / 1.62) and had **four callers**. The CSS carried
1.02, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.42, 1.45, 1.5, 1.55, 1.6, 1.7 and 1.75
as literals. **119 declarations** were bucketed to the nearest token; `line-height:1` (×18)
and `0` (×5) are left alone, being glyph centring rather than typography. Every rendered
line-height now derives from one of the three.

**THE CLOSE STRIP'S LABELS WERE PROSE AT `--fs-micro`.** `.cstrip-l .tag` ("CLOSE") and
`.cstrip-m .m .mk` ("Day", "Complete") sat at 10px, and rule 6 reserves micro for "counts,
badge numerals, ornament captions ONLY". Both are uppercase tracked labels, which is what
`--fs-label` is for — 10px → 11px on the strip that is on screen at all times.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10
chrome themes AA · content text gate clean · overflow 7 groups, unchanged.

**Deliberately NOT swept: the off-4px-scale spacing** — **1,089 declarations in the CSS and
90 in template literals**. Each needs a round-up-or-down judgement, it would change the look
a third time, and the regression risk is real for a diminishing return. It is gated instead.

### `tools/check_spacing_scale.mjs` — a RATCHET, not a demand for zero

The gate records what is there today and **fails if it grows**. New code lands on the scale,
old code converges when a rule is touched for another reason, and the number only ever goes
down. A gate that demanded zero would be red from the first run and switched off by the
second.

- **Per VALUE, not one total**, so ten fewer 7px cannot pay for ten more 13px.
- **A value absent from the baseline fails on sight** — the actual case this exists to
  catch is somebody typing `padding:15px` into a new rule.
- **CSS and template literals are counted separately.** An inline style built in JS is the
  same mistake somewhere a stylesheet linter would never look, and one budget must not hide
  inside the other.
- **`--baseline` prints the current map, through the same scanner the gate uses.** Recompute
  it that way, never by hand: the first attempt at this baseline was written by a throwaway
  script whose regex was escaped wrong, and it was 89 short.

**A HALF-TOKENISED VALUE IS THE POINT, AND THE FIRST CUT MISSED IT.** Skipping any
declaration mentioning `var()` was the obvious way to avoid counting tokens, and it silently
ignored `padding:2px var(--s-2)` — a hard-coded literal sitting right beside a token, which
is exactly the thing worth catching. It strips `var()`/`calc()`/`clamp()`/`min()`/`max()`
sub-expressions instead and counts what is left, so a fully tokenised value reduces to
nothing and a mixed one is caught. That correction alone found **44 more**.

**Negative-tested on all four paths**: a new value fails as `NEW`, a half-tokenised value
fails as `UP` on 7px, a fully tokenised value including `calc(var(--s-4) - 2px)` passes and
counts nothing, and a genuine fix passes while printing the exact lowered baseline to paste.

## 2026-08-29 — the numerals: one face, one scale, all tabular

Owner: *"the fonts and number size/color texture, height, spacing are not consistent."*
Right, and measuring it found three real faults the token passes had not touched — one of
them introduced by this session's own work.

**62 ELEMENTS WERE RENDERING IN ARIAL.** A `<button>` or `<select>` that sets `font-size`
but no `font-family` falls through to the **user agent's** control font, which is Arial here.
`font:inherit` was on some button rules and missing from others — `.selpill`, `.trace-row-*`,
`.trace-act`, `.trace-open`, `.trace-seg`, `.btn-icon` — including **six figures**. That is
not something that can be kept right rule by rule, so it is one reset:
`button,input,select,textarea,optgroup{font-family:inherit}`. `<code>`/`<kbd>`/`<samp>` had
the same hole on the other side, falling through to the UA's generic `monospace` instead of
the IBM Plex Mono this file now embeds.

**`--fs-figure` WAS SMALLER THAN `--fs-card`, AND THIS SESSION DID THAT.** The figure size
sat one step ABOVE the card title at 16 vs 15. Raising the title to 17 and leaving the figure
at 16 inverted it — every KPI value in the product became smaller than the heading above it,
which is why the stat tiles stopped reading as figures. It is `var(--fs-page)` now: the role
keeps its own name for its 17 callers and the platform renders one fewer size. A worklist
figure hard-coding `font-size:22px` in the mercury block went with it.

**THE SCALE IS NOW ACTUALLY THE SCALE.** Chart labels were the last holdouts — SVG `<text>`
at 9, 15 and `size/4.4` (34px on a large donut), set as presentation attributes, which cannot
take a `var()`. They are `style="font-size:var(--fs-*)"` now; the geometry-derived donut
centre is capped with `min(calc(…), var(--fs-hero))` so it stays responsive without inventing
a size. Eleven glyph rules at 8/9px went to `--fs-micro`.

| measure | before | after |
|---|---|---|
| font families rendering | Inter, **Arial**, generic monospace | **Inter + IBM Plex Mono, nothing else** |
| text sizes off the scale | 16 · 22 · 34 · 15 · 9 · 8 | **none** |
| numerals tabular | 1649 / 1649 | 1649 / 1649 (this one was already right) |
| distinct family/size/weight combos | 29 | **20** |

**The declared scale, corrected:** `--fs-micro` 10 · `--fs-label` 11 · `--fs-table` 12 ·
`--fs-ui` 13 · `--fs-card` 17 · `--fs-page` 20, plus `--fs-hero` 28. `--fs-figure` is an
ALIAS of `--fs-page`, not a seventh size. The old note that `--fs-hero` "has exactly one
caller" is stale — it has two.

### The figures are monospace — rule 14 is honoured rather than amended

Owner's call. `--num` was aliased to `--sans` on 2026-08-28, which read rule 14's second
sentence ("Chrome uses Inter") and dropped its first ("All money, dates, IDs, deltas:
monospace"). `--num` is `var(--mono)` — IBM Plex Mono, embedded — and **both halves hold at
once because chrome does not use `--num` at all**: 0 of 152 chrome rules. The two faces never
blend because they never meet.

**MEASURED BEFORE SWITCHING, not after.** A monospace figure is **13.2% wider** —
`(1,234,567.89)` goes 89px → 101px at 12px — and this is a dense product with seven numeric
columns, so the risk was `fxShed()` silently dropping one. Tested by overriding `--num` live
first: overflow groups 9 before / 9 after with **zero new**, the Flux statement still fitting
its track exactly (1216 = 1216), and no column shed with the panel open or closed. The
columns absorb it because their width is driven by the header text, not the figure — the
sample cell measured *narrower* in mono, 133px against 139px.

**THE SWITCH ALONE ONLY MOVED 75% OF THEM**, and the reason is the interesting part.

- **Seven rules define `.num`** — `.dt`, `.tbl`, `.ic-mx`, `.tbl.fr-filing`, `#fxRoot .tbl`,
  `.rw-docs`, `.rw-per`, `.acctsurf` — and exactly ONE set a font-family. The other six set
  `text-align` and `font-variant-numeric` and let the family fall through, so flipping
  `--num` moved some numeric columns and left others in Inter *in the same table*. One base
  rule, `th.num,td.num{font-family:var(--num)}`, at the lowest specificity so each of those
  rules keeps controlling its own alignment.
- **THE `tabular-nums` HEURISTIC WAS WRONG, AND THE OWNER CAUGHT IT.** The first cut gave
  `var(--num)` to every rule declaring `tabular-nums`, on the theory that a thing opting into
  tabular figures IS a figure. **font-family inherits, and `tabular-nums` is routinely set on
  a CONTAINER or a `th`** — so the sweep put the monospace face on ~700 WORD-bearing elements:
  152 table headers ("Amount", "Age"), 284 `.ic-mini` sentences ("3 blockers"), 60 provenance
  lines ("NetSuite · 10 min ago"). Three panels side by side then showed three different
  faces. It shipped, and the owner saw it before I did — the lesson is to grep the RENDERED
  result for words-in-the-figure-face after any family change, not to trust the CSS reasoning.

**The face goes on the LEAF that holds the figure, never a container, header or label.** After
the revert: `td.num` takes it and `th.num` does NOT (a column heading is a word), split out of
the one rule that bundled them. The display figures are listed as an explicit set of leaf
selectors (`.hst-v`, `.mc-v`, `.kpi .v`, `.fpkpi .vv`, `#fxRoot.aw .fx-detail .rw-met-v` …) so
nothing inherits the face into a sibling label. Three rules that hard-coded `--num` on a
phrase were freed (`.burn-lbl` "46% paid · 60% invoiced", `.pipecol-hd .tot`, `.card-sum`), and
`.piv td.rowhdr` was pinned back to `--sans` where it had picked up the column's mono.

**Result: pure words rendering in the figure face went 700 → 14**, and the 14 are value cells
(`.det-c .v` = "✓ Balanced" / "Tie exactly") whose content is a figure most of the time and a
word occasionally — forcing either face is wrong for the other, so they are left. **1,233
numerals on the figure face, all tabular, 0 elements clipped.** Verified by spot check: the
statement cells, the panel's four-figure band and the KPI tiles are mono; table headers, the
band's period labels, pivot row headers and the whole Korvyn Assistant are Inter.

**The ~300 numerals still in Inter are markup, not CSS**, and are left deliberately: unclassed
`<td>` account codes that are LEFT-aligned beside a name (a `.num` would wrongly right-align
them — they need their own class at ~10 template sites), and numbers inside sentences, which
SHOULD stay Inter because a figure that switches face mid-sentence reads worse than one that
does not.

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · spacing ratchet unchanged · 0 clipped elements · 14
word-in-mono cells, all runtime-mixed value cells.

### The inspect panel's tabs disagreed on the figure face — the leaf-list missed the panel's own

Owner, looking at the docked Flux panel: *"each tab's fonts / color shading / numbers looks
different."* Right, and specific: on Overview the header band read `60.0M` in mono but the Key
drivers `+0.2` / `+0.6` right below it were **Inter**, while History and Evidence were all
mono. Same panel, same kind of number, a different face per tab.

Cause: the mono switch's leaf-selector list covered the STATEMENT and the KPI tiles but not
the panel's own value classes, which each declared `tabular-nums` and no family and so fell to
Inter — `.rw-kd .v`, `.rw-kd-tot span:last-child`, `.rw-r .v`, `.rw-r .p`, `.rw-tot .v`, plus
`#fxRoot .rw-per td.num` / `.rw-docs td.num` which out-specify the base `td.num` rule and drop
its family. All seven now take `var(--num)`.

**And `.mono` — a class literally named monospace — rendered in Inter** everywhere except
`.rw-fsr .v .mono`, because that was its only rule. The GL-drill account codes and JE ids
(`class="mono"`, `"pill mono"`) were Inter. One global `.mono{font-family:var(--mono)}` fixes
every use.

**Result: all six dock tabs are 100% mono figures, 0 Inter, 0 words-in-mono.** The only
numbers still Inter are `.ct` count badges ("Comments 5"), which sit inline with a word and
are inventory (rule 12), not figures.

**Spacing, same panel:** the Comments header (`.rw-cbar`) sat 12px above its content while
every other card title uses 8px (the `.aw` override on `.rw-sec`), so that one card read
looser. `.rw-cbar` margin-bottom `--s-3` → `--s-2`. Title-to-content gap is now 8px on every
tab.

### The inspect panel has a 4-STEP TYPE CONTRACT — everything conforms, in both densities

Owner, still: *"you can't make such changes universally … spacing/fonts/color shading are
inconsistent,"* and then *"the right flux panel is terrible."* Both fair. The pattern was
reactive — fix a class, claim it, the owner finds the next. So this time the whole panel was
audited element-by-element in both densities and forced onto ONE explicit scale:

| step | size | use |
|---|---|---|
| title | 17px / 600 / `--ink` | card / section title (`.rw-sec`) |
| **body** | **12px / 400 / `--ink` or `--muted`** | prose, list rows, tables, messages — everything |
| meta | 11px / 400 / `--hint` | provenance, timestamps, secondary links |
| count | 10px / 500 / `--hint` | badge numerals |

**The body step was the whole problem.** Half the panel was 13px (`--fs-ui`) and half 12px
(`--fs-table`) with no principle: Explanation prose, Key drivers, the Evidence table, the
History balance table, comment author names, activity titles and the GL drill were all 13,
while Workflow, Comments messages and counts were 12 — so the text changed size card to card
and tab to tab. **Eleven rules** moved to `--fs-table`: `.rw-expl`, `.rw-kd li`, `.rw-kd-tot`,
`.rw-figs .who`, `.rw-flist .rw-doc`, `.rw-docs td`, `.rw-per td`, `.rw-ac .t`, `.rw-who`,
`.rw-msg .who`, `.rw-gl td`, plus the peek `.who`/`.tx`. 12px is the coherent choice because
it matches the statement grid the panel hangs off. The four things that stay 13px are the
panel HEADER identity (`.rw-nm` ×2) and controls (`.rw-ib`), not body.

**Colour:** `.gap` ("7 awaiting") rendered `--sev-med` amber while the identical text in the
Comments header (`.rw-cawait`) was neutral `--hint`. One fact, two colours → both `--hint`
(a waiting-count is inventory, rule 12, not an alarm).

**Two buttons, two sizes:** Accept (`.btn-primary.sm`, 12px) sat beside Edit
(`.btn-out.sm`, 11px). Both `--fs-table` now.

**Result, verified element-by-element in BOTH densities across all six tabs:** every body
element is 12px, every meta 11px, every count 10px, every title 17px — no 13px anywhere, no
off-scale size, no off-token colour (bar the decorative `--n-300` drill chevron), every
figure mono. Three off-scale paddings (7px) fixed to 8px; spacing ratchet baseline lowered
1089 → 1086.

**The honest note:** this was still done by auditing one surface exhaustively, not by a
mechanism that guarantees it platform-wide. The contract above is the standard; the panel now
meets it. The next surface (statement, close screens, GL) would need the same element-level
audit — a "figures are mono / text is on the 4-step scale / colour is a token" consistency
gate over the RENDERED DOM would be the real universal fix, and does not exist yet.

## 2026-08-29 — the Overview tab, made enterprise grade

Owner: *"I will give you full liberty to make my overview tab enterprise grade."* The
consistency passes above fixed drift; this is the hierarchy and polish that make a flux
review panel read as enterprise software. Three structural faults, found by auditing every
element rather than eyeballing:

**THE SUBJECT WAS BURIED.** The line name — the panel's whole subject — rendered at
**`--fs-ui` (13px)**, *smaller* than the section titles inside it (`--fs-card`, 17px). A
reviewer's eye landed on "Explanation" before "Rental revenue". The line name is now
**`--fs-page` (20px) / `--fw-strong` / `--ink-strong`** — it is the panel's title in the
literal sense the token is named for, and it stays one line (ellipsis, not shrink) even for
the longest name ("Transaction and acquisition costs" fits at 20px without clipping or
colliding with the window controls, verified in both densities).

**TWO LABEL/VALUE CARDS, THREE DIFFERENT TREATMENTS.** Workflow & review and Financial
source are structurally identical — a stack of label:value rows — but drew nothing alike:

| | label case | label size | value align | label col |
|---|---|---|---|---|
| Workflow (before) | sentence | 12px | RIGHT | 104px |
| Financial source (before) | UPPERCASE | 10px | LEFT | 96px |
| **both (after)** | **UPPERCASE tracked** | **11px `--fs-label`** | **LEFT** | **100px** |

One field-row system now: an uppercase tracked `--muted` field label in a fixed 100px
column, and a **left-aligned** value so every value starts on the same pixel and the card
scans like a data sheet — not Workflow's old ragged right-align. This is the design
system's own `--fs-label` treatment ("uppercase section label, tracked"), so the two cards
are byte-identical in type and layout now (verified: label `11/500/UPPER/100px`, value
`12/left` on both).

**THE RESULT IS A STRICT 5-STEP HIERARCHY** from the six tokens, each with ONE role, and it
holds across all six tabs in BOTH densities:

| step | token | role |
|---|---|---|
| 20 | `--fs-page` | line name (subject) |
| 17 | `--fs-card` | section titles · header figures |
| 12 | `--fs-table` | all body — prose, rows, tables, messages |
| 11 | `--fs-label` | UPPERCASE field labels |
| 10 | `--fs-micro` | counts, captions |

Verified element-by-element: **dock renders exactly {20,17,12,11,10}, three weights
{400,500,600}, zero off-scale, zero off-token colour, every figure mono.** Page mode had two
13px stragglers in the header's below-materiality note (`.rw-state.soft` inherited 13,
pinned to `--fs-table`); after that, page mode is identically clean.

Row padding moved 7px → `--s-2` (8px) on both cards — on-scale, and the spacing ratchet
caught a 1px optical nudge I tried to add (removed it; baseline lowered 1086 → 1083).

**Verified:** 60/60 views · 160/160 tab × density combinations · console clean · 10/10 chrome
themes AA · content text gate clean · spacing ratchet green · long-name stress test passes ·
both densities on the 5-step scale.

**Still deliberately NOT done** (would need owner direction, not liberty): reordering the
Overview cards, adding a header verdict band (the reference has none — the classification
pill carries it), or touching the four-figure band's structure. This pass was hierarchy and
consistency, which is what "enterprise grade" was missing.

**Later (owner: "focus on UI") — the four-figure band became an instrument strip.** It read
`gap:0`, four figures edge-to-edge as one blur; now each cell is divided by a hairline
(`.rw-met + .rw-met` border-left) with `--s-3` breathing room, first/last cells flush to the
band edges. The variance label was truncating ("Variance · fav…") in a ~100px cell — dropped
to "Variance" since the cell's colour and its ▲/▼ arrow already carry favourable/unfavourable
(the word still lives in the statement's F/U column and the Explanation). Verified: 0.5px
dividers, no label truncation on any line, both densities, gates green.

**Then (owner: "all three") — the variance leads, the pill is a badge, the sparkline is
refined.**
- **THE VARIANCE WAS NOT COLOURED, a real bug.** `#fxRoot.aw .fx-detail .rw-met-v{color:--ink}`
  (1 id + 3 classes) out-specified `#fxRoot .dlt.up`/`.dn` (1 id + 2), so the variance
  rendered slate on every line — against "colour lands only on the two variance cells".
  Restored with `.rw-met-v.dlt.up{--pos}` / `.dn{--neg}` / `.n{--muted}` at matching
  specificity. The variance amount also steps up one size (`.rw-met-v.hero` → `--fs-page`/20
  vs 17 for Current/Prior), with a fixed 24px line box on `.rw-met-v` keeping all four labels
  on one baseline. The variance now leads by SIZE and COLOUR — green favourable, red
  unfavourable (verified both).
- **The classification pill is a status badge**: UPPERCASE + `--tracking-label`, inline-flex,
  so "NEEDS REVIEW" / "ROUTINE" read as deliberate tokens, not a soft wash.
- **The sparkline** trades its flat 7%-opacity fill for a vertical gradient
  (`linearGradient #rwSpkFill`, accent .16 → 0) and a hollow ring endpoint (surface fill,
  accent stroke) instead of a solid dot.

Verified: 16/16 lines render, gradient present, console clean, all three gates green (the
spacing ratchet caught a 2px pill padding and made me revert it to 1px).

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
node tools/check_text_contrast.mjs    # index.html CONTENT text passes WCAG AA (both modes)
node tools/check_spacing_scale.mjs     # index.html spacing stays on the 4px scale (ratchet)
cd packages/core && npm run check      # core: typecheck + 78 tests + import boundary
cd packages/agent && npm run dryrun    # agent: all tools resolve, no API call
```

For `index.html` the browser-preview sweep is the end-to-end check: open
`file:///C:/Korvyn/index.html`, drive every tab, assert each view rendered, console clean.

## Git

Repo `github.com/mrgiri-hash/korvyn` (private). Requires Node (checks use `node --test`) and Python
(the boundary checker).
