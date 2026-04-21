# Historical Gold Layer Source Mapping (2026-04-21)

Owner: Magoo  
Goal: turn the historical warehouse strategy into an executable field-by-field build handoff for the gold analytics layer.  
Proof required: explicit source-to-target mapping for each target layer, with exists/derived/missing status and phased build order.  
Last updated: 2026-04-21 19:36 America/Toronto

## Blunt verdict

The missing piece was real: we had warehouse rails, migrations, and strategy docs, but we did **not** yet have the exact source-to-target mapping artifact that says what each target field comes from and what still needs enrichment.

This doc is that handoff.

## Scope

This mapping covers the phased historical analytics build Marco described:

1. `dim_historical_games`
2. `fact_historical_market_sides`
3. results/profitability attachment
4. `historical_betting_markets_gold`

Primary source tables already present:
- `market_snapshot_events`
- `market_snapshot_prices`
- `canonical_games`
- `goose_market_events`
- `goose_market_candidates`
- `goose_market_results`

## Source inventory reality

### Already exists in schema

#### `market_snapshot_events`
Core event snapshot rail with:
- `sport`
- `game_id`
- `odds_api_event_id`
- `commence_time`
- `matchup`
- `home_team`
- `away_team`
- `captured_at`
- warehouse additions:
  - `canonical_game_id`
  - `source_event_id_kind`
  - `real_game_id`
  - `snapshot_game_id`
  - `coverage_flags`
  - `source_limited`

#### `market_snapshot_prices`
Core price snapshot rail with:
- `sport`
- `game_id`
- `odds_api_event_id`
- `commence_time`
- `captured_at`
- `book`
- `market_type`
- `outcome`
- `odds`
- `line`
- warehouse additions:
  - `canonical_game_id`
  - `canonical_market_key`
  - `participant_key`
  - `capture_window_phase`
  - `is_opening_candidate`
  - `is_closing_candidate`
  - `coverage_flags`
  - `source_limited`

#### `canonical_games`
Canonical event identity rail with:
- `canonical_game_id`
- `sport`
- `league`
- `event_date`
- `scheduled_start`
- `home_team`
- `away_team`
- `home_team_key`
- `away_team_key`
- `source_event_ids`
- `identity_confidence`

#### `goose_market_events`
Normalized event rail with:
- `event_id`
- `sport`
- `league`
- `event_date`
- `commence_time`
- `home_team`
- `away_team`
- `home_team_id`
- `away_team_id`
- `status`
- `source`
- `source_event_id`
- `odds_api_event_id`
- `metadata`

#### `goose_market_candidates`
Normalized side-level candidate rail with:
- `candidate_id`
- `event_id`
- `sport`
- `league`
- `event_date`
- `market_type`
- `submarket_type`
- `participant_type`
- `participant_id`
- `participant_name`
- `opponent_id`
- `opponent_name`
- `side`
- `line`
- `odds`
- `book` / `sportsbook`
- `capture_ts`
- `is_opening`
- `is_closing`
- `raw_payload`
- `normalized_payload`

#### `goose_market_results`
Settlement rail with:
- `candidate_id`
- `event_id`
- `result`
- `actual_stat`
- `actual_stat_text`
- `closing_line`
- `closing_odds`
- `settlement_ts`
- `grade_source`
- `integrity_status`
- `grading_notes`

## Build target 1: `dim_historical_games`

Purpose: one canonical row per historical game/event.

### Mapping

