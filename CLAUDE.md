# CLAUDE.md — Korvyn monorepo

Orienting guidance for the whole repo. **Working detail lives in a `CLAUDE.md` next to the code** —
Claude Code auto-loads the one for whatever subtree you're editing. Read that one before you edit
there; this file is the map and the shared rules.

> **`index.html` at the repo root is the main project file** (owner's direction, 2026-08-14). It is
> the product. Everything under `apps/` is now a predecessor kept for reference — read from them,
> edit them only if asked by name.

> **THE LIVE BRANCH IS `design/ui-overhaul-phase1`, NOT `main`.** Check with `git branch --show-current`
> before you read a line of `index.html`. `main` is seven commits behind and does not have the UI
> overhaul: no inspect-panel hierarchy, no mono figures, no materiality impact filter. The two
> branches render a visibly different Flux surface from an `index.html` of nearly identical size,
> so **a file that looks plausible is not evidence you are on the right branch** — and neither is a
> clean `git status`, which is equally clean on both.
>
> This is written down because it has already cost real work. On 2026-08-30 a session opened just
> after a `checkout` from this branch to `main`, read `main`'s `index.html`, found it byte-identical
> to `HEAD`, and concluded on that basis that nothing was missing — while the owner was looking at a
> screen this branch renders and `main` cannot. **When the file disagrees with what the owner
> describes, suspect the branch before you suspect the file.** Nothing was lost (the work was
> committed and pushed here), but the reflog was the thing that should have been read first.

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

**This file and its four subtree siblings are the SOLE source of truth.** There is no mirror to
keep in step, and none should be recreated unless the owner asks for one.

**The `.cursor/rules/` mirror was retired 2026-09-02** (owner: Cursor is no longer in use). It
was six scoped `.mdc` files restating these documents for an editor that cannot read them, and
it carried no unique authority — `project.mdc`'s own opening said so: *"These rules are a
summary, not the authority. When they and a `CLAUDE.md` disagree, the `CLAUDE.md` wins."* So
nothing was lost with it, and the standing cost of the arrangement went too: every rule change
had to be made twice, and a mirror that drifted was worse than no mirror because each editor
then enforced a different repo. The files are in git history if a future editor ever needs the
same treatment.

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

## 2026-08-30 — the Explanation column tells the review state, with timestamps

Owner's direction, several passes. In **Narrative** mode the Explanation column printed the
prose alone, so a Korvyn draft read as a settled explanation and a returned line read as
though nothing was owed — the honesty the *status* column carries in Statement mode was lost
the moment the words appeared. `narrCell()` now emits a marker under the prose for the three
states where the words are NOT the line's settled answer:

- **Korvyn draft** — an indigo `✦` leads the prose and a grey `.eb-prov` line reads
  *"Korvyn draft — preparer to review and approve"* (the panel's own draft treatment: sparkle
  carries the `--ai` identity, rule 2).
- **Open for review** (submitted) — muted *"Open for review — {reviewer} to review and
  finalize · submitted {time}"*, the column's own `wait` treatment.
- **Returned** — amber (`--warning`, the panel's change-request colour) *"Changes requested by
  {reviewer} · {time} — address before this is final: {note}"*.

An accepted or signed-off explanation is final and reads as prose alone. **Timestamps are
stamped on the record**, not derived: `exSubmit` writes `rc.submittedAt`, `exReturn` writes
`rc.returnedAt`, both via `stamp()`; the marker's `.eb-when` is quiet `--hint` and stays in
the sans face (a date inside a running sentence reads worse switching face mid-line). The
Korvyn draft's own timestamp (`best.at`) also shows in the panel's `.rw-prov`.

## 2026-08-30 — the KPI strip is an instrument, and it tracks the review states

The worklist tiles gained three visual reads within the same flat cards and the app's own
state palette (owner: "full creative ability"):

- the **explained** tile is a STACKED METER (`.wl-meter`) — signed (green `--success`) ·
  explained (accent) · owed (amber `--warning`) as a share of the gross movement, over a bare
  track for the part below materiality. Derived, never duplicated: the same figures the tiles
  state, split by review state (`reqD`/`signedD`/`owedD`/`explD` in the worklist builder).
- **signed-off** carries a `.wl-mini` fill bar of done ÷ required.
- an exception tile takes a 3px STATE EDGE as an inset shadow (`.edge-act` cobalt for *need
  you*, `.edge-warn` amber for *unexplained*, `.edge-bad` red for *returned*) — rule 8's
  severity idiom, no layout shift, only when something is owed, so a finished strip is
  monochrome. *Need you* is the hero (`.hero` → accent-ink figure); Ties-to-TB is a green/amber
  status.

Every fill is a BACKGROUND, never text (the on-fill gate is not in play); heights/radii/edges
are not spacing (the 4px ratchet is not either). Later, the strip gained **`returned`** and
**`in review`** segments (one-click filters via `S.show`, cased in `visible()`), so the KPI
strip reflects the review state machine below.

## 2026-08-30 — the inspect panel: simpler Overview, a thread, a variance chip

Owner supplied the reference inspector's screenshots.

- **Overview is Explanation · Conversation · Workflow** — Key drivers and Evidence left
  Overview in BOTH densities (`dwOverviewKeys` → `['explain','cmtPeek','reviewer']`; each is
  its own tab). `RW_LAYOUT.page` matched.
- **Workflow & review is four rows** (`reviewer()`): Status (coloured only for a real state) ·
  Review owner (avatar) · Assigned to · Prepared by · Response due. **Labels are sentence
  case, values right-align** (`#fxRoot .rw-wfr .k/.v`) — matching the reference; the 11px
  uppercase tracked label read as shouting inside a key→value record.
- **Evidence is attachments only** (`RW_LAYOUT.drawer.evid=['evid']` — Financial source moved
  off; it answers a Drivers/GL question, not a support one).
- **The variance is a highlighted answer chip** in the four-figure band — a soft `--pos-bg` /
  `--neg-bg` tint (`.rw-met-hero`) with the figure at the `-ink` step and the dividers around
  it standing down, so the movement reads as one lifted answer.
- **The comments are a THREAD, not boxes** (owner: "rather than in boxes, I prefer a thread").
  The message border/fill/radius come off in the dock and a single timeline rail runs down the
  avatar gutter (`.rw-thread::before` at `left:11px`, avatars as opaque beads, replies branch
  right). This reverses the 2026-08-29 bordered-card ruling FOR THE COMMENTS THREAD only; the
  section cards (Explanation/Workflow/Evidence) stay bordered cards on the ground. `cmtHi()`
  highlights `@`-mentions.

## 2026-08-30 — assignment, @-mention, and auto-notify

The model had FIXED scope-owners (`ENT_OWNERS`/`REG_OWNERS`) and an accidental preparer, so
there was nothing to reassign. Now there is.

- **`pplDir()`** — one flat roster built from the seeded entity/region owners + the standard
  preparer/reviewer + the acting user (no second identity model). **`lineAssignee(rc)`** — the
  reassignable responder, defaults to the preparer. **`canAssign = ()=>caps().reopen`** —
  Controllers and the CAO only (the owner's choice).
- **Reassign** (Workflow card "Assigned to" row + `assignDialog`/`assignLine`) and per-comment
  **Add responder** (`assignComment`, gated `caps().review`) both go through the audit trail
  (the `⇄` reassign event that existed in `RW_ACTS` but nothing wrote).
- **`@`-mention in the composer** (owner: "add a name by using @"): `cmtMentionScan` matches
  `@` + word-chars (not the trailing `. Patel`, so an inserted name does not keep the menu
  open), `cmtMentionPick` inserts `@Name` into `S.cmtMentions`, `cmtKey` drives ↑/↓/Enter/Esc.
  On post, each still-present mention raises a notification for a reviewer.
- **Auto-notify** (owner: "yes, auto notify"): reassignment and directed comments/mentions
  raise a PERSON-TARGETED request via `raiseReq(r,nm,ask,sub)` — `sub:'own'` for a whole-line
  hand-off (one per line, prior withdrawn), `sub:'return'`/`'query'` for the review loop and
  comment asks. It lands in the person's queue (`reqOwnerRec(q)` resolves ownership by the
  named person, not just the scope), drives the line's Response-due row and the worklist
  count, and is late-able. `exSubmit` discharges the `own`/`return` obligations.

## 2026-08-30 — the enforced review sequence and the back-and-forth control

Owner: "add proper sequence … the control has to be strictly in place … the back-and-forth
review comments should have a robust control."

- **The review is a state machine** — Korvyn draft → Prepared → In review → Returned (loop) →
  Reviewed — drawn as a **progress stepper** (`rwStepper`/`rwFlowStage`) in the Workflow card:
  travelled path green, current step accent, a returned line amber back at *Prepared*.
- **Open review items gate re-submission** (the robust control). `reviewItems(rc)` = change
  requests (`c.chg && !c.resolved`). A returned line does not offer Submit while any are open —
  the footer shows *"N reviewer comment(s) to address · Address comments"*, enforced in
  `exSubmit`, `readyToSubmit` AND `dwFoot` so they cannot disagree. The preparer responds via
  **`cmtResolve`** (a threaded reply is required; silence is not addressing), the comment reads
  **Addressed**, and Submit returns.
- **Auto-routing**: `exReturn` sets `rc.assignee = preparer` and notifies (`sub:'return'`);
  `exSubmit` sets `rc.assignee = reviewer` and, on a resubmit, notifies (`sub:'review'`).
- **The statement flags "Open"** while a review comment is unaddressed (`fxStateKey` →
  `reviewItems(rc).length?'open':'ret'`; `FXST.open`), and relaxes to "Returned · ready to
  resubmit" once addressed.
- **A directed question is answered only by the named person** (owner: "others shouldn't be
  able to answer that question"). `canAddress(c)` — if `c.ask` names a person, only they may
  mark it addressed; a plain return falls back to the preparer. `cmtResolve` re-checks it.
- **Prior-period explanation is wired to the prior period's FINAL review** (owner). The
  `prior` card, `exCarry` and the AI context object now require `priorRec(id).status ===
  'approved'` — a prior draft/in-review is work in progress, not institutional memory. Shows
  the sign-off provenance (*"reviewed by … · locked …"*).

## 2026-08-30 — the full screen is the REVIEW DESK, Korvyn's signature review surface

Owner: "the reviewer can come in to the full screen and just review/address the open comments
… a signature item … think big." Four moves, all built.

**The layout is two columns, not three** (`RW_LAYOUT.page` = `{judge:['explain'],
rec:['openItems','reviewer','cmtHead','cmtStream','cmtComp','cmtOwed']}`; `dwPageCols` returns
two; `.rw-cols.desk` grid). LEFT is the case — the explanation at reading width. RIGHT is the
review — the workflow record with its stepper, then the WHOLE live conversation, so a reviewer
reads the argument on the left and works the review on the right without changing tabs.
**Needs attention is gone** (the blockers are the open comments, now the subject of the right
column) and **the Comments tab is removed from the page** (`FX_PAGETABS`) — Overview IS the
conversation, so no second place for one thread. The dock keeps its Comments tab.

1. **A review control bar in the header** — `dwStatePill(rc)` + `dwCtrlBtns(r,rc)` in the
   `ws-from.rw-ctrlbar` strip: the state pill and the state-appropriate action (Return / Mark
   reviewed / Address N open / Submit / Reopen). Shares its guards with `dwFoot`.
2. **An open-items ribbon** (`openItems` part, page-only, top of the review column) — the
   unaddressed reviewer comments as a checklist, each with *"Awaiting {person}"* and an Address
   action for the person it is directed at. Renders nothing when clean.
3. **A review-queue flow** — a progress meter in the header (*"N of M reviewed"* + `.rw-cbbar`),
   **Next needing review →** (`fxNextOpen`), and **signing a line glides to the next**
   (`exApprove` calls `fxNextOpen()` in `S.dwPage`).
4. **Keyboard-first** — in `fxKeys` under `S.dwPage`: **a** approve · **r** return · **c**
   comment (`dwFocusComposer`) · **j/k** next/prev line in the queue (`dwQueueMove`, walks the
   visible rows, keeps the desk open via `pickAt`) · **n** next needing review · **Esc** back.

Verified across the whole turn: the full loop (submit → return → "Open" flag + blocked
resubmit → address → Submit → route → sign → glide) works; the control bar shows the right
state+actions in every state; `j/k/c` drive the queue; 63/63 views render; console clean; all
three gates pass (contrast, spacing unchanged at 1079/89, chrome 10/10) in this and every
2026-08-30 pass above.

## 2026-08-30 — the Review Desk becomes a command centre (hero, Korvyn's read, motion)

Owner: "not totally sold or impressed … this can be the heart of Korvyn … think big." The
desk was a bigger panel; these make it a command centre.

- **THE COMMAND HERO** (`dwPageHero`, full page only — the dock keeps the four-figure band).
  LEFT states the MOVEMENT with authority: the variance at `--fs-hero`, coloured, with the
  favourable/unfavourable verdict and Δ%, the prior→current flow beneath, and the trajectory.
  RIGHT is the VERDICT cluster: the progress stepper, a coverage instrument (the share a
  reviewer signs against, with residual against tolerance), the state pill and the one action
  that advances it (`dwStatePill` + `dwCtrlBtns`, shared with the footer's guards). Swapped in
  at `S.dwPage?dwPageHero(r,rc):figs`; the stepper drops out of the Workflow card on the page
  (`X.page?'':rwStepper`) and the state band leaves the idrow — the hero carries both.
- **KORVYN'S READ** (`krvSummary` part, page-only, leads `page.judge`) — a generated one-line
  verdict in Korvyn's indigo voice (`--ai-bg`/`--ai-line`), state-adaptive: indigo/ready when
  clean, **amber** with open comments or residual over tolerance, **green** when signed off. It
  NARRATES the engine's figures (coverage, residual, open count) — never computes one.
- **THE FOUR EXPERIENCE MOVES** (owner: "all four"). #1 Korvyn's read (above). #2 the
  conversation is the centrepiece — the review column widened to `minmax(520px,640px)` on the
  desk grid. #3 immersive — more air entering full screen (`.dw-hd` padding, `.dw-body`
  padding-top). #4 MOTION — a one-shot entrance (`.dw-in` set in `dwPage()` on #fxDetail, which
  paintDrawer never recreates so a re-render cannot replay it) and a glide when the queue moves
  to a new line (`.dw-glide` set in `pickAt()` only on a line change in page mode), both under
  `@media (prefers-reduced-motion:no-preference)`.

## 2026-08-30 — every full-screen tab, elevated (Drivers, GL, Evidence, History)

Owner: "update the full screen UI for other tabs." The Overview desk was elevated; the other
page tabs still rendered as one short card floating in empty gray. The command hero already
heads every tab (it is in `dwHead`, not Overview); the bodies now use the screen too.

- **DRIVERS is a contribution chart** — each drill row (`dwDrivers`) carries `--sh:<share>%`,
  and a `::before` fills it with `--accent-bg` to that width, so the decomposition reads as a
  horizontal bar chart footing to the movement. The residual/total rows carry no `--sh` and
  stay unbarred. Full screen only; the 440px dock stays a compact list.
- **HISTORY is two columns** — `dwPageCols('hist')` returns `[['judge',['trend']],
  ['rec',['prior','trail']]]`: the period series on the left, the signed-off prior explanation
  and the activity log on the right, filling the width like Overview.
- **SINGLE-COLUMN TABS ARE COMPOSED, NOT STRETCHED** — `.rw-cols.one` is capped at 1000px and
  centred under the full-width hero, so Drivers, General ledger (the 40-row ledger with its
  All/Manual/Post-close filters and View-in-ERP links) and Evidence read as a document on the
  sheet rather than one lonely band across 1,250px. That was the empty-space problem.

Verified: 63/63 views, all five page tabs (`sum·drive·gl·evid·hist`) render with content, the
driver bars size to share, History splits, GL is a full ledger, console clean, all three gates
pass (spacing unchanged at 1079/89, chrome 10/10).

## 2026-08-30 — materiality is the policy, and the policy is cited on every required line

Owner: "enhance the materiality filter and link it precisely to the flux explanation/variance …
make this enterprise grade." The threshold already drove `r.flag`→`r.req`; what was missing was
that the policy was *chosen blind* and *cited nowhere*. Two moves, one principle: the materiality
policy answers two questions about every line — is an explanation REQUIRED (the threshold) and is
it SUFFICIENT to sign (the residual tolerance) — and both are now expressed in the SAME on-screen
unit as the figure they judge, so the filter, the statement and the inspect panel cite the policy
identically and cannot drift.

**ONE SET OF HELPERS, defined once beside `fmt`/`pct`** (so `thr`/`prof`/`matFac`/`fmt`/`uName`
are all in scope): `matAbsThr()`/`matTolThr()` (the two bars in $000), `matRule()` ("1.0M and 5%"),
`matBasis(r)` and `matImpact()`. `rows()` now carries `hitAbs`/`hitPct` on every row so the basis
can say WHICH bar breached without recomputing. **`matBasis(r)` is the single source** for why a
line does/doesn't require an explanation — kind `floor|imm|watch|mat`, each a precise sentence:
*"Material — Δ 1.4M exceeds 1.0M and 6.8% exceeds 5%, per Monthly close policy."* It reads the same
whether it lands in a tooltip or a panel.

**THE FILTER LEADS WITH A LIVE IMPACT PANEL** (`.mat-impact`, top of the `mat` popover). A
materiality threshold is a judgement about how much of the movement must be defended, and it was
being set with no sight of what it captured. The panel states **"N of M lines require an
explanation"** over a coverage bar and **"K material · captures X% of the $Y gross movement"** —
read from `rows()`, so it counts exactly what the grid flags. It **repaints live**: `setAbs`/
`setPct`/`setFloor`/`setTol` all gained `if(popKind==='mat')paintPop()` (only `setOp`/`setProfile`
had it). Verified: default 2 lines / 54%; `setAbs(0.5)` → 3 lines / 71% (Property taxes joins on
the $ bar) with the grid's "Needs explanation" count moving in lockstep.

**THE INSPECT PANEL CITES THE POLICY on every required line** — a neutral `.rw-basis` band at the
top of the Explanation card (a tracked "WHY REQUIRED" label over the sentence), shown only when
`r.req`: the precise breach (or the watchlist reason) **plus** *"Signable once the unexplained
residual is within 0.5M."* — so the requirement is never a bare flag; it names the policy that
raised it and the tolerance that clears it. Neutral by design: materiality is context, not a state
(rules 2/3); the control is the requirement, not a colour. An immaterial line shows no band
(explanation optional). The **statement Δ cell tooltip** now uses the same `matBasis(r).why` and
covers watch-listed lines too, replacing the old `flag`-only "Breaches …" string that printed the
threshold without a unit letter.

**The star (below-materiality flag) folds into the identical workflow** and is now gated to
`caps().policy` (Accounting Manager / Controller / CAO) — a preparer can no longer add OR remove a
reviewer's mandatory-flux flag. A watch-listed line reads `r.watch→r.req`, so it gets the same
"Needs explanation" flag, the same submit gate, and the same reviewer-note-at-sign-off as a
threshold-material line; its basis band reads the reviewer-decision reason instead of a breach.

Verified: 63/63 views · console clean · all three gates pass (contrast, spacing unchanged at
1079/89, chrome 10/10) · impact panel live across abs/pct/op/floor/tol and profile · basis band
correct for material, watch-listed and immaterial lines in the dock · Δ tooltip matches the band.

## 2026-08-31 — one dropdown model, and materiality is a level

Owner: *"The dropdown options are not consistent. I want to simplify the entire filters
ribbon … can we make each dropdown selectable by clicking on the box … re-do the Variance
tab. The materiality options should be very simple. I don't need SEC, other add'l
options."* Measured before the pass, the eight-tab ribbon opened **ten different kinds of
menu**, and two of them were forms.

**EVERY FILTER COMMITS ON CLICK.** The ribbon held two contradictory models. A
single-select (Status, Direction, Period, Cadence, Eliminations, Units) committed on click
and closed. A multi-select (Entity, Segment, Region, Property, Cost center) edited a DRAFT
and did nothing at all until a `Clear / Unfiltered / Show all` footer was pressed — so
ticking three entities and walking away left the statement unfiltered while three boxes
read as chosen. **One surface cannot answer "did that take effect?" two ways.**

The staging had two stated reasons and neither survived. Recompute cost is not real on this
book — `renderAll()` is one frame. And "Included vs Excluded cannot be read mid-build" is
answered better by making the mode a switch over a LIVE selection than by hiding the whole
act behind Apply: you now watch the statement move as you flip it. Verified arithmetically
complementary as before — Ashburn only 39.5 + all except 48.6 = 88.1 total revenue.

`popDraft` / `popDraftX` are gone with the footer. **The menu renders from `S`, which is
what the statement renders from, so the two cannot disagree.** `.pop-ft` / `.pop-ftn` /
`.pop-clr` are retired; Clear moved into the header, where every other menu already carried
it.

**Only these | All except is a switch, and it appears only once something is chosen.** It
was an `Included|Excluded` tab pair sitting permanently above the list — a control for a
decision the reviewer had not reached yet, drawn in the `.ktab` primitive, which then
needed an exception in the tab-strip arrow handler (`if(t.closest('.pop-mode'))return`).
It is `.pop-sw` now, the chosen half takes `--accent-bg` (the same "one option is selected"
treatment the single-select row uses, not a second idiom), and the keyboard exception is
gone with the borrowed class. 5.73–10.48:1 in both modes.

**THE TRIGGER DOES NOT SURVIVE ITS OWN FILTER — and this was a live bug, not a consequence
of the change.** `renderAll()` rebuilds the field row, which destroys the button `#pop` is
anchored to; `popPlace()` then measured a detached node, got a zero rect, and parked the
menu in the **top-left corner of the window**. Measured on Reason code, which already
committed live: **(609,302) → (8,6) on one click.**

The fix went in `popPlace()`, **not in each commit path**. A first cut put it in the new
`popLive()` and covered exactly the four handlers this pass rewrote, missing every other
menu that repaints in place — `setReason`, `clearReason`, `setProfile`, `setSort`,
`setDens`, `setFullAll`. **The guard belongs where the rectangle is read**, so it covers
every caller including any added later. `popRebind()` re-acquires the trigger by its
`data-pop` key, and when it cannot, the menu **stays put** rather than being placed against
a zero rect. Verified 609,302 → 609,307 on Reason, Entity and Materiality; Escape still
returns focus to the *rebuilt* trigger, and `popLive()` restores the focused row index so
a checkbox list is still drivable from the keyboard.

### Movement over became a list

**It was the only control in the ribbon answered with a keyboard was the only control in the ribbon answered with a keyboard** — a bare
number input in a menu of option lists, which is most of what "not consistent" was pointing
at. It is a list of fixed amounts now, held in `$000` in `TH_STEPS` and rendered through
the unit on screen, so it reads `0.5M / 1.0M / 2.5M` in millions and `500K / 1,000K` in
thousands rather than offering "0.5" of whatever is current. `threshWord()` phrases it once
for the menu row, the field and the chip — three places that were each formatting it their
own way ("over 1.0M" in the row against "over 1M" in the field beside it).

**And the list exposed a real bug in the control it replaced.** `S.thresh` is stored in
DISPLAY units, so switching millions → thousands left `1` in the field and silently turned
a **1.0M floor into a 1.0K one — a thousand times looser** — under a Units menu whose own
note promises that "switching units never silently changes what is flagged". Invisible
while the control was a box you had typed into yourself; obvious the moment it became a
list of stated amounts. `setUnits()` re-expresses the value so the AMOUNT is unchanged.
Materiality never had this fault: it is stored in $M and converted once through `matFac()`.

### Two field-row faults, both in the row's own markup

- **The Saved Views field printed its label twice** — "View **View** Standard review". It
  was wrapped in `fxGroup('View', …)` around a field already labelled View, and was the one
  control on the eight tabs not drawn by `fxField()`. `fxGroup()` and `.fxg` / `.fxg-l` are
  retired with it: a group label exists to name a control that has none, and every control
  in the row states its own name.
- **The Table menu carried a nested Units row** while Units is a field on Basis — a second
  entry point to one control, the duplication the 2026-08-28 pass removed everywhere else.
- The Display mode note still said **"All three read the same figures"**; there have been
  two modes since `DISP_MODES` was cut to Statement + Narrative.

**Measured after.** Every filter tab's row is uniformly **180×32**. Across all 18 menus
reachable from the ribbon: **0 non-search inputs** (was 5, in two menus), **every row
clickable**, one anatomy — `pop-h → [pop-s] → pop-l → [pop-b]` — and one width, 300px,
except the three dimension multi-selects at 340px, which carry a second column of figures.
Search appears at one stated list length (>12) rather than always on some menus and never
on others. `viewmode` and `views` keep their section stacks: they configure rather than
filter and are not part of this vocabulary.

**Verified:** 60/60 views render · console clean · 10/10 chrome themes AA · content text
gate clean · spacing ratchet green (baseline **lowered** 1079 → 1077 with the retired
footer and tab-pair rules; the gate caught a 6px I introduced in `.pop-sw` and it was put
on the scale) · dark mode holds · Only these / All except arithmetically complementary ·
keyboard drives every menu through a commit · Escape returns focus to the rebuilt trigger ·
the platform band (`#gfBar`, `g:` menus) untouched and still committing on click.

**Deliberately NOT done:** the Actions tab is still a row of buttons rather than fields —
the tab IS the menu by the 2026-08-28 ruling, and putting a menu inside a tab would be two
clicks to reach one action. The Reason code menu has 14 rows and no search, which is
correct under the >12 rule only because it is not a dimension; if it grows, it takes the
same search every other long list has.

### Later the same day — the rule editor comes back, smaller

Owner, with a mockup: *"I said simple like attached … the materiality options should be
very simple."* **Simple meant a SMALLER FORM, not no form.** The pass above read it as "no
form" and replaced the editor with a list of three named levels — which did not simplify
the control, it removed the ability to set a threshold at all. Corrected: Amount · Percent ·
Logic (Either|Both) · Residual tolerance, and one line.

What stays gone is the NAMING. Monthly close policy / SEC / MD&A / Tight review were three
presets over the same four numbers, and "SEC / MD&A" asserted a reporting basis this model
does not carry — the same fault the evidence table avoids by deriving Verified/Pending from
a line's own sign-off rather than badging a document-approval workflow nobody built. There
is no policy NAME any more; **`prof()` survives as the one place that phrases the rule**, so
the memo, the chips, the panel and the audit trail all say `1.0M and 5%` identically. Also
gone: the `and/or` control's ability to build a rule no written policy states, the
small-balance floor (a constant, not a threshold a reviewer sets), and the impact CARD.

**A LIST APPLIES ON CLICK; A FORM APPLIES ON APPLY.** The rule editor is the one staged
control left in the ribbon, and the split is a rule rather than an exception: you cannot
half-type `0.25` without passing through `0`, and a statement that recomputed on every
keystroke would flag every line in the book on the way to the value you meant. Cancel is
what a list does not need and a form does. `Save as default` applies AND writes `S.matDef`,
which is what clearing the rule returns to — so "default" is a real state rather than a
second copy of Apply.

**Staging is what earns the caption its place.** It is not a description, it is a
measurement of the PENDING rule: *"3 of 16 lines require an explanation **(now 2)**"* — what
Apply will do, before you press it, counted off `rows()` so it cannot drift from the grid.
It inks up only while the draft would change the count, so it is silent until it has news.
**The caption refreshes; the form does not** — `paintPop()` on every keystroke takes the
caret with it, the same contract `cmtField()` and `exField()` hold, so `matCap()` rewrites
only the line and the Logic pair.

The capability gate stays (`caps().policy`) and the reason has not changed: drop the bar
mid-close and a breaching line stops requiring an explanation, leaves the flagged count and
drops out of the flux memo, which then prints the new rule as though it had been in force
all period. **Do not remove the gate to make the form feel lighter.**

`1.0`, not `1`: a whole number is padded to one decimal in a field labelled Amount ($M),
because that is money. Only a whole number — rounding a typed `0.25` to `0.3` on the next
paint would silently change the rule. The percent stays bare; 5% is not 5.0%.

### ONE SELECTION AFFORDANCE, and no description at the bottom of a filter

Owner: *"I said consistent dropdown — I see some options that get selected using the boxes,
others don't … why do we need a description at the bottom of each filter?"*

**Both were rules this file had written down, and both were wrong.** "Single-select is a
TICK, multi-select is a CHECKBOX" produced exactly what was reported: a single-select drew a
bare tick and filled the whole row with `--accent-bg`, a multi-select drew a square box and
left the row neutral — two answers to "how do I choose this?" on one surface. **Every option
row now carries the same 14px box, and no row fill**: the box IS the selected state, so a
second one is redundant. The distinction that matters is still carried where it belongs —
`.pop-o.ck` keeps the checkbox ROLE in `popEnhance()`, so a screen reader is told the truth
about whether one answer is possible or several, while the eye reads one language.

**The exception is tagged, not hand-written.** Three kinds of row cannot hold a box: More
(each row opens another menu), a saved view (its gutter holds a favourite star, which is a
control), and the Table menu's four commands. `popEnhance()` marks them `.nobox` after
paint, and a `.nobox` row carries its selected state on the row — so no call site has to
remember, and a menu added later is covered. A More row also gets a `›`, because a row that
opens another menu must not read as an option that refuses to tick.

**Nine menus carried a paragraph explaining the control above it.** A filter whose name and
options do not say what it filters is not fixed by a footnote, and a footnote under every one
turned a 26px option row into a 60px card. All nine are gone. Two captions survive and
neither is prose: the rule editor's impact count, and the 12-period trend readout, which is a
data popover rather than a filter.

**And the same habit had spread onto the rows.** *"under 90% of the movement"* beside
*"Partly explained"*, *"34px rows"* beside *"Standard"*, *"biggest movers first"* beside
*"Largest Δ amount"* — a footnote per option. **The sub column carries a VALUE, never a
sentence**: a resolved period on Compare, a movement figure on a dimension, a count on Reason
code, `5 shown` and `Alt+Z` in the Table menu. Prose belongs to the option's own name or
nowhere.

**Measured after, across all 18 menus reachable from the ribbon:** every row is either boxed
or `.nobox`-tagged (**no third state**), **zero footers**, one box at 14×14/3px, no selected-row
fill, two widths (300px; 340px only for the three dimension lists, which carry a column of
figures). 60/60 views · console clean · 10/10 chrome themes AA · content text gate clean
(caption 6.48 light / 7.73 dark, Save as default 6.44/7.39, Either|Both 6.5/7.69) · spacing
ratchet unchanged. Apply / Cancel / Save as default / reopen / clear all verified end to end,
and the caret survives every keystroke in the form.

### Later — SELECTED FILTERS: the tabs stay, and a slim strip says what is on

Owner: *"the FILTERS are not intuitive. I got lost toggling different options from the
tab … it should be something like this when the filters are selected"*, with a reference
showing `Selected filters ›` followed by removable chips. And: *"I don't want to see a
bulky strip that overtakes the filter."*

**A DETOUR WORTH RECORDING: the eight-tab surface was replaced wholesale and the owner
rejected it.** The reasoning behind that attempt was sound and is still true — thirteen
filters behind eight tabs put at most three on screen, so ten were invisible at any
moment, and the tab badges could only ever say a filter existed SOMEWHERE. But the fix
was too big: it retired the tabs, the context/filters split and the whole command
surface for a chip bar, and lost a layout the owner wants. **The defect was never the
tabs. It was that nothing stated what was selected.** Reverted by replaying every
accepted splice onto a clean base rather than unpicking the last one — which is the only
safe way to undo one pass out of eight in a 2.9 MB single file.

**What shipped is the small version of the same idea.** `fxSelStrip()` renders one line
under the field row:

```
Selected filters ›   ⟨Entity: 2 selected ×⟩   ⟨Movement over: over 0.5M ×⟩   Clear all
```

- **It does not render at all when nothing is selected** — zero height, not an empty
  band. An unfiltered page pays nothing for it. Measured: region 108px open / 35px
  folded with no filters, +42px with the strip.
- **It is the quietest row in the region.** Ramp chips on the surface, not the accent:
  the tabs and fields are where you act, the strip is where you read, and a row of
  cobalt tablets would shout louder than the controls above it (rule 2).
- **A chip is two targets, and both are real buttons** — the body opens that filter,
  the × removes it. Not one handler inspecting the event, so both are keyboard-reachable
  and each says what it does.
- **Clicking a chip goes to the tab that owns the filter AND opens its menu**, so the
  strip and the tab strip can never disagree about where you are. The tab is derived
  from `FX_FTABS` (`fxTabOf`), never a second list, and a dimension behind **More**
  routes to Scope. The menu anchors to the FIELD, not to the chip — the menu belongs to
  the control, and a chip disappears the moment its filter is cleared.

**THE STRIP SURVIVES THE FOLD, and that is the point.** Collapsing hides WHICH controls
are available; it must never hide WHAT is filtering the statement — on a surface whose
numbers get signed, that guarantee is the reason the tab badges existed. Folded with two
filters the whole region is 77px and still names both. `.fx-filters.shut` hides
`.fx-ftabs` and `.fx-fields` and deliberately not `.fx-sel`.

**ONE STATEMENT OF WHAT A FILTER READS.** `fxFilterState(k)` returns `{nm, on, val}` and
is the single source for both the field and its chip — `fxDimField()` and the
`show / dir / reason / cover / thresh / elim` branches of `fxOneField()` were each
computing their own label and value, so a chip written separately would have drifted from
the field within one change. The exclusion wording ("Excl. 2") is spelt in that one place,
which is what stops a field that is HIDING Meridian West from reading "Meridian West".

**The query owns a chip too** (`Find: “rent”`), so `setQuery()` calls `fxPaintSel()` — the
strip repaints alone and never the row holding the input, because a repaint takes the
caret with it (the contract `cmtField` and `exField` hold).

**Verified:** 60/60 views · console clean · all three gates pass · every filter tab's row
still 180×32 · strip absent at rest, 41px when present, identical text folded and open ·
chip → correct tab + correct menu anchored to its field (including a More dimension) ·
× removes one filter, Clear all removes the strip · caret survives typing in Find ·
light and dark 6.48–14.12:1 on every element.

## 2026-08-31 — the worklist bar: four tiles, and the review's own words

Owner: *"simplify the KPI — I don't need TB tie out. Do we need to rename 'Need You'?
Can we make this super helpful for users?"* Six tiles became four, and two of the three
removals were duplicates rather than trims.

**"NEED YOU" WAS NOT WHAT THE NUMBER MEANT.** It counts every required line not yet
signed off, whoever holds it — including a line sitting with another entity that owes YOU
an explanation, and a line you submitted that another reviewer is holding. Nothing in it
is about you. A count that over-claims ownership is worse than a dull one, because a
reviewer trusts it and works the wrong queue. (`SHOWS` has an *"Assigned to me"* filter
whose predicate is `r.req && r.status!=='approved'` — the same population, equally
un-personal. Now that `lineAssignee()` exists, that filter could be made honest; it has
not been, and it is the obvious next fix here.)

It reads **to review**, and its complement reads **reviewed**. The pair states progress in
the same two words the review's own state machine uses: `FXST.done` is literally
"Reviewed", while this bar had been calling the same state **"signed off"** — two names
for one fact on one screen, which is exactly the drift this file's comments keep warning
about. The focus line said "signed off" too and now says "reviewed".

**FLAGGED WAS THE REAL CLUTTER, and it was a duplicate.** `flag` means "breaches the
materiality policy", which at the start of a close is the SAME set as "to review" — the
seeded statement rendered `2 FLAGGED` beside `2 TO REVIEW`, the same two lines counted
twice — and that population is already stated by the explanation rule's own caption
("2 of 16 lines require an explanation"). The filter is untouched and still reachable from
Workflow › Status; the tile still appears when `flag` is the ACTIVE filter, so it can
always be switched off from where it was switched on.

**TIES TO TB IS GONE (owner).** It is a control, not a work item. `paintMethod()` states
it under the statement and the memo prints it at sign-off — `tieOut()` is unchanged and
both still read it. A permanent green tick in a bar of work counts teaches the eye to skip
the bar. `.wl-tie` and its five CSS rules went with it.

**What made two removals safe is the Selected filters strip.** An exception tile used to
have to exist partly so a filter could be switched off from the same bar it was switched
on; the chips do that now for every filter on the page. That is what let this bar shed a
third of itself without losing a single entry point.

**Measured:** 6 tiles → 4 (`2 to review · 2.8 unexplained · 46% explained · 0/2
reviewed`), strip 75px, and the statement opens ~30px higher. Exceptions still appear on
their own: driving one line to submitted put `1 IN REVIEW` back in the row, and it leaves
again when the count returns to zero.

**Verified:** 60/60 views · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet green (baseline lowered 1077 → 1076 with the retired `.wl-tie`
padding) · tiles still one-click filters, and the Selected filters chip appears when one
is on · balance sheet renders the same four tiles.

### The Δ% column is neutral ON PURPOSE — checked, not changed

Owner: *"I see red/green colour on Amount but not on the %. It may be right but wanted to
point this out."* It is right, and it is design rule 9: **colour at most two columns, the
primary variance and its direction.** Measured on the rendered grid:

| column | colour |
|---|---|
| Δ amount | `--pos` / `--neg` — `rgb(15,122,68)` on a favourable line |
| Δ % | `--ink`, neutral — `rgb(59,66,86)` |
| F / U mark | `--pos` / `--neg`, the SAME green as the amount |

So colour does land twice on that pair — on the amount and on the favourability letter
beside the percentage. Colouring the number as well would be the third rendering of one
signal in one row, and on an income statement the sign and the favourability are not the
same fact: an expense that ROSE is a negative Δ and unfavourable, while a revenue line
that rose is positive and favourable. The letter is what carries that distinction; the
percentage is a magnitude and stays quiet.

**A per-line progress/coverage BAR COLUMN was considered and declined.** This file has
already run that experiment: `contrib` was a bar-in-a-cell column and it was retired
(2026-08-28) for reasons that apply again — 25 bars are a second chart competing with the
figures beside them, and a bar scaled per row cannot be read against its neighbours. The
same argument retired the 12-period sparkline from the default column set. Coverage is a
question asked of ONE line, and the inspect panel already answers it with a coverage bar
against the tolerance tick. If a per-line cue is ever wanted on the grid, the honest
version is a micro-bar inside the Explanation cell for partly-explained lines only — a
handful of rows, not every row — and it needs the owner's call, not a unilateral change.

### Later the same day — the worklist reads from YOUR side of the review

Owner: *"the KPI should be a snapshot for both preparer and reviewer and it should flip
based on the credentials … preparer will see how many flux explanations are needed, how
many you need to sign off, what is with the reviewer."*

**ONE PIPELINE, READ FROM ONE END OR THE OTHER.** The tiles are the review's own states,
ordered the way the work actually flows, and every one is a filter:

| lens | tiles |
|---|---|
| **preparer** | `needs explanation` → `ready to submit` → `with reviewer` |
| **reviewer** | `awaiting your review` · `you returned` · `with preparer` |
| **read-only** | `in review` · `returned` · `with preparer` |

Then `explained %` (with the stacked meter) and `reviewed N/M` on both.

**IT CANNOT FLIP ON THE JOB TITLE, and that is the whole design problem.** `FX_CAPS`
gives Accounting Manager, Controller and the CAO **both** prepare and review — three of
six roles, and every role that actually works a close. A strip keyed on the title would
show those three one queue and silently hide the other. What decides the side is the
LINE: `canReviewLine()` means nobody reviews a line they prepared, so on any given line
you are one or the other. Same discipline `cmtRole()` follows — read the side off the
RECORD, never off a title.

**A DUAL ROLE GETS THE PREPARER PIPELINE, and its review queue surfaces as an
exception.** You prepare before you review; and the reviewer pipeline for someone who
prepared the statement is three zeros, because `awaitingMyReview` excludes lines you
prepared — it is empty *precisely when* you are the one who explained them. So the review
queue is not lost: `awaiting your review` appears as an exception tile the moment it is
non-empty, which is the discipline every other exception in this bar already follows.

**A QUEUE SWITCH WAS BUILT AND REMOVED** (owner: *"remove this — system should update the
KPI based on the role"*). A `Preparing | Reviewing` pair sat at the head of the strip for
dual-cap roles. It asked a reviewer to tell the product something the product already
knows, and a control that only restates a fact is one more thing to get wrong. `lensOf()`
derives it; there is no `S.lens`, no stored preference and nothing to press.

**READ-ONLY OWNS NOTHING, so its lens says so.** FP&A and External Auditor have
`review:0`, which made `awaitingMyReview` a permanent zero — a tile promising a queue
they are not allowed to hold. They get a third lens: the same pipeline in neutral words,
no hero, no accent edge.

**ONE PREDICATE, THREE READERS.** `rowReady(r)` is the whole definition of "ready to hand
over" — explained inside tolerance, still with the preparer, and (if returned) every
reviewer comment addressed. `readyToSubmit()` is now literally `rows().filter(rowReady)`,
the `Ready to submit` filter is `!rowReady(r)`, and the tile counts the same. The Submit
CTA already lived by that rule ("a button reading Submit 3 can never submit two"); the
tile and the filter now live by it too, so a tile reading 3 cannot open a statement of 2.

`SHOWS` gains **Ready to submit · With a reviewer · Awaiting your review · With the
preparer**, so every tile is also reachable from Workflow › Status and names itself in the
Selected filters strip once it is on.

**`unexplained` left the always-on set.** It is the same fact as the gauge beside it in a
different unit — the gauge IS its complement — and the per-line figure is already a column
in the statement. Still a filter, and it returns as a tile while it is the active one.

**THE HERO IS `needs explanation`, not "to explain"** (owner asked for a better name). Not
taste — consistency: this exact state is already called *Needs explanation* by `FXST.need`
in the Explanation column, by the Status filter and by the Selected filters chip. "To
explain" was a fourth name for one state, which is the same drift that had this bar saying
"signed off" while the column said "Reviewed".

**And it exposed a real layout bug.** The tiles were `flex:1 1 0` — forced to equal width —
so with the review panel taking 440px every tile shrank to 141px and the LONGEST label (the
hero, the one that matters) spilled past its own tile edge, while `explained` and `reviewed`
sat in slack they did not need. `flex:1 1 auto` sizes each tile to its content and shares the
remainder: measured, no overflow and no truncation with the panel closed, with it open, or in
the observing lens. An ellipsis backstop keeps a longer label added later from spilling, with
the full text in the tooltip every tile already carries.

**Verified:** 60/60 views · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet green · five tiles in every lens · the strip flips correctly
across all six roles (Asset Manager and the three dual roles → preparer; FP&A and External
Auditor → the observing lens) · the three new filters open exactly what their tiles count
(`ready` and `myrev` both 0 and both render the empty state; `wprep` opens 6 lines) ·
balance sheet renders the same five tiles.

### The tile and the column were deriving one state twice

Reported by the owner: with the rule at **2.0M or 5%** the statement marked FOUR lines
"Needs explanation" and the tile said THREE.

The odd line out was **Repairs and maintenance — 0.2 movement, +6.9%.** The percent bar
makes it material, so it REQUIRES an explanation; and with a residual of 0.2 against a 0.5
tolerance it is already `clear`, though nobody has written a word. The tile tested
`!r.clear` and dropped it.

**That is the threshold/tolerance conflation this file already warns about.** The
THRESHOLD decides whether a line must be explained at all (`r.req`); the TOLERANCE decides
whether an explanation covers enough of the movement (`r.clear`). Different numbers,
different questions — `!clear` was answering the second while the column answered the
first.

**The fix is not a better predicate, it is one fewer.** `fxStateKey()` already decides what
the Explanation column prints, so `fxStateOf(r)` wraps it and both the tile and the filter
read it: *needs explanation* is now literally `fxStateOf(r)==='need'`. Same discipline as
`rowReady()` feeding `readyToSubmit()`, the Ready filter and its tile — **one function,
every reader**, with no second derivation left to drift.

**THE FILTER CARRIED THE SAME FAULT, AND IT PREDATES THE WORKLIST PASS.**
`S.show==='open'` is labelled "Needs explanation" in `SHOWS` and was
`r.req && (draft||returned) && !r.clear` — so a material, entirely unexplained line whose
movement is small has been invisible to its own filter for as long as the filter has
existed. Fixed by the same one-liner.

**Verified across six rules** — 2.0M or 5% · 1.0M and 5% · 0.25M or 2% · 5M or 10% · 0.1M
or 1% · 10M and 20% — the tile and the column agree at every setting, on the income
statement (4/4) and the balance sheet (12/12). Clicking the tile opens exactly those four
lines (Tenant recoveries, Power and utilities, Repairs and maintenance, Property taxes) and
every one is marked in the column. 60/60 views · console clean · three gates green.

**The lesson is the one already written in memory: never pass replacement text through the
shell.** This block itself was first inserted with
a `node -e` one-liner inside double quotes, and the shell ate every backtick as a command
substitution — the paragraph landed with its code spans replaced by empty strings and a
terminal escape sequence. Write the text to a file and splice from the file.

## 2026-08-31 — the trend column stays a line; the bar was built twice and rejected twice

Owner: *"12 month trend — can we add horizontal bar instead? Also can we add MoM or QoQ
change options?"* → *"I meant one straight horizontal bar."* → *"where is the color?"* →
**"forget about the bar — I don't like it. I can't tell how that is relevant when it only
shows one bar. How is this helpful?"**

It was not helpful, and the reason is worth writing down so it is not attempted a third
time.

**A SINGLE BAR OF THE CURRENT MOVEMENT RESTATES THE Δ AMOUNT COLUMN.** Same number, same
sign, same green/red, two columns away. The only thing it added over the figure was
pre-attentive magnitude — which line moved most — and **the statement already answers that
better**: the Δ Amount header sorts by largest movement in one click. A column that
duplicates its neighbour and loses to a control that already exists has no argument left.

Colouring it is what made the duplication obvious. The accent version at least looked like a
different kind of information; once it was green and red it was visibly the Δ column drawn
again. That the owner saw it immediately after the colour landed is the whole story.

**Its shared scale also mixed subtotals with detail lines**, so the longest bar on the income
statement was Total revenue — longest because it is a sum, which tells a reviewer nothing.

**THE ONLY NON-REDUNDANT JOB THIS COLUMN HAS IS CONTEXT**: *is this month's movement normal
for this line, or the first of its kind in a year?* That question needs HISTORY, which is
exactly what one bar cannot carry and what the sparkline does. So the column is the line
again, byte-identical to what shipped, and still off by default.

**Two shapes were rejected on the way**, both at the owner's direction: eleven bars of
period-over-period change (a bar-sparkline — *"I meant one straight horizontal bar"*), and
then the single bar. **If a MoM/QoQ basis is ever wanted again, it belongs on a control that
shows a SERIES, not on one that shows a single number.**

### What was kept, because it was real

Three fixes found while building the thing that got reverted. They are unrelated to the bar
and they stay.

- **`colOn()` APPENDED, so every newly enabled column landed after Explanation** — the widest
  and only text column, which belongs last (owner: *"why is the trend behind the explanation?
  The sequence is flawed"*). A new column now takes the first slot whose `COL_DEFS` position
  is later than its own. Columns already on screen keep whatever order the reviewer dragged
  them into; this decides only where a NEW one lands, which is the part nobody was choosing.
  Verified: `trend`, `resid` and `share` each land in their canonical slot, all before
  Explanation.
- **`COLS_DEFAULT` still listed `contrib`**, retired 2026-08-28 and gone from `COL_DEFS`.
  "Reset to default" wrote a dead id back into `S.cols`. `renderGrid()` filtered it out, which
  is why the table never broke — but the picker and any saved view taken after a reset carried
  the ghost.
- **`colName()`** is the one namer for a column, so a header and the column picker cannot
  disagree.

### And a latent dark-mode bug, app-wide

`--pos` / `--neg` / `--warn` / `--neu` are declared in `:root` as `var(--success)` and
friends. **A custom property resolves where it is DECLARED**, so they resolved against html's
LIGHT semantics and inherited down as frozen light values — `[data-theme="dark"]` redefines
`--success` on BODY, too late. Measured before the fix: a favourable Δ rendered `#0F7A44` on
a `#171A21` surface, **about 2:1**. Every green and red figure was affected — the Δ amount,
the F/U mark, the unexplained residual, the worklist meter.

**The dark block's own comment states the rule and was not followed**: *"if you add a
ramp-derived alias to `:root`, add it here too."* `--pos-ink` had been re-declared there and
its three siblings had not, which is how it went unseen. `--neutral` had to be re-resolved
first, or `--neu` would have inherited the same freeze one link down the chain.

After: dark `--pos` `#46C489` at **7.89:1**, `--neg` `#F0685E` at **5.68:1**.

**THE STATIC GATE CANNOT SEE THIS.** `check_text_contrast.mjs` resolves `--pos` → `--success`
analytically and gets the dark value, so it passed throughout. Only the RENDERED colour shows
the freeze. A gate for this class of bug has to read computed style in a browser; it does not
exist yet and is the obvious next tool.

**Verified after the revert:** 60/60 views · console clean · three gates green · the trend
column renders the line again (2 paths, 0 rects) and sits before Explanation · the Table menu
is back to Table · Statement order · Row density.

## 2026-08-31 — three borrowings from the design comps

Owner supplied three comps of this screen and asked for a read on them, then: *"let's start
with 1–3."* The filter tab architecture is explicitly out of scope. What follows is what was
worth taking; the rest of the read is in the response, not here.

### 1. The Δ pair shares one header

"Δ amount" and "Δ %" are ONE measure in two units, and the header row read them as two
unrelated columns — the Δ glyph twice and the word that ties them, *change*, nowhere. They
sit under a single **CHANGE** span now with `$` and `%` beneath, which is what a financial
statement does on paper.

**THE SPAN IS CONDITIONAL, and that is the whole trick.** `fxShed()` hides Δ% by CLASS when
the track narrows, so a hard `colspan=2` would keep spanning two columns while only one
existed and drag every heading to its right one cell out of line. The group renders only when
BOTH are in the column set, and `fxShed()` syncs the colspan when it sheds — a colspan is an
attribute, the one thing a class cannot hide. Verified: panel open → colspan 1, panel closed
→ colspan 2, header and body cell counts equal (8/8) throughout.

**ONE VALUE DRIVES BOTH ROWS, or they overlap.** The sub-row pins at
`--fx-stick + --fx-hgrp-h`, so that height cannot be guessed. Set at 20px against a row that
rendered 32px, the sub-row pinned **12px into the row above** and the pair sat over the first
body rows (measured: header 150–204, first body cell top 178). The group cell is the only
cell in row 1 that is not `rowspan="2"`, so its height IS row 1's height — it is pinned to
the same token the offset uses and the two can no longer disagree. Verified at three scroll
positions: the rows abut at exactly 0px.

### 2. Comments and Support as count columns

Both figures existed and were reachable only inside the panel. On the row they answer "which
lines already carry a conversation, and which carry documents" while a reviewer scans.

**Inventory, not a badge** (rule 12): a quiet grey numeral beside its icon, never a filled
pill — which is the thing to avoid from comp #2, where a green "Reviewed" pill on 18 of 21
rows is a wall of decoration. **An empty cell is an em dash, not a `0`**: two dozen zeroes
stop the eye on exactly the rows with nothing to say.

Support counts **documents**, not citations — `evidenceDocs()` dedupes by file name, which is
the list the Evidence tab and its badge already read. Counting `evidenceFor()` would say 3
where the tab lists 2. Both columns are OFF by default and shed with the analytics group,
before Explanation. Verified live: the seeded thread on General and administrative reads 3,
and posting a comment moved Tenant recoveries from — to 1.

### 3. A driver states its share — it already did, and it was broken

The comps show Key drivers with a share per driver. **We already print it**, in `dwDrivers()`,
which is the drivers view that actually renders.

**`RWSEC.drivers` — the reference's Key drivers card, `.rw-kd` — IS ORPHANED.** It is still
listed in `RW_LAYOUT.drawer.sum`, but Overview has been state-composed by `dwOverviewKeys()`
since 2026-08-30 and that returns `['explain','cmtPeek','reviewer']`, and `RW_LAYOUT.page` was
rebuilt as the two-column Review Desk. Swept the rendered DOM for `.rw-kd` across 6 tabs × 2
densities × 6 lines: **zero hits.** The share was added there first and reverted; the part is
left in place and NAMED as orphaned, because it is the reference composition and is what to
mount if that card ever returns.

**AND THE LIVE ONE HAD THE `contrib` BUG.** Found while looking for the card: *Site operations
and staffing* moved 0.0 and its drivers read **23474% · 19460% · 11119% · 7005%** — four
drivers of ±0.0 that very nearly cancel, divided by the almost-nothing they leave behind.

That is exactly the fault that retired `contrib`, surviving in the one place a share is still
printed: **a percentage is only meaningful while its denominator can carry one.** Below half a
display unit the total rounds to 0.0 on screen and a percentage of it is noise however it is
computed. `shareOf(v,tot)` returns `null` there and the row prints no share — the AMOUNTS
carry the decomposition on their own, which is what a footing schedule does anyway. One
helper, so the root drivers, the drill rows and the bar widths cannot disagree about when a
share exists.

Verified after: Site operations blank with 0% bars; Power and utilities 69 + 18 + 8 + 5 = 100;
Rental revenue 37 + 35 + 23 + 5 = 100; drilled one level (Power → by region) 56 + 23 + 21 = 100.

**Verified overall:** 60/60 views · console clean · three gates green (the ratchet caught a
2px sub-row padding and it went to `--s-1`) · header and body cell counts equal with the
columns on and off and with the panel open and closed · both statements render the two-row
header.

### Later — the defaults, and the period columns name their period

Owner, on the pass above: *"I wouldn't make 12-month trend a default view. Also, instead of
saying current and compared — please add the month on the header. And I didn't like comments
and support columns — you can either remove or leave as an option."*

**THE TWO DEFAULTS HAD DRIFTED.** `S.cols` (what a session opens on) never held the trend
column; `COLS_DEFAULT` (what "Reset to default" writes) did. So a reset handed the column
back and looked like the product had turned it on. They agree now, and that is the rule: a
reset must return you to what a new session opens on, not to a different set.

The trend column and the two count columns are all OPTIONS — real, listed in `COL_DEFS`, one
click away in Display › Table › Columns, off until somebody asks. Comments and Support were
never in either default; they stay available rather than being deleted, which is the lighter
of the two options the owner offered.

**THE PERIOD COLUMNS NAME THEIR PERIOD.** "Current" and "Compared" are ROLES; a reviewer
reading a statement wants the period, and all three comps put the month on the header. A
figure under a column headed **Jun 2026** needs no decoding, and a printed or exported
statement carries its own dates.

**TWO NAMES, TWO JOBS.** `colHead()` is what the header says; `colName()` stays the stable
role name for the column PICKER, the sort tooltip and the shed order — "turn off Jun 2026" is
meaningless in a list of columns, and the wording would change every month. Compared resolves
through `cmpBtnLabel()`, so it reads **Budget** or **Forecast** when that is what the
statement is measured against rather than inventing a date for a comparison that has none,
and `pLabel()` carries the cadence.

Verified across every basis: monthly `Jun 2026 | May 2026`, quarterly `Q2 2026 | Q1 2026`,
year-over-year `Jun 2026 | Jun 2025`, budget `Jun 2026 | Budget`, and stepping a period back
`May 2026 | Apr 2026`. The picker still reads Current · Compared · Δ amount · Δ % ·
Explanation.

**Worth an owner's call, not taken here:** with dates on the header the column ORDER reads
backwards — `Jun 2026 | May 2026 | Change` is newest-first, where a variance statement is
normally read left to right as prior → current → change, which is what all three comps do.
Flipping `cur` and `pri` in `COL_DEFS` (and so in the canonical insert order) would fix it,
but column order is the reviewer's to set and it was not asked for.

**Verified:** 60/60 views · console clean · three gates green · header and body cell counts
equal with all three optional columns on (9/9) · both statements.

## 2026-08-31 — the income statement is PUBLISHED: costs positive, colour on favourability

Owner: *"you have operating expenses as all −ve. Why? This is flawed reporting."*

**It was a convention, not a bug — and the wrong convention for this surface.** Every account
carries its natural sign, so an expense is negative and every subtotal is a plain SUM of its
children: Net operating income was literally Total revenue **plus** Total operating expenses.
That is coherent management reporting. A published income statement does the opposite —
expenses POSITIVE, the column footing by convention (revenue less expenses) rather than by
addition — and on a screen called Income Statement Flux under Financial reporting, that is
what a controller expects.

You can have one or the other, not both. This is the published presentation, done as a
**display layer** so the engine keeps its additive arithmetic:

| | |
|---|---|
| `lineRaw()` | natural sign; the subtotal recursion runs on this, so Total opex is still the SUM of its children and NOI is still Total revenue PLUS Total opex |
| `lineVal()` | `lineRaw` × the line's display sign — every caller outside the recursion reads this, so the grid, the panel, the memo, the sparkline and the export flip together and none can disagree |

**ONE FLAG ON THE LINE, NEVER A GUESS FROM THE SECTION.** `exp:1` marks a line whose natural
balance is a cost. Section membership would be wrong: *Gain on disposition* sits under
Non-operating beside Depreciation and is a credit — flipping it would report a gain as a loss.
**The balance sheet is untouched**: contra-accounts there are legitimately negative in a
published balance sheet, and there is no favourable direction to key a sign off.

**THE DECOMPOSITION HAD TO FLIP WITH THE LINE.** `byDim()` and `rwAgg()` sum the raw slices
and bypass `lineVal` entirely, so without the same sign the header would read a +1.4 expense
increase while its drivers read −1.0 / −0.2 / −0.1 — the card would not foot to the movement it
sits under, which is the one thing Key drivers exists to do. Same for account sub-rows
(`acctSgn`, resolved through the line the account rolls up to via `COA.c`).

### unfav() was a coincidence waiting to break

The old body read `(r.cur<0 && r.d<0) || (r.cur>=0 && r.d<0)` — which is `r.d<0` on **both**
branches, identical to the balance-sheet rule sitting beside it. It looked like it
distinguished revenue from expense and did not. It produced correct F/U marks only BECAUSE
expenses were carried negative, so a rising cost happened to be a falling number. Publish the
statement and the coincidence breaks: a rising cost is +1.4 and would have read **Favorable**.
Stated properly it is the same rule the accounting is — revenue up is good, cost up is bad.

**COLOUR FOLLOWS FAVOURABILITY, THE ARROW FOLLOWS THE SIGN.** The Δ cell, the panel's
four-figure band and the full-screen hero all key colour on `unfav()`; component amounts
(drivers, drill nodes) go through `unfavOn(id,d)`, the same rule applied to a part of the
movement. On the balance sheet `unfav()` is `d<0`, so this is exactly the sign rule it
replaces. Tying the ARROW to favourability too was tried and reverted within the pass: it made
an up-arrow mean "good", so a cost that FELL 0.2 rendered as a green up-arrow — which reads as
a cost that rose. Two facts, two channels.

**Verified end to end:**

| line | Δ | grid | panel | drivers |
|---|---|---|---|---|
| Power and utilities (cost rose) | +1.4 | red ▼‑class, **U** | ▲ 1.4 red | all red, foot to 1.4 |
| Repairs and maintenance (cost fell) | (0.2) | green, **F** | ▼ 0.2 green | all green |
| Tenant recoveries (revenue rose) | +1.4 | green, **F** | ▲ 1.4 green | all green |

Footing on screen: Total revenue 88.1 − Total opex 30.0 = NOI 58.1; NOI − G&A − Txn = EBITDA
57.3; EBITDA − D&A − interest − tax = Net income 28.1. All check. The six opex lines sum to
30.1 against a stated 30.0 — display rounding at 1dp, present before this change and unrelated
to sign.

60/60 views · console clean · three gates green · balance sheet unchanged.

## 2026-09-01 — THE PERIOD IS A PROPERTY OF THE BOOK (stage 1 of 3)

Owner: *"we need to work on the period — which is super important. People will be working
one period at a time. How do you make this default and static? I believe you need to
change/update the architecture."* Then, decisively: *"this should apply to the entire
platform"*, and on where it comes from — *"we have the open/close period, regular accounting
stuff. Each section can be locked/unlocked but once the period is closed, everything becomes
final."*

**NO SCREEN DICTATES THE PERIOD.** That is the answer to the question, and it is why the
period could never be made sticky as a filter: a filter belongs to a view, and four views
each owning one produced four answers. Measured before the change, on ONE screen:

| | said | from |
|---|---|---|
| the close strip | `JUN 2026` | `CLOSE_DAYS.period` — a hard-coded string |
| the topbar chip | `Inception to date` | `F.periodType`, defaulting to `itd` |
| the statement | `Jun 2026` | `S.cur`, a private cursor |

**And it reset.** `pickLens()` wrote the lens's own `filters.periodType` back over whatever
had been chosen, so picking a period on Flux and opening Reconciliations silently returned
you to inception-to-date.

### The model

    BOOK.open     the period the book ACCEPTS WORK IN. One at a time. It moves only
                  through a governed close/reopen, never by navigating.
    VIEW.period   what you are LOOKING AT. Defaults to BOOK.open. You may look back at a
                  closed period; doing so is reading, not working.

Conflating those two is the bug. `BOOK.periods` is the register — status, who signed it
off and when, and a per-section lock map. **Absence means closed**: silence is not
permission.

**A SECTION IS THE UNIT OF LOCK, and the sections already existed.** `CLOSE_FUNCS` is the
close checklist's own function list (Cash & banking, Revenue & billing, Fixed assets & CIP
…) — exactly what a controller locks one at a time. A locked section is final while the
period is still open; closing the period locks every section at once, so `sectionLocked()`
returns true for everything the moment status leaves `open`.

**`canEditPeriod(sec)` is the one predicate every edit surface will ask**, and it is
deliberately SEPARATE from role capability: being a Controller does not make a closed period
editable, and an open period does not make you a reviewer. Both have to hold.
`periodBlockReason()` returns the sentence rather than a bare false — *"Apr 2026 is closed
— signed off by M. Giri, Controller on May 5, 2026. Switch to Jun 2026 to make changes."*

### It lives in the SHELL, and that cost a round

The first cut put the register beside `PERIODS` inside the flux module and **the close strip
threw on load**: that script block is wrapped, so nothing declared in it is reachable from
the shell. The same mistake then repeated in `bookPeriodMenu()`, which walked `PERIODS` and
`pKey()` — the handler threw and the menu silently never opened.

The boundary is real and worth stating: **two script blocks, and the flux one is wrapped.**
The shell can call `KFX.*`; nothing else crosses. The register is platform state, so it
belongs in the shell, and the dependency runs the right way round — the flux cursor READS
the book. `KFX.syncPeriod(k)` is the only bridge, called BY `setPeriod()`, never the
reverse. `S.cur` cannot be seeded from `VIEW.period` either: `S` is built while the flux
block evaluates and the shell has not run yet.

### The control

The close strip's `JUN 2026` is now the period control — already top-left on all 60 views,
which is where a period belongs. It is chrome, not a filter. The word beside it says whether
the book accepts work: **CLOSE** while open, **CLOSED** (amber) while you are reading
history. The menu lists every period with its status and names the open one at the foot.

`setPeriod()` is the ONE writer. It also repaints the chrome explicitly, because
**`renderAll()` does not** — the close strip rides the nav's paint cycle, so the first
version repainted every figure and left the strip naming the period you had just left.
Order matters: `paintCloseStrip` rebuilds the markup including the `#hdrCtl` container that
`paintHdrCtl` then fills.

`windowMonths()` keeps `itd` / `ytd` / `quarter` / `month` but they are **window WIDTHS
anchored to `VIEW.period`** now, not periods: every one ends at the book's period instead of
at whatever a stale `periodVal` happened to name. A fixed-asset rollforward still gets
inception-to-date — that is a wider window on Jun 2026, not a different period. No figures
moved, because each view keeps the width it declared.

**Verified:** 60/60 views · console clean on a fresh tab · three gates green · the strip, the
statement and the book agree · setting the period from the strip moves Flux, and setting it
from Flux's Period field moves the strip · **it survives `pickLens('portfolio')` →
`pickLens('ledger')` → `pickTab('glrecon')`** · a closed period reads CLOSED with
`canEditPeriod()` false and a precise reason.

### Still to build — stages 2 and 3

1. **Enforcement.** `canEditPeriod()` exists and nothing asks it yet. Every edit surface
   needs the guard: explanations, comments, sign-off, requests, assignment, the star, saved
   views. Plus one read-only banner so a closed period announces itself rather than failing
   at the click.
2. **Section locks.** `BOOK.periods[k].locks` is honoured by `sectionLocked()` and nothing
   writes it. Needs the lock/unlock control on the close checklist, role-gated to
   `caps().reopen`, with an audit entry — and the close/reopen transition itself.

### Later — the close and reopen, which the register shipped without

Owner: *"where is my period close/open?"* Fair: the previous pass built the register and the
picker but not the one act they exist to record, so the book could be READ in any period and
MOVED to none.

**WHO.** Gated to the roles `FX_CAPS` already grants `reopen` — Controller and Chief
Accounting Officer, whose own role descriptions say they "review, approve and lock" and
"determine, lock and can reopen". Everyone else sees the state and is told who can change it,
rather than a control that refuses them at the click.

**CLOSING ADVANCES THE BOOK.** A close is not a switch on one period, it is a hand-off: this
period becomes final and the next one opens. Closing the LAST period in the calendar opens
nothing, and the book is then final everywhere — the owner's own "once the period is closed,
everything becomes final". That needs no special case: `bookStatus(BOOK.open)` is no longer
`open`, so `canEditPeriod()` is false on every surface.

**IT IS RECORDED.** Each transition appends to the period's own history with who, what role
and when, and that record is what the menu and `periodBlockReason()` read back. Verified:
close then reopen leaves *"closed the period — Mitra Giri, Controller"* and *"reopened the
period — Mitra Giri, Chief Accounting Officer"*.

**THE CONFIRMATION IS A PANEL, NOT A BROWSER DIALOG**, and it states the consequence in full —
which period becomes final, which one opens, and that there may be none. It replaces the menu
body in place; `periodMenuBody()` is split out so Cancel can restore the list without
re-anchoring the menu to the Cancel button.

**Three things that had to be got right, each of which failed first:**

- **A document handler dismisses `#wsPop` on any click inside it**, so the confirmation
  rendered into a menu that was removed in the same tick — the panel simply never appeared.
  Every action button calls `event.stopPropagation()` first.
- **`min-width` is not a width.** The confirmation body is a sentence, and with only a min the
  menu grew to the width of that sentence: a 900px popover hanging off a chip in the corner.
  It is a fixed 300px.
- **CONTENT TOKENS, NOT CHROME.** `.ws-menu` is a WHITE popover on the content plane even
  though it is launched from the dark ribbon. `--chrome-text` put the period name at
  **1.17:1** on white and `--chrome-text-mute` put the sentence at **3.81:1**, under the AA
  floor. Now 14.12:1 and 10:1. **The static text gate does not see this** — those tokens are
  scoped to the chrome plane, which it checks against chrome surfaces. Judge a token by the
  surface it lands on, not by the control that opened it.

**`setPeriodHard()` exists because `setPeriod()` short-circuits on an unchanged key** —
exactly the case after a reopen, where the period is the same and its STATUS is not.

**Verified:** close → strip reads `JUN 2026 · CLOSED`, `canEditPeriod()` false, reason precise ·
reopen → `CLOSE`, editable, both entries in history · a non-admin sees the state and no
control · Cancel restores the list and stays anchored · 60/60 views · console clean · three
gates green.

**Still open — the enforcement.** `canEditPeriod()` is now reachable, correct, and asked by
nothing. The next stage is threading it through the edit surfaces (explanations, comments,
sign-off, requests, assignment, the star) with one read-only banner, plus writing
`BOOK.periods[k].locks` from a section control on the close checklist.

**And a process note, because this is the third time.** This block was first inserted with a
`node -e` one-liner and the shell ate every backtick as a command substitution — the
paragraph landed with its code spans blanked out. The rule is already written in memory:
**never pass replacement text through the shell.** Write it to a file and splice from the
file.

### Later — the close was unreachable, and two literals disagreed about who may reopen

Owner: *"how do i close the period?"* The control shipped in the pass above and the owner
could not find it. Three separate causes, all real:

**THE STRIP SAID `CLOSE` BESIDE A PERIOD THAT WAS OPEN.** `.cstrip-l .tag` rendered
**Close** while the book accepted work and **Closed** once it did not — so the one place a
controller would look for "close the period" carried the word and no control, and the word
meant the OPPOSITE of the state it was reporting. It reads **Open** / **Closed** now, which
is the vocabulary the menu's own period list already uses. One word, one meaning.

**THE DEFAULT IDENTITY CAN NEVER CLOSE.** `USER_ROLE` is *Accounting Manager*, whose role
text is "Prepares and reviews" — correctly not a period admin. So the product as it opens
shows the gate's polite refusal and nothing else, and testing the close meant a trip through
Settings › Roles & access. The refusal now carries the prototype's OWN role switch —
**Act as Controller** — beside the sentence explaining why it is needed. Settings already
says the role "is switchable here so you can preview each"; this is that same device at the
point of refusal. It is **not** an access request and must not be made to read like one: in
a real deployment an admin assigns the role and this button does not exist. It is an
OUTLINE, so the menu's one filled control is still the act itself (rule 13).

**AND THE POLICY WAS STATED TWICE, IN CONFLICT.** Settings' sign-off matrix said Controller
may lock but **not reopen**; `reopenPeriod()` was gated on `canClosePeriod()`, which admitted
both Controller and CAO. Two hand-written literals for one policy, already drifted — the
exact failure the rest of this file keeps collapsing. **`PERIOD_CAPS` is now the one table**,
read by the period control AND by the matrix, and the matrix wins the disagreement because it
is the declared policy: a **Controller locks the period, only the Chief Accounting Officer
reopens it.** Close and reopen are separate capabilities and the menu names the right role
for each. A role absent from the table has neither — silence is not permission.

The matrix also now lists **Accounting Manager**, the default identity. A role whose standing
is missing from the table cannot be checked against the wall it hits, which is most of why
this took a session to notice.

**Verified:** strip reads `JUN 2026 · OPEN` · the menu as Accounting Manager states the rule,
names the signed-in role and offers Act as Controller · one click reaches **Close Jun 2026** ·
the confirmation, the commit, the advance and the audit entry all unchanged · a **Controller
is refused the reopen** and offered *Act as Chief Accounting Officer*, who gets it · history
reads `closed the period — Mitra Giri, Controller` then `reopened the period — Mitra Giri,
Chief Accounting Officer` · matrix renders `Accounting Manager Yes/No/No · Controller
Yes/Yes/No · CAO Yes/Yes/Yes` · 60/60 views · console clean · three gates green · the act-as
button 14:1 and the note 11.5:1 on the white menu.

**Checked and found clean, recorded so it is not re-chased:** `VIEW.period` was instrumented
with a setter trap and every one of the 63 view keys driven through `pickTab()` — **zero
moves, synchronous or asynchronous.** No view silently changes the working period; a stray
`MAY 2026` seen mid-session was the test harness clicking a period row, not the app.

## 2026-09-01 — THE PERIOD IS THE WORKSPACE (stage 2 of 3): every Accounting page inherits it

Owner's brief: make the selected accounting period the persistent financial context for the
whole Accounting workspace. **PERIOD** = what period am I working in · **SCOPE** = what
organisation am I viewing · **VIEW** = how do I want to analyse it. Stage 1 built the register
(`BOOK` / `VIEW`); this is the stage where the pages actually read it.

**A PAGE THAT HARD-CODES THE PERIOD CANNOT INHERIT ONE.** Measured before: 60 literal
`Jun 2026` and 69 `Jun 30, 2026` in the file, and the worst of them was `glCtx()` — the subhead
of **every** General Ledger page — which pushed the string `'Jun 2026'`. `periodCtxLine(tab)` is
the one place that turns the selected key into each page's own shape, and `perLong` / `perEnd` /
`perRange` / `perQtr` / `perWindow` / `perAdd` are the words it is built from. Month arithmetic
is on the KEY, never on `Date`, so nothing can drift a day.

| Page | States |
|---|---|
| Close | `June 2026 Close` · `June 1 – June 30, 2026` |
| Financials | the presentation window — `Jun 2026` · `Q2 2026` · `Jan–Jun 2026` |
| Trial balance · Reconciliations · Intercompany | `As of Jun 30, 2026` |
| Flux | `Jun 2026 vs May 2026` |
| Trending | the window on screen — `Jul 2025–Jun 2026` |
| Consolidation · Exceptions · Accounting Issues | `June 2026` / `June 2026 close` |

Verified end to end: one `setPeriod('2026-03')` from the header moves all of them, and the
selection survives `ledger → portfolio → fpa → ledger`.

### PRESENTATION IS NOT PERIOD, and it appears only where it acts

`F.periodType` was a *period* control offering "Single month" plus a **Which** picker — a second
way to choose the period, which is exactly the redundancy the brief removes. On Accounting it is
**Presentation** now (Monthly · Quarterly · YTD), it drives the same `#periodType` element so no
data path moved, and **Which is gone**: the quarter and the month are the selected period's own.

**It renders on Financials and nowhere else.** Every other Accounting page either reads no window
or answers "as of", so a control there could not change a figure — and a control that cannot act
is a dead control. Measured before deciding: switching the window moves figures on **glfin only**,
across all six Accounting pages tested. That is also why the lens default moved `itd → month` —
inception-to-date is not a presentation *of* a period, and nothing but Financials noticed.

**And the balance sheet stops being scaled.** The statement rendered every line as `cur` and
`cur * 6` under a heading that read "YTD Jun 2026" — including the balance sheet, whose balances
were being multiplied by six. A balance answers "as of" and has no window to widen: it scales
nothing, heads its columns `As of Jun 30, 2026` / `As of May 31, 2026`, and drops the YTD pair.
When the presentation IS year-to-date the period pair and the YTD pair are the same two figures,
so the duplicate is dropped there too.

### FLUX: THE COMPARISON IS DETERMINISTIC

Three controls became one. **Period, Compare and Cadence** were an open-ended "Period A vs
Period B" — the Compare menu even carried a `custom` branch listing every prior period in the
calendar, a second way to move the period that never went through the book. They are one **View**
field on a **Comparison** tab, and each option is a NAMED PAIR of a window and a basis the engine
already understood, so no figure path moved:

| View | Resolves to | `grain` · `compare` |
|---|---|---|
| MoM | Jun 2026 vs May 2026 | `m` · `seq` |
| QoQ | Q2 2026 vs Q1 2026 | `q` · `seq` |
| YoY | Jun 2026 vs Jun 2025 | `m` · `yoy` |
| YTD | Jan–Jun 2026 vs Jan–Jun 2025 | `ytd` · `yoy` |
| 6M Trend | Jan–Jun 2026 | `t6` · `seq` |
| 12M Trend | Jul 2025–Jun 2026 | `ttm` · `seq` |
| Budget · Forecast | Jun 2026 vs budget / forecast | `m` · `budget` / `fcst` |

**The view is DERIVED from the pair, never stored beside it** (`fxViewId()`), so a saved view
taken before this change still opens and anything unrecognised — the retired `custom` among them
— resolves to MoM rather than to a comparison nobody chose. Same migrate-on-read discipline
`dispMode()` follows.

**ONE PRIOR RULE.** `priorForView(v)` replaces the branch-per-basis: a window grain compares
against the window immediately before it, so `q`, `6M` and `12M` all follow one line instead of
three. `win()` gained `t6` and nothing else.

**A TREND VIEW NAMES ITS WINDOW, NOT A PAIR** — "Jan–Jun 2026", per the brief. Its compared
column then names the prior window itself (`cmpBtnLabel()` → `Jul–Dec 2025`), so nothing on the
statement is unlabelled. Budget and Forecast were KEPT: they are equally deterministic — same
period, a different basis — and dropping them would have removed real function. What is gone is
the arbitrary date picker.

**`cadenceWord()` is retired to an empty string.** It existed to add "Monthly" beside a phrase
that did not carry its own window; every view's phrase now names the window on both sides of the
`vs`, so a cadence word would say it twice.

**THE HEADER LEADS WITH THE COMPARISON** (brief §5). The page is **Flux** — not "Corporate Flux";
an adjective that never changes was competing with the line that does — and the comparison is
marked `.tb-cmp` (ink at `--fs-ui` against `--fs-label --hint` beside it), so it reads as the
subject of the page rather than as crumb. A reviewer never has to open a filter to know what the
figures are.

### TRENDING IS ANCHORED, AND WAS NOT

It rendered a fixed 30-month series ending at a hard-coded Jun 2026 with **no window control at
all** — so once the book can open in any period it would have shown months *after* the period
under review. `trendSeries()` is one function read by the chart, the statistics beside it and the
header line, so they cannot describe different spans: 6 months · 12 months · Quarterly (four
quarters, each the SUM of its months, not every third month) · Full history, every one ending AT
the selected period. The window is a bound `<select>` in a labelled `.grp`, which is the
vocabulary `gfPageGrps()` already discovers — so it needed no wiring of its own. Its growth
figure is annualised from the window on screen; it used to divide by a hard-coded 2.5 years.

### THE CLOSE WORKSPACE IS AN ORCHESTRATION CENTRE, NOT A DASHBOARD

The page opened on **seven KPI cards** — close period, completion, days remaining, tasks
completed, tasks overdue, blockers, entity completion — which is the "dense dashboard full of
KPIs" the brief rules out, and which answered *how much is there* six times before answering
*what needs me* once. It now opens on the four questions the brief names: where are we, what
requires attention, what work remains, what can I drill into.

**Nothing is duplicated.** Every row states where a workspace stands, read from that workspace's
OWN data (`GL_RECON`, `icUnmatched()`, `consolReady()`, `amKpi()`, and `KFX.fluxStats()` — a new
export that walks the same `rows()` the statement renders, so the orchestration page and the page
it links to cannot disagree about the count), and hands the reviewer to it. **The period needs no
argument passed**: it is global, so the destination inherits it. Severity on the attention rows is
a 3px left border and nothing else (rule 8); the meters are 60px glances beside the fraction that
is the actual fact. Every figure the seven cards carried survives — completion is the headline,
blockers and overdue lead Needs attention, the entity table below is untouched.

### THE DROPDOWN NAVIGATES; IT DOES NOT CLOSE THE LEDGER

Owner: *"Korvyn should not imply that clicking a simple dropdown button directly closes the
accounting ledger. The ERP remains the source of truth."* Right — and it was the primary action
of the menu. The footer is **"View Jun 2026 Close →"** now. `closePeriod()` / `reopenPeriod()`
are untouched, still gated by `PERIOD_CAPS`, and moved to the **Close workspace's own header**,
which is where the close is orchestrated and where its governance act belongs.

### TWO CONTROLS LABELLED "PERIOD" ON ONE STRIP

The close strip carried the master period chip on the left (`JUN 2026`) and, on the right, a
second chip labelled **Period** reading *"Month"*. It has never shown a period — it shows the
window width. It is named **Window** now, and on the Accounting workspace it does not render at
all: the window is Presentation and the period is the book's. Every other module keeps it, having
no global period to inherit.

### A live bug found while mapping, and fixed

`windowMonths()`'s quarter branch read `PERIODS[viewIdx()]` — `viewIdx()` does not exist and
`PERIODS` belongs to the wrapped flux module, so the function **threw** the moment anyone chose
Quarterly. It never fired because the default was inception-to-date; making Quarterly a
first-class presentation is exactly what would have surfaced it. It computes the quarter from the
period key now, in shell arithmetic.

### Structural, not built (brief §3/§14)

`closeVersion` is read off the period record and rendered when present. **Nothing writes it** and
no version management exists — this is the shape being reserved, not a feature being claimed.
Deliberately not built: the ERP close API, a certification engine, close-version history,
restatement, workflow automation, a new permissions architecture, a snapshot engine.

**Verified:** **180/180** — all 60 views rendered in each of three periods (Jun 2026, Mar 2026,
Dec 2025) · console clean · three gates green (the spacing ratchet caught six off-scale values in
the new Close CSS and they were put on the scale; baselines unchanged at 1076/89) · the six Flux
views resolve exactly as specified and re-anchor when the period moves · Trending never runs past
the selected period in any of its four windows · Presentation renders on Financials alone and
moves only its figures · the balance sheet scales nothing · the close action is offered to a
Controller and withheld from an Accounting Manager · the period survives a module round-trip.

### Still on independent period state — the next increment

- **`ASOF`** (the "As of · Live" rewind beside the window chip) is a separate time axis and was
  deliberately left alone; it answers "as the record stood at a timestamp", not "which accounting
  period", and conflating the two would be the same mistake this pass undid.
- **`CLOSE_DAYS`** still carries authored `opened` / `due` / `remaining` and the close timeline's
  `DAYS` axis is a literal `Jul 1 … Jul 8`, so the close CALENDAR does not move with the period
  even though the close itself does.
- **`IC_ASOF='2026-06-30'`**, `gliAsOf`'s "Full period · Jun 30" and the remaining hard-coded
  dates inside sample DATA. Data is data; the labels above it are what matter and those now
  derive.
- **`glfin`'s prior-period factor** is still the illustrative `P = 0.982` rather than a period
  lookup, so its comparative column is proportional rather than sourced.
- **The GL engine reads its own book**, not `windowMonths()` — anchoring GL FIGURES to the period
  (rather than only their labels) is the real stage-3 work, alongside the `canEditPeriod()`
  enforcement stage 1 left open.

## 2026-09-01 — the Close workspace becomes an operating surface, not a dashboard

Owner's brief: Close must answer four questions immediately — where are we, what is
preventing completion, what needs *me*, and where do I go next — and it is the
**orchestration layer**, not a place to do the accounting. Financials, Flux,
Reconciliations, Intercompany, Consolidation and Accounting Issues keep their own
workspaces; Close states their readiness and routes into them.

**ONE PAGE, THREE EMPHASES, NO THIRD ARCHITECTURE.** `Overview · My work · All work`
is a `.ktabs.lvl2` strip — the design-system tab primitive, not a new component — and
all three share the same header, status strip and switcher. **All work is what was
already on this page**: the close timeline, blockers, entity completion and the
filtered checklist, reused whole rather than rebuilt. Overview and My work are new
compositions over the same data.

### The status strip, and why the three stages do not sum to the headline

One integrated strip, not three KPI cards. The headline is `closePct()` — **the same
figure the ribbon has always shown**, so the page cannot contradict the chrome above
it. Beneath it the three stages (brief §6) each state their **own fraction**:

| Stage | Measures | Today |
|---|---|---|
| Preparation | checklist tasks complete | 54 / 76 |
| Review | reconciliations reviewed + flux signed off + entities consolidated | 25 / 51 |
| Certification | entity sign-offs | 0 / 4 |

They are not slices of one number and are not presented as if they were: preparing the
book, reviewing it and certifying it are different work over different objects, and
printing each denominator is cheaper than a footnote explaining a weighted total.
**Certification reads zero honestly** — nothing signs off yet, and borrowing a figure
from the stage before it would assert a control that does not exist.

### Needs attention is the section that dominates, and materiality decides its order

Six rows maximum, **ranked by financial impact with blocking work ahead of everything**
— a blocker stops other work, which no amount does. Each row carries the figure that
ranks it, the entity or pair it belongs to, the owner the record names, and a route.

**ONE MONEY UNIT AT THE EDGE.** The book states reconciliation and flux figures in
`$000` and intercompany in `$M`. Ranked in their own units, a 1.4M flux line sorted
above a 2.3M intercompany break — the exact "treat $18.4M like $2,300" failure the
brief calls out, arriving through unit drift rather than through indifference.
Everything is converted to `$000` once, on the way in, so the ranking and the wording
read one scale.

### Close work is a table, and every count comes from the workspace it describes

`GL_RECON` · `GL_IC` · `GL_CONSOL` · `CLOSE_TASKS` · `amKpi()` · `KFX.fluxStats()`,
which walks the same `rows()` the flux statement renders. There is no headline authored
over a table that says something else (the `RECON_SCALE` rule). **Two fields ARE
authored and are named as such in the code**: the owning team and the last-activity
time. This prototype models no org chart and no event log, and inventing a derivation
for them would be worse than saying they are placeholders.

**Status is one closed vocabulary** (`CW_ST`, brief §5) — Not started · In progress ·
Prepared · Pending review · Review required · Blocked · Exception · Ready · Ready for
certification · Certified. No "Good"/"Okay"/"Done". Colour is on **blocked and
exception only**; everything else is the neutral `.pill`, so the table is not a rainbow.

### A ROW'S ROUTE IS AN INDEX, NOT A STRING OF CODE

The first cut put the destination's filter call into the onclick as text —
`cwOpen('finrep', "KFX.setShow('need')")` — which **terminates the double-quoted
attribute at its own first inner quote**, so the handler was truncated and every
attention row silently did nothing. Escaping it would have worked and would still have
been a page that builds code out of strings. `cwLink()` files the route as a FUNCTION
while the row renders and returns the index; `CW_ROUTES` is reset at the top of
`closeShell()`, or every repaint would append another copy of every destination
(asserted: 17 routes after one paint and after four).

Verified end to end — each row lands on the right workspace **with the destination's
own filter applied**, in the period the book is open in:

| Row | Lands on |
|---|---|
| Flux · material variances | `finrep`, `S.show='need'` |
| Reconciliations · awaiting review | `glrecon`, `glReconFilter='prog'` |
| Close checklist · blocked | `acctclose`, `clFilter.st='blk'` |
| Intercompany · unmatched | `icomp` |

**The period is never passed.** It is global, so the destination inherits whatever the
book is open in — which is the whole point of the increment before this one.

### My work is wired, not mocked — and the two name forms did not match

It reads the owner recorded on the close task and on the reconciliation against the
signed-in user. The app already has both, so building an authorization model to answer
"what is mine" would be a framework written to avoid reading a field.

**The book writes owners as `M. Giri` and the session knows `Mitra Giri`**, so a string
compare found **1 of 16** items that are actually mine. `cwIsMe()` matches on surname
plus first initial, the only thing the two forms share. 9 items now.

### Certification reports; it does not act

Understated block (brief §11): *Not ready · 6 items must be cleared before this period
can be certified · View blockers*. **No close button** — the governance act is the
period control in this page's header, gated by `PERIOD_CAPS`, and there is no ERP close
posting here. Every attention item is a certification gate, so the count is the
attention count and the sentence says what it gates rather than calling six things
"blocking" when four of them block only the sign-off.

### Judgment calls worth recording

- **Close readiness (brief §10) was omitted.** The brief offered it conditionally —
  "if this makes the page too repetitive, prioritize the Close Work table" — and it is
  the Close Work table with fewer columns. One statement of where a workstream stands.
- **No filter ribbon on Overview** (brief §15, which prefers none). The page shows six
  attention rows and seven workstreams; there is nothing to filter yet.
- **No contextual drawer** (brief §18). The only docked panel in the product is the
  flux inspect panel, which is flux-scoped; the brief says not to build a new drawer
  architecture, so rows navigate. `openCloseTask()` still expands a task inline on
  All work, which is the pattern this page already had.
- **Entity names were left alone.** The brief lists credible enterprise names as
  examples; the book's own — Meridian DC Holdco, Fleet DC OpCo, Meridian Property Co —
  are already of that kind, and renaming the entity set would ripple through every
  workspace for no gain. Global texture comes from what is already modelled: EUR and
  GBP entities, four legal entities, eight close functions, 45 reconciliations.

**Verified:** **360/360** — all 60 views rendered across 3 Close tabs × 2 periods ·
console clean · three gates green (the ratchet caught five off-scale values in the new
CSS; they were derived from tokens and the baseline is unchanged at 1076/89) · every
route lands filtered and in period · the route table is stable across repaints · the
hierarchy measures header → strip → tabs → attention → work → certification, with
attention 453px tall against activity's secondary placement below the fold · type on
the 5-step scale (20 / 12 / 11) and every new element 5.62:1 or better.

**One tooling note.** The Browser pane's screenshots went stale mid-session — the DOM
returned correct live state while the pane painted a previous view — and this session
could not start its own server (five already running from other chats). Verification
fell back to computed geometry, computed colour and rendered text, which is stronger
evidence than a screenshot anyway; the visual was confirmed on the last good frame.

## 2026-09-02 — RECONCILIATIONS R1: the work unit is a governed reconciliation group

Owner's brief, stage 1 of an eight-increment roadmap. The page this replaces listed one row per
(account, entity) out of `GL_RECON` and asked a preparer to tick accounts off. That model is
rejected: the chain is

```
ERP GL / TB -> approved account mapping -> canonical account
            -> financial statement line -> RECONCILIATION GROUP
```

and every one of those layers already existed in this file. **Nothing in R1 re-declares a chart
of accounts, a trial balance, an entity hierarchy, a period selector or a balance.** Amounts come
from `fsAmount()` — the same governed object Financials, Trending and Flux read — so a
reconciliation and a statement cannot disagree about what the ledger says.

### TWO OBJECTS, AND THE DISTINCTION IS THE WHOLE DESIGN

| | |
|---|---|
| **`ReconciliationDefinition`** | PERSISTS ACROSS PERIODS. `REC-CIP-ELECTRICAL` is one governed, effective-dated, versioned configuration — not a new record every month. |
| **`ReconciliationInstance`** | ONE PER (definition, period, scope, reporting lens). `REC-CIP-ELECTRICAL-2026-06`. |

**Instances are DERIVED on demand, never stored** — that is what keeps the register from becoming
a second set of balances. Change the period and every figure re-resolves from the statement
engine. Verified across Jun / May / Apr 2026: one definition, three instances, three fingerprints,
and June's beginning is May's trial balance exactly.

**The ONLY thing stored is workflow state** (`RC_STATE`, seeded from `RC_SEED`). A review status
is a fact about people and cannot be derived from a balance. **There is no
`reconciliationPageStatus[]` and there must not be one** — the Control Center, the workspace and
Close all read `rcState()` / `reconReadiness()`.

### THE ROLL-FORWARD, AND WHY NOTHING IS STORED TWICE

```
beginning + activity + other = endingCalculated
difference = endingCalculated - trialBalance
```

**Neither `endingCalculated` nor `difference` is stored.** Both derive, every time.

- **BEGINNING IS THE PRIOR PERIOD'S GOVERNED ENDING BALANCE** — literally
  `fsAmount(line, prior).reported`, the same object Financials prints for May and Flux uses as its
  comparison. There is no separately maintained opening balance, so June cannot drift from May.
- **TRIAL BALANCE IS THE GOVERNED REPORTED BALANCE** — `fsAmount(line, period).reported`. No
  second TB store exists anywhere in the module.
- **ACTIVITY IS THE RESIDUAL OF THE GOVERNED MOVEMENT IN R1**, less any stated
  `r1ActivityVariance`. That is an honest prototype and is named as one in the code: R2 replaces
  it with the transaction population and the field disappears with it. Where a variance IS stated,
  the activity population genuinely does not explain the movement and **the reconciliation does
  not tie** — which is the point, and is how the untied cases exist without storing a difference.

Verified on the CIP reference model: 3,942.0 + 254.0 + 14.2 = 4,210.2 = TB, difference 0, and
4,210.2 is byte-identical to Financials, Trending and Flux current. **Zero mismatches across all
35 reconciled financial lines**, on both TB and beginning.

**A GROUP'S SHARE OF ITS LINE IS ALLOCATED WITH THE LAST GROUP TAKING THE REMAINDER**, on every
component independently — the same plug discipline the Flux key-drivers card uses and for the same
reason: four independently rounded figures do not visibly add up. The four CIP groups foot to CIP
on every column (verified: beginning 3,942.0, activity 254.0, other 14.2, TB 4,210.2).

**A SINGLE-GROUP LINE IS CARRIED AT FULL PRECISION, NOT AT THE DISPLAY DECIMAL.** Rounding to 1dp
is what makes a SPLIT foot on the printed column; applied to a line with one group it put the
reconciliation a rounding step away from the statement it exists to tie to — 32 lines were off by
up to 0.05 before this was fixed. `rcN()` / `fsM()` round once, on the way to the screen.

### THE POPULATION COMES FROM THE MAPPING, NEVER FROM A LIST ON THIS PAGE

`accountPopulationRule` is read against `MAPPINGS` through `mapResolve()` AT THE PERIOD. Nothing
in `RECON_DEFS` names a source account. Three things come back besides the population, and each
answers a question the brief asks:

- **`candidates`** — an UNMAPPED account Korvyn attributes here and cannot place. Surfaced on the
  row, above the table and in the workspace, never silently excluded, and it makes the tie status
  **Incomplete**. The worked case is `99120 Suspense - Unclassified` under Other Current Assets.
- **`contested`** — an account a RIVAL mapping rule would place in this group instead. `471100
  Electrical Installation` is the worked case: a chart-of-accounts rule says Electrical
  Infrastructure, a German entity-group rule says Mechanical, neither was filed as an override.
  Whichever group loses still has to know the account is claimed.
- **`rcPopulationDelta()`** — the population compared against the prior period's resolution of the
  same rule. Electrical CIP genuinely gains `15010` at 2026-06 because MV-2026-06-4 split the US
  and German capex accounts. A mapping change reads as a population change, not as an unexplained
  movement.

**A CONTESTED POPULATION IS NOT AN INCOMPLETE ONE.** Both rival rules put 471100 on FS-CIP and in
RG-CIP, so the LINE's population is complete and only the split between two groups is contested.
It is flagged, and it does not change the tie status. An UNMAPPED account is different: the
balance is attributable to nothing, so the population is not settled and Incomplete outranks the
arithmetic.

### SIX STATE DIMENSIONS, NEVER ONE BOOLEAN

`tie` · `movement` · `support` · `preparation` · `review` · `final`. A reconciliation that ties is
not one that is done: it can tie mechanically, still be missing its project roll-forward, and
still be sitting with a reviewer. **`final` is DERIVED from the other five and is not settable**,
and where it reads Open the panel states WHY in a sentence rather than leaving six pills to be
cross-read.

**TIE STATUS IS DERIVED AND CANNOT BE SET.** `rcTieStatus()` reads the population and the
materiality policy's tolerance; a user cannot mark an untied reconciliation Tied. **Support is
derived from its REQUIREMENTS**, not typed — a DERIVED requirement is satisfied by a governed
population Korvyn already holds, an ATTACHED one needs a document and reads Pending, which is R4.
A support requirement is not an attachment: *"project roll-forward is required and has not been
provided"* is a control statement that exists before any file does.

### THE CONTROL CENTER

A dense financial workpaper in the idiom Financials and Trending already established — `.fsx-bar`,
`.fsx-cx`, `.fsx-card`, `.amap-panel`, `.ktabs.lvl2`, `.pop`. **Nothing here introduces a second
table language, a second dropdown or a second docked panel.**

- **The page states its context once**, in the shell's own title row: *"Jun 2026 · USD · Corporate
  Consolidated · US GAAP"*. No second period picker, no second entity selector — Scope is
  inherited and untouched.
- **Eleven columns**: account / group · Beg · Activity · Other · End · TB · Diff · MoM · Tie ·
  Support · Review. Hairlines, tabular mono figures, indentation for hierarchy, row height one
  step tighter than the platform (`calc(var(--row-h) - 12px)`) because this surface puts
  forty-five lines and eleven columns on one screen. Derived from the token, never a literal.
- **The FS hierarchy is reused and PRUNED** to the branches that carry reconciliations. A section
  with nothing under it is noise, and rendering 40 empty financial lines would be the giant list
  of accounts this page exists to remove. **A section row is a LABEL BAND, not a total** — a sum
  across reconciliations is not itself a reconciliation and printing one would invite a reader to
  tie to it.
- **ONE compact status summary line**, not KPI cards: *"38 required reconciliations · 35 tied ·
  22 approved · 6 in review · 2 returned · 3 untied · 2 overdue · 5 support exceptions"*. Every
  count is a filter, so reading the position and opening it are the same gesture, and every count
  derives from `reconReadiness()`.
- **Quick views are READINGS of the same instances**, never separate pages.
- **MoM is neutral** (rule: sign is not favourability on a balance sheet — a rising asset and a
  rising liability are both positive and mean opposite things). Only the difference takes colour.
- Severity is a quiet word tag and only when something is owed, so a healthy screen carries none.
  An inventory fraction (CIP's `2/4` support) is grey text, never a badge.

**A `.rcx-r.ln td` rule sets ink at (0,2,1)**, so `.rcx-diff` and `.rcx-mom` have to match that
specificity and sit below it or a financial-line row prints its difference in ink. Caught by
measuring computed colour, not by reading.

**FSLINES NAMES ARE PRE-ESCAPED HTML** and are rendered raw, exactly as Financials and Trending
render them; a definition name is plain text this page authored and IS escaped. Escaping both
printed `Furniture &amp;amp; Equipment`.

### THE DOCKED WORKSPACE — six tabs, no modal

Summary · Roll-forward · Activity · Support · Review · Trace, in `.amap-panel`. Verified: **228/228
combinations of 38 definitions × 6 tabs render with content.**

- **Roll-forward** is an Excel-like workpaper and every row is a `RollforwardComponent`, so what is
  on screen IS the object model. It closes by naming the component types the model carries and
  this increment does not calculate — FX translation, ERP remeasurement, elimination. **FX is
  deliberately not buried inside Other**, because that is exactly the decision R3 would have to
  unpick. `REPORTING_ADJUSTMENT` is a separate component type from `GL_ACTIVITY` forever: a Korvyn
  reporting overlay is not an ERP posting and the trace has to keep saying so.
- **Activity** resolves the population's IDENTITY and size, not its transactions — accounts,
  canonical accounts, transaction count, ERP systems, `activityPopulationId`, mapping version.
  R2's grid, drill and download resolve the SAME id; they are not a different query. Transaction
  count is derived from the population (accounts × entities × a stable per-account rate) so it
  moves when the population moves instead of contradicting it. **A population with no modelled
  source account does not get to claim four ERP systems** — it says so.
- **Trace** answers "where did this number come from" as one vertical chain in the idiom
  Financials already uses: group → definition → financial line → mapping version → canonical
  accounts → source accounts → activity population → trial balance → ERP sources, then the
  reporting-adjustment disclosure and the fingerprint.
- **Submit / Approve / Add support / View activity render disabled with the increment they belong
  to in their title.** They are not dead controls pretending to work, and they are not absent —
  the shape of the workflow is visible and honestly dated.

### THE FINGERPRINT AND THE REVISION, BUILT NOW SO THEY DO NOT NEED A REWRITE

`reconciliationFingerprint` carries `sourceTBVersion` · `sourceGLSnapshotId` · `mappingVersion` ·
`hierarchyVersion` · `definitionVersion` · `statementVersion` · `reportingLensId` · `fxRateSetId` ·
`consolidationRuleSetId` · `dataAsOf`, plus an FNV digest of all of them so comparing two
fingerprints is one string compare. The instance carries `revision`, `priorCertifiedInstanceId`,
`reReviewRequired` and `changeSetId`. **R1 records them; the "data changed after sign-off"
detection and the amendment workflow are R6.** Verified: the three period instances of one
definition produce three different digests.

### REPORTING LENS — the third axis, and only one of four is built

`REPORTING_LENSES` carries Corporate Consolidated · EMEA Reporting Group · Germany Statutory · US
Tax Group, each with its hierarchy, basis, presentation currency, consolidation rule set and FX
rate set. **It is NOT a second entity selector** — Scope answers "which entities" and is
untouched; a lens answers "under which basis, in which currency, against which hierarchy".

**Only the corporate lens is built.** Translation, consolidation rule sets and statutory adjustment
engines do not exist, and a lens that silently returned US-GAAP-USD figures under a "Germany
Statutory" label would be a lie with a picker on it. The other three render **disabled with the
reason in their title** — the same treatment Financials gives the Cash Flow and Equity statements
it declares but has not built. Hiding them would make the architecture invisible and make the menu
lie about the choice.

### THE PAGE'S MENUS JOIN THE ONE POPOVER SYSTEM

`RCFIELD(k)` is the same descriptor shape `GFIELD(k)` is, and `paintPop()` gained an `rc:` branch
beside the `g:` one — so rendering, keyboard, anchoring, width and selected state all come from one
place. **A new page does not get a new dropdown.** `popRebind()`'s generic `[data-pop=…]` fallback
already re-acquires the trigger after `renderAll()`, so the menu survives its own filter.

### CLOSE CONSUMES THE SHARED READINESS OBJECT

`reconReadiness(period, scope)` returns `totalRequired` / `tiedCount` / `untiedCount` /
`incompleteCount` / `readyForReviewCount` / `inReviewCount` / `approvedCount` / `returnedCount` /
`overdueCount` / `supportExceptionCount` / `reReviewRequiredCount` — every one a count of
instances. `cwRecon()` reads it in the same guarded shape `cwFlux()` uses and for the same reason,
so a close cannot report a reconciliation position the Reconciliations page does not show. The
Close workstream row and the Review stage both moved onto it (22/38 and Review 24/44).

### LEGACY — `GL_RECON` SURVIVES, AND RETIRING IT IS NOT THIS INCREMENT'S JOB

`GL_RECON` has ~50 consumers across Home, Close, Exceptions, My Work, Issues, Consolidation, the
Controller command centre and Ask Korvyn, and it is the only entity-level reconciliation data in
the file. It stays, and it stays the fallback in `cwRecon()`. **What is retired is the page**:
`glvReconWork` / `glvReconDetail` / `glReconWork` / `glReconSel` and the `setGlRecon*` setters are
now orphaned as far as this view is concerned — a legacy deep link such as
`setGlReconSel('15000|Meridian DC Holdco')` still navigates to Reconciliations but lands on the
Control Center rather than on that account's pane. **That is the largest piece of debt this
increment leaves**, and it belongs to R5, when the review workflow gives the entity-level
reconciliation a real home.

### DELIBERATELY NOT BUILT (each named in the model, none faked)

Transaction-level activity grid, journal drill and export (R2) · sophisticated multi-currency, FX
bridge, elimination and statutory engines (R3) · Add support, evidence versioning, Excel publish
(R4) · submit / return / approve / sign-off (R5) · 12-month audit roll-forward and audit package
(R6) · Excel add-in (R7) · specialised reconciliation methods (R8). AI and Data Room integration
are not in R1 either.

**Verified:** 62/62 views render · 228/228 definition × tab combinations render with content ·
console clean on a fresh load · 10/10 chrome themes AA · content text gate clean (new elements
4.81–14.12 light, 5.56–13.53 dark) · spacing ratchet unchanged at 1072/88 · dark mode holds in
both densities · the roll-forward is exact for all 38 instances · the four CIP groups foot to CIP
on every column · Recon TB = Financials = Trending = Flux current = 4,210.2 and Recon beginning =
Financials May = 3,942.0 · zero TB or beginning mismatches across all 35 reconciled lines · the
period survives a module round-trip and the register re-resolves for Jun / May / Apr.

## 2026-09-02 — RECONCILIATIONS R2: the accounting proof under the roll-forward

R1 built the object model and the Control Center. R2 is the layer that makes a reconciliation
DEFENSIBLE rather than merely stated:

```
reconciliation group -> source GL accounts -> current-period GL activity
                     -> transactions / journals / invoices -> ERP source
```

**THE PROOF IS ARITHMETIC, NOT ASSERTION.** Every level foots into the one above by
construction. Measured on the reference model, Electrical CIP at Jun 2026:

| | |
|---|---|
| 237 transactions | debit 96.697 − credit 2.897 = **net 93.800** |
| 4 source accounts | activity 36.083 + 29.271 + 20.437 + 8.009 = **93.800** |
| the group | beginning 1,454.6 + activity 93.8 + other 5.2 = ending 1,553.6 = **TB 1,553.6** |

`populationDifference` prints an em dash because it IS nothing, not because it rounds to
nothing.

### NO TRANSACTION MATCHING, AND NONE MUST BE ADDED

Nothing in this module is Matched / Unmatched / Checked, and no line is manually certified.
Activity lines are SOURCE FACTS a preparer inspects for composition, materiality and
exceptions. Transaction matching is a different reconciliation METHOD and belongs to R8.
**Material activity is a LENS, not a classification** — filtering to it helps work a large
population and records nothing about what was looked at.

### THE POPULATION HAS DEPTH BECAUSE THE MAPPING DOES

R1's groups resolved one or two modelled accounts each, which proves an architecture and
cannot prove an account-level tie-out. Eleven source accounts and fifteen mappings were added
**to the governed spine**, not to this page — that is the whole point of the R1 ruling that a
population is whatever the mapping resolves. Purely additive: no existing account, mapping or
version changed, so Account Mapping, Financials, Trending and Flux read exactly what they read
before, and `SRC_TOTAL` / `SRC_UNMAPPED` are untouched because these are modelled samples OF
the estate.

Electrical CIP now resolves 4 accounts, Mechanical 4, Generators 2, Cooling/Other 8,
Accruals 2.

**ACCOUNT NUMBER IS NOT IDENTITY, and the tie-out demonstrates it.** Electrical CIP holds two
accounts numbered **15010** — `CIP - Electrical` in NetSuite US Development and
`Property Electrical Works` in the JD Edwards legacy book. `sacct()` keys on instance + chart +
code, so they cannot be merged by number, and the row states its ERP, instance and chart of
accounts beneath the name.

### THE SOURCE ACCOUNT ROLL-UP

Beginning, other and trial balance are each account's share of the group's, with the LAST
account taking the remainder — the same plug the groups use under their financial line, and for
the same reason. Shares derive from the account's own modelled balance, a real attribute rather
than a weight invented here.

**ACTIVITY IS THEN THE ACCOUNT'S OWN RESIDUAL, and the account named by `varianceOn` carries
the group's stated variance.** That is what makes an account-level difference roll INTO the
group difference instead of sitting beside it — Accrued Expenses is out by (6.4) and the
tie-out says immediately that it is `21100 Accrued Capital Costs`, not `21000`:

```
21000  Accrued Expenses - Operating   243.3  +2.1   —   245.4   245.4     —    Tied
21100  Accrued Capital Costs          147.3  (5.1)  —   142.2   148.6   (6.4)  Difference
Total  Accrued Expenses · 2 accounts  390.7  (3.1)  —   387.6   394.0   (6.4)  Difference
```

That is §54's reviewer story working: open an untied reconciliation, see which GL account is
out, drill to its journals.

### POSTING PERIOD IS THE FILTER; TRANSACTION DATE IS METADATA

A June reconciliation contains everything POSTED to June — including an invoice dated May 29 —
and excludes a July-posted item dated Jun 30. Both dates are on every transaction.

**AND THE BOUNDARY IS PROVED RATHER THAN ASSERTED.** An excluded transaction is invisible by
definition, so `rcBoundary()` generates the NEXT period's population and filters it for items
dated in THIS one. Those are exactly the rows a reader would otherwise have to take on trust.
Nothing is stored; both sets come from the same deterministic generator. On Electrical CIP:
*45 dated before Jun 2026 are included because they were posted to it ($15.6M); 54 dated in Jun
2026 are excluded because they were posted to Jul 2026.* Verified: **0** transactions in the
June population carry a posting period other than June.

### THE TRANSACTION MODEL

Deterministic from (sourceAccountId, period) — a reload, a re-render and an export produce
byte-identical rows, which is what lets an export reconcile to the screen. Weights are scaled so
the population sums EXACTLY to the target and the last row absorbs the rounding; ~15% carry the
opposite sign, so a net activity figure is a real net rather than a column of debits.

Every §10 field is carried: source transaction id · posting date and period · transaction date
and period · source account id, GL number and name · canonical account · journal number and
line · invoice and document number · memo and description · entity id and name · project ·
vendor · debit / credit / net · the three currencies and their three amounts · ERP platform,
instance id and name · source reference and, where one exists, a source URL.

**THE CANONICAL ACCOUNT IS A PROPERTY OF THE MAPPING, NOT OF THE SOURCE ACCOUNT.**
`SRC_ACCOUNTS` carries no `canon` — `rcPopulation()` adds it when the mapping resolves — so the
generator reading it off the account row got `undefined` and the trace printed an em dash. It
resolves through `mapResolve()` now. Worth remembering: an account row and a POPULATION row are
different objects.

**A DEEP LINK EXISTS ONLY WHERE THE INSTANCE PUBLISHES ONE.** Two of the seven ERP instances do;
the rest state *"Source reference available"* and offer no button. Measured: 97 of 97 NetSuite
transactions carry a URL, **0 of the JD Edwards ones do**. Nothing fabricates a URL.

### THE ACTIVITY DETAIL CANVAS

`View activity` **replaces the Control Center on the main canvas** — not a modal, and not a
twenty-column grid squeezed into the 420px dock. Period, scope, reporting lens and the selected
reconciliation are all inherited; nothing is passed and nothing is re-chosen; the return strip
goes back to the reconciliation that was open, with its Activity tab selected.

Four tabs over one population: **Accounts** (the tie-out, rows expand into their transactions) ·
**Transactions** (the whole population, one search, compact filters, sticky head, frozen
identifier, 50 a page) · **Composition** · **Population** (source-account membership and the
mapping rule that put each account there).

**ONE POPULATION, ONE ID.** The narrow summary, this canvas, the grid, every download and the
Trace all resolve the same `activityPopulationId`. There is no second query with its own total
anywhere in the module, and `rcActivityPopulation()` now COUNTS its transactions off the
population rather than deriving a size from a hash — which is what R1 declared the object for.

**The control total is the point of the header** (§18): a transaction count without its total
proves nothing, so debit, credit, net, the reconciliation activity and the population difference
are printed together.

**The tie bar is sticky** — beginning, activity, other, calculated ending, trial balance,
difference, above whatever transaction the reader has drilled to.

### EXCEPTIONS ARE STATED WITH THEIR AMOUNT, THEIR CAUSE AND THEIR ROUTE

- **UNMAPPED ACTIVITY.** `78410 Commissioning Services` is unmapped at June and a DRAFT rule in
  mapping v2026.07.1 places it in CIP from July — which is `MV-2026-07-1`'s own recorded note
  ("commissioning costs"), not an invention. So 48 transactions totalling +$1.2M sit in the
  ledger and in no reconciliation population. It is disclosed with its amount and a route to
  Account Mapping, and **it makes the tie status Incomplete**.

  **This changed the CIP reference model from Tied to Incomplete, deliberately.** §22 is
  explicit that unmapped activity can do so "even if the numerical ending happens to equal the
  TB", and it does: CIP's arithmetic still ties (difference —, TB 4,210.2, identical to
  Financials), and its POPULATION is not complete. Hiding that to keep the flagship line green
  would be the one failure a reconciliation engine must not commit. Readiness went 35 tied → 34
  tied, 1 incomplete → 2.

- **CONTESTED POPULATION, now defined.** Two live mapping rules disagree about `471100
  Electrical Installation` and neither was filed as an override, so it sits in Mechanical while
  Electrical has a live claim on it — $16.5M of movement. The balance is **not missing**, which
  is why this is not an incomplete population and does not change the tie; what moves when the
  conflict is resolved is the SPLIT between two groups, and both sides are told.

- **SOURCE CHANGED** (§21, §45). `sourceGLVersion` is the snapshot the population was generated
  against; when the live GL version has moved past it the population reads **Changed** and says
  so instead of quietly serving stale activity. `rcRefreshPopulation()` re-stamps it and bumps
  `populationVersion` — a real action with a real effect, not a button that reports success.
  Verified: `changed → refresh → current`.

### THE REPORTING ADJUSTMENT IS NOT GL ACTIVITY

It is a governed Korvyn overlay with its own basis, scope and approval. It is **not posted to
the ERP**, **not in the transaction population**, and is never given a source journal number
because it does not have one. It renders as its own band beside the population — component
type, amount, source, *In the GL population: No* — over the governed adjustment itself
(`RA-2026-06-001`, read from `fsAdjForLine()`; there is no second adjustment store) with a route
to it. Verified: 0 transactions of an adjustment type in any population.

### DOWNLOAD, MANIFEST AND VALIDATION

One column set (**34 columns**, every one §30 asks for), one row builder, two encodings. The
Excel file is a real workbook Excel opens natively — an HTML-table workbook with the Excel mime
and the manifest as its first block — which keeps the page self-contained: no library, no CDN,
no build step.

**EVERY EXPORT IS VALIDATED BEFORE IT IS WRITTEN.** The sum of the exported reporting amounts is
compared against the population amount and a mismatch **refuses** rather than quietly
succeeding. Negative-tested by forcing a difference: no blob was created, and the manifest
recorded `valid:false` with the difference. An export that does not reconcile to the screen is
the one failure this feature exists to prevent.

Three scopes, all validated: whole population (237 rows / $93.8M), one source account (63 rows /
$20.437M, every row that account), and the same in either format. The manifest — export id,
instance, population, period, scope, lens, component, counts, amounts, difference, validation,
mapping and GL versions, data as of, by and at — is shown in an **Exports this session** block
beside the population it describes rather than in an export-management module.

### TRACE, EXTENDED

- **Population** (§35): the reconciliation Trace now steps GL Activity component → activity
  population (count, amount, population version, mapping version, data as of) → journals and
  invoices → ERP, and the population step opens the Activity canvas.
- **Source account** (§36): identity, why the number alone is not identity, chart, ERP, entity
  reach, mapping, the account's own tie-out, and the chain group → line → canonical → account →
  activity → ERP.
- **Transaction** (§37): ERP transaction → source account → canonical → reconciliation group →
  roll-forward component → reconciliation → financial line, then the four surfaces that read
  that line — Financials, Trending, Flux, this reconciliation — which is real shared lineage
  (`fsAmount(financialLineId)`), not a claim.

### A CLASS NAME COLLISION ATE THE CONTROL CENTER'S OWN CONTROL ROW

Reported by the owner: *"I see some hidden selections."* Correct, and worth recording because
nothing failed loudly.

`.rcx-bar` was already R1's statement-picker row (`class="fsx-bar rcx-bar"`) when R2 declared it
again as the Composition tab's 6px share bar:

```css
.rcx-bar{display:block;height:6px;background:var(--n-100);overflow:hidden}
```

A single-class selector later in the sheet wins, so the header row collapsed from 53px to 21px
with `overflow:hidden` — which **hid the Reporting-lens field and the readiness count entirely**,
cut the Balance Sheet / Income Statement tabs in half, and let `.fsx-pick` overflow underneath
the quick-view row. No console error, no layout jump, no gate failure: the three gates check
contrast, chrome themes and the spacing scale, and none of them looks at whether an element
clips its own children.

Renamed to **`.rcx-sharebar`**, which is what it is. **A prefix is not a namespace — check the
name before you declare it.**

**A CLIPPING SWEEP IS NOW PART OF THE CHECK for this module**, because a static gate cannot see
this: walk every element on the surface and flag any that clips its own content without
`overflow:auto` or `text-overflow:ellipsis`. It found the collision immediately and one genuine
second case — the Population tab's ERP cell cut "JD Edwards Legacy North America" mid-glyph
(193px of content in a 167px cell) because `.rcx-tbl td` is nowrap and the base table rule clips.
`.rcx-acctsrc` ellipsises now and the cell carries the full text in its title. Verified: **0
clipped elements** across the Control Center and all four Activity tabs on three reconciliations.

### A CONTROL THAT REFUSES MUST SAY WHY, ON THE CONTROL

Reported by the owner: *"reporting lens for different reporting group is not clickable."*

The refusal is correct and stays. A lens restates the population under a different **basis,
currency AND hierarchy** at once, so selecting EMEA has to re-express every figure in EUR under
IFRS — R3's FX bridge and consolidation engine. Dividing by a rate to make the control feel
alive would break the invariant the whole module rests on: that a reconciliation and the
statement read the same governed amount. **Do not make these selectable before the engine
exists.**

What was wrong was the PRESENTATION, and it was the same fault as the R1 phase buttons: the
reason lived in a `title`, which is hover-only, so the row read as a control that silently
refused. Three fixes:

- the reason is **on the row**, in words, not in a tooltip;
- the row drops the tick gutter (it can never be ticked) and carries `aria-disabled="true"`
  instead of being announced as a radio option a reader could pick;
- a footer note says what a lens IS and that R3 makes the rest selectable, so the menu explains
  itself rather than leaving three dead rows.

**A REASON ON A MENU ROW IS A CLAUSE, NOT A PARAGRAPH.** The first cut used the full sentences
and added the hierarchy to each subtitle; rows went to 96px, `.pop-l` hit its 262px cap and
scrolled, and the fourth lens fell below the fold — a menu hiding an option in order to explain
why another one is unavailable. Short clause, currency and basis only in the subtitle, and the
argument in the footer: rows 28/57/73/73, no scroll in either axis.

Two defects found while checking, both fixed:

- **`setRcLens()` did not close its menu.** Every other single-select in the module calls
  `KFX.popClose()`; this one re-rendered and left the menu hanging open over the statement,
  re-anchored by `popRebind()`. The app's own 2026-08-31 ruling is that a single-select commits
  on click and closes.
- **`.pop-l` scrolled sideways.** Only `overflow-y` was declared, so `overflow-x` computes to
  `auto` and the vertical scrollbar's own 17px produced a horizontal one under it. A menu list
  never scrolls sideways — `overflow-x:hidden`.

### PERFORMANCE

The grid **pages** (50 a row) rather than rendering the population; the footer totals are the
whole filtered set, not the page. `rcTxPool`, `rcAcctRows`, `rcDefForSrc` and
`rcUnmappedActivity` are memoised per (key, period, lens) — the last one because
`reconReadiness()` resolves 38 instances a render and the unmapped scan walks every source
account through `mapResolve()`. Measured: **91ms** to render the Control Center with all 38
instances resolved.

### WHAT R2 DELIBERATELY DID NOT BUILD

R3 FX bridge / dual-currency reconciliation / eliminations / statutory · R4 support upload and
versioning · R5 submit / return / approve · R6 audit package · R7 Excel add-in · R8 transaction
matching. The three placeholder actions R1 left now **state their phase visibly** (`R4`, `R5`)
rather than hiding the reason in a tooltip.

**Legacy to retire later:** `glTxns()` / `GL_ACT` — the Account Activity browser — is built on
the LEGACY `COA` account codes, carries none of §10's fields and cannot be filtered by
`sourceAccountId` or `activityPopulationId`. §38 asks for one transaction browser; the honest
position is that there are two until `glact` is re-pointed at the governed model, and that is
its own pass rather than a side effect of this one.

**Verified:** 62/62 views · 152/152 definition × activity-tab combinations · all 18 acceptance
tests pass · console clean on a fresh load · 10/10 chrome themes AA · content text gate clean
(new elements 4.81–14.12 light, 7.19+ dark) · spacing ratchet unchanged at 1072/88 · dark mode
holds · accounts foot to the group on every column · the population's net equals the GL Activity
component exactly · exports reconcile and a forced mismatch refuses · 0 out-of-period
transactions in a period population.

## 2026-09-03 — RECONCILIATIONS R2.1: the beginning balance is what the prior period reported

A surgical pass over R1/R2, not a redesign: the page shell, the visual family, the dense table, the
docked workspace, the Activity Detail layout and its four tabs are unchanged. What changed is
accounting integrity, and then the clarity around it.

### THE BEGINNING BALANCE IS AS REPORTED — this was a misstatement, not a refinement

R2 allocated the prior period's line balance across the CURRENT groups by their declared shares, and
allocated each group's beginning across the CURRENT accounts. Both silently recast May under June's
rules. What that produced was not a rounding artifact:

> Mapping v2026.06.4 split the US and German capex accounts out of the generic CIP bucket. In MAY,
> **Mechanical CIP had no accounts at all** and Electrical CIP had one. June nonetheless reported a
> **$993.4M May beginning for Mechanical** — and because activity is the residual, booked the whole
> reclassification as **June operating activity**.

The bridge is explicit now, and every level foots:

```
beginning          the prior period's balance of the accounts THIS GROUP HELD THEN
+ classification   the opening balance of accounts that joined the group less those that left,
  change           valued at the prior period end — membership moving, not money
+ GL activity      what the ledger actually posted in the period
+ adj./other       the governed reporting overlay
= ending           = trial balance
```

| Jun 2026 | beginning | + activity | + classification | + adj. | = ending / TB |
|---|---|---|---|---|---|
| Electrical CIP | 57.2 | 30.9 | **+612.5** | 5.2 | 705.8 |
| Mechanical CIP | **0** | 32.7 | **+671.8** | 3.6 | 708.1 |
| Generators | 349.0 | 16.5 | 0 | 2.3 | 367.8 |
| Cooling / Other | 3,535.8 | 173.9 | **−1,284.3** | 3.1 | 2,428.4 |
| **CIP line** | **3,942.0** | 254.0 | **0** | 14.2 | **4,210.2** |

**THE PIECES FOOT BOTH WAYS.** `rcAcctBalance()` gives an account its share of its FINANCIAL LINE's
governed balance at a period, with the last account taking the remainder — so accounts sum to the
line exactly, and a move between two groups on one line contributes +x to one and −x to the other
and **nets to nothing at line level**. Financials, Trending and Flux are untouched, and every
reconciled line still ties to the statement at both ends in Jun, May and Apr.

**THIS IS NOT A HISTORICAL RECAST ENGINE and must not become one.** It resolves the prior period
with the prior period's mapping and states the difference. Restating history under today's rules is
a separate governed act, and R2.1 does not perform it.

**A line Korvyn models no source accounts for falls back to the declared share** — goodwill and
transformers have no population to compare and must not be given a fabricated one.

**`CLASSIFICATION_CHANGE` is a first-class component** (source `ACCOUNT_MAPPING`), carrying the prior
and current mapping versions and the affected source account ids. It is emitted only when membership
actually moved.

**THE TIE-OUT CARRIES THE ACCOUNTS THAT LEFT.** A row for an account held at the prior period end and
gone now opens with its as-reported balance, has the classification column take it straight back out,
and ends at nothing. Without those rows the accounts would sum to less than the beginning they are
supposed to explain.

**MoM MEASURES MOVEMENT, NOT RECLASSIFICATION.** With the bridge in place Electrical opened at 57.2
and closed at 705.8, so the old MoM read **1,134%** — a number describing a mapping version. The base
is restated for the classification change, as a comparative always is, and the four CIP groups become
comparable again: 5.4 / 5.4 / 5.4 / 7.9 against the line's 6.8.

### DATES, EVERYWHERE A BALANCE IS NAMED

`BEG` and `END` said nothing about WHICH balances. Two-line headers now, derived from the selected
period and nothing hard-coded — choose Jul 2026 and they read Jun 30 / Jul / Jul 31 on their own:

```
BEGINNING   ACTIVITY   ADJ./OTHER   ENDING    TB        DIFF   MOM
May 31      Jun                     Jun 30    Jun 30
```

The same clarity in the docked roll-forward (*Beginning balance · May 31, 2026 · as reported*,
*Jun 2026 GL activity*, *Calculated ending balance · Jun 30, 2026*), in the Summary figures, and in
the Activity Detail tie bar.

### "OTHER" NAMES ITSELF

`ADJ./OTHER` in the compact parent tables; in the detailed roll-forward the actual component —
**Reporting adjustment**, **Classification change** — because the system can now distinguish them and
hiding a known component behind "Other" is a choice to say less than is known. FX translation, ERP
remeasurement and eliminations stay declared for R3 and deliberately outside "Other".

### THE REPORTING LENS

Restrained metadata, not roadmap prose: a compact `Coming in R3` tag beside the name, currency and
basis on the right, no tick gutter on a row that can never be ticked, `aria-disabled`, and the
argument removed from the menu entirely — it lives in the code and this record. The first cut put
whole sentences on each row; rows went to 96px, the list hit its cap and scrolled the fourth lens out
of sight, which is a menu hiding an option in order to explain why another is unavailable.

### WORDING, IN AN ACCOUNTANT'S REGISTER

*"Held by the narrower rule; a rival rule at the same precedence claims it"* is precedence mechanics,
and precedence is not what a reviewer needs while reading a balance. Now:

> **Population conflict · $182.5M**
> GL 471100 · Electrical Installation is currently included in Mechanical CIP but is also claimed by
> another active mapping rule.
> Total Construction in Progress is unaffected, but the allocation between the groups may change when
> the mapping conflict is resolved. **Review population →**

The mechanics stay one click away in Population and Trace. The CONTESTED badge explains itself on
hover (*Competing mapping rule*). Population statuses are one word — In population · Contested ·
Pending mapping · Claimed · Unmapped — with the explanation in the cell's title, not inside it.
`Final` reads **Overall** (display only; `finalStatus` is unchanged).

### USABILITY

- **Identity survives a horizontal scroll.** GL # and GL name freeze on the tie-out and the
  population; posting date, GL # and GL name on the transaction grid. Far enough to keep identity,
  near enough to leave usable width.
- **The Accounts tab is `GL account tie-out`**, with a caption stating what it foots to.
- Transactions lead with the identity and document columns and put transaction date, document #,
  line #, debit/credit and the functional amounts behind **More columns**. The full model is preserved.
- The search placeholder **fits** — it was truncating itself at 150px.
- The Activity Detail header leads with the group, the period, the amount and the counts;
  reconciliation, population, population version, source GL version, mapping and hierarchy versions,
  lens and scope fold into **View provenance**.

### THE REPORTING ADJUSTMENT EXAMPLE WAS INCOHERENT

`RA-2026-06-001` was `basis:'management'` and read *"not capitalised under US GAAP"* — while being
APPROVED, therefore moving the reported figure, on a page presenting Corporate Consolidated / US
GAAP. **A US GAAP statement cannot include an amount its own note says US GAAP excludes.** It is a US
GAAP presentation overlay now: *"Approved reclassification of commissioning-related project costs to
Construction in Progress, pending the ERP reclass entry."* — the treatment is right, the ERP has not
caught up, and the overlay still says plainly that no journal exists behind it. Display only; no
figure moved.

### PROTOTYPE ACTIONS DO NOT SPEAK OUR ROADMAP

`R4` / `R5` were our vocabulary, not the product's. The disabled controls name the PHASE OF THE
PRODUCT — *Support & Evidence phase*, *Review & Sign-off phase* — and remain unpressable. Nothing may
imply evidence was attached or an approval happened.

**Verified:** 62/62 views · 152/152 definition × activity-tab combinations · console clean · 10/10
chrome themes AA · content text gate clean · spacing ratchet unchanged at 1072/88 · 0 clipped
elements · every reconciled line ties to Financials at both ends across Jun/May/Apr · every
instance's roll-forward exact · accounts foot to their group on every column · exports still validate
· no transaction-matching workflow introduced · no theme, shell or layout redesign · R3 not started.

## 2026-09-03 — RECONCILIATIONS R3: reporting lenses, FX and consolidation bridges

**THERE IS STILL ONE LEDGER.** No IFRS ledger, no statutory ledger, no tax ledger, no currency
ledger. Every lens reads the same source facts; what differs is the governed, versioned
interpretation stacked above them:

```
ERP GL / TB -> functional-currency facts -> accounting basis -> FX translation
            -> consolidation / eliminations -> reporting adjustments -> lens balance
```

### THE PRESENTATION AMOUNT IS THE ANCHOR; THE FUNCTIONAL AMOUNT IS DERIVED FROM IT

A modelling choice, and the one that keeps cross-surface consistency true. Under the corporate
lens every factor in `rcLensLine()` is 1 or 0 and the result is `fsAmount().reported` byte for
byte — so a reconciliation and Financials cannot drift. Functional = presentation ÷ period-end
rate is exact and invertible; nothing is fabricated in either direction.

**The US GAAP lens starts from the REPORTED figure; every other basis starts from the LEDGER.**
`fsAmount().reported` is source TB plus the approved US GAAP presentation overlays, so under IFRS
or local GAAP those overlays are not in force: the base is `sourceTB` with that basis's own
adjustments instead. Otherwise an IFRS balance would silently carry a US GAAP presentation
decision.

### THE TRANSLATION EFFECT IS A PLUG, AND IT IS THE RIGHT ONE

```
functional movement           Fmove = Fclose − Fopen
that movement at the average  Pmove = Fmove × rateAvg
translation effect            FX    = (Pclose − Popen) − Pmove
```

The standard CTA derivation. Exactly zero when the rates do not move or the entity already
reports in the presentation currency — which is why **Germany Statutory shows no FX at all**
(a EUR lens over a EUR-functional filing entity translates nothing) and **US Tax shows none**.
That is the architecture working, not an omission.

### THREE FX CATEGORIES, AND THEY CANNOT DOUBLE-COUNT

| | |
|---|---|
| **ERP-posted remeasurement** | a real `FXR` journal with a real JE number, inside GL activity, drillable to the transaction. Classified out for visibility — *"of which ERP remeasurement · 7 posted journals · included in GL activity above"* — never added again |
| **Reporting translation / CTA** | derived from balances and rates. **No journal number is invented.** Its own drill shows the calculation, the rate set, its source, version and approval |
| **Reporting-lens currency effect** | carried by the lens's own rate set and presentation currency, stamped into the fingerprint |

They are computed from different things — one from the transaction population, one from balances
and rates — so overlap is structurally impossible. Measured on Mechanical CIP: remeasurement
$1.507M (7 journals) against derived translation $1.446M (no journal).

### ELIMINATIONS ARE EMBEDDED, NOT ADDED — this was a real error caught in verification

The first cut subtracted eliminations from the lens balance, which put the corporate CIP
reconciliation **3.789 below Financials**. A consolidated statement is *already* net of group
eliminations; subtracting them again double-counts. The elimination is now carried as a
**disclosure of what the level contains**, and the roll-forward shows its **period movement**,
carved out of activity so a consolidation effect is never reported as operating movement. Same
treatment for basis adjustments where they are additive to the ledger base.

### A GROUP WITH NO ACCOUNTS IS NOTHING, NOT A SHARE — the second error caught

R2.1's fallback gave a group with no modelled accounts its declared share of the line. With
siblings using real account balances that share was **added on top**: Mechanical CIP contributed
993.4 at May for a group that held nothing, and CIP read 4,935.4 against a statement of 3,942.0.
**A declared share is only safe when every sibling uses one.** The fallback now applies only when
the LINE itself models no accounts; an account-modelled line gives an empty group zero.

### THE FOUR LENSES ARE OPERATIONAL

| Lens | Population | Basis | Currency | Eliminations | CIP Jun 2026 |
|---|---|---|---|---|---|
| Corporate Consolidated | 612 entities | US GAAP | USD | CRS-CORP-2026 | **4,210.2 USD** = Financials |
| EMEA Reporting Group | 206 EMEA entities | IFRS | EUR | CRS-EMEA-2026 | 1,316.1 EUR |
| Germany Statutory | 37 German filing entities | Local GAAP | EUR | **none — single filing population** | 232.9 EUR |
| US Tax Group | 248 US tax entities | Tax | USD | CRS-US-TAX | 1,693.2 USD |

Switching one changes the population, the basis, the presentation currency, the rate set, the
eliminations, every balance, the roll-forward and the trace. **The basis lives inside the lens**
so an impossible combination — IFRS under the US tax hierarchy — cannot be selected at all, and
there is no separate GAAP dropdown. A lens narrower than the scope chip says so on the page
rather than letting a reader assume the chip governs.

### THE ROLL-FORWARD CARRIES EVERY COMPONENT, EACH WITH A DRILL

Beginning · GL activity (*of which ERP remeasurement*) · Mapping / classification · FX
translation → **FX bridge** · Eliminations → **Consolidation trace** · Basis adjustment →
**Basis bridge** · Reporting adjustment → the governed adjustment · Calculated ending · Trial
balance · Difference. Labels are accountant-facing; the raw enums appear only in Trace and
provenance.

The **basis bridge** closes with the caveat that matters: the lenses cover different populations
and currencies as well as different bases, *"so these are not four measurements of one number —
they are four governed answers to four different questions over the same ledger."*

### FINGERPRINT AND TRACE

The fingerprint now pins `reportingLensId`, `reportingLensVersion`, `reportingBasis`,
`presentationCurrency`, `fxRateSetId`, `consolidationRuleSetVersion` and
`reportingAdjustmentSetVersion` alongside the R1/R2 versions — so a later policy or rate change
cannot silently rewrite a certified balance. Trace now opens at the lens (basis, jurisdiction,
version) → presentation currency and rate set → population and hierarchy → consolidation rules →
adjustment set → and only then the reconciliation objects.

### WHAT R3 DID NOT DO

No second ledger. No UI redesign — shell, Control Center, workspace, Activity Detail and its four
tabs, filter and dropdown behaviour all unchanged. R4 (evidence), R5 (sign-off), R6 (audit
package), R7 (Excel add-in) and R8 (specialised engines) are untouched. Rate drift is
representative and stated as such; this is not a treasury administration module.

**Verified:** 62/62 views · 608 lens × definition × activity-tab combinations · every
roll-forward foots in all four lenses · corporate reconciliation = Financials at both ends across
Jun/May/Apr/Mar · every derived drill renders under three lenses · exports still validate ·
console clean · 10/10 chrome themes AA · content text gate clean · spacing ratchet unchanged at
1072/88.

## 2026-09-03 — RECONCILIATIONS R3.1: currency integrity and traceability refinement

Not a redesign. The Control Center, the docked workspace, Activity Detail and its four tabs,
the table hierarchy, the filters and the lens control are all where R3 left them. What changed
is that the figures now say what currency they are in, the trace reads as accounting before it
reads as lineage, and nothing in provenance is blank.

### THE STALE "$" HAD ONE ROOT CAUSE, AND IT WAS NOT THE LENS

Under Germany Statutory the Summary printed `$3.2M · +$1.5M · $39.0M` over a footer that said
"In millions of EUR". The engine was right — `rcLensLine()` had translated every figure into
EUR — and the FORMATTER was `fsM()`, Financials' own, which prints "$" because Financials
presents the corporate lens. Sixty-four call sites in this module were calling a formatter that
had no idea a lens existed.

**`rcM()` is that formatter with the symbol resolved from the selected lens's presentation
currency** (`RC_CCY` · `ccySym()` · `ccyFmt()`), so switching the lens moves every figure on
the page without a template being touched. Pass a currency to state a specific one (a
transaction's own, an entity's functional); omit it and the lens governs. USD/EUR/GBP/CAD/
AUD/SGD/JPY carry a glyph; CHF and the Nordic currencies are written as their code, which is
what a treasury does. **`fsM()` is untouched and still Financials' formatter** — the two are
separate because they answer different questions.

The context line had the same disease one level up: `glCtx()` read
`ENTCTX.presentationCurrency`, which is the enterprise's, so EMEA read "USD · EMEA Reporting
Group · IFRS". It takes an optional currency now and Reconciliations passes the lens's.

### THE BLANK VERSIONS HAD ONE ROOT CAUSE TOO

`rcInstance()` reads `mappingVersion`, `hierarchyVersion`, `statementVersion` and `dataAsOf` off
`amounts.currentAmount`. R3 changed that object from `fsAmount()`'s to `rcLensLine()`'s and the
four fields were left behind — so every trace printed "v" and a blank, and the export manifest
stamped `undefined`. `rcLensLine()` now carries them; the hierarchy version is the LENS's (a
lens names its own hierarchy). Two callers also read `L.fxRateSetId`, which never existed (the
lens holds a prefix), and printed "rate set undefined" — `rcFxSetId(L,p)` is the one derivation.

**Data as of is an instant.** The feed reports "10 min ago", which is right for a health strip
and wrong for provenance: a snapshot statement has to survive being read next week.
`rcDataAsOf(p)` is the morning-after-close GL extract, derived from the period, stated as
representative. Financials still shows the relative feed time; that is outside this brief.

### CURRENCY · LOCAL IS GONE FROM THIS PAGE

The platform Basis tab's `Currency · USD | Local` field rendered on Reconciliations and did
nothing there — `sliceOk`-style, it moved no figure — while claiming a choice the lens had
already made. "Local" also has no meaning for a consolidated multi-currency population. `gfTabs()`
omits the Basis tab on `glrecon` only; every other page keeps it. Functional detail lives where
it can be honest: the entity drill (**By functional currency**) and the transaction grid, which
state each entity's and each transaction's own currency. Where functional equals presentation
the entity view prints "= reported" rather than the same EUR twice (§8).

### ADJ./OTHER OPENS

The one compact column can hold five governed components, and a reader who met "+617.7" had to
open Trace to learn it was a mapping bridge. The cell keeps its hover title and gains a click:
`rcAdjPeek()` anchors a small card under the cell — every component, the material ones with
their amount, the rest as a dash — and the route to the roll-forward. A financial-line cell sums
its groups component by component, which is how the CIP line correctly shows the classification
change netting to nothing while its groups show ±600M. **Deliberately not `pop()`**: a pop is an
option list that traps focus; this is a transient read, the discipline the Flux Explanation peek
follows. It closes on outside click, Escape, any scroll and every repaint.

### TRACE: TWO SECTIONS, THE ACCOUNTING FIRST

**How this balance is built** — opening balance → GL activity (of which ERP remeasurement,
included and not added again) → mapping / classification change → basis adjustment → FX
translation → consolidation / elimination → reporting adjustment → reported ending balance →
trial balance / Financials. One `.rcx-tn` node per component, and every material node opens the
surface that supports it. A component that does not apply says so in a clause — *"FX
translation · Not required · EUR → EUR"* — quieter than one carrying money, never as a block.

**Provenance** — lens (id, version), basis (jurisdiction), presentation currency, functional
currencies, population, hierarchy (version), mapping (version, state), statement definition
(version), FX rate set, consolidation rules (`N/A — single filing population` where there are
none), reporting adjustment set, reconciliation definition (version, effective), GL snapshot,
TB snapshot (now the lens's: `TB-2026-06-DE-STAT`), data as of, revision, fingerprint. **No
blank and no bare "v".**

The R1/R2 chain is kept whole under **Show technical lineage** — it was reordered, not removed.

### THE BASIS BRIDGE HOLDS THE CURRENCY STILL

Three things can differ between two lenses — basis, currency and population — and a bridge that
lets all three move at once is a number nobody can read. `rcBasisBody()` is now three tables:
this lens's bridge (source → adjustment → basis balance, in its own currency); **every basis
over this population in this currency**, so the only thing that moves down the column is the
basis; and the other lenses in their own currency AND translated into this one at the
period-end cross rate, in two columns, with the caveat that their populations differ. FX trace
and consolidation trace stay their own panes.

### A TRANSACTION BELONGS TO AN ENTITY THE LENS INCLUDES

Found from the EMEA composition frame: broken down by functional currency it read **USD and
CAD** — under a lens whose population is 206 EMEA entities. `rcTxPool()` drew a transaction's
entity from every entity that posts to the account, ignoring the lens, while
`rcEntityBalances()` had already narrowed to the lens population. The pool now applies the same
rule (the account's entities within the lens, else the lens's first entity), so Composition,
the transaction grid, the entity filter and the functional-currency list all describe the
population the balance was resolved over. Amounts are targets and did not move; exports still
validate; population difference is still nothing. The remeasurement rule was widened with it:
an FXR journal survives where the entity's functional currency differs from the presentation
currency **or the document was denominated in a third currency** (a EUR entity's USD invoice),
so a EUR-functional population under a EUR lens still shows the ERP remeasurement it really
posts rather than losing it with the foreign entities.

### A DRILL OPENED FROM THE DOCK NOW RENDERS

Pre-existing R3 gap found while wiring the trace routes: `rcDrillPane()` was mounted only by
Activity Detail, so the roll-forward's **FX bridge / Consolidation trace / Basis bridge** buttons
in the docked panel set `rcDrill` and drew nothing. The drill takes the panel's place while open
and Close returns to it.

### SMALLER, EACH REAL

- `rcN()` and `ccyFmt()` print an em dash for nothing and `<0.1` / `<€0.1M` for a figure that is
  real but below the display precision — never `($0.0M)` (§16).
- "Mapping / classification" reads **"Mapping / classification change"** in the roll-forward,
  the tie bar and the Adj./Other title (§14).
- The Activity tab and the Activity Detail provenance state presentation currency, functional
  currencies, basis and rate set (§22, §23). `functionalCurrency` on the instance is the actual
  list, not "multi-currency population".
- Composition's Activity column names its currency (§26). The export manifest carries
  `presentationCurrency` and `reportingBasis`.
- `reconAiContext()` returns the structured context §43 lists — lens, basis, currency,
  population, versions, rate set, rules, adjustment set, and the open instance with its
  fingerprint and amounts — and `cpContext()` renders its one line in the assistant:
  *"Looking at: Reconciliations · Jun 2026 · EUR · Germany Statutory · Local GAAP · Electrical
  CIP · REC-CIP-ELECTRICAL-2026-06"*. No AI surface was built.

### CROSS-SURFACE, STATED HONESTLY

Financials, Trending and Flux have no lens selector; they present the corporate lens (USD ·
US GAAP), and the corporate lens in Reconciliations resolves `fsAmount().reported` byte for byte,
so the four agree there. Under any other lens the Trace's last node says so — *"Financials
presents Corporate Consolidated · USD; this balance is that figure restated under the lens"* —
rather than letting **Open Financials** imply a EUR statement exists. Giving those pages a lens is
R3.5 and was not started.

**Verified:** 62/62 views render · console clean · 10/10 chrome themes AA · content text gate
clean · spacing ratchet unchanged at 1072/88 · all four lenses: 0 foreign symbols on the page or
in any dock tab, Activity Detail tab or drill · the switching cycle Corporate → EMEA → Germany →
US Tax → Corporate leaves no stale currency, basis, population, rate set, rule set or adjustment
set · the peek opens on click, suppresses the row click, closes on outside click and Escape · the
Basis tab is absent on `glrecon` and present elsewhere · 273 numeric grid cells, none reading
`0.0`.

## 2026-09-03 — context-preserving navigation: trace → inspect → return

Owner's brief: a link from Reconciliations to Financials, Flux, Account Mapping, Trending or
the adjustment must land on the governed object it names, never on a module's front door, and
the user must be able to come back to exactly the work they left — without relying on the
browser's Back and without an ERP-style breadcrumb chain.

### THE MODEL IS NAVIGATION STATE, NOT FINANCIAL STATE

`NAVCTX` (shell) holds one origin: `originSurface` · `originObjectId` · `originTab` ·
`originLabel` · `originContext` · `periodId` · `scopeId` · `reportingLensId` ·
`financialLineId` · `reconciliationGroupId` · `activityPopulationId` · `comparisonId` ·
`mappingVersion` · `sourceAccountId` · `scrollPosition` · and the origin's own `restore()`.
Nothing in it is a balance; every figure re-derives on return. `navGo(ctx, dest)` sets it and
runs the destination; `navReturn()` calls the origin's restore; `paintNavRet()` is painted by
the `renderAll` wrapper after every render, so the strip is on the destination and nowhere else.

**ONE HOP, BY DESIGN.** The context is dropped the moment the user is on any tab other than the
destination it was created for. A return strip that survives three pages of wandering is a
breadcrumb chain. The shell's history stack (the title-row chevron) is untouched and still
works beside it.

**THE STRIP IS ONE LINE** (`#navRet`, `.navret`): *← Back to Electrical CIP reconciliation ·
Jun 2026 · Germany Statutory · Trace*, and, when the lens is not corporate, the note that
Financials, Flux and Trending present Corporate Consolidated · USD — stated on the strip rather
than letting the destination imply a EUR statement exists.

### THE ORIGIN SNAPSHOTS ITS OWN UI AND NOTHING ELSE

`rcNavCtx()` (Reconciliations) is the one place the origin is described; `rcRestore()` the one
place it is reinstated: lens, selected row, dock tab, Activity Detail and its tab, quick view,
search, status and reviewer filters, expanded lines, open drill, folded lineage, activity
filters, expanded accounts, page scroll and dock scroll. The period and the enterprise scope are
the book's and the enterprise's: they are put back only if the user moved them while away, and
through their own writers (`setPeriod`, `ENTCTX.scope`).

**The dock animates in, and a scrollTop set during the entrance clamps to zero** (observed):
the restore re-applies the scroll on a short retry until it sticks.

### EVERY OUTBOUND LINK LANDS ON THE OBJECT

Nineteen call sites in the module went through `rcGo*`; the only `pickTab` calls left in it are
inside those functions and the restore.

| link | lands on |
|---|---|
| Open Financials · Financial line · Open the adjustment | `fsReveal(lineId)`: the right statement, every ancestor opened, the row selected and scrolled to; `adj` tab where asked |
| Open Flux | the Flux statement line the population's accounts roll into (`KFX.lineForAcct`), else the `RC_FS_FLUX` crosswalk — a NAVIGATION aid between two statement models with no shared id, not a second mapping; unifying them is R3.5. `comparisonId` is recorded from Flux's own grain/compare |
| Review mapping · Account mapping | the account open (`amapOpen`), or the group's rules on screen — searched by the canonical account its rule names, else its mapping group, else its financial line, because the mapping rows carry those and not the definition's name |
| Incomplete mapping banner | Account Mapping filtered to Unmapped |
| Trending | the line selected with its ancestors opened |
| Open the adjustment (band) | Data Enrichment on the adjustment |
| ERP sources | Sync, with the return |
| View activity | unchanged — it already resolves the exact `activityPopulationId` on this surface |

**Verified:** Financials arrives on FS-CIP with PP&E opened and the row selected, the strip
reads the origin and survives a tab change inside Financials; return restores lens, row, tab,
page scroll and dock scroll; Flux arrives on `recost` on the balance sheet with `m/seq` recorded;
Mapping arrives on the account or the group's rules; Trending arrives on FS-CIP; navigating to
an unrelated tab clears the context and hides the strip; 62/62 views render; console clean;
three gates green.

## 2026-09-04 — RECONCILIATIONS R3.2 → R5.7B: the objects R6 has to build on

Nine increments in one entry, at the density a later session needs rather than nine
retrospectives. The commit messages carry the full reasoning (`git log` from `30f60fd`
onward); this is the map, the invariants and the traps.

**READ THIS BEFORE STARTING R6 (Annual / Audit).** Every object an audit package needs
already exists. Rebuilding any of them is the failure mode this block is written to prevent.

### The governed objects, and which increment owns each

| Object | Owns | Where it lives |
|---|---|---|
| `ReconciliationDefinition` / `Instance` | R1 | `RECON_DEFS`, `rcInstance()` — instances DERIVE, never stored |
| `ActivityPopulation` + transactions | R2 | `rcPopulation`, `rcTxPool(srcId, period)` |
| `ReportingLens` | R3 | `REPORTING_LENSES`, `rcLensLine()` — all four built |
| `FinancialContext` / deep links | R3.2 | `NAVCTX`, `fcGo()` |
| `ReconciliationMethod` + `ReconciliationSource` | R3.5 | `RC_METHODS`, `rcMethodModel()`, `proofStatus` |
| `SupportRequirement` / `EvidenceObject` / `EvidenceVersion` / `EvidenceRelationship` | R4 | `RC_SUPPORT_REQS`, `EVIDENCE`, `EV_RELS`, `rcSupportGraph()` |
| `ReviewWorkflow` / `ReviewStage` / `ReviewSubmission` / `ReviewDecision` / `ReconciliationSignOff` | R5 | `RC_WORKFLOWS`, `RC_SUBS`, `RC_DECS`, `RC_SIGNOFFS`, `RC_EVENTS` |
| Chronology guard | R5.1 | `rcChronologyCheck()` — must stay at zero |
| Roles / scope / lens access / authority / mentions | R5.5–R5.6 | `KROLES`, `KSCOPES`, `KTEAMS`, `KAUTH`, `resolveEffectiveAccess()` |
| `ReconciliationAssignmentRule` / delegation | R5.7A | `RC_ASSIGN_RULES`, `KDELEGATIONS`, `rcResolveAssignment()` |
| `ReviewCheckpoint` / `ReviewDelta` | R5.7B | `RC_CHECKPOINTS`, `rcReviewDelta()`, `reconReviewSignals()` |

### The invariants — break any of these and the module stops being defensible

1. **ONE AMOUNT SERVICE.** Every figure resolves through `fsAmount()` / `rcLensLine()`. The
   corporate lens returns `fsAmount().reported` byte for byte, which is why Financials, Flux,
   Trending and Reconciliations agree. FS-CIP = **4,210.2** is the canary: if it moves,
   something has grown a second balance store.
2. **THREE FINGERPRINTS, THREE QUESTIONS.** `reconciliationFingerprint` = what the BALANCE was
   resolved from (this is what re-review compares). `packageFingerprint` = what the REVIEWER
   SAW, including pinned evidence versions. The R4 EVIDENCE fingerprint uses different key
   names again (`glSnapshotId` vs `sourceGLSnapshotId`) — comparing one with the other's
   vocabulary silently finds no drift, which shipped once. `rcFpHash()` is the only hasher.
3. **IMMUTABLE MEANS FROZEN.** Submissions, sign-offs and checkpoints are `Object.freeze`d and
   never edited. A correction is a NEW version / cycle / checkpoint.
4. **ONE INSTANT PER EVENT.** `rcEventAt()` clamps every audit event to the one before it. Two
   independently generated timestamps for one event is the Land defect (a certification dated
   before its own approvals).
5. **PERMISSION ≠ AUTHORITY ≠ INDEPENDENCE.** `kCanApprove()` is all three, in that order, and
   permission never absorbs SoD. Every check takes the actor and the object; no module reads a
   role name.
6. **ASSIGNMENT CANNOT GRANT PERMISSION** and **DELEGATION CANNOT EXCEED THE DELEGATOR.** Both
   surface as findings rather than silent upgrades.
7. **A MENTION IS NOT AN ASSIGNMENT.** Different objects, different actions, only one gated on
   `ASSIGN_WORK`.
8. **NO SOURCE FREEZE.** Only submission and certification pin snapshots. Pre-close checkpoints
   are made against a moving target on purpose and are NOT the formal package.
9. **AI CONTEXT IS ASSEMBLED AFTER ACCESS RESOLUTION** (`kAiContext()`), never redacted after.

### What R6 already has, and must not rebuild

An audit package is an assembly of objects that exist:

- the certified `ReconciliationSignOff` and the `ReviewSubmission` it cites;
- every `ReviewDecision` on that submission, with the reviewer who actually acted and
  `actingUnderDelegationId` where a delegation was used;
- the pinned `supportEvidenceVersionIds` and their `EvidenceRelationship`s;
- the `ReviewCheckpoint` history — what was looked at before submission, and by whom;
- `rcAssignTrace()` (why this person owned it) and `rcReviewTrace()` (who decided what);
- the append-only `RC_EVENTS` trail.

`VIEW_AUDIT_PACKAGE` is already a permission; `EXTERNAL_AUDITOR` already resolves to certified
work only (18 of 38 instances) and `XP-AUDIT` already opens on the Certified quick view.
**R6 is a reading of these, plus retention and export — not a new record.**

### Traps that have each cost a round

- **`ME` and `caps()` live in the flux closure.** In the shell, `ME` is a two-letter initials
  CONSTANT, so `ME()` fails at run time, not parse time. Shell scope uses `rcMe()`/`rcCaps()`;
  the access layer's actor is `kActor()`, which reads `USER_NAME` — never `cwMe()`, which reads
  a rendered DOM element and silently answers for the wrong person.
- **`pickTab` will not object to a tab the current lens does not declare.** It falls through to
  the lens's first tab. Settings is `pickLens('admin'); pickTab('admin')`.
- **A prefix is not a namespace.** `.rcx-bar` was declared twice and a single-class selector
  later in the sheet ate the Control Center's own header row. Grep the name before declaring it.
- **A splice script that fails mid-way loses every earlier edit** — the write is at the end.
  This has bitten four times.
- **Never pass replacement text through the shell**; write it to a file and splice from the file.
- **`sed -i` rewrites the whole file's line endings.** The working tree is CRLF; restore it with
  node if a shell tool flattens it.
- Verification runs on the python server in `.claude/launch.json` (`preview_start {name:'main'}`),
  not `file://`.

### The standing verification set

62/62 views · 912 lens × definition × tab combinations · `rcChronologyCheck()` = 0 ·
0 console errors · 0 clipped elements · the three gates · FS-CIP = 4,210.2.

### Deliberately deferred

R6 annual/audit and the post-certification amendment workflow · R7 Excel add-in · transaction
matching, depreciation and amortization engines · SSO/SCIM/DLP/impersonation · a security-event
console · AI surfaces of any kind (the data is structured; nothing is generated).

## 2026-09-04 — RECONCILIATIONS R6: multi-period, quarterly, annual, audit and certified history

**READ THE R3.2 → R5.7B BLOCK ABOVE FIRST.** R6 rebuilt nothing in it. What it adds is the layer
that turns one governed reconciliation reviewed in one period into a financial control HISTORY.

```
ONE persistent ReconciliationDefinition
+ MANY period instances, DERIVED, never stored
+ a governed CERTIFICATION FREQUENCY   policy: how often a conclusion is required
+ a user-chosen VIEW HORIZON           analysis: how much history is on screen
= IMMUTABLE certified history
```

**FREQUENCY AND HORIZON ARE NOT THE SAME THING, and conflating them is the bug this increment
exists to avoid.** A monthly reconciliation may be read year-to-date; a quarterly one still shows
its months; a goodwill reconciliation certified once a year still consumes twelve months of
governed history. **A VIEW HORIZON NEVER CREATES A FINANCIAL TRUTH** — `rcHorizonPeriods()`
returns period keys, `rcMultiPeriod()` resolves each one through `rcAmounts()`, and the totals
are sums of those. **There is no quarterly or annual balance store and there must not be one.**

### The objects R6 adds

| Object | Where |
|---|---|
| CertificationPolicy / frequency | `RC_CERT_FREQ` · `RC_CERT_POLICY` · `rcFreqOf` · `rcCertRequiredAt` |
| ViewHorizon | `RC_HORIZONS` · `rcHorizon` / `rcHzAnchor` · `rcHorizonPeriods` |
| PeriodBridge | `rcPeriodBridge` — one month as a bridge row, cached |
| MultiPeriodRollforward | `rcMultiPeriod` — the quarter / year workpaper |
| Activity matrix | `rcActivityMatrix` · `rcActivityByType` · `RC_ACT_TAXONOMY` |
| CertifiedReconciliationVersion | `rcCertOf` / `rcCertBuild` → `RC_CERT_STORE` (frozen) |
| Amendment versions | `RC_CERT_AMEND` · `rcAmendCertify` · `rcVersionBridge` |
| CertificationInstance | `RC_CERT_INSTANCES` · `rcCertifyHorizon` · `rcCertReadiness` |
| PostCloseChange | `RC_POSTCLOSE` · `rcPostClosePost` · `fsPostCloseDelta` |
| Evidence coverage | `rcEvidenceCoverage` — references, never copies |
| AuditPackage + Manifest | `RC_PACKAGES` · `rcPackageBuild` · `rcPackageExport` |

### THE GOVERNED SPINE WAS RE-DATED, AND THAT IS THE ENABLING CHANGE

There was no reconciliation history to roll forward: the opening mapping set was effective
**2026-01**, so `rcLineAccts()` resolved nothing before it, every group's opening balance for any
2025 period was zero, and an annual roll-forward could not exist. `MV-2026-01-1` is now
**`MV-2024-01-1` / `2024.01.1`, effective `2024-01`**, and the thirty rules it governs moved with
it; `RC_DEF_BASE`, the support requirements, the six review workflows and the assignment rules are
effective from the same month. **Nothing about the June 2026 split changed** — `MV-2026-06-4`
still introduces the German capex split and `mapVersionFor()` still returns it from June onward.
An opening mapping set dated the month the prototype's calendar happens to start was an artifact,
not an accounting fact. `2026.01.1` no longer exists as a version label.

**What that unlocks:** FY2025 is a COMPLETE governed year — opening $43.573M at Dec 31 2024,
twelve months, 12/12 certified, ending $47.662M = TB, difference nil, continuity unbroken. FY2026
is in progress: Jan–Jun governed, **Jul–Dec render as "not yet opened" and carry no figures**,
because a period after `BOOK.open` has not happened and `fsPeriodFactor()` is a statement about
the months it covers, not a growth law. Extrapolating them would have been the easy lie.

### AS-REPORTED IS THE DEFAULT AND THE CONTROL

Each period resolves under ITS OWN mapping version — `rcAmounts()` has done this since R2.1 — so
a December mapping change cannot silently recast January. Where membership genuinely moved, the
`CLASSIFICATION_CHANGE` component says so in the month it happened, which is why the annual
roll-forward foots without recasting anything. **Analytical recast is NOT implemented**; if it
ever is, it is a labelled alternative view and never the default. The horizon band states the
basis and names every mapping version in force ("3 mapping versions in force (2024.01.1,
2026.05.3, 2026.06.4)").

### THE CONTINUITY CONTROL WAS WRONG FIRST, AND THE FIX IS THE ACCOUNTING

The first cut tested `beginning[i] == calculatedEnding[i-1]`. **A month's opening is the prior
period's AS-REPORTED governed ending balance — the prior TRIAL BALANCE** — and those two are the
same figure only when the prior month tied. So it reported a continuity break on every untied
reconciliation in every month (11 each on Intercompany Receivable and Accrued Expenses), which is
not a break at all: it is the difference the reconciliation already discloses, counted twice.

**What the untied months DO cost is the year's footing, and that is real.** If a month's
calculated ending is 6.4 below its trial balance and the next month opens at that trial balance,
the year's opening plus its movement is short by exactly the differences that were never carried.
`openingResets` states that as its own line — *"Unreconciled difference at prior month end"* — so
the roll-forward foots AND the reader is told the reconciliation did not tie in those months. It
is a disclosure, not a plug. All 38 definitions now foot and hold continuity across every horizon.

### THE ACTIVITY MATRIX CLASSIFIES A REAL POPULATION

**The activity schema is the governed transaction taxonomy, not a category list invented for this
view.** `RC_TX_TYPES` already classifies every row of every activity population — vendor invoice,
capitalised interest, transfer, reclassification, accrual, reversal, journal, ERP remeasurement —
so each cell drills to the exact transactions behind it. `RC_ACT_TAXONOMY` holds the per-method
WORDING only: a CIP schedule calls a transfer "Transfers", a register calls the same governed
movement "Transfers from CIP". **This is what R1's declared-but-unbuilt `AS-CIP-FULL` was for**;
the registry entry is `built:1` now and names what it resolves to.

**A LINE WITH NO MODELLED POPULATION IS NOT A FOOTING FAILURE.** Several definitions resolve their
balance from the governed statement and model no source accounts (goodwill, transformers, land),
so there is nothing to classify. Left alone the matrix printed the non-GL components only and
reported "does not foot to the roll-forward movement" on **216 of 304** combinations — a red flag
on a condition the reader can do nothing about. The activity is stated as one honest row named
`GL activity` with the reason. 304/304 matrices foot; 78 carry a real classification.

### CERTIFIED HISTORY IS FROZEN, AND THE IMMUTABILITY IS MECHANICAL

`rcCertOf()` materialises a certified month once, deterministically, `Object.freeze`s it into
`RC_CERT_STORE`, and never recomputes it. A post-close journal changes the CURRENT resolution and
leaves the record untouched — which is what makes `sourceChanged` a DETECTION rather than an
assertion. Certified history is seeded governance exactly as `RC_SEED` is: `RC_CERTIFIED_THROUGH`
defaults to the last closed period, nothing at or after `BOOK.open` is claimed (the open period is
R5's), and nothing before `RC_HISTORY_FROM`.

**A POST-CLOSE JOURNAL IS SOURCE TRUTH, NOT A KORVYN OVERLAY.** It is added in `fsOwnTB()` — the
one place a source balance is resolved — so Financials, Trending, Flux and Reconciliations all
move together after a legitimate reopened-period adjustment (memo §21.8). Verified: a $4.2M late
accrual on May 2026 Electrical CIP moves the June reconciliation 705.833 → 710.033 **and FS-CIP
June 4,210.2 → 4,214.4**, while certified v1 stays at 57.188 with fingerprint `FP-76074653`.
Routing it through `RPT_ADJUSTMENTS` would have made an ERP posting a reporting overlay, which is
the distinction R2.1 spent a pass establishing.

**And it lands on the ACCOUNT it was posted to.** `rcAcctBalance()` carves the post-close amount
out before the weighted split and adds it back to its own account, so the bridge can name GL 15010
instead of spreading one journal across four CIP groups.

**`rcAsCertified()` IS A FLAG, NOT A CACHE FLUSH.** The first cut dropped every cache on entry and
exit because `_rcLensBalCache` and `_fsCtaPlugCache` key on line/period/lens and not on the
generation. It was correct and unusable — an annual Control Center resolves several hundred
certified records and paid two full rebuilds for each. Those two keys now carry `_rcMapGen()`,
which folds in the post-close generation and the as-certified flag, so the two resolutions cannot
serve each other's numbers and nothing is flushed. **38 definitions × 12 months: 95ms cold, 1ms warm.**

### THE CERTIFICATION CALENDAR REACHES THE CLOSE

`rcCertRequiredAt()` decides whether a conclusion is owed at a period end. **Overdue is a required
conclusion past its date**: a lender-covenant reconciliation is prepared and reviewed monthly and
CERTIFIED quarterly, and counting it overdue in April and May reports a breach of a control that
was never due (memo §28.6). `reconReadiness()` separates the populations — `overdueCount` counts
the required ones, `overdueAllCount` keeps the raw number. Measured: May 2026 overdue 18 → 15,
June (a quarter end) 17 → 16. Seeded policy: Cash and CIP monthly, **Long-Term and Current Debt
quarterly**, **Goodwill annual**, **Intangibles event-driven** (one declared control event, the
Ridgeline PPA at 2026-03). All four frequencies are exercised; no valuation or impairment engine
is implied by the annual one.

### THE SURFACE: NO SECOND CONTROL CENTER, NO ANNUAL APPLICATION

The horizon is one more field in the bar the page already has (`rcR6Field` → the same `RCFIELD`
descriptor shape, so the menus get the one popover system's keyboard, anchoring and widths for
nothing). The anchor field renders only for Quarter and Full year — the "to date" horizons are
anchored on the working period by definition. The grid **re-heads itself** (Opening / Movement /
Ending / TB / Diff / Change / Tie / Certified / Conclusion) and resolves **endpoints only** for 38
definitions; the monthly detail is one click away in the workspace, which is §52's progressive
disclosure. The workspace keeps its six tabs and changes what they are ABOUT: Roll-forward gains a
**By month / By activity** switch, Support becomes the evidence coverage matrix, Review becomes
the certification history and the horizon conclusion, Trace extends month → certification → package.

**Audit packages are governed OUTPUTS, not a module.** `rcPackageBuild()` builds the package and
its manifest together, because a package whose manifest is assembled later is one nobody can
reproduce. Support is **inherited by reference** — 48 evidence version ids for FY2025, never a
thirteenth copy of the same workpaper. A DELIVERED package is immutable: an amendment marks it
SUPERSEDED with a reason and names its replacement; AP-2026-001 is retained exactly as delivered.

**The GL export is the SAME export.** R2 built one 34-column set, two encodings, one manifest
register and the rule that an export which does not reconcile is REFUSED. R6 extracted the write
half as `rcWriteExport()` and widened the SCOPE to a period range — `rcExport()` is now a
one-liner over it. **The context columns became per-row**: a row in a twelve-month export is a
fact about its own month and carries the versions in force then, so `ctx` may be a function of the
row. Verified: 649 transactions, $3.571M, difference 0, valid.

### TRAPS THAT EACH COST A ROUND

- **A PREFIX IS NOT A NAMESPACE — third time.** `.rcx-hist` (a flex column for Review timeline)
  and `.rcx-chain` (the Trace chain) were already declared. The certified-history TABLE inherited
  `display:flex`, its `table-layout:fixed` was applied and ignored, and the lineage stack silently
  re-gapped the existing Trace. No console error, no gate failure. **`tools/check_css_duplicates.mjs`
  now gates it** — a ratchet over the 63 names legitimately declared twice today, failing when a
  new one appears. Negative-tested by reintroducing the exact `.rcx-hist` collision.
- **Two base rules written for the full-width grid, inherited by the 440px dock.**
  `.rcx-tbl td.rcx-nm` pins `min-width:260px`, and `.rcx-nm` is `display:flex` — so a child set to
  `display:block` is still a flex ITEM and the certifier would not stack under the period however
  it was declared. Both are overridden for R6's dock tables only. And `.rcx-tbl td` pins the row
  height, which clipped the second line into the row below.
- **`.rcx-tn` is a two-column grid.** R6's block children need `grid-column:1/-1` or the heading
  and its body land in adjacent cells and overlap. R6's state border is `st-ok`/`st-warn`/`st-bad`,
  NOT a reuse of `.bad`: `.rcx-tn.bad` already exists as a bare `border-left-color` with no
  border-style — inert by construction — and giving it a border would have changed every existing
  Trace node it lands on.
- **SPLICING AFTER THE LAST STATEMENT OF A FUNCTION IS NOT SPLICING AFTER THE FUNCTION.** Part B
  and Part C both landed inside a function body as unreachable code. The file parsed, the app
  loaded, and every symbol in the block was simply undefined. An 'after' splice must assert that
  the next line is a `}` at column 0.
- **AN AMENDMENT CHANGES A DERIVED STATE, SO THE DERIVATION MUST BE DROPPED.** `rcPeriodBridge()`
  caches on the post-close generation, and certifying an amendment posts nothing — so a month went
  on reading "changed after certification" after it had been amended. `rcAmendCertify()` and
  `rcCertifyHorizon()` clear `_rcBridgeCache` / `_rcActCache`.
- **Role defaults clear the selection.** `kApplyRoleDefaults()` runs inside `rcRows()` and calls
  `setRcQV()`, which nulls `rcSel`. After `setUserRole()`, render once to let it settle before
  selecting anything — this is R5.6 behaviour, not R6's, and it cost several screenshots.
- **Never pass replacement text through the shell.** A quoted heredoc still ate `\\'` and produced
  an anchor that could not match. Write the splice script with the Write tool.

### Verified

62/62 view keys (65 including the three lens-scoped ones) · **2,736 horizon × definition × tab ×
roll-mode combinations render with content, 0 errors, 0 empty** · **304/304 activity matrices
foot** · every definition foots and holds continuity across 8 horizons · reconciliation groups tie
to Financials at Jun 2024 through Jun 2026 · `rcChronologyCheck()` = 0 · console clean on a fresh
load · **all four gates pass** (chrome themes 10/10, content contrast, spacing ratchet unchanged at
1072/88, css duplicates 63/63) · **all 43 acceptance tests in brief §56–§60 pass**, run in the
product.

### Deliberately NOT built (R7 and beyond)

The Excel add-in · the full Data Room and PBC request workflow · an audit portal or auditor
messaging · audit confirmations · transaction-matching expansion · autonomous AI certification ·
ERP journal posting · a valuation or tax-provision engine · analytical recast to the current
mapping. **AI surfaces of any kind:** the objects are structured for grounding (`rcMultiPeriod`,
`rcVersionBridge`, `rcDownstreamImpact`, the package manifest) and nothing is generated.

### Open, and worth an owner's call

- **The 12-column annual by-activity matrix scrolls horizontally in the 440px dock.** That is the
  documented pattern for wide content and a quarter fits comfortably, but a year is tight. The
  honest alternative is opening the annual matrix on the main canvas the way Activity Detail does
  — which is a layout decision, not a defect, so it was not made unasked.
- **`RC_CERTIFIED_THROUGH` is empty**, so every definition's certified history runs to the last
  closed period. A real deployment configures it per definition.
- The event-driven example uses Intangible Assets with one declared control event. If acquisition
  accounting is ever modelled properly, that policy entry is where it attaches.

## 2026-09-04 — R6.1: the period is an operating state, and the calendar decides the work

R6 gave a reconciliation a certification FREQUENCY and the user a VIEW HORIZON. What it did not
do is decide WHICH WORK IS ACTIVE, so the product still behaved as though you pick a period and
then pick what to do in it. That is backwards for a close.

```
CurrentControlPeriod        the one period the enterprise is working in
+ FinancialControlCalendar  what it requires at this scope, lens and basis
= the active work, resolved — never chosen from a menu
```

**NO THIRD PERIOD VARIABLE.** `BOOK.open` is still what the book accepts work in and
`VIEW.period` is still what you are looking at. R6.1 adds the CONTROL state around them —
upcoming, pre-close, open, ready to finalise, certified — and what that state implies.

### Where it lives

| Concept | Function |
|---|---|
| Period lifecycle | `PERIOD_STATES` · `controlPeriodState()` · `controlPeriodExceptions()` |
| Fiscal calendar | `FISCAL` · `isQuarterEnd` · `isYearEnd` · `controlHorizons()` |
| The calendar | `financialControlCalendar()` / `fcal()` — cached, cleared with the recon caches |
| Audit horizon | `auditHorizon()` — resolved, never selected |
| Audit readiness | `auditControls()` · `auditReadiness()` · `rcAuditGenerate()` |
| Provenance | `controlProvenance()` — why this control is active, in one sentence |
| The guard | `canPerformActivePeriodAction()` · `rcGate()` · `rcPeriodActive()` |
| Amendment mode | `RC_AMENDMENT_MODE` · `wpAmendStart/End()` |
| Current Period | `renderCurrentPeriod()` · `wpLens()` · `wpNextAction()` · `wpStages()` |
| Audit History | `renderAuditHistory()` |

### JUNE IS A QUARTER END AND KORVYN KNOWS IT

`controlHorizons()` resolves month-end + Q2-end in June and month-end + Q4-end + FY-end in
December. Measured: Jun requires **34 monthly + 2 quarterly + 0 annual**; May requires **34 + 0 +
0**; Dec requires **34 + 2 + 1**. The user never answers "should I do the Q2 reconciliation now?"
and never activates year-end work by hand.

**AND THE VIEW HORIZON STILL CREATES NO WORK.** R6's distinction is load-bearing and untouched:
`rcHorizon` selects periods to LOOK at, `controlHorizons()` resolves what is DUE, and switching
the Control Center to FY2025 leaves both the required-control set and the audit horizon
unchanged (asserted).

### TWO CORRECTIONS THE FIRST CUT NEEDED

**PRE-CLOSE IS AN ACCOUNTING FACT, NOT A DAY COUNT.** It first read off days elapsed since the
period end, which made the working period read "Open" at day 6 while the ERP period was still
accepting postings — the opposite of what pre-close means. It is the SOURCE state: while the
source period is open the data is still arriving, which is exactly the condition R5.7B's
checkpoints exist for. No day constant, and it cannot drift with the prototype's clock.

**AN EXCEPTION ON ONE RECONCILIATION IS NOT THE PERIOD'S STATE.** Returned work and re-review
first won the state test, so two lines out of thirty-eight renamed the whole close and the header
stopped saying where the close actually was. The lifecycle state is the position; exceptions are
counted alongside it in `C.exceptions` and surfaced where they can be acted on. For a CLOSED
period they ARE the state, because nothing else can be true of a period whose work is finished.

### THE GUARD IS IN THE WRITERS, NOT ONLY ON THE BUTTONS

`canPerformActivePeriodAction()` is asked inside `rcSubmitReview`, `rcApproveStage`,
`rcStartPrep`, `rcMarkReady`, `rcReturnCommit`, `rcCertifyHorizon` and `rcPkgOpen`. It is
deliberately a THIRD question after capability and independence: being a Controller does not make
a certified period writable, and an open period does not make you a reviewer. Verified —
preparing in May leaves `rcState` byte-identical and reports *"May 2026 is certified history and
is read only. To prepare in it, a Controller or the Chief Accounting Officer must start an
amendment or request a reopen."*

**AND THE CONTROLS STAND DOWN, WHICH IS THE OTHER HALF.** The writer refusing is the guarantee;
it is not the experience. Opening May still showed "Mark reviewed through now", the readiness
actions and the review workflow exactly as the working period does — a control that will refuse
is worse than one that is not there. `rcCanPrepare()` and `rcRevActions()` are the two single
gates the panel already routed through, so adding the period to them stands every preparation and
review control down at once. **Everything still READS** — roll-forward, activity, support,
decisions, certification — which is the whole point of history being reachable.

### AUDIT IS PERIOD-DRIVEN AND THE PACKAGE ASSEMBLES ITSELF

R6 left the AuditPackage as a thing a user CREATES for any horizon they could name — the
free-form period-selection workspace the brief rules out. `auditHorizon()` resolves it from the
control period (a month audits the month, a quarter end the quarter, a year end the year), and
`rcPkgOpen()` now refuses anything else by name: *"An audit package is generated over the current
control horizon — quarter-end, Q2 2026. FY2025 is history: its packages open and read, and a
change to them goes through an amendment."*

`auditReadiness()` counts the (definition, period) conclusions the horizon requires and how many
carry a governed one. Measured: **Q2 2026 — 86 of 104 controls ready, Assembling**, with the
outstanding ones named; May 2026 — 34 of 34, Ready; Dec 2026 — 191 of 209 over FY2026. The
package completes itself; nothing has to be remembered.

`rcHorizonPackage` / `rcAuditGenerate` add a HORIZON-level package beside R6's per-definition
one, reusing the same manifest discipline. **R6's package, its manifest, its supersession and its
amendment bridge are untouched.**

### THE SURFACES

**The Accounting landing page is the Current Period workspace.** `renderAcctOver` is retired to a
delegation (the legacy body is kept as `renderAcctOverLegacy` and nothing calls it) so every deep
link still lands. What it replaced was seven KPI cards titled "Controller command centre" — the
startup dashboard the brief rules out. It now answers one question, role-aware: **what do I need
to do next.** Header (period · lens · basis · currency · state · data through), a restrained
PREPARE → REVIEW → CERTIFY → AUDIT READY indicator, the period's exceptions as one-click filters,
the work table (WORK · OWNER · STATE · NEXT ACTION), the controls active this period with a
`why`, and the audit package assembling.

**THE ROLE → QUEUE MAPPING USES DECLARED POLICY, and the first cut used the wrong field.**
`FX_CAPS.policy` is 1 for the Accounting Manager, so testing `reopen||policy` first gave a manager
the CERTIFICATION queue — the one queue that is not theirs — and `FX_CAPS.reopen` is 1 for both
the Controller and the CAO, so it cannot tell them apart at all. `PERIOD_CAPS` already declares
that distinction (a Controller LOCKS a period, only the CAO REOPENS one) and is the table the
sign-off matrix and the period control both read. Resolved: Asset Manager → my preparation work ·
Accounting Manager → my team's work and blockers · Controller → needs my review · CAO →
certification readiness · External Auditor → certified and audit-ready work.

**A CONTROL THAT OWES NO CONCLUSION THIS PERIOD OWES NO ACTION.** The first cut asked for
"Complete preparation" on Goodwill in June — an annual control next due in December. It is
de-prioritised, not hidden: the row reads *Not due this period · next due Dec 2026*, sorts below
everything owed, and is passive.

**The period navigator is CURRENT / HISTORY / UPCOMING.** It listed twelve months as twelve equal
choices, which is what makes a period read as a filter. Upcoming periods derive from the calendar
rather than from `MONTHS`, which stops at the working period.

**The rail follows the financial lifecycle** (§24): Current period · Financial foundation (trial
balance, account activity, account mapping, data enrichment) · Financial review (financials, flux,
trending) · Close & control (reconciliations, intercompany, consolidation, close, continuous
close) · Governance (issues, policies, audit history). Same components and same visual language;
only the order and the group names changed. **Account Mapping and Data Enrichment moved into the
foundation because that is where they act: they interpret and organise the trial balance's facts,
they do not create them** — the brief's §2 boundary, made structural.

**Audit History, not "Audit"** (§25). Active readiness belongs to the current period; naming the
page Audit would promise a workspace that §15 says must not exist.

**Close consumes the one calendar** (§30). Its header states the control period title, its state
and its horizons — "Jun 2026 · Q2 2026 close · Month-end + Quarter-end · 34 monthly · 2 quarterly
controls required". `closeStages()`, `closePct()` and the checklist are untouched.

### Two small fixes made along the way

- **`REC-FF`'s name carried a pre-escaped entity** copied from the FSLINES name (which IS rendered
  raw). Escaped again on every definition render it read `Furniture &amp;amp; Equipment` in the
  Control Center, the multi-period grid and the work table. The definition name is plain text now,
  per R1's own rule; the financial line's name is untouched.
- **`--n-400` as `border-left-color`** tripped the content-contrast gate's USE arm. The gate is
  right: n-400's declared role is borders and placeholders and the arm catches any `color`
  property. It uses `--border-strong`.

### Verified

66/66 views · **3,192** period × horizon × definition × tab combinations render with content, 0
errors, 0 empty · console clean on a fresh load · **4/4 gates** · FS-CIP 4,210.2 and the
reconciliation groups still tie to it · `rcChronologyCheck()` = 0 · R6 intact (FY2025 foots, holds
continuity, 12/12 certified, the activity matrix reconciles) · **all 22 acceptance tests in the
brief pass, run in the product.**

### Deliberately not done

R7 / Korvyn for Excel · a separate audit application · a second period model · per-entity or
per-lens divergent close states beyond what `fcal(period, scope, lens)` already keys on (the
signature carries them; the seeded book has one enterprise close) · AI surfaces.

## 2026-09-04 — the module is named FLUX REVIEW

Owner’s direction. **User-facing names only — not one identifier moved.** The tab id is still
`finrep`, and `FX_*`, `#fxRoot`, `KFX`, `FLUX_GOV`, `rcGoFlux()` and every function name are
untouched: renaming those is a refactor of several hundred symbols with no product change and
real risk.

**35 references renamed**, found in two passes that must both be run — a source scan for the
declared strings, and a DOM sweep across every view for what a user actually SEES. The sweep
caught three the source scan could not: the shell title row **assigns** the page name
(`tt.textContent='Flux'`) rather than declaring it, and it is the one place the name is read
largest; plus `View Flux ›` in the drivers card and the Close review stage’s own description.

Renamed: the rail item and the tab registry · `VIEW_META.finrep` · the page title · the Cash
flows / Equity flux view’s heading · Close’s workstream rows and its review-stage description ·
the attention row · `MAP_USED_BY` · the Trace “where used” list · My Work’s workspace · the
Reconciliations routes (`Open Flux Review →`, `View Flux Review ›`, the Drivers button, the
downstream-impact row) · the memo (menu item, modal heading, printed title) · and the sign-off
vocabulary, which already said the right words and is now capitalised as a proper noun.

**Two navigation paths were stale as well as unrenamed** and were corrected with it: two notes
still read “General Ledger → Financial reporting → Flux review”, a path the rail has not used
since 2026-08-28. They read **Accounting → Flux Review**.

**DELIBERATELY NOT RENAMED — the domain terms that contain the word.** A flux is a movement
between two periods; that word is the accounting, not the product name, and “Flux Review group”
would read wrong:

| Left as-is | What it is |
|---|---|
| **Flux group** | a mapping taxonomy (`TAXONOMIES.flux`) — a dimension of the chart |
| **Flux Driver** | an enrichment field (`EF-FLUX`) |
| **Flux range / comparison / scope** | filter-group labels on the legacy `#filterCtrls` store and the Cash flows / Equity view |
| **flux explanations / commentary / notes** | the accounting artefacts a review produces |

**Verified:** 66/66 views · console clean · 4/4 gates · FS-CIP 4,210.2 · `rcChronologyCheck()` = 0
· R6 intact (FY2025 foots, 12/12 certified) · the control calendar unchanged · the
Reconciliation → Flux Review → return round trip still preserves context · a DOM sweep across
every view finds no bare “Flux” naming the module.


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
node tools/check_css_duplicates.mjs    # no class name newly claimed by a second component (ratchet)
cd packages/core && npm run check      # core: typecheck + 78 tests + import boundary
cd packages/agent && npm run dryrun    # agent: all tools resolve, no API call
```

For `index.html` the browser-preview sweep is the end-to-end check: open
`file:///C:/Korvyn/index.html`, drive every tab, assert each view rendered, console clean.

## Git

Repo `github.com/mrgiri-hash/korvyn` (private). Requires Node (checks use `node --test`) and Python
(the boundary checker).
