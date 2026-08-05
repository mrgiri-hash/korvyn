# korvyn-review

The **Financial Review Platform** — Korvyn's reviews-first workspace. A separate front-end
from the original three pieces (`apps/dashboard/korvyn_dashboard.html`, `packages/core/`, `packages/agent/`);
it reuses their **design language** but not their layout.

The organizing idea: the unit of work is a **Financial Review Package** (Operating Expense,
Cash, Revenue, Fixed Asset, CIP, Debt, Lease, AP…), not a module. The home answers *"what
reviews need me today?"* and every review opens a consistent 12-section workspace
(Executive Summary · AI Analysis · Trend · Reconciliation · Transaction Drilldown ·
Workpapers · Supporting Evidence · Journal Entries · Discussion · Review History ·
Approvals · Audit Readiness).

## Files

| File | What it is |
|---|---|
| `index.html` | The platform. Self-contained (inlined Korvyn wordmark + tokens). Operating Expense and Revenue reviews are wired **live** to an embedded GL trending engine (interactive chart, materiality-flagged variance table, transaction drill-down, derived exec + AI). Other reviews show honest "connects as we go" stubs naming their real engine. |
| `mocks/gl-trending-review.html` | Standalone earlier prototype: one review package end-to-end — customizable MoM/QoQ trending, data-vintage versioning, evidence attach, comments, and Approve-&-freeze immutable versions. Kept as a reference. |

## Running it with the live agent (the full chatbot)

`index.html` opens on its own in a browser (the **Ask Korvyn** panel then falls back to a
grounded, deterministic engine that still cites its source). To make Ask Korvyn a
**full-fledged agentic chatbot**, run [`korvyn-agent`](../../packages/agent), which serves this
UI and the streaming LLM agent on one origin:

```bash
cd ../../packages/agent
cp .env.example .env      # add ANTHROPIC_API_KEY
npm install
npm run serve             # → http://localhost:8787  (serves ../korvyn-review/index.html + POST /ask)
```

Open **http://localhost:8787** and the panel connects to the live agent
(`claude-opus-4-8`, tool-calling, streaming). Point the agent elsewhere with
`REVIEW_UI_PATH` if this folder moves.

## Design & data notes

- Reuses Korvyn's **graphite chrome + neutral ramp + one cobalt accent + muted status**
  (green never dominates); light + dark. Categorical chart palette
  `#2F62D4,#0E9AA6,#7C4DD6,#C24D8A,#B8722E` (colorblind-validated in both modes).
- **AI narrates, never computes a number** — every figure comes from the engine; the AI
  layer only explains and cites.
- Sample data is a fictional data-center REIT (Meridian). No backend, no persistence yet;
  the production path stands this on [`korvyn-core`](../../packages/core).

## Not a claude.ai artifact

A published claude.ai artifact cannot host or reach a live LLM (sandbox CSP blocks all
network calls; no model API is granted). The agentic chatbot therefore only runs here,
served by `korvyn-agent` — not from any artifact link.