| target field | source table(s) | source field(s) | status | notes / transform |
|---|---|---|---|---|
| `canonical_game_id` | `canonical_games` | `canonical_game_id` | exists now | primary key |
| `sport` | `canonical_games` | `sport` | exists now | canonical source preferred |
| `league` | `canonical_games` | `league` | exists now | canonical source preferred |
| `season` | `canonical_games` or `goose_market_events` | `event_date`, `league` | derived | derive by league season rules, not raw calendar year |
| `season_year` | `canonical_games` or `goose_market_events` | `event_date` | derived | explicit helper needed per sport |
| `event_date` | `canonical_games` | `event_date` | exists now | canonical date |
| `scheduled_start` | `canonical_games` | `scheduled_start` | exists now | fallback to `goose_market_events.commence_time` if null |
| `home_team` | `canonical_games` | `home_team` | exists now | fallback to event rails only if needed |
| `away_team` | `canonical_games` | `away_team` | exists now | fallback to event rails only if needed |
| `home_team_key` | `canonical_games` | `home_team_key` | exists now | usable canonical team key |
| `away_team_key` | `canonical_games` | `away_team_key` | exists now | usable canonical team key |
| `home_team_id` | `goose_market_events` | `home_team_id` | exists now | not guaranteed universal quality |
| `away_team_id` | `goose_market_events` | `away_team_id` | exists now | not guaranteed universal quality |
| `source_event_ids` | `canonical_games` | `source_event_ids` | exists now | provenance rail |
| `identity_confidence` | `canonical_games` | `identity_confidence` | exists now | use for QA / filtering |
| `is_divisional` | enrichment table not yet built | division lookup + team matchup | missing / enrichment needed | requires division/conference map by league and season |
| `home_rest_days` | derived from same dimension | prior game dates by team | missing / derivable after dim exists | needs team schedule window function |
| `away_rest_days` | derived from same dimension | prior game dates by team | missing / derivable after dim exists | same as above |
| `home_back_to_back` | derived | `home_rest_days <= 1` | derived after enrichment | depends on rest-day derivation |
| `away_back_to_back` | derived | `away_rest_days <= 1` | derived after enrichment | depends on rest-day derivation |

### Build note

`dim_historical_games` is mostly straightforward **except** for schedule-context enrichment. The event identity rail exists. The context rail does not.

## Build target 2: `fact_historical_market_sides`

Purpose: one normalized side/selection row per market observation intended for analysis and profitability joins.

### Mapping

| target field | source table(s) | source field(s) | status | notes / transform |
|---|---|---|---|---|
| `candidate_id` | `goose_market_candidates` | `candidate_id` | exists now | best stable row key today |
| `canonical_game_id` | `market_snapshot_prices`, `canonical_games`, `goose_market_events` | `canonical_game_id` or join via event identity | exists now but needs join discipline | use canonical price rail first, fallback via event mapping |
| `sport` | `goose_market_candidates` | `sport` | exists now | normalized |
| `league` | `goose_market_candidates` | `league` | exists now | normalized |
| `season` | join to `dim_historical_games` | derived | derived | inherit from game dim |
| `event_date` | `goose_market_candidates` | `event_date` | exists now | normalized |
| `home_team` | join to `dim_historical_games` | `home_team` | exists now via join | do not duplicate source logic |
| `away_team` | join to `dim_historical_games` | `away_team` | exists now via join | do not duplicate source logic |
| `market_type` | `goose_market_candidates` | `market_type` | exists now | raw normalized market type |
| `submarket_type` | `goose_market_candidates` | `submarket_type` | exists now | useful for periods / variants |
| `market_family` | `goose_market_candidates` | `market_type`, `submarket_type`, payload | derived | needs explicit taxonomy mapping, for example spread / total / moneyline / player_prop |
| `market_scope` | `goose_market_candidates` | `market_type`, `submarket_type` | derived | game / team / player / period / first-five style mapping |
| `participant_type` | `goose_market_candidates` | `participant_type` | exists now | normalized field already present |
| `participant_id` | `goose_market_candidates` | `participant_id` | exists now | quality varies by sport/market |
| `participant_name` | `goose_market_candidates` | `participant_name` | exists now | useful for player/team props |
| `opponent_id` | `goose_market_candidates` | `opponent_id` | exists now | may be null for some markets |
| `opponent_name` | `goose_market_candidates` | `opponent_name` | exists now | may be null for some markets |
| `side` | `goose_market_candidates` | `side` | exists now | normalized side rail |
| `line` | `goose_market_candidates` | `line` | exists now | analysis line |
| `sportsbook` | `goose_market_candidates` | `sportsbook` / `book` | exists now | stored/generated |
| `captured_at` | `goose_market_candidates` | `capture_ts` | exists now | observation timestamp |
| `opening_flag` | `goose_market_candidates` or `market_snapshot_prices` | `is_opening` / `is_opening_candidate` | exists now | choose one canonical rule |
| `closing_flag` | `goose_market_candidates` or `market_snapshot_prices` | `is_closing` / `is_closing_candidate` | exists now | choose one canonical rule |
| `capture_window_phase` | `market_snapshot_prices` | `capture_window_phase` | exists now | best source for opener/closer windows |
| `closing_odds` | `goose_market_results` or closing-side self-join | `closing_odds` | exists now but mixed semantics | prefer market-side close from normalized side logic when available |
| `source` | `goose_market_candidates` | `source` | exists now | provenance |
| `source_market_id` | `goose_market_candidates` | `source_market_id` | exists now | provenance |
| `source_limited` | `market_snapshot_prices` | `source_limited` | exists now | useful for QA filtering |
| `coverage_flags` | `market_snapshot_prices` | `coverage_flags` | exists now | useful for QA filtering |

