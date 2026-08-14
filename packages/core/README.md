# @korvyn/core

Canonical accounting model + integration boundary. Typed scaffold only — no
connectors, no sync engine, no persistence.

> **Status: verified.** Compiles clean under the strict config, and 78 tests
> exercise the invariants against the emitted `dist/`. Run `npm run check`.

## Running it

Node **is** installed on the build machine, but it is not on `PATH` —
`C:\Users\mitragiri\tools\node22\` (v22.23.1, npm bundled). Prepend it first, or
nothing below works and it looks like Node is missing:

```powershell
$env:Path = "C:\Users\mitragiri\tools\node22;$env:Path"
npm install
npm run check      # typecheck src + typecheck tests + tests + boundary
```

| Script | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over `src` |
| `npm run typecheck:test` | `tsc -p tsconfig.test.json` over `test` |
| `npm run build` | emits `dist/` |
| `npm test` | builds, then runs the suite |
| `npm run check` | all of the above, plus the boundary checker |

Tests are TypeScript run directly by Node 22's native type stripping, so there is
**no test framework and no transpiler** — `node:test` plus `node:assert` only. The
only devDependencies are `typescript` and `@types/node`.

They import from `dist/`, not `src/`, so the suite exercises the artifact a
consumer actually gets — and proves the ESM module graph resolves at runtime,
which is precisely what the explicit `.js` extensions exist to guarantee.

## The architectural rule

```
  integration/  ──────────►  domain/
   (adapters)     depends      (canonical model)
                   on

  domain/  ──X──►  integration/        FORBIDDEN
  domain/  ──X──►  any vendor SDK      FORBIDDEN
```

**Core logic depends only on the canonical model, never on an adapter or an
external schema. All external data enters through an adapter.**

Concretely, that means no file under `src/domain/` may import from
`src/integration/`, and no NetSuite / Intacct / Yardi / Procore / QuickBooks
field name may appear anywhere outside an adapter's private translation code.

The one place the domain acknowledges external systems is `JournalSource` on a
journal entry, which records *that* an entry was imported and by which connector
— as inert metadata. No core logic branches on it.

### Enforcing it

Right now the rule is convention plus code review. Once Node is available, make
it mechanical — a lint rule is far more reliable than vigilance:

```jsonc
// .eslintrc — eslint-plugin-import
"import/no-restricted-paths": ["error", {
  "zones": [{ "target": "./src/domain", "from": "./src/integration" }]
}]
```

## Layout

```
src/
  domain/                     canonical model — depends on nothing
    primitives.ts             branded ids, Money, Result
    account.ts                chart of accounts, type, normal balance
    entity.ts                 legal/reporting entity, consolidation attrs
    dimension.ts              flexible segments (cost code, project, dept, property)
    period.ts                 accounting period + open/closed state
    journal.ts                JournalEntry, JournalLine, ValidatedJournalEntry
    validation.ts             THE INVARIANTS (balance, period, references)
    capital.ts                capital-asset lifecycle: authorize → CIP → placed-in-service → depreciation
    index.ts
  integration/                the seam — may depend on domain
    adapter.ts                Adapter interface, capabilities, pull/push, auth
    mapping.ts                MappingConfig schema (type only, no engine)
    adapters/
      procore.adapter.ts      do-nothing stub proving the contract
    index.ts
  fixtures/                   sample data (NOT re-exported from the domain barrel)
    enterprise-gl.ts          multinational GL generator, validated + serialisable
  index.ts
tools/
  check_boundary.py           enforces the domain ← integration rule without Node
  emit_enterprise_gl.mjs      serialises the GL snapshot into the dashboard
```

## Invariants enforced

`validateJournalEntry(entry, ctx)` returns `Result<ValidatedJournalEntry, ValidationError[]>`
— **all** failures, not the first:

| Check | Code |
|---|---|
| At least two lines | `NO_LINES`, `SINGLE_LINE` |
| Debits equal credits, **per currency** | `UNBALANCED` |
| No zero-amount lines | `ZERO_AMOUNT_LINE` |
| Period exists and accepts postings | `PERIOD_NOT_FOUND`, `PERIOD_NOT_ACCEPTING_POSTINGS` |
| Posting date inside the period | `POSTING_DATE_OUTSIDE_PERIOD` |
| Account exists, active, postable, in entity scope | `ACCOUNT_*` |
| Entity exists and is active | `ENTITY_*` |
| Account's required dimensions present | `MISSING_REQUIRED_DIMENSION` |
| Dimension applies to that account type | `DIMENSION_NOT_APPLICABLE` |

## The capital-asset lifecycle

`capital.ts` models the quote-to-depreciation spine — one `CapitalProject` that
moves through six stages, gaining detail at each and becoming one or more
`AssetUnit`s when placed in service:

```
DRAFT  ─authorize→  AUTHORIZED  ─commit→  COMMITTED  ─spend→  INCURRING
       ─capitalize→  IN_CIP  ─placeInService→  IN_SERVICE
