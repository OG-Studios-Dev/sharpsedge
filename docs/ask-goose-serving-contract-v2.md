# Ask Goose Serving Contract v2

## Status
Implementation spec.

## Why this exists
Ask Goose is the first cutover target because it is the clearest example of analytical warehouse behavior leaking into a user-facing serving path.

The current architecture proves the point:
- `ask_goose_query_layer_v1` is an explicit serving table, which is the right direction
- but it is still fed by an upstream chain rooted in heavy historical analytical views
- that chain has already produced timeout-driven refactors

This document defines the next version of the Ask Goose serving contract so we can stop improvising and build the right thing.

---

## Terminal framing
- **Owner:** Magoo
- **Goal:** define the serving contract for Ask Goose v2 so implementation can proceed without further architecture ambiguity
- **Proof required:** repo artifact with schema, refresh strategy, query contract, banned dependencies, and build sequence
- **Last updated:** 2026-04-22
- **Status:** Done

---

## Product intent
Ask Goose is not supposed to be raw NL-to-SQL over warehouse views.
It is supposed to be a fast, honest, constrained betting research assistant that can answer structured questions like:
- how has Team X performed as a home favorite
- how have overs hit for Team X over the last N games
- how has Team X done against Team Y in a certain market
- how have road underdogs performed in a league/window

That means Ask Goose needs:
1. a constrained question grammar
2. curated structured data
3. precomputed summary tables for common query families
4. response logic that shows sample size, result mix, units, and caveats

It does **not** need direct access to the warehouse chain at request time.

---

## Contract principles

### 1. Batch only upstream
The upstream source build for Ask Goose v2 must be batch/materialized only.
No request-time execution of historical analytical view chains.

### 2. Serve from narrow indexed tables
The API should read from explicit serving tables whose schema matches question patterns.

### 3. Constrained question support
Ask Goose v2 should support defined structured query families first.
No open-ended arbitrary analytical computation path.

### 4. Honest outputs
Every answer should include:
- what slice was queried
- sample size
- W/L/P or equivalent result breakdown
- units / ROI where relevant
- window/league scope
- caveat when data is thin or unsupported

### 5. Warehouse-derived, not warehouse-dependent
Ask Goose may be fed from warehouse-grade pipelines.
It may not depend on warehouse objects at request time.

---

## Banned upstream dependencies
These objects are **not allowed** in request-time Ask Goose serving paths:

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
- `historical_trends_question_surface_v1`
- `historical_trends_loader_source_v1`

Allowed role for those objects:
- batch source only
- offline warehouse only
- staging/build jobs only

---

## Source-of-truth inputs
Ask Goose v2 should be built from a controlled batch input contract, not a sprawling implicit SQL chain.

## Required logical inputs
At build time, the Ask Goose pipeline needs rows that resolve to:
- sport
- league
- season
- event date
- canonical game/event id
- home team
- away team
- query team name
- opponent name
- market type
- market family
- market scope
- side
- line
- odds
- result
- graded
- profit units
- favorite/underdog flags
- home/away team bet flags

## Optional contextual inputs
Only include if stable and cheap enough to maintain:
- divisional flag
- prime time flag
- previous-game result
- days since previous game
- over/under related context

Rule:
Optional context must be justified by real question demand and stable source logic.
If it increases fragility, leave it out of v2.

---

## Supported question families for v2
These are the supported analytical question templates the data model should serve.

## Family 1: Team x market
Examples:
- How have the Leafs performed as favorites?
- How have the Lakers done on totals?
- How has Team X performed on moneyline?

Required filters:
- league
- team_name
- market_type or market_family

Output:
- sample size
- record
- hit rate
- units
- ROI

---

## Family 2: Team vs opponent
Examples:
- How have the Knicks done against the Celtics?
- How have overs hit in Oilers vs Flames?

Required filters:
- league
- team_name
- opponent_name
- optional market_type/family

Output:
- sample size
- record
- units
- recent window if requested

---

## Family 3: Favorite / underdog splits
Examples:
- How do road dogs perform in NHL?
- How has Team X done as a home favorite?

Required filters:
- league
- optional team_name
- favorite/underdog flags
- optional home/away flags

Output:
- sample size
- record
- units
- ROI

---

## Family 4: Over / under / spread / moneyline bucket questions
Examples:
- How have overs hit for Team X in the last 10?
- How has Team X done ATS as a road dog?

Required filters:
- league
- team_name
- market_type/family
- optional line bucket / recent window / role flags

Output:
- sample size
- record
- units

---

## Family 5: Recent window summaries
Examples:
- last 5
- last 10
- this season
- since date X

Required filters:
- supported only for defined windows

Output:
- bounded window metrics
- explicit caveat when sample is small

---

## Out of scope for v2
These should be rejected or answered with a narrow fallback:
- arbitrary why-style causal questions requiring narrative synthesis from warehouse joins
- unsupported derived metrics not explicitly modeled
- multi-hop open-ended comparisons across many entities with freeform aggregation
- long natural-language prompts pretending to be SQL analysts

If unsupported, Ask Goose should say so cleanly and offer supported query forms.

---

## Serving tables

## Table 1: `ask_goose_serving_rows_v2`
Purpose:
The core narrow row-level serving table for structured filters.

### Grain
One row per queryable historical betting outcome slice for a team/opponent/market result.

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
- `graded boolean not null`
- `result text`
- `profit_units numeric`
- `profit_dollars_10 numeric`
- `roi_on_10_flat numeric`
- `is_favorite boolean`
- `is_underdog boolean`
- `is_home_team_bet boolean`
- `is_away_team_bet boolean`
- `is_total_over_bet boolean`
- `is_total_under_bet boolean`
- `is_divisional_game boolean`
- `is_prime_time boolean`
- `segment_key text`
- `source_build_version text not null`
- `refreshed_at timestamptz not null`