### Classification fields

| target field | source table(s) | source field(s) | status | notes / transform |
|---|---|---|---|---|
| `bet_on_home_team` | `goose_market_candidates` + game dim | `side`, participant/opponent/team keys | derived | requires team-side resolver |
| `bet_on_away_team` | `goose_market_candidates` + game dim | `side`, participant/opponent/team keys | derived | same |
| `team_role` | derived | compare selected team to home/away | derived | `home` / `away` / null |
| `opponent_role` | derived | compare opponent to home/away | derived | inverse of team role where applicable |
| `favorite_team_id` | derived from closing price set | moneyline/spread close consensus | derived | needs game-level favorite resolver |
| `underdog_team_id` | derived from closing price set | moneyline/spread close consensus | derived | same |

### Build note

This fact table is **mostly buildable now** from Goose2 normalized candidates plus the newer historical warehouse columns. The missing piece is not storage. It is the explicit classification logic.

## Build target 3: result and profitability attachment

Purpose: attach settled outcomes and flat-stake economics to the side-level fact.

### Mapping

| target field | source table(s) | source field(s) | status | notes / transform |
|---|---|---|---|---|
| `result` | `goose_market_results` | `result` | exists now | canonical settlement result |
| `graded` | `goose_market_results` | `result`, `integrity_status`, `settlement_ts` | derived | true when terminal and usable |
| `integrity_status` | `goose_market_results` | `integrity_status` | exists now | keep raw |
| `settlement_ts` | `goose_market_results` | `settlement_ts` | exists now | terminal timestamp |
| `actual_stat` | `goose_market_results` | `actual_stat` | exists now | optional analytical context |
| `actual_stat_text` | `goose_market_results` | `actual_stat_text` | exists now | optional analytical context |
| `profit_units` | `goose_market_results` + candidate odds | `result`, `odds` | derived | flat stake payout formula required |
| `profit_dollars_10` | derived | `profit_units * 10` | derived | fixed $10 stake |
| `roi_on_10_flat` | derived | `profit_dollars_10 / 10` | derived | equivalent to unit ROI for flat $10 |

### Settlement logic recommendation

For gold-layer analytics, define `graded = true` only when:
- `result in ('win','loss','push','void','cancelled')`
- and `integrity_status in ('ok','void','cancelled')`

Keep `manual_review`, `unresolvable`, and `pending` out of default performance aggregates.

### Profit logic recommendation

Use a single canonical formula:
- American odds > 0: win profit units = `odds / 100`
- American odds < 0: win profit units = `100 / abs(odds)`
- loss = `-1`
- push / void / cancelled = `0`

Then:
- `profit_dollars_10 = profit_units * 10`
- `roi_on_10_flat = profit_dollars_10 / 10`

## Build target 4: `historical_betting_markets_gold`

Purpose: analyst-facing denormalized gold layer for training, BI, QA, and future AI query workflows.

### Gold-layer target field mapping

