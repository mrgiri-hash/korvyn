# CLAUDE.md — `korvyn-agent`

The server-side agentic LLM layer over Korvyn's graph — the full working guide is
**[`README.md`](README.md)**; read it before editing. This file is the load-bearing summary.

## What it is

A full agentic AI (not a chatbot) over a compact, deterministic port of the Meridian fixture
(`src/graph.ts`, `src/ledger.ts`). Uses the Claude API (`claude-opus-4-8`) with tool-calling:
streaming, multi-turn, and it **takes action** — it doesn't just answer. Kept a **separate package**
from `apps/` and `packages/core/` specifically so the LLM dependency and the API key live
server-side and neither of those is touched.

## The rules that must not break

- **It cannot break the ledger.** `post_to_ledger` exists but is refused by construction — posting
  needs a `HumanApproval` token whose branding Symbol is closure-private, so no agent code path can
  mint one. The ERP stays the system of record. Do not add a path that mints approval.
- **Grounded, or it says so.** Every figure must come from a tool result; if the graph can't answer
  it returns `not traceable: <reason>` and names what's missing. No LLM touches the numbers.
- **Tools self-register.** Each `src/tools/*.tool(s).ts` registers itself; add a file, import it in
  `src/tools/index.ts`, and the model can use it. No intent parsing — do not reintroduce a
  `parseIntent`-style dispatcher.
- **The API key never enters the repo.** Read from `ANTHROPIC_API_KEY`; `.env` is git-ignored; the
  code never handles the value. Do not log it, echo it, or write it to a file.

## Tools

**Read** — `trace` · `explain_variance` · `list_detections` · `reconciliation_status` ·
`close_status` · `intercompany_status` · `financial_statement` · `get_policy` · `list_entities`
· **Act** — `create_task` · `save_evidence` · `escalate` · `set_exception_state` · `audit_log`
· **Guardrail** — `post_to_ledger` (always refuses).

## Run

Node is installed but **not on `PATH`** — prepend it first (see [root CLAUDE.md](../../CLAUDE.md)).

```bash
npm install
cp .env.example .env      # paste your key from console.anthropic.com
npm run dryrun            # exercise ALL tools with NO API call (free)
npm run agent             # interactive multi-turn REPL (spends credits)
npm run serve             # serves the main file (../../index.html) + live agent at :8787
                          # REVIEW_UI_PATH overrides — point it at apps/review/index.html
                          # for the superseded review platform
```

`npm run serve` is the only way to get a **live** Ask Korvyn — a published claude.ai artifact can
never reach a model API (sandbox CSP), so the artifact only ever shows the deterministic fallback.

## Sloane reasoning service (2026-09-17)

