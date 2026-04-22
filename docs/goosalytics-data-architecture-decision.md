# Goosalytics Data Architecture Decision

## Status
Proposed by Magoo, implementation-ready recommendation.

## Why this doc exists
Goosalytics is trying to use one Supabase/Postgres system for three different jobs at once:
1. Product UI reads
2. Ask Goose / AI query features
3. Historical analytics + ML/training

That is the real problem. Not the raw database size.

A 40GB Postgres database is fine. A 40GB Postgres database serving low-latency UI, exploratory AI reads, and warehouse-style historical scans on the same live query path is how you get timeouts, bad plans, and bullshit latency.

## My opinion
We should **not** blow up the stack and replace Supabase.
We should also **not** keep pretending one live relational serving path can do everything.

The right move is:
- keep **Supabase/Postgres as OLTP + system of record**
- create **derived serving tables in Postgres** for product UI and Ask Goose
- move **deep historical analytics / ML / long-range scans** onto a separate warehouse path
- treat AI retrieval as a curated query layer, not raw NL-to-SQL over giant historical views

That is the architecture I recommend and can implement in phases.

---

## Executive decision

### Keep in Supabase/Postgres
Use Supabase for:
- auth, users, subscriptions
- current app/product state
- user picks, pick history, account-level product reads
- Goose model operational tables
- market snapshot ingestion / recent operational history
- precomputed read models for UI
- precomputed Ask Goose query tables

### Move out of the live serving path
Do **not** let these sit on live product-serving view chains:
- long-range historical trend scans
- warehouse-style joins over odds snapshots + results + context
- model training / feature generation over broad history
- exploratory AI questions that require full historical scans

### Create a warehouse lane
Use a separate analytics store for:
- historical fact tables
- wide scans across seasons/leagues
- backtests
- model feature generation
- offline trend mining
- long-window comparative analytics

This can be implemented with one of these realistic choices:
- Postgres read replica + explicit analytical schemas as a transitional step
- ClickHouse for event-heavy analytical workloads
- BigQuery if we want low-ops batch analytics and easy long-range scans
- Snowflake only if the org becomes materially more data-heavy and enterprise process-y, which is not where we are right now

### My actual recommendation
**Phase 1 and 2:** stay on Supabase/Postgres for product + derived serving tables
**Phase 3:** add a real warehouse lane for deep history and ML

If forced to choose today, my recommendation is:
- **Supabase/Postgres** for OLTP + serving
- **BigQuery or ClickHouse** for analytical warehouse

If we want lowest operational friction: **BigQuery**
If we want highest performance for event/time-series analytical queries and we are willing to own a little more infra complexity: **ClickHouse**

For Goosalytics right now, I lean **BigQuery first** unless we know we need ultra-fast repeated analytical slicing at very high scale very soon.

---

## What the current repo already tells us

Observed patterns from repo structure:
- lots of product API surfaces under `src/app/api/*`
- Ask Goose sits on top of custom query-layer tables/functions
- historical warehouse logic is being built via increasingly deep migration-defined views
- repeated work exists around:
  - `historical_trends_loader_source_v1`
  - `fact_historical_market_sides_base_v1`
  - `historical_market_results_enriched_v1`
  - Ask Goose stage/query/cache tables
- Goose model rails (`goose_model_picks`, `system_qualifiers`, market snapshots) already live in the same database universe

That is enough to form a strong view:
**the architecture is trying to evolve warehouse behavior inside the same live serving Postgres path.**
That can work for a while, but it is already starting to crack.

---

## Target architecture

## Lane 1: Product-serving OLTP
Purpose:
- power the website/app
- serve user-facing pages fast and predictably

Technology:
- Supabase/Postgres

Should contain:
- users, auth, subscriptions
- user picks, pick history
- current operational system tables
- recent market snapshots needed for product flows
- app state and transactional writes
- read-optimized product tables

Rules:
- UI routes must query **read-optimized serving tables**
- UI routes must **not** query layered historical live views
- all UI queries should be selective, paginated, and indexed

Examples of what UI should query:
- dashboard summary tables
- league/team/player trend summary tables
- precomputed standings/matchup context tables
- my-picks result summary tables
- cached or denormalized recent odds views

---

## Lane 2: Ask Goose / AI-serving layer
Purpose:
- let Ask Goose answer structured betting questions quickly and honestly

Technology:
- still in Supabase/Postgres for now
- optional semantic retrieval/search adjunct later

Should contain:
- curated Ask Goose query tables
- denormalized stat/result rows built for searchability
- sample-size-ready summary tables
- optional metric dictionary/entity mapping layer

