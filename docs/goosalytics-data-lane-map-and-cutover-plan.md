# Goosalytics Data Lane Map and Cutover Plan

## Status
Implementation planning artifact.

## Why this exists
The architecture decision is made in principle:
- Supabase/Postgres stays for OLTP + serving
- deep historical analytics and ML should not live on request-time serving paths
- Ask Goose and other user-facing analytical surfaces need curated serving tables

This doc turns that into a concrete repo-specific execution map.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** classify current data/query surfaces, identify serving-path violations, and define the first cutover plan
- **Proof required:** repo-specific lane map, freeze list, cutover targets, committed artifact
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Lane definitions

### Lane 1: Product-serving
User-facing, low-latency, operational product reads/writes.

Examples:
- dashboards
- current picks
- user picks CRUD/stats
- live odds board
- account/product state

### Lane 2: Ask Goose / AI-serving
Curated, user-facing analytical question answering.

Examples:
- Ask Goose query layer
- AI-ready summary tables
- constrained query surfaces for explanations and trend questions

### Lane 3: Analytics / ML / warehouse
Deep history, heavy joins, training, evaluation, wide scans, enrichment chains.

Examples:
- historical odds/result fact chains
- context-building view stacks
- backtests
- feature generation
- model evaluation

---

## Repo-specific lane map

## Lane 1: Product-serving surfaces

### Core NHL product rail
**Routes/modules**
- `src/app/api/dashboard/route.ts`
- `src/app/api/best-bets/route.ts`
- `src/app/api/trends/route.ts`
- `src/app/api/games/route.ts`
- `src/app/api/picks/route.ts`
- `src/lib/live-data.ts`
- `src/lib/picks-engine.ts`
- `src/lib/pick-history-store.ts`

**Primary backing surfaces**
- live provider modules (`nhl-api`, `odds-aggregator`, `nhl-stats-engine`, `nhl-team-trends`)
- `pick_history`
- `pick_slates`

**Risk**
- dashboard/best-bets/trends: low
- picks: medium

**Decision**
Keep in product-serving lane.
Do not mix with warehouse chains.

---

### MLB product rail
**Routes/modules**
- `src/app/api/mlb/dashboard/route.ts`
- `src/app/api/mlb/trends/route.ts`
- `src/app/api/mlb/picks/route.ts`
- `src/lib/mlb-live-data.ts`

**Primary backing surfaces**
- live MLB modules
- `pick_history`
- `pick_slates`

**Risk**
- dashboard/trends: low
- picks: medium

**Decision**
Keep in product-serving lane.

---

### NBA product rail
**Routes/modules**
- `src/app/api/nba/dashboard/route.ts`
- `src/app/api/nba/trends/route.ts`
- `src/app/api/nba/picks/route.ts`
- `src/lib/nba-live-data.ts`

**Primary backing surfaces**
- live NBA modules
- `pick_history`
- `pick_slates`

**Risk**
- dashboard/trends: low
- picks: medium

**Decision**
Keep in product-serving lane.

---

### Golf product rail
**Routes/modules**
- `src/app/api/golf/dashboard/route.ts`
- `src/app/api/golf/predictions/route.ts`
- `src/app/api/golf/picks/route.ts`
- `src/app/api/golf/leaderboard/route.ts`
- `src/lib/golf-live-data.ts`

**Primary backing surfaces**
- `datagolf-cache`
- `golf-api`
- `golf-odds`
- `pick_history`
- `pick_slates`

**Risk**
- dashboard/leaderboard: low
- picks/predictions: medium

**Decision**
Keep in product-serving lane.

---

### Odds board and snapshot rail
**Routes/modules**
- `src/app/api/odds/aggregated/route.ts`
- `src/app/api/odds/aggregated/snapshot/route.ts`
- `src/app/api/odds/aggregated/history/route.ts`
- `src/lib/odds-aggregator.ts`
- `src/lib/market-snapshot-store.ts`
- `src/lib/market-snapshot-history.ts`

**Primary backing surfaces**
- live aggregated odds
- `market_snapshots`
- `market_snapshot_events`
- `market_snapshot_prices`
- derived snapshot views:
  - `vw_market_openers`
  - `vw_market_closers`
  - `vw_market_line_movements`
  - `vw_market_source_coverage_daily`

**Risk**
- aggregated board: low
- snapshot/history: medium

**Decision**
Keep in product-serving lane, but constrain historical reads.
This rail needs a bounded serving contract, not open-ended raw historical table reads.

---