`src/sloane/` is Korvyn's **Sloane API** — interpret · plan · narrate over a provider-neutral `SloaneLLMAdapter`
(`AnthropicSloaneAdapter`, `claude-opus-5`, structured output, strict re-validation; `MockLLMAdapter` declines so the
browser's deterministic engine answers). Mounted by `src/server.ts` at `/api/sloane/*`, same-origin only. **Since 2026-09-17 it orchestrates server-side**: `POST /api/sloane/turn` →
`SloaneOrchestrator` (context, interpretation, clarification, planning, permissions, READ-only tools over `@korvyn/core`'s GL,
grounding, traces). `/interpret` `/plan` `/narrate` return 410. `npm run sloane:test` · `npm run sloane:dryrun`. `npm run sloane:dryrun` (no spend) · `npm run sloane:demo` (scripted DEMO endpoint, not a provider). Full
record in the root CLAUDE.md, *SLOANE 2.0 PHASE 2*.

**Phase 3A (2026-09-17):** 88 governed READ tools across 12 domains over one population engine
(`governed.ts`), control objects (`controls.ts`), tool catalog (`toolset.ts`). The server book is `@korvyn/core`'s GL, not the
browser's. `npm run sloane:live-eval` spends credits. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3A*.

**Phase 3B (2026-09-17):** controlled Build + Act. PROPOSE tools (`actiontools.ts`) create ActionProposals; only
`POST /api/sloane/action` → `ActionEngine.decide()` executes a registered Action Service (`actions.ts`), after
confirmation, with re-checked permission, staleness, idempotency and audit. Governed actions are prepare-only.
Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3B*.

**Phase 3C (2026-09-17):** durable work store (`persistence/`, `node:sqlite`, `data/korvyn-work.db`), server-authoritative
workflow for reconciliations (both catalogs), flux, close and work objects; session-cookie auth and capability authorization
(`auth.ts`); domain APIs under `/api/work/*` (`workapi.ts`); append-only audit; STALE_PROPOSAL with refresh / regenerate /
cancel (no overwrite). Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 3C*.

**Phase 4A (2026-09-18):** Artifact Intelligence — real `.xlsx`/CSV generation from governed definitions (`src/sloane/artifacts/`:
`model` · `compose` · `renderer` (ExcelJS streaming behind `ExcelRenderer`, preset `KORVYN_FINANCIAL`) · `tieout` · `refine` · `engine`),
server-authoritative Flux explanations (`book.ts` `fluxExplanation` / `setFluxExplanation`) and versioned reconciliation balances
(`controls.ts` `reconBalance`), and a source feed for late ERP postings (`sourcefeed.ts`). `npx tsx src/sloane/artifacts/perf.ts` is the
synthetic scale harness. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 4A*.

**Phase 4B (2026-09-18):** generalized Artifact Intelligence — package types (close review, reconciliation, Flux, vendor support,
audit support, monthly financial, management review; PBC scaffold) composed from one section library (`artifacts/sections.ts`), NL package
refinement, derive/reuse, a validation model, the common artifact contract, save/archive/restore, job cancel (COMPLETED/CANCELLED) and
`ArtifactStorage` (`artifacts/storage.ts`). Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 4B*.

**Phase 5A (2026-09-18):** Audit / PBC intelligence — requests (NL, manual, CSV / TSV / XLSX upload; PDF needs review) become versioned
`PBC_REQUEST` records whose population, tie-out, selection matching, evidence and support gaps are derived from the one ledger
(`src/sloane/audit/pbc.ts`), Sloane tools and proposals (`audit/pbctools.ts`, `audit/pbcactions.ts`), a PBC_PACKAGE over the request,
and `/api/work/pbc/*`. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 5A*.

**Phase 6 (2026-09-18):** conversational runtime — `conversation.ts` (ConversationState, follow-up / deictic / correction
resolution, capability gaps, titles), routes SHORTCUT · DELIVERABLE · FOLLOW_UP · FAST · DEEP (+ NARRATE on Haiku), `POST /api/sloane/turn/stream`
(NDJSON), supersession, safe caches, `latency.ts` harness. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 6*.

**Phase 7 (2026-09-18):** the governed agent runtime — `agent/` (model · goals · graphs · runtime): goals become durable runs over validated task graphs, policy profiles chosen by Korvyn, checkpoints (confirmation, governed approval, external dependency), interventions, VERIFY before COMPLETED, `/api/sloane/agent/runs…`, `npm run sloane:live-agent`. The runtime never executes: every step goes through `agentValidate` / `agentExecute` / `decide`. Full record in the root CLAUDE.md, *SLOANE 2.0 PHASE 7*.

**Agent hardening (2026-09-18):** clarification checkpoints (`agent/ambiguity.ts`; a run waits in WAITING_FOR_USER and resumes the SAME run) and durable steering (`agent/steering.ts` → `AgentRuntime.steer`: ten steering types, `UserSteeringEvent`s, safe replan, constraints enforced in the policy gate). Also the conversational front door (`adapter.converse`, route CONVERSATION). Full record in the root CLAUDE.md.

**Phase 8A (2026-09-19):** the enterprise financial semantic layer — `semantic/` (model · graph · time · context · tools): a permission-filtered Financial Graph over the existing services (no graph store, no figures of its own), tenant-calendar period resolution, `ContextAssembler` (a capped neighbourhood attached to every model call via `modelContext`), 15 semantic READ tools with `semanticPlan` routing, and `scopeNamedBy` (a project is never a scope). Full record in the root CLAUDE.md.

**Phase 8B (2026-09-19):** the Universal Intent Resolver and the Dynamic Financial Canvas — `canvas/` (intent · canvas): a short request ("close", "flux", "CIP", "June") opens a canvas of sections composed from governed READ tools (each authorised like a planned step), role-aware priorities (new CFO dev role), conversational refinement kept on `SessionContext.canvas`, route `CANVAS`. Full record in the root CLAUDE.md.

**Phase 8C (2026-09-19):** the governed analysis — `analysis/` (model · query · edit · engine): one book-aware `AnalysisDefinition` edited conversationally (deterministic reader, then `adapter.analysisEdit`), executed server-side by `FinancialAnalysisQueryService` over `GovernedLedger.contribution`, cells identified by canonical row path § column id with a re-derivable `CellContext` and population; drill / explain / Flux / reconciliation / support on the same population; route `ANALYSIS` ahead of the canvas; `focus` forwarded by `/turn` and `/turn/stream`. Full record in the root CLAUDE.md.

**Phase 8C.1 (2026-09-19):** natural-language generalization — model-first analysis editing with a stated relation and the governed vocabulary, structured grid commands (`focus.command`), interpretation-driven planning, a scope check on every new analysis, and the evaluation harness (`eval/`: known + holdout + model-generated paraphrases; holdout 40% → 93%). Full record in the root CLAUDE.md.

**Phase 8C.2 (2026-09-19):** context control — the model proposes a `contextRelation`, target referent and ephemeral vs persistent operation; `analysis/context.ts` `governEdit` validates it against the analysis on screen (restriction vs new, sort vs drill vs rank, "the other X", clarification only when context cannot decide), `AnalysisStateHistory` powers Undo / Redo across analyses, and `TurnResponse.workspace` carries the active workspace title. `context.test.ts`; `npx tsx src/sloane/eval/context-eval.ts`. Full record in the root CLAUDE.md.

**Phase 8D (2026-09-19):** open-ended financial reasoning — an OBJECTIVE (conversational intent `INVESTIGATION`) starts a durable agent run of goal type `INVESTIGATE`: THINK (the model picks 1–3 governed READ calls from a relevance-ranked subset of ≤20, validated like any plan step) → observe (compact observations) → THINK … → SYNTHESIZE (findings labelled by kind and support; any figure no observation carried is rejected) → VERIFY → SUMMARIZE. `agent/investigate.ts` (budgets, capability classes D0–M4, escalation, cost), `adapter.agentStep/agentSynth` (stable schema so the prompt cache reads; clips over-long prose instead of rejecting), `investigate.test.ts`; `npx tsx src/sloane/eval/agent-eval.ts` (live, spends credits; appends `eval/agent-history.json` for cost regression). Full record in the root CLAUDE.md.

**Core Runtime V2, Phase 1 (2026-09-19):** a new conversational core BESIDE the orchestrator, behind
`SLOANE_RUNTIME_V2` (off by default; `sloane-serve-v2` is the launch config that turns it on). `src/sloane/v2/`:
`model` (the transcript / governed-state separation) · `conversation` (a DURABLE transcript, kind
`SLOANE_CONVERSATION`, six turns verbatim and deterministic compaction — **four turns since Phase 1.5**) · `tools`
(a STABLE per-actor core of 29 governed READ tools — the cacheable prefix — plus `open_analysis_grid`,
`start_investigation`, `ask_clarification`; **Phase 1.5 composes that core down to 11**) · `runtime` (`SloaneV2.turn`: load → build context once → one primary `adapter.reason()` call
with native tool use → re-authorized tools → answer, with no separate narration pass) · `ab` (the measured A/B,
`npm run sloane:v2-ab`, spends credits). v1 is untouched and still owns structured grid commands, grid selections
and agent steering. `v2.test.ts`. Full record, including the live measurements, in the root CLAUDE.md.

**Core Runtime V2, Phase 1.5 (2026-09-20):** efficiency + financial semantic intelligence, both measured.
`semantic/concepts.ts` (~40 FinancialConcepts with their chart mappings and a five-value status —
RESOLVED · **DEFAULTED** · AMBIGUOUS · NOT_HELD · UNKNOWN — so an ordinary term like OPEX is answered with
the professional reading AND the disclosure of which reading it used) and `semantic/concepttools.ts`
(`resolveFinancialConcept`, `resolveSubject`). The matcher is structural, not a dictionary: `&` reads as
"and", a light stem covers plurals / participles / -ise-ize, and a bounded Damerau-1 check covers one
slipped key — **nine regexes in the layer, not one of them a finance phrase**. `v2/compose.ts` collapses
the surface to six composed dispatchers (**32 tools → 11**, prefix 6,175 → 3,581 tokens) with §10 exposure
filtering preserved per actor. Two more cache breakpoints give incremental conversation caching; the answer
streams (`trace.firstTokenMs`); `ungrounded()` names any figure in the answer that no governed read
produced (`trace.ungroundedFigures`). Harnesses: `npm run sloane:v2-ab` (v1 vs v2, seven §32 turn
categories, TTFT), `npm run sloane:direct-vs-sloane` (125-prompt holdout, direct model vs Sloane —
**category B = 0**), `npm run sloane:v2-transcript` (the §18 window experiment). All spend credits. Full
record, including every live number, in the root CLAUDE.md.

**Core Runtime V2, Phase 2 (2026-09-20):** structural grounding, traceability and adaptive answers.
`v2/facts.ts` — the canonical `FinancialFact` (kind, measure, governed `displayValue`, sign read from the VALUE,
period/scope/book/basis/lens, source object ids, trace, supported drills, tie status), promotion from any
governed object's own facts (`factsFrom`, ONE place, no tool rewritten), and a per-conversation `FactRegistry`
bounded at 400 that evicts the least recently REFERENCED and rides in the existing `SLOANE_CONVERSATION`
record. `v2/respond.ts` — the `ResponseDefinition` and the TERMINAL `respond` tool (§22: the model's last
`tool_use` IS the answer, so no formatting pass and no extra call), typed assertions, causal-claim safety
(§20: an unsupported "because" is demoted to INFERENCE, never deleted; a governed DECOMPOSITION supports it),
adaptive rendering (DIRECT draws no headings) and the next steps read from the cited facts' own drills (§30).
**The model never types a company figure: it writes `{{FACT:id}}` and `renderFacts` substitutes the governed
value** — the only place an authoritative figure becomes text. `semantic/concepts.ts` gains
`naturalMeasure`/`measureIntent`/`resolveMeasure` (§13: the verb decides stock vs flow, so capex asked as spend
routes to `getAccountAnalysis`), `v2/compose.ts` gains measure-aware dispatch and business-language titles
(§28). The answer streams out of the `respond` tool input (`onToolInput` + `eager_input_streaming`), with each
complete reference resolved on the way past. `v2p2.test.ts`. Full record, including every live number, in the
root CLAUDE.md.

**Core Runtime V2, Phase 2.5 (2026-09-20):** grounded response performance. `v2/strategy.ts` — three response
strategies (`GROUNDED_DIRECT` · `GROUNDED_REASONING` · `AGENTIC_INVESTIGATION`, never named to a person),
eligibility, three deterministic composers (VALUE · BREAKDOWN · STATUS) that REUSE `ResponseDefinition` and
`renderResponse`, and the offer/drill table. The model declares `answerMode` on the read it asks for — **one
optional argument on every composed operation, no router and no phrase matching** — and Korvyn validates it
against what came back, so a governed lookup costs ONE model call and a clicked offer costs NONE. §29: a reader
whose visibility is limited is always WORDED, never composed. §16: a governed turn can no longer reach a person as
unstructured prose. `firstUsefulMs`, `strategy` and `workload` join the trace. `v2p25.test.ts`;
`npm run sloane:v2-smoke` (Tier 1, spends credits). Full record in the root CLAUDE.md.

**Core Runtime V2, Phase 2.6 (2026-09-20):** derived financial intelligence. `semantic/metrics.ts` — the
`DerivedMetricDefinition` catalogue (9 metrics, 7 calculable) that EXECUTES the formulas `semantic/concepts.ts` had
declared and nothing ever ran, over CANONICAL STATEMENT CONCEPTS rather than account codes, with a stated status
(GOVERNED · DEFAULTED · CANDIDATE · AMBIGUOUS · UNAVAILABLE) and a component bridge that foots. Two governed tools:
`calculateMetric` and `compareStatement`, the latter fixing the driver bug — `getIncomeStatement` emitted facts for
total revenue and net income ONLY, so "revenue was the only material mover" was the honest report of the only mover
the model could CITE. One composed operation (`getMetric`, 12 tools to 13) and two generic measure-word regexes,
neither naming a metric. `IncomeStatementResult.components` is now the ONE source the statement, every metric and
every ranked comparison read. `v2p26.test.ts`. Full record in the root CLAUDE.md.

**Core Runtime V2, Phase 2.6.1 (2026-09-20):** consolidation-consistent analytical populations. The elimination
rule left `incomeStatement()` — where it was hard-coded to one entity pair and invisible to every other service —
and became ONE predicate in the consolidation layer: `financials.ts` declares `IntercompanyRelationship`
(parties, matcher, and the statement `sections` it eliminates in) and `eliminatesIn`; `governed.ts` exposes
`covers()` and `consolidation(treatment, covered)`, read by `match()`, `balanceUsd()` and `analysis/query.ts`, so
a statement line and the accounts beneath it are ONE economic population. `EliminationTreatment` keeps the
pre-elimination and eliminations-only views reachable and `source = consolidated + eliminations` holds.
`FinancialFact.eliminationTreatment` travels the treatment (§13) and `populationMismatch()` refuses a claim that
compares two populations (§12, period excepted). `compareStatement` publishes `detailReconciles` — the check that
was missing, not a caveat (§8/§15) — and `consolidationFact(section)` answers "does this include eliminations?"
from the declared relationships on the income statement, the balance sheet and the account drill (§14). The
balance-sheet relationship is declared and deliberately NOT eliminated: the two sides do not match on this book
and netting them buried a $6.18M control finding in the translation residual. `v2p261.test.ts` (15);
`npm run sloane:v2-smoke` gains a consolidation case. Full record in the root CLAUDE.md.

**Core Runtime V2, Phase 3 (2026-09-20):** conversation-first. `respond` is RETIRED from the surface — the model
answers by WRITING, on the call it was going to spend anyway, and `v2/respond.ts` `fromProse()` turns that into
the same `ResponseDefinition` everything downstream reads (one path, two authors; three prose branches collapsed
to one). `renderResponse` draws NO section label at all; the assertion type survives on each part. `show_list` is
the one optional presentation (`Presentation` = NONE | COMPACT_LIST, emitted alongside the text, marked
`parts[].row` so the browser draws rows rather than one-line paragraphs). Phase 2.5's forced composition is
reversed: Korvyn composes only when withholding leaves nothing publishable. Grounding is unchanged and its
checks are sharper — a sentence whose figure Korvyn can find nowhere is withheld and NAMED (`withheldFigures`),
§16 asks the fact registry rather than "did a tool run this turn", and `internalVocabulary()` measures both a
Korvyn constant and a sentence about the plumbing. At the source: `statusWords()` and `blockerKind()` stop a raw
enum being a `display`, `closeBlockers()` carries the owner and reviewer its own record names, and a
reconciliation that does not tie carries the amount it is out by. Harnesses: `npm run sloane:v2-conv` (the
brief's own conversations, answer length / headings / artifacts) and `npm run sloane:style` (§40, direct Claude
vs Sloane on 25 unseen questions, with a contamination guard). Both spend credits. `v2p3.test.ts`. Full record,
including every live number, in the root CLAUDE.md.

**Runtime V3 (2026-09-20):** conversation-first, after an audit found the artifact/conversation coupling in the
BROWSER, not the server. `TurnResponse` gains `presentation` (NONE | LIST | TABLE, **null by default** — a TABLE
names one object read THIS turn) and `diagnostics` (§11: grounding findings never reach a person; `notes` is only
what a finance professional needs told). `show` replaces `show_list` as the one presentation declaration — a
SHAPE, never a screen (§40) — decided by one question: did they ask to SEE something, or ask a QUESTION. In
`index.html`, `s2ServerRender0`'s default branch no longer takes its heading from the first tool object nor draws
every object as a table; `s2PresHTML` is the single place an object becomes visible, and `SL_CHAT` is a chat
thread so an ordinary question no longer creates an Investigation (`SL_INV` and its 45 readers untouched — a
workspace answer still opens one). `publish()` splits resolved parts once into message and rows, so a row cannot
draw twice or reach the screen as `{{FACT:…}}`. `statusWords()` keeps a raw enum out of a governed `display`.
Verified by an eight-turn browser acceptance run and three screenshots, not by tests alone. Full record in the
root CLAUDE.md, *SLOANE RUNTIME V3*.

**A8 (2026-09-24):** governed object resolution + referent verification. `src/sloane/v2/resolve.ts` — hard constraints
FILTER (an entity, an id, a period, a book, a basis, a lens, and the object KIND the request names) and soft signals only
ORDER what survives; a module anchor (`session.anchor`, stated by the surface) and the conversation's own object
(`session.object`) hold unless the request names another object with HIGH confidence; two materially different candidates
ask rather than pick, and a request that names NOTHING stays in context; nothing found is said, never answered with the
broader object. Post-retrieval verification: a turn that resolved an object must have READ it, on the conversational path
and, via the investigation anchor, on the agent path. `KorvynTrace.resolution` and
`SloaneExecutionTrace.referentResolution`; seven eval checks in `eval/agent/checks.ts`. `a8.test.ts`;
`npm run sloane:a8-live` (spends credits). Full record in the root CLAUDE.md, *A8*.

**Phase 3D (2026-09-17):** one book — Flux comments (keyed by FS lines), reconciliation workflow, close task status and saved
reports are read and written by the workspace and Sloane through the same store (`book.ts`, seeded from `browser-book.json` by
`tools/extract-browser-book.mjs`). Session hardening: HttpOnly SameSite cookie, per-session CSRF token (`X-Korvyn-CSRF`), Origin check,
allowed-origin CORS, logout; authorization before validation; a standard `outcome` contract. Full record in the root CLAUDE.md,
*SLOANE 2.0 PHASE 3D*.
