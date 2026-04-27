# Self-Hosted Ask Goose Roadmap

Last updated: 2026-04-27
Owner: Magoo
Status: Product roadmap + internal prototype track

## Product goal

Build a narrow, self-hosted Ask Goose chatbot path that can answer Goosalytics sports-betting research questions without relying on OpenAI/Claude API keys for app use.

This is **not** a plan to train a full general-purpose LLM from scratch. The safe product is a local Goose analyst that explains verified Goosalytics data.

## Non-negotiable safety rule

The local LLM is the narrator, not the brain.

The brain remains:
- Goosalytics database
- deterministic query layer
- betting rules
- scoring engine
- QA gates
- refusal logic
- final answer validation

The local model may only explain approved fact packets. It must not invent stats, odds, injuries, news, or picks.

## Production isolation rule

Build outside what is working today until QA and user testing approve moving anything toward production.

Default production Ask Goose behavior must remain unchanged unless an explicit feature flag/provider switch is enabled.

## Architecture

1. User asks Ask Goose a question.
2. Deterministic parser classifies league, market, side, date/sample intent, and unsupported conditions.
3. Goosalytics database returns exact rows and computed summary.
4. Safety layer builds an approved fact packet:
   - record
   - units
   - ROI
   - sample size
   - warnings
   - trust notes
   - evidence rows
5. Local LLM renders a concise explanation from that fact packet only.
6. Final validator rejects bad/missing JSON, unsupported claims, hallucinated numbers, or missing caveats.
7. If anything fails, Ask Goose falls back to deterministic database explanation.

## Phase 1 — Internal prototype

Goal: prove a local model can render acceptable Ask Goose explanations without an API key.

Initial runtime:
- Ollama on local/dev host
- Candidate models: Qwen 2.5/3 Instruct, Llama 3.1/3.2 8B, Mistral small instruct
- Use existing `/api/ask-goose` data layer
- Feature flag only: no public behavior change

Success gate:
- 50-100 canned questions pass
- zero critical hallucinations
- no fabricated odds/stats
- clear thin-sample caveats
- acceptable latency for internal use

## Phase 2 — Router and fact-packet hardening

Add or strengthen:
- intent classification
- supported/unsupported query map
- structured fact packet schema
- answer validator
- refusal templates
- trace logging
- deterministic fallback on every failure path

## Phase 3 — Shadow mode

For each production Ask Goose question:
- current answer remains user-visible
- local model answer is generated privately when enabled
- compare factual agreement, caveats, and latency
- log failures for QA

Success gate:
- 95%+ factual accuracy on supported questions
- 0 critical hallucinations in regression set
- stable latency and timeout behavior

## Phase 4 — Internal/admin beta

Expose only behind admin/internal toggle:
- visible beta label
- thumbs up/down
- report bad answer
- full answer trace retained
- fallback remains available

No public launch until Marco/user testing and QA approve.

## Phase 5 — Limited public rollout

Start only with low-risk query classes:
- historical trends
- records and sample summaries
- database-backed pick explanations
- unsupported-data refusals

Keep blocked initially:
- live pick generation
- injury/news-sensitive claims
- same-day odds confidence without verified odds
- personalized gambling advice

Rollout: 5% → 25% → 50% → default only if metrics remain clean.

## Phase 6 — Production hardening

Required before broad rollout:
- rate limits
- timeout fallback
- answer cache
- model versioning
- prompt/version logs
- QA dashboard
- daily regression suite
- rollback switch
- abuse protection
- cost/latency tracking
- user feedback loop

## Current implementation track

Start with optional Ollama explainer support controlled by env vars:

```bash
ASK_GOOSE_EXPLAINER_PROVIDER=ollama
ASK_GOOSE_LOCAL_MODEL=qwen2.5:7b-instruct
ASK_GOOSE_OLLAMA_URL=http://127.0.0.1:11434
```

If Ollama is unavailable, times out, or returns invalid JSON, Ask Goose must return the deterministic database explanation.

Default provider remains the existing behavior until explicitly changed.