### User picks rail
**Routes/modules**
- `src/app/api/user-picks/route.ts`
- `src/app/api/user-picks/stats/route.ts`
- `src/app/api/user-picks/analytics/route.ts`
- `src/lib/user-picks-store.ts`
- `src/lib/user-picks-analytics.ts`
- `src/lib/canonical-picks-store.ts`

**Primary backing surfaces**
- `user_picks`
- `user_pick_stats`
- likely canonical picks support from `20260417220500_canonical_picks_warehouse.sql`

**Risk**
- CRUD/stats: low
- analytics: medium

**Decision**
Keep CRUD/stats in product-serving lane.
Audit analytics for live derivation creep.
If analytics is broadening, move it onto explicit serving summaries.

---

### Systems Goose rail
**Routes/modules**
- `src/app/api/systems/goose/route.ts`
- `src/app/api/systems/refresh/route.ts`
- `src/lib/systems-tracking-store.ts`
- relevant pages under `src/app/systems/**`

**Primary backing surfaces**
- `system_qualifiers`
- JSON/data state in `systems-tracking-store`
- market history via `market_snapshot_history`
- betting splits rails

**Risk**
- medium-high

**Decision**
This remains user-facing, but the dependency graph is too analytical.
Needs an explicit serving summary layer.

---

## Lane 2: Ask Goose / AI-serving surfaces

### Ask Goose query rail
**Routes/modules**
- `src/app/api/ask-goose/route.ts`
- `src/app/ask-goose/page.tsx`

**Backing surfaces**
- `ask_goose_query_layer_v1`
- `ask_goose_loader_source_cache_v1`
- `ask_goose_source_stage_v1`
- `refresh_ask_goose_source_stage_v1(...)`
- `refresh_ask_goose_query_layer_v1_batch(...)`

**Risk**
- high

**Decision**
Keep as AI-serving lane, but sever any request-time or fragile operational dependency on warehouse view chains.
Batch only.

---

### Goose model admin rail
**Routes/modules**
- `src/app/api/admin/goose-model/*`
- `src/lib/goose-model/store.ts`
- `src/lib/goose-model/generator.ts`
- feature modules in `src/lib/goose-model/*`

**Backing surfaces**
- `goose_model_picks`
- `goose_signal_weights`
- `system_qualifiers`
- `pick_history` ingestion paths

**Risk**
- medium

**Decision**
This is operational model/admin serving, not warehouse UI.
Keep on explicit tables.
Do not let feature generation creep into request-time admin paths.

---

### Goose2 shadow/training rail
**Routes/modules**
- `src/app/api/admin/goose2/*`
- `src/lib/goose2/repository.ts`
- `src/lib/goose2/shadow-pipeline.ts`
- `src/lib/goose2/training-audit.ts`
- `src/lib/goose2/warehouse-audit.ts`

