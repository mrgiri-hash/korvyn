# korvyn-agent

A **full-fledged agentic AI** over Korvyn's graph — the API-backed successor to the dashboard's deterministic `parseIntent → ans*` stub. It uses the Claude API (`claude-opus-4-8`) with tool-calling: the model reasons over your question, calls the graph and workflow tools, composes them for requests nobody hand-coded, **and takes action** — it doesn't just answer, it does work.

Separate package from `apps/dashboard/korvyn_dashboard.html` (the prototype) and `korvyn-core` (the clean domain model), so the LLM dependency and the API key live server-side and neither of those is touched.

## What makes it "agentic", not a chatbot

- **Streaming, multi-turn** — answers stream token-by-token; the session remembers the conversation.
- **It does work.** Beyond answering, it can create tasks, save evidence, escalate, and move an exception through its lifecycle (New → Assigned → Escalated → Cleared → Dismissed). These are real side effects into Korvyn's own append-only stores.
- **It cannot break the ledger.** `post_to_ledger` exists but is refused by construction — posting requires a `HumanApproval` token whose branding Symbol is closure-private, so no agent code path can mint one. The ERP stays the system of record.
- **Grounded, or it says so.** Every figure must come from a tool result; if the graph can't answer it returns `not traceable: <reason>` and names what's missing. Each answer prints the tools it was `grounded in`.
- **Auto-wires new features.** Each tool self-registers (`src/tools/*.tool(s).ts`) — drop a file, import it in `src/tools/index.ts`, and the model can use it. No intent parsing.

## Tools

**Read** — `trace` · `explain_variance` · `list_detections` · `reconciliation_status` · `close_status` · `intercompany_status` · `financial_statement` · `get_policy` · `list_entities`

**Act** — `create_task` · `save_evidence` · `escalate` · `set_exception_state` · `audit_log`

**Guardrail** — `post_to_ledger` (always refuses)

The data they read (`src/graph.ts`, `src/ledger.ts`) is a compact, deterministic port of the Meridian Global Portfolio fixture. No LLM touches those numbers.

## Setup

```bash
cd packages/agent
npm install
cp .env.example .env      # paste your key from console.anthropic.com
```

`.env` is git-ignored — the key never enters the repo or the dashboard. The code reads `ANTHROPIC_API_KEY` from the environment and never handles the value.

## Run

```bash
npm run agent                                   # interactive, multi-turn REPL
npm run agent -- "what did Korvyn detect? escalate the biggest one to A. Okafor and create a task to chase it"
npm run dryrun                                  # exercise ALL tools with NO API call (free)
npm run serve                                   # full app: serves the review-platform UI + live agent at http://localhost:8787
```

### Full-fledged chatbot in the browser

`npm run serve` starts the HTTP bridge **and** serves the main file
(`../../index.html`; set `REVIEW_UI_PATH` to serve something else) at the same origin. Open
**http://localhost:8787** with your
`ANTHROPIC_API_KEY` set and the **Ask Korvyn** panel streams from the real agent —
one command, one URL, no CSP sandbox. (The published claude.ai artifact can only ever
show the grounded deterministic fallback: artifact CSP blocks all network calls and
grants no model API, so a live LLM chatbot must run here, not there.)

Try a multi-step ask: *"show me the balance sheet, explain the accrued-costs variance, then trace the biggest liability and tell me what's missing."*

## Cost

Metered per token — `claude-opus-4-8` is $5 / 1M input, $25 / 1M output. A test session is cents.

## Verified

- `npm run typecheck` — clean
- `npm run dryrun` — all 15 tools resolve; actions write to the stores; the lifecycle change is reflected; `post_to_ledger` is refused; the audit log captures the work. (No live API call — that needs your key and spends your credits; you run it.)

## Where it goes next

The tools read a fixture today. The path to production is to point each tool at real data — the ingestion/identity graph and the deterministic engines — and, when you want it embedded, run this as a small HTTP service the dashboard calls. The tool registry means each new capability is one file.