### Notes
- Keep this table narrower than prior wide question surfaces.
- Do not keep adding analytical fields just because they exist upstream.
- Every field must justify itself against a supported question family.

### Index plan
Minimum indexes:
- `(league, event_date desc)`
- `(league, team_name, event_date desc)`
- `(league, opponent_name, event_date desc)`
- `(league, team_name, opponent_name, event_date desc)`
- `(league, market_type, event_date desc)`
- `(league, market_family, event_date desc)`
- `(league, team_name, market_type, event_date desc)`
- `(league, team_name, is_favorite, is_home_team_bet, event_date desc)`
- `(graded, result)`

Optional partial indexes if needed:
- graded-only slices
- league + market family + recent date windows

---

## Table 2: `ask_goose_summary_team_market_v2`
Purpose:
Precompute the most common team-by-market queries.

### Grain
One row per `(league, team_name, market_type, market_family, split_key, window_key)`

### Core columns
- `league`
- `team_name`
- `market_type`
- `market_family`
- `split_key`
- `window_key`
- `sample_size`
- `wins`
- `losses`
- `pushes`
- `hit_rate`
- `units`
- `roi`
- `last_event_date`
- `refreshed_at`

### Example split keys
- `all`
- `favorite`
- `underdog`
- `home`
- `away`
- `home_favorite`
- `road_dog`
- `over`
- `under`

### Example window keys
- `all_time_supported`
- `season_to_date`
- `last_5`
- `last_10`
- `last_20`

---

## Table 3: `ask_goose_summary_matchup_v2`
Purpose:
Precompute team-vs-opponent summaries.

### Grain
One row per `(league, team_name, opponent_name, market_type, split_key, window_key)`

### Core columns
- `league`
- `team_name`
- `opponent_name`
- `market_type`
- `split_key`
- `window_key`
- `sample_size`
- `wins`
- `losses`
- `pushes`
- `hit_rate`
- `units`
- `roi`
- `last_event_date`
- `refreshed_at`

---

## Table 4: `ask_goose_summary_market_bucket_v2`
Purpose:
Support favorite/underdog, side, and high-level market family questions without row scans.

### Grain
One row per `(league, market_type, split_key, window_key)`

### Example supported slices
- home favorites
- road underdogs
- overs
- unders
- moneyline favorites
- spread underdogs

---

## Refresh model

## Cadence
Recommended v2 cadence:
- nightly full refresh for supported historical horizon
- intra-day incremental refresh where new graded results land
- optional per-league refresh jobs if build window needs segmentation

## Refresh rules
- refresh jobs are batch only
- refresh jobs may read warehouse/batch objects
- API routes may read only final serving tables
- no on-demand user-triggered rebuild from warehouse sources

## Build phases
1. refresh or load controlled source stage
2. rebuild `ask_goose_serving_rows_v2`
3. rebuild aggregate summary tables
4. atomically swap or version if needed
5. update refresh metadata/logging

## Metadata to track
- build start/end time
- source watermark
- row counts inserted
- per-league row counts
- build version string
- failure state and reason

---

## API contract for `/api/ask-goose`

## Input model
The route should parse the question into:
- intent family
- league
- team
- opponent
- market type/family
- split flags
- requested window

If the question cannot be classified into a supported family, the route should reject gracefully.

## Query strategy
Order of preference:
1. summary tables
2. serving rows with bounded filters
3. reject unsupported question

The route should not invent SQL over warehouse objects.

## Output contract
Every response should include:
- normalized interpretation of the question
- sample size
- record
- hit rate if meaningful
- units / ROI if meaningful
- time/window scope
- data caveat if sample is small or unsupported
- supporting slice preview rows when useful

---

## Guardrails

## Sample-size guardrails
If sample size is below threshold, the response must say so clearly.
Recommended initial thresholds:
- under 5: very thin, caution language
- under 10: limited sample

## Unsupported query handling
If the user asks for something outside the supported grammar, respond with:
- what Ask Goose currently supports
- a suggested reformulation

## No hallucinated reasoning
Ask Goose must not claim causal explanations not supported by the query contract.
It is a grounded stats/query assistant first.

---

## Build sequence

## Phase 1: Spec alignment
- confirm supported question families
- confirm final v2 row schema
- confirm aggregate summary tables

## Phase 2: Schema implementation
- create v2 serving tables
- create indexes
- create build metadata table if needed

## Phase 3: Batch build pipeline
- create refresh job(s) for v2 rows and summaries
- ensure build reads batch-safe sources only
- ensure request path reads only v2 serving tables

## Phase 4: API rewrite
- update `/api/ask-goose` to use classifier + summary-first query path
- reject unsupported questions cleanly
- return normalized proof-based answers

## Phase 5: Validation
- verify refresh completes without timeout
- verify rows land
- verify indexes are hit on key queries
- verify representative Ask Goose prompts return grounded outputs

---

## Non-goals for v2
These are explicitly not first-pass requirements:
- freeform natural-language analytics over arbitrary warehouse history
- causal narrative generation from raw structured data
- vector-first architecture
- full RAG over every doc, note, and stat source
- perfect semantic coverage of every betting question

The goal of v2 is not to be magical.
The goal is to be fast, honest, and structurally sound.

---

## Final call
Ask Goose v2 should be built as a constrained AI-serving layer on top of narrow serving tables and precomputed summaries.

That means:
- warehouse logic stays upstream in batch
- serving tables stay narrow and indexed
- API logic stays structured
- unsupported questions get rejected cleanly
- answers are grounded and measurable

That is how we stop the timeout spiral and turn Ask Goose into a real product surface instead of a fragile analytical science project.