# Ask Goose v2 Serving Table Contract

## Status
Serving contract draft for safe app-facing use.

## Purpose
Define the exact Supabase serving tables that Ask Goose v2 should read from after BigQuery batch computation.

This contract exists to keep the product fast and stable:
- BigQuery computes
- Supabase serves
- the app never depends on warehouse-style heavy chains at request time

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** lock the v2 Ask Goose serving-table contract before implementation
- **Proof required:** concrete table definitions, refresh contract, API-use contract, safety rules
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Core rule

**Ask Goose v2 must never query BigQuery directly at request time.**

User flow should be:
1. BigQuery computes batch outputs
2. batch writes compact serving rows back into Supabase
3. `/api/ask-goose` reads only serving tables in Supabase
4. UI renders from those serving tables only

That is the whole damn point.

---

## Problem with current state

Current Ask Goose chain is structurally wrong for product serving because it depends on warehouse-style analytical layers such as:
- `fact_historical_market_sides_base_v1`
- `historical_market_results_enriched_v1`
- `historical_trends_question_surface_v1`
- `historical_trends_loader_source_v1`
- `ask_goose_loader_source_cache_v1`
- `ask_goose_source_stage_v1`
- `ask_goose_query_layer_v1`

That path is too heavy, too fragile, and already proved it can time out.

---

## v2 serving model

Ask Goose v2 should use two classes of Supabase tables:

1. **detail serving rows**
2. **pre-aggregated summary tables**

The detail table gives evidence rows.
The summary tables give fast answer synthesis.

---

## Table 1: ask_goose_serving_rows_v2

### Purpose
Compact evidence-row table for direct Ask Goose answer support.

### Grain
One row per candidate historical market-side outcome that is eligible for Ask Goose querying.

### Required columns
- `candidate_id text primary key`
- `canonical_game_id text`
- `event_id text`
- `sport text not null`
- `league text not null`
- `season text`
- `event_date date not null`
- `home_team text not null`
- `away_team text not null`
- `team_name text not null`
- `opponent_name text not null`
- `team_role text`
- `market_type text not null`
- `submarket_type text`
- `market_family text`
- `market_scope text`
- `side text`
- `line numeric`
- `odds numeric`
- `sportsbook text`
- `is_home_team_bet boolean`
- `is_away_team_bet boolean`
- `is_total_over_bet boolean`
- `is_total_under_bet boolean`
- `is_favorite boolean`
- `is_underdog boolean`
- `is_divisional_game boolean`
- `is_prime_time boolean`
- `segment_key text`
- `graded boolean not null`
- `result text`
- `integrity_status text`
- `profit_units numeric`
- `profit_dollars_10 numeric`
- `roi_on_10_flat numeric`
- `sample_eligible boolean not null default true`
- `build_version text not null`
- `source_batch_id text not null`
- `refreshed_at timestamptz not null`

### Required indexes
- `(league, event_date desc)`
- `(league, team_name, event_date desc)`
- `(league, opponent_name, event_date desc)`
- `(league, market_type, market_family)`
- `(graded, result)`

### Serving rule
This table must be directly queryable by `/api/ask-goose` for evidence rows and answer support.

---

## Table 2: ask_goose_summary_team_market_v2

### Purpose
Fast summary table for team x market questions.

### Grain
One row per:
- league
- team
- market type
- split key
- window key

### Required columns
- `summary_key text primary key`
- `league text not null`
- `team_name text not null`
- `market_type text not null`
- `market_family text`
- `split_key text not null`
- `window_key text not null`
- `sample_size integer not null`
- `wins integer not null`
- `losses integer not null`
- `pushes integer not null`
- `hit_rate numeric`
- `units numeric`
- `roi numeric`
- `last_event_date date`
- `build_version text not null`
- `source_batch_id text not null`
- `refreshed_at timestamptz not null`

### Example split keys
- `all`
- `favorite`
- `underdog`
- `home`
- `away`
- `over`
- `under`
- `prime_time`
- `divisional`

### Example window keys
- `last_5`
- `last_10`
- `last_25`
- `season`
- `all_time_available`

### Required indexes
- `(league, team_name, market_type)`
- `(league, split_key, window_key)`

