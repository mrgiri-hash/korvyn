# @korvyn/core

Canonical accounting model + integration boundary. Typed scaffold only — no
connectors, no sync engine, no persistence.

> **Status: UNVERIFIED.** This was authored on a machine with no Node toolchain,
> so it has never been compiled. Run `npm install && npm run typecheck` before
> trusting it. Expect to fix a small number of type errors; the shapes and the
> boundary are the deliverable, not a green build.

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
    index.ts
  integration/                the seam — may depend on domain
    adapter.ts                Adapter interface, capabilities, pull/push, auth
    mapping.ts                MappingConfig schema (type only, no engine)
    adapters/
      procore.adapter.ts      do-nothing stub proving the contract
    index.ts
  index.ts
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

## Next steps

1. Install Node ≥20, then `npm install && npm run typecheck`. Fix what it finds.
2. Add the `import/no-restricted-paths` lint rule above so the boundary is
   mechanically enforced.
3. Write unit tests for `validateJournalEntry` — it is pure and needs no mocks.
4. Only then start a real connector.