| target field | source | status | notes |
|---|---|---|---|
| `sport` | game dim / fact | exists now | carry forward |
| `league` | game dim / fact | exists now | carry forward |
| `season` | game dim | derived | required |
| `event_date` | game dim / fact | exists now | carry forward |
| `home_team` | game dim | exists now | carry forward |
| `away_team` | game dim | exists now | carry forward |
| `is_divisional` | game dim enrichment | missing / enrichment needed | not available yet |
| `home_rest_days` | game dim enrichment | missing / derivable | not available yet |
| `away_rest_days` | game dim enrichment | missing / derivable | not available yet |
| `home_back_to_back` | game dim enrichment | derived after rest logic | not available yet |
| `away_back_to_back` | game dim enrichment | derived after rest logic | not available yet |
| `market_family` | side fact | derived | taxonomy layer |
| `market_scope` | side fact | derived | taxonomy layer |
| `participant_type` | side fact | exists now | carry forward |
| `side` | side fact | exists now | carry forward |
| `line` | side fact | exists now | carry forward |
| `sportsbook` | side fact | exists now | carry forward |
| `closing_odds` | side fact / results | exists now but standardization needed | use one consistent close rule |
| `bet_on_home_team` | side fact | derived | classification helper |
| `bet_on_away_team` | side fact | derived | classification helper |
| `team_role` | side fact | derived | classification helper |
| `opponent_role` | side fact | derived | classification helper |
| `favorite_team_id` | side fact/game resolver | derived | requires close consensus logic |
| `underdog_team_id` | side fact/game resolver | derived | requires close consensus logic |
| `result` | results | exists now | carry forward |
| `graded` | results | derived | carry forward |
| `integrity_status` | results | exists now | carry forward |
| `profit_units` | profitability transform | derived | carry forward |
| `profit_dollars_10` | profitability transform | derived | carry forward |
| `roi_on_10_flat` | profitability transform | derived | carry forward |

## What is truly missing right now

### Missing but buildable with current data
- `season`
- `season_year`
- `market_family`
- `market_scope`
- `bet_on_home_team`
- `bet_on_away_team`
- `team_role`
- `opponent_role`
- `profit_units`
- `profit_dollars_10`
- `roi_on_10_flat`
- `favorite_team_id`
- `underdog_team_id` via closing consensus logic

### Missing and requires enrichment or new helper rails
- `is_divisional`
- `home_rest_days`
- `away_rest_days`
- `home_back_to_back`
- `away_back_to_back`
- fully trusted canonical team IDs across every sport/market edge case
- stronger NFL parity where historical truth/identity is still weaker

## Recommended implementation order

### Phase 1 — build `dim_historical_games`
Build first from:
- `canonical_games`
- `goose_market_events`

Include immediately:
- identity fields
- sport/league/date/team fields
- season derivation

Defer to enrichment sub-phase:
- divisional flags
- rest/back-to-back context

### Phase 2 — build `fact_historical_market_sides`
Build from:
- `goose_market_candidates`
- `market_snapshot_prices`
- `dim_historical_games`

Include immediately:
- normalized market rows
- market taxonomy
- side/home-away classification
- opening/closing flags

### Phase 3 — attach settlement and profitability
Build from:
- `goose_market_results`
- odds from side fact

Include immediately:
- `result`
- `graded`
- `integrity_status`
- flat-stake profitability fields

### Phase 4 — publish `historical_betting_markets_gold`
Publish as a table or materialized view that joins:
- `dim_historical_games`
- `fact_historical_market_sides`
- result/profitability layer

### Phase 5 — only then connect AI/query workflows
Do not wire AI analyst flows directly to raw snapshot or candidate rails.
Use the gold layer or we will get brittle garbage.

## Recommended engineering checklist

1. Create explicit SQL/view spec for `dim_historical_games`
2. Add season derivation helper by league
3. Create explicit SQL/view spec for `fact_historical_market_sides`
4. Add market taxonomy mapping for `market_family` and `market_scope`
5. Add team-side resolver for home/away flags and roles
6. Add profitability transform logic with fixed formulas
7. Publish `historical_betting_markets_gold`
8. Add QA queries for null rates and unresolved classification buckets
9. Add second-pass enrichment for rest/back-to-back/divisional context
10. Treat NFL edge cases as QA-gated, not silently equivalent to NHL/MLB quality

## Best blunt summary

We are past the vague strategy phase.

What is done:
- warehouse direction
- source rails decision
- schema rails
- build order
- target shape

What was missing and is now defined here:
- field-by-field mapping from source rails to gold-layer targets
- clear split between exists now vs derived vs truly missing

## Terminal status
- Done: source-to-target mapping artifact created for the historical gold layer
- Partial: schema/view implementation still needs to be built from this handoff