---

## Table 3: ask_goose_summary_matchup_v2

### Purpose
Fast summary table for team vs opponent questions.

### Grain
One row per:
- league
- team
- opponent
- market type
- split key
- window key

### Required columns
- `summary_key text primary key`
- `league text not null`
- `team_name text not null`
- `opponent_name text not null`
- `market_type text not null`
- `market_family text`
- `split_key text not null`
- `window_key text not null`
- `sample_size integer not null`
- `wins integer not null`
- `losses integer not null`
- `pushes integer not null`
- `hit_rate numeric`
- `units numeric`
- `roi numeric`
- `last_event_date date`
- `build_version text not null`
- `source_batch_id text not null`
- `refreshed_at timestamptz not null`

### Required indexes
- `(league, team_name, opponent_name, market_type)`
- `(league, opponent_name, team_name)`

---

## Table 4: ask_goose_summary_market_context_v2

### Purpose
Fast summary for broader market-context questions where user intent is not team-specific.

### Grain
One row per:
- league
- market type
- split key
- window key

### Required columns
- `summary_key text primary key`
- `league text not null`
- `market_type text not null`
- `market_family text`
- `split_key text not null`
- `window_key text not null`
- `sample_size integer not null`
- `wins integer not null`
- `losses integer not null`
- `pushes integer not null`
- `hit_rate numeric`
- `units numeric`
- `roi numeric`
- `last_event_date date`
- `build_version text not null`
- `source_batch_id text not null`
- `refreshed_at timestamptz not null`

### Required indexes
- `(league, market_type, split_key, window_key)`

---

## Refresh contract

### Batch direction
BigQuery -> Supabase

### Refresh mode
- full replace for first implementation is acceptable
- later move to league-scoped upsert/replace if needed

### Required batch guarantees
Every refresh job must stamp:
- `build_version`
- `source_batch_id`
- `refreshed_at`

That gives traceability and rollback context.

### Refresh ordering
1. build BigQuery query-ready layer
2. compute v2 detail rows
3. compute summary tables
4. write detail rows to Supabase
5. write summary tables to Supabase
6. validate counts and freshness
7. only then expose to app route

---

## API-use contract for `/api/ask-goose`

### Allowed reads
`/api/ask-goose` may read only:
- `ask_goose_serving_rows_v2`
- `ask_goose_summary_team_market_v2`
- `ask_goose_summary_matchup_v2`
- `ask_goose_summary_market_context_v2`

### Not allowed
`/api/ask-goose` must not read:
- BigQuery directly
- analytical warehouse views in Supabase
- request-time loader/stage/cache chains
- `historical_trends_question_surface_v1`
- `historical_trends_loader_source_v1`
- `ask_goose_source_stage_v1`
- `ask_goose_query_layer_v1`

If it does, we failed the architecture.

---

## Answer contract for Ask Goose v2

For betting-style questions, response builder should use summaries first, then evidence rows.

Every valid betting answer should try to include:
- interpreted scope
- sample size
- W-L-P
- hit rate
- units
- ROI
- recent supporting examples
- freshness stamp if useful

If sample size is too weak, say so.
No fake certainty.

---

## Non-betting / junk-query rule

Ask Goose v2 should reject or redirect:
- non-sports-betting questions
- nonsense text
- prompts with no parseable betting intent

That belongs in app/API logic, not in warehouse tables, but the contract matters because the route should not rummage blindly through detail rows just because a user typed garbage.

---

## Freshness rule

The route should expose stale-state honestly.
If `max(refreshed_at)` is older than acceptable threshold, the route should say data may be stale instead of pretending it's fresh.

---

## First implementation recommendation

Build these first, in order:
1. `ask_goose_serving_rows_v2`
2. `ask_goose_summary_team_market_v2`
3. `ask_goose_summary_matchup_v2`

The broader market-context summary can follow immediately after.
But those first three are enough to make the product meaningfully real.

---

## Final call
This contract is the architectural line that keeps Ask Goose usable.

BigQuery should do the heavy math once.
Supabase should serve compact, indexed, boring tables fast.
That is how we stop timing out and start acting like a product.