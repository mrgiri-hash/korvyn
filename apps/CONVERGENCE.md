# Convergence — one Korvyn

Folding `apps/dashboard/` and `apps/review/` into a single product, at the owner's direction
(2026-08-10). This file is the plan and the record of decisions; the per-app `CLAUDE.md` files carry
the working detail.

---

> ## ⚠️ 2026-08-14 — REVERSED. The dashboard line wins.
>
> **The owner supplied a further-evolved dashboard and made it the main file: `index.html` at the
> repo root.** It is a direct descendant of `apps/dashboard/korvyn_dashboard.html` — same spine
> ribbon, same `RECON_SCALE`, same baked `EGL_DATA` snapshot — grown to ~24k lines and ~60 views on
> the "Instrument" system (a further evolution of the phase 1–3 ramp + cobalt work).
>
> **This inverts the central ruling below.** `apps/review/` is superseded; it is no longer the
> active front-end and no longer the app screens move *into*. Everything under `apps/` is now a
> predecessor kept for reference. **Where this block and anything below it disagree, this block
> wins** — the text below is preserved because the *reasoning* it records is still the reasoning
> that has to be answered, not because its conclusion still holds.
>
> ### What the reversal costs — read this before planning any next step
>
> The old ruling picked review because it carried **the live GL engine**, and that fact has not
> changed:
>
> | | `index.html` (main) | `apps/review/index.html` (superseded) |
> |---|---|---|
> | `glLedger()` live engine | ✗ none | ✓ 54 references |
> | 152-account REIT chart that foots (A = L + E) | ✗ | ✓ `E_ACC`-derived taxonomies |
> | flux surface depth | 141 references | 650 references |
> | baked `EGL_DATA` snapshot | ✓ (read by `view-egl` alone) | ✗ |
> | views | ~60 | fewer, but deeper |
>
> So the direction of travel flips, and with it the source-of-numbers question. **The engine now
> has to move into `index.html`, rather than the screens moving into the engine.** Until it does,
> the main file's figures are illustrative except for `view-egl`, which reads the validated snapshot
> emitted by `packages/core/tools/emit_enterprise_gl.mjs` (re-pointed at `index.html` on 2026-08-14).
>
> That is a real debt, not a detail. The repo rule *"numbers derive, never duplicate"* and the
> `RECON_SCALE` cautionary tale both apply to it, and porting `glLedger()` in is the obvious next
> increment whenever the owner wants live numbers in the main file.
>
> ### What is still true from the plan below
>
> - The **inventory** of ~59 dashboard views, and the grouping by capital-lifecycle / overlap /
>   out-of-thesis / data-room / leaf. `index.html` inherits it.
> - The finding that **~14 of 59 views (financial planning, reporting/filing) sit outside the product
>   thesis.** They are now in the main file by default rather than arriving by a decision — which
>   makes the explicit call *more* overdue, not less.
> - Every rule under "Rules that hold throughout".
> - The trap about `px` vs `rem` type scales, in reverse: the main file is **px**, so anything lifted
>   from `apps/review/` arrives in `rem` and must be converted, not pasted.
> - The trap about `check_chrome_themes.mjs` validating nothing shipping — **resolved**: it was
>   re-pointed at `index.html` on 2026-08-14 and all 10 themes still pass AA in both modes.

---

## Where it stands

| Phase | What | Status |
|---|---|---|
| 1 | Neutral ramp + cobalt accent | ✅ `839d682` — and carried further in `index.html` |
| 2 | Semantic type scale | ✅ `eb82b7e` — `index.html` ships six sizes + two weights |
| 3 | One graphite chrome | ✅ `305454a` — 10 themes, gated, all pass AA |
| — | `design-system.md` brought in line | ✅ `e25b078`, re-recorded 2026-08-14 |
| 3b | Card / chip / table treatments | ⬜ not audited |
| 4 | Merge the two apps | ↩️ **direction reversed** — see the block above |
| 5 | Port `glLedger()` into `index.html` | ⬜ the debt the reversal creates |

## Decisions made (and why) — superseded 2026-08-14, kept for the reasoning

**`apps/review/` is the surviving app.** It is already named the active front-end, it carries the
live GL engine, and phases 1–3 put the converged design system in it. The dashboard's screens move
*into* it, not the reverse.

**The review platform's live engine is the single source of numbers; the dashboard's baked GL
snapshot does not survive the merge.** This is the one genuinely contested call, so the reasoning
matters:

- `packages/core/tools/emit_enterprise_gl.mjs` serialises a validated GL snapshot *into* the
  dashboard's HTML at build time. That was the right design for an illustrative dashboard with no
  engine of its own.
- `apps/review/` computes from `glLedger()` — a built-from-spec ~152-account REIT chart that foots
  (A = L + E via cash-plug and retained earnings), with every taxonomy derived from it.
- Carrying both into one app would put **two sources of the same numbers** in one product, which is
  precisely what the repo-wide rule *"numbers derive, never duplicate"* exists to prevent. Two GL
  representations that drift is the `RECON_SCALE` failure at a larger scale.

So: the emit pipeline stays useful as **core's validation and feed path into the one engine** — it
keeps proving a snapshot is GAAP-valid — but it stops writing a second dataset into a page. Any
dashboard screen that reads the baked snapshot is re-pointed at `glLedger()` as it moves.