**Backing surfaces**
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`
- `goose_feature_rows`
- `goose_decision_log`
- snapshot tables upstream

**Risk**
- medium

**Decision**
Treat as ML/AI ops lane with explicit table contract.
Not a user-facing product-serving dependency.

---

## Lane 3: Analytics / ML / warehouse surfaces

### Historical betting warehouse chain
**Defined mainly in**
- `supabase/migrations/20260420153000_market_snapshot_historical_warehouse.sql`
- `supabase/migrations/20260421200000_historical_gold_views_v1.sql`
- `supabase/migrations/20260421214000_historical_query_ready_refactor.sql`
- `supabase/migrations/20260421215500_historical_favorite_underdog_helpers.sql`

**Primary chain**
- `public.canonical_games`
- `public.dim_historical_games_v1`
- `public.fact_historical_market_sides_base_v1`
- `public.fact_historical_market_sides_support_v1`
- `public.fact_historical_market_sides_v1`
- `public.historical_market_results_enriched_v1`
- `public.historical_betting_markets_gold_v1`
- `public.historical_betting_markets_gold_graded_v1`
- `public.historical_betting_markets_query_v1`
- `public.historical_betting_markets_query_graded_v1`

**Decision**
Warehouse-only.
Never a request-time serving dependency.

---

### Historical trends context chain
**Defined mainly in**
- `supabase/migrations/20260421221500_historical_trends_context_layer.sql`
- `supabase/migrations/20260421223000_historical_pregame_record_context.sql`
- `supabase/migrations/20260421224500_historical_schedule_and_prev_game_context.sql`
- `supabase/migrations/20260421235500_prime_time_and_segment_market_hardening.sql`
- `supabase/migrations/20260422010000_rebuild_historical_view_chain_safe.sql`

**Primary chain**
- `public.historical_team_market_summary_v1`
- `public.historical_team_game_index_v1`
- `public.historical_team_pregame_record_context_v1`
- `public.historical_team_schedule_context_v1`
- `public.historical_team_previous_game_context_v1`
- `public.historical_shutout_context_v1`
- `public.historical_divisional_context_v1`
- `public.historical_prime_time_context_v1`
- `public.historical_segment_market_context_v1`
- `public.historical_trends_question_surface_v1`

**Decision**
Warehouse-only.
Never a request-time serving dependency.

---

### Ask Goose staging source chain
**Defined mainly in**
- `supabase/migrations/20260422000000_ask_goose_query_table_bootstrap.sql`
- `supabase/migrations/20260422001500_ask_goose_query_layer_loader.sql`
- `supabase/migrations/20260422011500_batch_loader_for_ask_goose.sql`
- `supabase/migrations/20260422013000_thin_loader_source_for_ask_goose.sql`
- `supabase/migrations/20260422100000_ask_goose_source_stage.sql`
- `supabase/migrations/20260422105500_fix_lean_loader_contract.sql`
- `supabase/migrations/20260422113000_materialize_ask_goose_loader_source.sql`
- `supabase/migrations/20260422150000_fix_ask_goose_timeout_chain.sql`

**Effective chain**
- `public.fact_historical_market_sides_base_v1`
- `public.historical_market_results_enriched_v1`
- `public.historical_trends_loader_source_v1`
- `public.ask_goose_loader_source_cache_v1`
- `public.ask_goose_source_stage_v1`
- `public.ask_goose_query_layer_v1`

**Decision**
The final AI-serving tables can stay in Postgres.
The upstream loader source must be treated as warehouse/batch-only.

---

### Market snapshot historical chain
**Defined in**
- `supabase/migrations/20260420153000_market_snapshot_historical_warehouse.sql`

**Objects**
- `public.market_snapshot_events`
- `public.market_snapshot_prices`
- `public.vw_market_openers`
- `public.vw_market_closers`
- `public.vw_market_line_movements`
- `public.vw_market_source_coverage_daily`

**Decision**
Hybrid rail.
Raw snapshot tables and large historical scans are analytical.
Recent, game-bounded, precomputed summaries can serve product.

---

## Serving-path violations and risk findings

## High-confidence risky request path
### Ask Goose
**Evidence**
- `src/app/api/ask-goose/route.ts`
- `src/app/ask-goose/page.tsx`
- depends on `ask_goose_query_layer_v1`
- that layer is fed by a batch/materialization chain rooted in historical analytical surfaces

**Assessment**
This is the clearest current serving-path pain point.
It is safer than directly querying deep views, but still anchored to a warehouse-derived chain that has already shown timeout symptoms.

---

## Medium-confidence risky request path
### Odds aggregated history
**Evidence**
- `src/app/api/odds/aggregated/history/route.ts`
- `src/lib/market-snapshot-history.ts`
- fallback reads from `market_snapshot_prices` ordered by `captured_at`, with broad historical shape

**Assessment**
Not as structurally dangerous as the historical trends chain, but a growth-risk request path as snapshot data expands.
Needs bounded serving slices.

---

## Medium-confidence risky internal/product path
### Systems Goose
**Evidence**
- `src/app/api/systems/goose/route.ts`
- `src/lib/systems-tracking-store.ts`
- pulls mixed qualifiers, market history, splits, JSON state

**Assessment**
User-facing system rail with analytical sprawl.
Needs serving summaries instead of live mixed dependency assembly.

---

## Freeze list
The following objects should be treated as **warehouse-only** and should not be introduced into request-time product paths.

### Freeze now
- `fact_historical_market_sides_base_v1`
- `fact_historical_market_sides_support_v1`
- `fact_historical_market_sides_v1`
- `historical_market_results_enriched_v1`
- `historical_betting_markets_gold_v1`
- `historical_betting_markets_gold_graded_v1`
- `historical_betting_markets_query_v1`
- `historical_betting_markets_query_graded_v1`
- `historical_team_market_summary_v1`
- `historical_team_game_index_v1`
- `historical_team_pregame_record_context_v1`
- `historical_team_schedule_context_v1`
- `historical_team_previous_game_context_v1`
- `historical_shutout_context_v1`
- `historical_divisional_context_v1`
- `historical_prime_time_context_v1`
- `historical_segment_market_context_v1`
- `historical_trends_question_surface_v1`
- `historical_trends_loader_source_v1`

### Conditional caution
- `market_snapshot_prices`
- `vw_market_openers`
- `vw_market_closers`
- `vw_market_line_movements`
- `vw_market_source_coverage_daily`

These can still support product if access is tightly bounded and precomputed, but they should not become broad scan surfaces in request-time flows.

---

## First replacement serving tables to build

## 1. Ask Goose serving rows
**Purpose**
Replace fragile dependence on broad historical loader chains with a narrow, indexed AI-serving table.

**Shape**
One row per queryable team/opponent/market/result slice with fields like:
- `league`
- `event_date`
- `team_name`
- `opponent_name`
- `market_type`
- `market_family`
- `market_scope`
- `side`
- `line`
- `odds`
- `graded`
- `result`
- `profit_units`
- `is_home_team_bet`
- `is_away_team_bet`
- `is_favorite`
- `is_underdog`
- selected contextual flags only if cheap and stable

**Rules**
- batch-built only
- explicit indexes
- no request-time upstream historical view execution

---

## 2. Ask Goose aggregate summary tables
**Purpose**
Support the most common structured questions without row scans.

**Priority aggregates**
- team x market summary
- team vs opponent summary
- favorite/underdog splits
- over/under summary
- recent-window summaries
- line bucket summary

**Rules**
- batch-built only
- query by template, not freeform warehouse scan

---

## 3. Systems Goose serving summary
**Purpose**
Flatten the mixed live/system/history dependency graph into one user-facing summary rail.

**Likely fields**
- system name
- current qualifier count
- recent performance summary
- current market context summary
- latest refresh timestamps
- status flags

---

## 4. Game-bounded odds history serving table or materialized slice
**Purpose**
Stop request-time rummaging through raw historical snapshot prices for product flows.

**Likely fields**
- `game_id`
- `sportsbook`
- `market_type`
- `line`
- `odds`
- `captured_at`
- precomputed movement markers if needed

**Rules**
- recent/game-bounded only
- index by `game_id`, `market_type`, `captured_at`
- old full history stays analytical

---

## 5. User picks analytics summary tables
**Purpose**
Prevent analytics endpoints from drifting into broad live derivation.

**Likely fields**
- user-level win/loss/push
- units
- ROI
- by sport/league/market/window

---

## First cutover order

## Cutover 1: Ask Goose
Why first:
- clearest timeout pain
- clearest analytical-serving mismatch
- already shows repeated refactor history around materialization and staged loading

Deliverables:
- final serving-table contract
- batch refresh path
- query template contract
- removal of fragile upstream request-time dependence

---

## Cutover 2: Systems Goose
Why second:
- user-facing
- mixed dependency graph
- likely to worsen as analytical context grows

Deliverables:
- serving summary table(s)
- bounded refresh cadence
- route reads only serving surfaces

---

## Cutover 3: Odds aggregated history
Why third:
- snapshot history is structurally valuable
- but raw historical reads will get slower with growth

Deliverables:
- bounded recent/game-centric history surface
- precomputed open/close/movement summaries where needed

---

## Cutover 4: User picks analytics
Why fourth:
- not the hottest fire
- but likely to accumulate derivation complexity

Deliverables:
- explicit analytics summary tables
- route contract with known SLA

---

## Cutover 5: Any future trend/AI routes
Rule:
No new user-facing analytical surface should be allowed to depend directly on the warehouse chain.
Serving tables first.

---

## What stays as-is for now
These surfaces are not the first emergency rebuild targets:
- `src/app/api/dashboard/route.ts`
- `src/app/api/best-bets/route.ts`
- `src/app/api/trends/route.ts`
- `src/app/api/mlb/*`
- `src/app/api/nba/*`
- `src/app/api/golf/*`
- `src/app/api/user-picks/route.ts`
- `src/app/api/user-picks/stats/route.ts`

They appear mostly live/operational and not directly tied to the heavy historical SQL chains identified in the migrations audit.

---

## Recommended next execution step
The first implementation artifact should be:

### Ask Goose serving contract v2
Define exactly:
- source of truth inputs
- batch refresh cadence
- final row schema
- summary table schema
- supported question patterns
- required indexes
- no-go upstream dependencies

That is the highest-leverage next move because it addresses the clearest pain while forcing the right architecture discipline.

---

## Final call
The repo is not universally broken.
The problem is concentrated:
- product/live rails are mostly fine
- historical analytical view chains are warehouse behavior living in the serving DB
- Ask Goose is the clearest symptom
- Systems Goose and odds-history rails are the next likely casualties if left untreated

So the plan is not “rewrite everything.”
The plan is:
1. freeze warehouse-only objects out of serving paths
2. build explicit serving tables for analytical user-facing features
3. keep Postgres for serving
4. move deep historical analytics and ML to a real warehouse lane
