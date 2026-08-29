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

**Known and NOT fixed here:** `kdAccept()` and `exPropose()`/`sugAllAccept()` both
write `rc.items` from the same decomposition, so a preparer who uses both double-books
the explanation — measured 100% explained · 0.0 residual, then 200% explained · 1.4
residual. Two generators, two vocabularies ("Korvyn draft" / "Korvyn suggests"),
neither aware of the other. Merging them is the next honest piece of work on this
panel.

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