```

The two middle transitions are the product thesis — the ASC 360 / 835-20
capitalization and placed-in-service judgments — so they are the only ones behind
a validated gate. `approveCapitalization` and `approvePlacement` return
`Result<Approved…, DeterminationError[]>`, and `capitalize` / `placeInService`
accept **only the branded result**, so a project can never hold an un-approved
determination — the guarantee `ValidatedJournalEntry` gives a posting, applied to
a judgment.

| Gate | Load-bearing checks | Example codes |
|---|---|---|
| **capitalize** → `IN_CIP` | every cost classified, ≥1 capitalizable, single currency | `UNCLASSIFIED_COST`, `NO_CAPITALIZABLE_COST`, `FOREIGN_CURRENCY_COST` |
| **placeInService** → `IN_SERVICE` | **asset cost ties out to the CIP balance settled**; life / method / salvage sane | `SETTLEMENT_OUT_OF_BALANCE`, `ASSET_MISSING_LIFE`, `SALVAGE_EXCEEDS_COST` |

`SETTLEMENT_OUT_OF_BALANCE` is the crown-jewel invariant, in the same family as
the reconciliation tie-outs the rest of Korvyn rests on: the cost carried into the
fixed-asset register must equal the CIP balance being settled, or the gate
refuses. Everything else **derives** — `cipBalance`, `capitalizedTotal`,
`authorizationVariance` (a control that can fail), and depreciation
(`monthlyDepreciation` / `accumulatedDepreciationAt` / `netBookValueAt`,
straight-line and land, terminal balance pinned exactly to the depreciable base).
Provenance threads through `SourceRef.journalEntryId` on every commitment and
cost, so a depreciation dollar traces back to the AFE that authorized it.

**Deliberately the roadmap tail** (the rest of Acquire-to-Retire): impairment
(ASC 360-10), useful-life reassessment, and disposal / retirement. Depreciation is
a derivation, not a stored stage.

## The enterprise GL fixture

`fixtures/enterprise-gl.ts` generates a multinational general ledger entirely in
the canonical model — 6 legal entities across 4 functional currencies
(USD/GBP/EUR/SGD), a hierarchical ~90-account chart, intercompany due-to/due-from,
dimensioned postings, ~580 balanced journal entries. It is **provably** enterprise-
grade, not merely large: the test suite asserts every generated entry passes
`validateJournalEntry`, and every entity nets to zero in its own currency. It is
deterministic (`buildEnterpriseGL({ seed })`) and serialisable (`bigint` →
string).

`tools/emit_enterprise_gl.mjs` is the build-time bridge to the single-file main
file: it serialises a snapshot into `index.html`'s `<script id="egl-data">` block
(idempotent), where the **Enterprise GL** module (`view-egl`) renders it. This is
a snapshot, not a runtime dependency — the page still imports nothing. Re-pointed
2026-08-14 from `apps/dashboard/korvyn_dashboard.html`.

## Design tradeoffs

**Money is `bigint` minor units, never `number`.** A ledger that cannot sum to
exactly zero cannot enforce double-entry, and binary floats cannot. `bigint`
rather than safe-integer `number` because REIT-scale consolidation plus FX
intermediates erodes the 2^53 headroom faster than expected. Cost: does not
survive `JSON.stringify` — use `moneyToJSON`.

**One signed amount per line, not `debit`/`credit` fields.** Makes the balance
check a single sum to zero, and eliminates illegal states the two-field form
admits (both populated, both zero, both negative). Cost: debit/credit becomes a
presentation concern — see `debitAmount` / `creditAmount`.

**Balance is checked per currency, not in aggregate.** 100 USD debit against
100 EUR credit is not balanced, it is an unrecorded FX position.

**Entity lives on the line, not just the entry.** Intercompany entries touch
several entities in one document; one-entity-per-entry cannot represent
due-to/due-from faithfully.

**Normal balance is derived from account type, not stored.** Storing it lets the
two disagree, and a liability with a debit normal balance is a bug, not a config.

**Generic dimension registry, not named fields.** Named fields typecheck better,
but each new segment becomes a migration plus a change to every consumer — and
this domain grows segments constantly. Per-account `requiredDimensions` recovers
most of the lost safety.

**Three period states, not two.** `SOFT_CLOSED` is where most late audit
adjustments legitimately land. Collapsing it into `CLOSED` loses a real control.

**`ValidatedJournalEntry` is a branded type.** A persistence function can demand
one, making it a *compile* error to post something unvalidated. The only way to
obtain the brand is through the validator.

**`ValidationContext` is an interface, not a repository.** Keeps the domain free
of I/O and makes every rule testable with plain object literals.

**`MappingConfig` contains no functions.** It must be serialisable to a database
row, because per-customer field differences should be configuration a consultant
edits, not a deploy. The moment a closure appears in that file the design
collapses back into code.

**Capabilities are declared, not discovered.** Connectors differ wildly — Procore
has no chart of accounts worth pulling. Callers branch on data rather than
hard-coding vendor quirks.

## Deliberately not built

Sync engine, conflict resolution, scheduling, retry/backoff, persistence,
real API calls, the mapping *engine*, and any UI. The adapter is a pure
translator plus authenticated transport; everything orchestrational sits above it.

## What the first compile found

Worth recording, because the failure mode generalises.

`tsc` reported **29 errors**, which looked like 28 mechanical ones plus a real
type bug (`journal.ts:99 — Type 'number' is not assignable to type 'bigint'`).
It was actually **one** root cause: relative imports lacked the `.js` extensions
that `moduleResolution: NodeNext` requires. Because `journal.ts` could not
resolve `Money`, `amountMinor` degraded to an error type, and unary minus on an
error type falls back to `number`. Fixing the imports fixed the "bigint bug" too.

The lesson: **fix resolution errors before believing any type error downstream of
them.** A broken import poisons inference in files that are themselves correct.

## Next steps

1. ~~Install Node, typecheck~~ — done; `npm run check` is green.
2. ~~Unit tests for `validateJournalEntry`~~ — done, 78 tests (capital lifecycle + enterprise GL fixture).
3. Add the `import/no-restricted-paths` lint rule above, so the boundary is
   enforced by the toolchain and not only by `tools/check_boundary.py`.
4. Only then start a real connector.