Rules:
- Ask Goose should **not** hit raw warehouse views directly
- Ask Goose should **not** freeform NL-to-SQL across giant base tables
- Ask Goose should query:
  1. a router/classifier layer
  2. curated query tables
  3. precomputed aggregates where possible

Recommended shape:
- `ask_goose_query_layer_v1` or successor becomes a **true serving table**, not just the end of a fragile live-view chain
- the loader for this table should read from a controlled batch process, not from live REST over heavyweight views
- question parsing should map to supported query patterns, not arbitrary SQL generation

What Ask Goose should answer from:
- indexed query tables by league, team, opponent, market family, market type, event date, result, graded, profit
- optional summary tables like:
  - team x market summary
  - team vs opponent summary
  - line bucket performance
  - favorite/underdog splits
  - recent form windows

What Ask Goose should not do:
- compute expensive joins on request
- scan all historical prices every question
- treat the production DB like a BI engine

---

## Lane 3: Analytics / ML / historical warehouse
Purpose:
- backtests
- feature generation
- season-over-season analysis
- model research
- long-window trend mining
- historical odds normalization and joins

Technology:
- separate warehouse lane

Should contain:
- historical fact tables
- canonical event/game entities
- normalized odds history
- enriched results tables
- model training feature tables
- long-window aggregates

Rules:
- this lane is allowed to scan broadly
- this lane is allowed to run heavy joins
- this lane should not sit behind user-facing request timeouts
- this lane should publish derived outputs back to serving tables, not serve the live app directly

Recommended outputs back into serving world:
- feature summaries
- precomputed trend slices
- leaderboard/ROI summaries
- model-ready aggregates
- Ask Goose serving tables

---

## Practical system contract

### Source of truth
Supabase/Postgres remains the operational source of truth.

### Data flow
1. Operational data lands in Postgres
2. ETL/ELT job copies or publishes relevant historical/analytical data into warehouse
3. Warehouse computes heavy joins, feature tables, long-range aggregates
4. Batch jobs write compact serving outputs back into Postgres serving tables
5. UI and Ask Goose query only serving tables

This is the key principle:
**compute heavy, serve light**

---

## What I recommend implementing

## Phase 1: Stop the bleeding in Postgres
Goal: stabilize product and Ask Goose without waiting on a full warehouse build.

### 1. Hard rule: no live heavy view chains for serving paths
Ban direct user-facing use of:
- `fact_historical_market_sides_base_v1`
- `historical_market_results_enriched_v1`
- `historical_trends_loader_source_v1`
- any multi-layer historical analytical view chain

These may exist temporarily for offline batch jobs only.

### 2. Create explicit serving tables
Build and maintain explicit read models for:
- trends page
- Ask Goose
- matchup summaries
- team market summaries
- line/market performance summaries
- player/team result summaries where needed

These should be:
- denormalized
- narrow enough to scan cheaply
- indexed for real filters
- refreshed in jobs, not in requests

### 3. Separate recent operational data from deep history
In Postgres:
- keep recent/hot data readily queryable
- archive or logically separate colder historical tables
- reduce temptation for product routes to pull full history on every request

### 4. Add query governance
Every product-facing route should declare:
- source table(s)
- expected row range
- required indexes
- pagination strategy
- SLA target

If a route depends on an analytical view stack, it fails review.

---

## Phase 2: Build the warehouse lane
Goal: create a real home for heavy analytics and ML.

### Recommended warehouse choice
**BigQuery** if we want fastest time to value and low operational overhead.

Why:
- good for append-heavy historical data
- excellent for batch analytics and large scans
- clean separation from product DB
- easy long-range SQL over large fact tables
- good fit for feature generation / trend mining / backtests

Alternative:
**ClickHouse** if we decide event/time-series analytics is so central that we want a more performance-first analytical engine and are willing to own more operational complexity.

### Warehouse schemas to create
Core datasets:
- `fact_market_prices`
- `fact_market_candidates`
- `fact_results`
- `dim_games`
- `dim_teams`
- `dim_players`
- `fact_model_predictions`
- `fact_user_pick_outcomes` if needed for analytics
- `feature_*` tables for ML
- `agg_*` tables for serving outputs

### Warehouse jobs
Jobs should own:
- historical normalization
- canonical entity resolution
- pregame context enrichment
- long-range aggregate generation
- Ask Goose source builds
- model feature builds

---

## Phase 3: Rebuild Ask Goose correctly
Goal: make Ask Goose actually useful and stable.

### Ask Goose target model
Pipeline:
1. intent classification
2. entity extraction
3. route to supported query type
4. query serving tables
5. return answer with proof, sample size, and caveats