**Nothing merges until it renders on the converged system.** A screen arrives already speaking the
ramp, the job-named type scale and the graphite chrome. Moving a screen and *then* restyling it
means a window where the product is visibly two products, which is what this whole effort is
removing.

## Sequence

Ordered by risk, lowest first. Each step is independently shippable and independently revertable.

1. **Inventory.** ✅ Done — see below.
2. **Port the shell, not the screens.** `apps/review/` already has the ribbon, the rail, the global
   panels and the page-header pattern. Any dashboard screen that arrives must drop its own chrome and
   adopt these. Confirm there is nothing in the dashboard's shell worth keeping first; if there is,
   it moves in phase 3b as a component, not as part of a screen.
3. **Move the leaf screens** — the ones with no equivalent and no baked-snapshot dependency. Lowest
   risk, and they prove the pipeline end to end.
4. **Re-point the snapshot readers.** For each remaining screen, replace baked-snapshot reads with
   `glLedger()`. Expect the numbers to *change* where the snapshot and the engine disagree — that
   divergence is a finding worth surfacing, not a bug to paper over.
5. **Reconcile the duplicates.** Screens that exist in both apps: pick one, delete the other, record
   why in the surviving app's `CLAUDE.md`.
6. **Retire `apps/dashboard/`** to `archive/` once nothing references it. Update the root
   `CLAUDE.md` map and `emit_enterprise_gl.mjs`'s target in the same change.

## Inventory (measured 2026-08-10)

`apps/dashboard/` renders **59 views**, all `<div class="view" id="view-*">`:

> lifecycle · pis · vendors · consol · budget · forecast · trend · pivot · po · ppe · tb · finrep ·
> filing · cip · caplife · caplabor · fpexec · fplrp · fpcash · fpwork · fpdriver · fpmgmt · glintel ·
> acctclose · acctover · icomp · contclose · mywork · approvals · exceptions · activity · documents ·
> dataroom · drover · drreq · drevid · drwork · drext · dgover · **egl** · controls · glover · glfin ·
> glact · gltrend · glrecon · glclose · glreports · glsync · fdash · fxbrl · freports · findex ·
> fdetail · tasks · issues · archives · admin · traceexc

**The baked GL snapshot is read by exactly one of them.** `window.EGL_DATA` has two references in the
whole file: the emitted `<script id="egl-data">` tag and `eglData()`, which serves `view-egl` alone.
This is much narrower than assumed when the plan was written — step 4 below is **one screen**, not a
sweep. Everything else computes its own figures or is illustrative.

**Rough grouping, for sequencing:**

- **Capital lifecycle** (lifecycle, pis, cip, caplife, caplabor, ppe) — the CIP → PIS wedge, the
  product thesis. No equivalent in `apps/review/`. Highest value to move, so it goes *last*, once
  the pipeline is proven.
- **Overlaps with `apps/review/`** (tb, controls, approvals, exceptions, activity, tasks, issues,
  acctclose, acctover, contclose, glrecon, glclose, mywork) — these are **reconciliations**, not
  moves. Pick one implementation per screen; the review platform's version usually wins because it
  is already on the converged system and reads the live engine.
- **Financial planning** (fpexec, fplrp, fpcash, fpwork, fpdriver, fpmgmt, budget, forecast) —
  ⚠️ **out of scope by the product thesis**, which names enterprise planning a deliberate non-goal.
  These do **not** move. Decide explicitly whether to archive or keep them dashboard-only; do not
  let them arrive by default just because they exist.
- **Reporting / filing** (finrep, filing, fxbrl, freports, findex, fdetail) — ⚠️ the thesis also
  excludes XBRL/EDGAR. Same treatment: an explicit call, not a default move.
- **Data room / evidence** (documents, dataroom, drover, drreq, drevid, drwork, drext, dgover) — a
  coherent block with a partial equivalent (Evidence Center). Move as a unit or not at all.
- **Leaf screens** (vendors, consol, trend, pivot, po, glintel, glover, glfin, glact, gltrend,
  glreports, glsync, icomp, fdash, archives, admin, traceexc, egl) — no equivalent, no blocker.
  **Start here** (step 3).

The two ⚠️ groups are ~14 of 59 views. That is the single biggest finding: a quarter of the
dashboard is outside the product thesis, and merging it wholesale would drag the surviving app into
scope the repo has explicitly ruled out. The merge is therefore **not** "move 59 screens" — it is
closer to "move ~18, reconcile ~13, and decide about ~14".

## Rules that hold throughout

- **The ERP is the system of record.** Nothing in this merge builds journal-entry creation,
  approval or posting.
- **AI narrates, never computes.** Any dashboard AI surface that arrives must cite an engine figure.
- **Prototypes stay single-file.** No build step, no external runtime dependencies.
- **Work incrementally.** No step in this plan requires rebuilding a screen that already works.

## Known traps

- `tools/check_chrome_themes.mjs` validates the **dashboard's** theme definitions. Once the dashboard
  is archived it validates nothing shipping — either re-point it at the surviving chrome or retire it
  with the app. Do not leave it green and meaningless.
- The dashboard declares its aliases on `html` and its dark ramp on `body`; a custom property resolves
  against the element it is *declared* on, so anything lifted from it wholesale can silently stay
  light in dark mode. `apps/review/` keeps both on `:root` deliberately.
- The dashboard's type scale is **px**; `apps/review/` deliberately kept **rem** so zoom and OS
  accessibility still scale. Ported components must be converted, not pasted.