### Supported query families
Examples:
- team performance by market type
- favorite/underdog splits
- over/under windows
- head-to-head market trends
- line bucket records
- recent form summaries
- ROI by team/market/window

### Ask Goose should use
- curated query tables
- summary aggregates
- constrained templates
- optional semantic/entity retrieval layer

### Ask Goose should not use
- raw open-ended SQL generation against full history
- live joins over huge normalized tables
- request-time heavy recomputation

---

## Table and partitioning guidance

## Postgres serving side
Use for:
- narrow serving tables
- recent operational rows
- user/account state

Guidance:
- prefer typed columns over deep JSON where filterable
- composite indexes should match actual app predicates
- add partial indexes where status/date windows dominate
- use append-friendly patterns for snapshot/event tables
- partition only when it materially helps operational management or dominant date-range access

Likely partition candidates if still in Postgres:
- large historical facts by `event_date` or season
- snapshot/event history by `captured_at` or date key

But don’t partition just for aesthetics. Partition because pruneable date windows are real.

## Warehouse side
Partition/cluster by:
- event date
- captured_at
- league/sport
- canonical game id
- market type

Warehouse tables should be optimized for:
- long-range scans
- batch joins
- aggregate generation
- model feature extraction

---

## Hot / warm / cold model

### Hot
- current slate
- recent snapshots
- current season summaries
- user-facing trends windows
- Ask Goose serving tables

Storage target:
- Postgres serving tables

### Warm
- current season history
- recent prior season slices
- commonly queried aggregates

Storage target:
- Postgres derived tables or warehouse aggregates copied back in

### Cold
- full raw archive
- full historical odds rows
- deep backtest datasets
- feature build history

Storage target:
- warehouse

This lets us stop treating every question as if it needs the full raw archive live.

---

## What I would not do
Do not:
- replace Supabase just because the DB hit 40GB
- let the UI keep querying live historical views
- keep stacking more views to patch over slow views
- let Ask Goose be freeform NL-to-SQL on raw historical data
- run ML/training scans on the same path as product requests
- pretend PostgREST is a warehouse query engine
- overcomplicate with vector DBs before the structured query contract is clean

Also do not jump straight into a massive migration before we define the serving contract. That’s how teams burn weeks and still keep the same bad query behavior.

---

## Recommended stack decision

## If we optimize for speed and minimal churn
- Supabase/Postgres stays
- derived serving tables in Postgres
- batch jobs populate serving tables
- defer warehouse split until product stability is restored

Good for immediate stabilization, but not enough long-term.

## If we optimize for the real product trajectory
- Supabase/Postgres for OLTP + serving
- BigQuery for analytics/ML warehouse
- curated serving-table pipeline back into Postgres
- Ask Goose on top of Postgres serving tables, not raw warehouse tables in request time

**This is my recommendation.**

---

## Implementation plan I can execute

## Step 1: classify every current data surface into a lane
Create a source-of-truth map for:
- UI-serving endpoints
- Ask Goose endpoints/tables/functions
- analytics/training jobs and tables

Output:
- every route/table assigned to one of: OLTP, AI-serving, warehouse

## Step 2: freeze bad patterns
Enforce a rule that no user-facing route can depend on the heavy historical live view chain.

Output:
- list of blocked data sources for serving paths

## Step 3: build proper serving tables
Implement explicit tables/jobs for:
- Ask Goose serving rows
- trends summaries
- matchup/team summary tables
- market and line bucket summaries

Output:
- fast Postgres query surfaces with known indexes

## Step 4: create the warehouse export/import contract
Define:
- what operational tables feed warehouse
- what aggregates/features come back to serving DB
- refresh cadence for each class

Output:
- clean ETL contract

## Step 5: stand up warehouse lane
Recommended first target: BigQuery.

Output:
- historical analytics path isolated from product serving

## Step 6: rebuild Ask Goose against curated surfaces
Replace the current fragile loader/view dependency with a supported serving model.

Output:
- Ask Goose that answers from indexed curated tables with proof-based outputs

---

## Immediate next actions
1. audit current product routes against data-source complexity
2. define the serving-table contract for Ask Goose and trends
3. stop relying on the historical live-view chain for request-time reads
4. design the warehouse export model
5. implement the first serving-table batch pipeline

---

## Final recommendation
My recommendation is:

- Keep Supabase/Postgres
- Stop using it as both app DB and live warehouse engine
- Build real serving tables for UI and Ask Goose
- Add a warehouse lane for deep history and ML
- Make Ask Goose query curated serving tables, not raw historical view chains

That is the solution I believe in, and it is also the one I can actually implement without wasting your time on a fake platform rewrite.
