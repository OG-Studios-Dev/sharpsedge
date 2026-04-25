# LM Year-over-Year System Backtest + Discovery Plan

Generated: 2026-04-24 20:20 EDT  
Owner: Magoo subagent audit  
Scope: read-only architecture audit; no data mutation; no expensive full backtest executed.

## Executive take

Goosalytics already has the right raw rails to start this safely: `ask_goose_query_layer_v1`, `historical_betting_markets_gold_v1`, Goose2 candidate/result/feature tables, and `system_qualifiers`. The missing piece is not “more AI” yet — it is a deterministic system-evaluation layer that applies current tracked system definitions to historical rows, stores reproducible year-by-year metrics, and only then feeds approved labels/features to the learning model.

The current `scripts/backtest-systems.mjs` is useful as a prototype, but it is not the production answer: it pulls external SBR JSON, uses proxy definitions for several systems, and does not use Goose2/Ask Goose’s canonical warehouse. Build the new runner against Supabase gold/query tables instead.

---

## Current tracked systems found

Source of truth inspected: `data/systems-tracking.json` plus templates/refresh logic in `src/lib/systems-tracking-store.ts`.

### Trackable/actionable now

| System ID | Name | League | Current status | Backtest readiness |
|---|---|---:|---|---|
| `nba-goose-system` | Mattys 1Q Chase NBA | NBA | tracking | Partial: needs historical 1Q/3Q ATS lines + quarter scores. Current Ask Goose has segment fields but actual quarter ATS line coverage must be proven. |
| `big-cats-nba-1q-under` | Big Cats NBA 1Q Under | NBA | tracking | Partial: can prototype if `segment_key='1Q'`/1Q totals are present; otherwise only proxy from full-game total, which should be labeled synthetic/provisional. |
| `fat-tonys-fade` | Fat Tony's Road Chalk | NBA | tracking | Missing: requires historical public bet/handle splits and line movement snapshots. Ask Goose has price/line rows, but not historical DK/FD handle history. |
| `coach-no-rest` | Coach, No Rest? | NHL | awaiting_data | Partial: needs schedule rest/back-to-back and fatigue; goalie context is not consistently historical. Can backtest a rest-only variant first. |
| `swaggy-stretch-drive` | Swaggy's Stretch Drive | NHL | awaiting_data | Missing/partial: requires standings urgency, xG%, goalie status, fatigue, ML price. Price exists; urgency/xG/goalie history need source mapping. |
| `falcons-fight-pummeled-pitchers` | Veal Banged Up Pitchers | MLB | tracking | Partial-good: needs probable starter identity, previous-start stats, ERA, ML range. Some MLB starter/enrichment rails exist; historical starter joins must be proven. |
| `robbies-ripper-fast-5` | Robbie's Ripper Fast 5 | MLB | tracking | Partial-good: requires explicit F5 side/total markets and starter quality gap. F5 market support exists in Goose2 exporter; starter quality join needs hardening. |
| `nhl-under-majority-handle` | NHL Under — Majority Handle | NHL | tracking | Missing for true system: requires historical total handle %. Can proxy only as `total under at line` but that is not the tracked definition. |
| `mlb-under-majority-handle` | MLB Under — Majority Handle | MLB | tracking | Missing for true system: requires historical total handle %. Can proxy only as `total under at line`, separately labeled. |

### Parked / blocked / definition-only

These should not be used for LM “profitable system” claims until definitions/data are complete: `beefs-bounce-back`, `the-blowout`, `hot-teams-matchup`, `veal-bangers-zig-playoff-zigzag`, `bigcat-bonaza-puckluck`, `tonys-hot-bats`, `falcons-fight-big-upset-follow-ups`, `warren-sharp-computer-totals-model`, `fly-low-goose`, `tonys-teaser-pleaser`, `nba-home-dog-majority-handle`, `nba-home-super-majority-close-game`, `nhl-home-dog-majority-handle`, `mlb-home-majority-handle`, `nfl-home-dog-majority-handle`.

Important nuance: `src/lib/system-grader.ts` lists several parked systems as gradeable if qualifiers exist, but gradeability is not the same as historical backtest readiness. For the LM, only run systems whose definition can be reproduced from timestamp-safe historical features.

---

## Existing source tables / views to use

### Core Goose2 warehouse

Defined in `supabase/migrations/20260409162000_goose2_phase1_core_tables.sql`:

- `goose_market_events` — event spine: `event_id`, `sport`, `league`, `event_date`, `commence_time`, teams, status, source IDs.
- `goose_market_candidates` — one candidate per market side/book/capture: market type, participant, side, line, odds, book, capture timestamp, opening/closing flags.
- `goose_market_results` — candidate settlement: `result`, actual stat/text, closing line/odds, `integrity_status`, source payload.
- `goose_feature_rows` — generated feature payload and `system_flags` list of matching system qualifiers.
- `goose_decision_log` — model decisions, probabilities, edge, policy/model versions.

### Historical gold/query layer

Defined/extended in migrations including:

- `supabase/migrations/20260421200000_historical_gold_views_v1.sql`
  - `dim_historical_games_v1`
  - `fact_historical_market_sides_v1`
  - `historical_market_results_enriched_v1`
  - `historical_betting_markets_gold_v1`
  - `historical_betting_markets_gold_graded_v1`
- `supabase/migrations/20260422070000_repoint_loader_to_gold_results.sql`
  - `historical_trends_loader_source_v1` maps gold rows to the Ask Goose loader shape.
- `supabase/migrations/20260421223000_historical_pregame_record_context.sql`
  - `historical_team_pregame_record_context_v1`
  - `historical_trends_question_surface_v1`

These views already expose many backtest primitives: `season`, `event_date`, home/away, `team_role`, `market_type`, `market_family`, `market_scope`, `side`, `line`, `odds`, `closing_flag`, `result`, `profit_units`, `graded`, `integrity_status`, pregame team/opponent win pct, above-.500 flags, and segment key.

### Ask Goose serving/training layer

- `supabase/migrations/20260422000000_ask_goose_query_table_bootstrap.sql` creates `ask_goose_query_layer_v1`.
- `supabase/migrations/20260422001500_ask_goose_query_layer_loader.sql` creates `goose_training_examples_v1` as graded Ask Goose examples.
- `src/app/api/ask-goose/route.ts` reads `ask_goose_query_layer_v1` and answers DB-backed questions.
- `src/app/ask-goose/page.tsx` surfaces rows/stats from the same layer.

Useful columns in `ask_goose_query_layer_v1`: `candidate_id`, `canonical_game_id`, `league`, `season`, `event_date`, `team_role`, `team_name`, `opponent_name`, `market_type`, `market_family`, `market_scope`, `side`, `line`, `odds`, `sportsbook`, favorite/dog/home/away flags, result/profit/ROI, total fields, prime-time/rest/divisional flags, pregame record context, previous result flags, `segment_key`.

### Tracked-system persistence

Defined in `supabase/migrations/20260328000000_system_qualifiers.sql`:

- `system_qualifiers` stores system rows and settlements.
- `system_performance_summary` aggregates current performance by system.

Connected code:

- `src/lib/systems-tracking-store.ts` — catalog definitions, refreshers, `upsertSystemQualifiers`.
- `src/lib/system-grader.ts` — pending qualifier graders.
- `src/app/admin/systems/page.tsx` — system performance admin UI.
- `src/app/api/admin/systems/grade/route.ts` — grade API.
- `src/app/api/admin/goose-model/ingest-system-results/route.ts` — ingests settled `system_qualifiers` into `goose_model_picks` with `experiment_tag='system-qualifier-v1'`.
- `src/lib/goose2/feature-mappers.ts` — attaches matching `system_qualifiers` into `goose_feature_rows.system_flags`.

---

## Existing training/export scripts

| Script/API | What it does | Fit for YoY backtesting |
|---|---|---|
| `scripts/goose2-export-training-dataset.mjs` | Exports Goose2 rows from `goose_market_results` + candidates + feature rows. Supports NHL/NBA/MLB and markets `moneyline`, `spread`, `total`, `first_five_total`, `first_five_side`. Excludes bad integrity rows. | Use after system-backtest rows exist; currently candidate-level, not system-level. |
| `scripts/goose2-train-baseline.mjs` | Trains/evaluates baseline from exported dataset. | Downstream only; do not train on unvetted system discoveries. |
| `scripts/goose2-score-shadow.mjs` | Scores pending candidates using the exported baseline and writes shadow report/log decisions. | Downstream validation. |
| `scripts/goose2-refresh-feature-qualifiers.mjs` | Hydrates `goose_feature_rows.system_flags` from `system_qualifiers`. | Useful bridge from system results to LM features. |
| `src/app/api/admin/goose-model/training-summary/route.ts` | Reads `goose_training_examples_v1`. | Good admin preview, not enough for YoY system stats. |
| `src/app/api/admin/goose-model/ingest-system-results/route.ts` | Pulls settled system qualifiers into `goose_model_picks`. | Good current learning loop, but only for stored current qualifiers, not full historical generated qualifiers. |
| `scripts/backtest-systems.mjs` | Prototype SBR-based backtest over hardcoded systems. | Do not use as source of truth; port concepts into new warehouse-backed runner. |

---

## Current coverage evidence

Read-only audit file found at `tmp/lm_ask_goose_data_audit_20260424.json`:

- `ask_goose_query_layer_v1`: NHL 152,568 rows / 7,135 graded; NBA 13,132 rows / 8,260 graded; MLB 21,398 rows / 14,350 graded; NFL 0 rows.
- `goose_market_events`: NHL 4,129; NBA 3,820; MLB 3,500; NFL 606.
- Ask Goose date ranges in serving table are currently narrower than event history:
  - NHL Ask Goose: 2026-03-01 to 2026-04-10.
  - NBA Ask Goose: 2026-04-01 to 2026-04-23.
  - MLB Ask Goose: 2026-04-01 to 2026-04-22.
  - NFL Ask Goose: none.
- Candidate counts timed out for NHL/NBA/MLB via naive count, which means new backtest queries must use chunking/materialized batches, not one broad query.

This is enough for a first milestone on one constrained league/month, not enough to claim complete multi-year YoY system performance yet.

---

## Proposed output schema

Create a new read/write path after review, ideally as migrations:

### `system_backtest_runs`

```sql
run_id text primary key,
run_ts timestamptz not null default now(),
run_status text check (run_status in ('dry_run','completed','failed')),
system_catalog_version text not null,
rule_version text not null,
source_layer text not null, -- ask_goose_query_layer_v1 / historical_betting_markets_gold_v1
source_layer_version text,
league text,
start_date date,
end_date date,
created_by text,
notes text,
config jsonb not null default '{}'
```

### `system_backtest_qualifiers`

```sql
run_id text references system_backtest_runs(run_id),
system_id text not null,
system_name text not null,
rule_version text not null,
league text not null,
season text,
season_year int,
event_date date not null,
canonical_game_id text,
event_id text,
candidate_id text,
market_type text,
market_family text,
market_scope text,
segment_key text,
team_role text,
team_name text,
opponent_name text,
action_side text,
line numeric,
odds numeric,
sportsbook text,
qualifier_reason jsonb not null default '{}',
feature_snapshot jsonb not null default '{}',
result text,
integrity_status text,
profit_units numeric,
settlement_status text,
exclusion_reason text,
created_at timestamptz default now(),
primary key (run_id, system_id, candidate_id)
```

### `system_backtest_yoy_summary`

```sql
run_id text references system_backtest_runs(run_id),
system_id text not null,
league text not null,
season text not null,
season_year int,
market_type text,
segment_key text,
qualifiers int not null,
graded int not null,
wins int not null,
losses int not null,
pushes int not null,
voids int not null,
ungradeable int not null,
win_pct numeric,
profit_units numeric,
roi_per_flat_unit numeric,
avg_odds numeric,
avg_line numeric,
first_event_date date,
last_event_date date,
source_coverage jsonb not null default '{}',
warnings jsonb not null default '[]',
primary key (run_id, system_id, league, season, coalesce(market_type,''), coalesce(segment_key,''))
```

### Optional discovery tables

- `discovered_system_candidates`: candidate rule hash, feature predicates, train window stats, validation/test stats, p-value/false-discovery metadata, status.
- `discovered_system_promotions`: human-reviewed promotions into tracked catalog, with freeze date and rule version.

---

## Backtest runner design

Build a new script/API pair instead of expanding the old SBR prototype.

### New files

- `src/lib/system-backtests/rules.ts`
  - Frozen rule functions per `system_id` and `rule_version`.
  - Each function accepts rows from the query layer and emits qualifiers/exclusions.
- `src/lib/system-backtests/source.ts`
  - Chunked PostgREST fetchers for `ask_goose_query_layer_v1` and/or `historical_betting_markets_gold_v1`.
  - Never broad-count candidate tables in one query.
- `src/lib/system-backtests/aggregate.ts`
  - Season/year aggregation, W-L-P, units, ROI, coverage warnings.
- `scripts/system-backtest-yoy.mjs`
  - CLI: `node scripts/system-backtest-yoy.mjs --league NHL --system nhl-under-majority-handle --start 2026-03-01 --end 2026-04-10 --dry-run`.
  - Default is dry-run JSON output under `tmp/`; explicit `--persist` required later.
- `src/app/api/admin/systems/backtest/route.ts`
  - Admin endpoint after CLI proof exists.
- Admin UI extension in `src/app/admin/systems/page.tsx`
  - Add YoY tab/cards only after summary table exists.

### Source selection

Use `ask_goose_query_layer_v1` for first milestone because it already has user-facing query shape and pregame context fields. Use `historical_betting_markets_gold_v1` for broader market candidate evaluation and when Ask Goose materialization is incomplete.

### Rule implementation approach

For each tracked system, define:

```ts
type SystemRule = {
  systemId: string;
  ruleVersion: string;
  requiredColumns: string[];
  requiredCoverage: string[];
  evaluate(rowBatch): { qualifiers; exclusions; warnings };
};
```

Hard rule: every qualifier must preserve `candidate_id`, source row values, and a `qualifier_reason` JSON object explaining exactly why it fired. No opaque AI-generated qualifiers.

### First systems to implement safely

1. `mlb-under-majority-handle` as a **proxy-only** test if true handle data absent: total under, total line threshold/side/result. Label as `proxy_without_handle`, not the real tracked system.
2. `nhl-under-majority-handle` same proxy-only warning.
3. `robbies-ripper-fast-5` if explicit F5 rows and starter features are available.
4. `nba-goose-system` only after quarter ATS lines and quarter scores are proven in historical rows.

Best first real candidate is probably `robbies-ripper-fast-5` or a constrained Ask Goose total/market slice, not handle-based systems, because historical handle data is the biggest missing input.

---

## Train/test safeguards

Non-negotiables before LM learning uses these outputs:

1. **Time split only**: never random split. Recommended: train oldest 70%, validation next 15%, test newest 15%, plus season holdout when enough seasons exist.
2. **Rule freeze**: when backtesting a system, store `rule_version` and do not tune thresholds on the test window.
3. **No closing leakage**: only use closing lines for systems that explicitly qualify at close. If a system is pregame/opening/live, use the capture phase matching that decision.
4. **No future context**: standings, previous results, starter/goalie/news features must be reproducible as of capture time.
5. **Coverage flags count as features/exclusions, not hidden assumptions**: if handle %, goalie status, xG, quarter lines, or starter context are absent, emit `exclusion_reason` and coverage warnings.
6. **Push/void/ungradeable separate**: do not collapse into losses or wins.
7. **Minimum sample gates**: no promotion/discovery claim below practical sample thresholds, e.g. at least 100 graded rows per system overall and at least 30 per season bucket before reading seasonal ROI as meaningful.
8. **Multiple-comparison control for discovery**: require validation/test persistence, not just best in-sample slice.
9. **Human review before promotion**: discovered systems remain candidates until reviewed and added to the tracked catalog with plain-English rules.

---

## Discovery approach for new profitable systems

Do this only after deterministic current-system backtests are reproducible.

### Candidate feature space

Start with Ask Goose / gold columns:

- League, season, month, day-of-week.
- Market family/scope/type, segment key.
- Home/away, favorite/underdog, road favorite/dog.
- Line buckets and odds buckets.
- Team/opponent pregame win pct and above-.500 flags.
- Previous moneyline/over/under result flags.
- Rest/back-to-back/divisional/prime-time only where populated and timestamp-safe.

### Mining method

1. Generate constrained predicate candidates: 1–4 predicates max, human-readable.
2. Score on train window only.
3. Filter by sample size and minimum edge over baseline implied-prob/market family.
4. Validate on next chronological window.
5. Test on final untouched window.
6. Save rejected candidates too, to avoid rediscovering the same overfit junk.

### Promotion standard

A discovery candidate can become a tracked system only if:

- positive ROI survives validation and test;
- W/L and units beat a market-family baseline;
- sample size survives per-season checks;
- source coverage is stable;
- rule can be explained in one paragraph;
- no critical leakage flags.

---

## First safe milestone

**Milestone: read-only YoY dry-run report for one constrained league/date window.**

Recommended first target:

- League: MLB or NHL.
- Source: `ask_goose_query_layer_v1` first, fallback to `historical_betting_markets_gold_v1`.
- Date: a narrow existing serving range from audit, e.g. MLB `2026-04-01` to `2026-04-22` or NHL `2026-03-01` to `2026-04-10`.
- Systems: start with one total-market proxy and clearly label it as proxy if handle is absent.
- Output only: `tmp/system-backtest-yoy-dry-run-<date>.json` + markdown summary.
- No DB writes.

Definition of done for milestone:

- CLI fetches chunked rows without timeout.
- Emits qualifier/exclusion counts by system.
- Emits W-L-P, units, ROI by season/date bucket.
- Shows coverage warnings for missing handle/segment/starter fields.
- Produces a repeatable artifact; no LM training changes yet.

---

## Evidence inspected

Commands / file evidence:

- `git status --short` showed existing uncommitted work and many generated logs/tmp files; audit did not mutate data.
- `find ... | rg '(system|goose|model|train|admin|backtest|qualifier|feature)'` surfaced relevant docs/scripts/migrations including `docs/goose2-training-dataset-spec-v1-2026-04-11.md`, `scripts/goose2-export-training-dataset.mjs`, `scripts/backtest-systems.mjs`, and Goose2/Ask Goose migrations.
- `node -e "const f=require('./data/systems-tracking.json')..."` summarized 24 tracked catalog entries and record counts.
- `rg -n "system_qualifiers|goose_model|ask_goose_query_layer|historical_betting_markets_gold" ...` confirmed source paths/routes/views:
  - `src/app/api/ask-goose/route.ts`
  - `src/app/admin/systems/page.tsx`
  - `src/app/api/admin/goose-model/ingest-system-results/route.ts`
  - `src/app/api/admin/goose-model/training-summary/route.ts`
  - `supabase/migrations/20260422000000_ask_goose_query_table_bootstrap.sql`
  - `supabase/migrations/20260422001500_ask_goose_query_layer_loader.sql`
  - `supabase/migrations/20260421200000_historical_gold_views_v1.sql`
- `node -e "const p=require('./package.json')..."` showed package scripts: `goose2:export-training`, `goose2:train-baseline`, `goose2:score-shadow`, `goose2:refresh-feature-qualifiers`, `goose2:refresh-trackable-systems`, `goose:warehouse-audit`.
- `python3` extraction of `scripts/backtest-systems.mjs` found hardcoded prototype systems: `swaggy-stretch-drive`, `bigcat-bonaza-puckluck`, `nhl-under-majority-handle`, `nhl-home-dog-majority-handle`, `nba-goose-system`, `nba-home-dog-majority-handle`, `nba-home-super-majority-close-game`, `falcons-fight-pummeled-pitchers`, `mlb-home-majority-handle`, `mlb-under-majority-handle`, `robbies-ripper-fast-5`, `coach-no-rest`, `fat-tonys-fade`.
- `tmp/lm_ask_goose_data_audit_20260424.json` provided read-only row counts/date ranges for Ask Goose and learning tables.

## Marco-provided named system seeds — 2026-04-24

Marco clarified that “systems” means named Goosalytics betting-system identities, not just raw market filters. Seed examples to model/backtest explicitly:

- Mattys 1Q Chase
- Veal Banged Up Pitchers
- Coach No Rest
- Robbie’s Ripper Fast 5

Implementation implication:

Each named system needs a formal registry entry with:

- `system_id`
- display name
- owner/source/persona if applicable
- league(s)
- market(s)
- eligibility rules
- required data fields
- exclusion rules
- minimum sample thresholds
- backtest date range
- yearly splits
- output stats: record, win %, units, ROI, sample size, confidence/data-quality flags

The first LM/year-over-year backtest runner should not treat these as generic “moneyline/spread/total” buckets. It should evaluate each named system independently, then compare system performance across seasons and leagues. Later discovery work can propose new systems, but proposed systems must be labeled as discovered/candidate until validated out-of-sample.
# Systems Backtest Eligibility Map — 2026-04-24

- Owner: Magoo
- Goal: classify every named Goosalytics system for historical YoY backtesting readiness.
- Source: `data/systems-tracking.json` extracted to `tmp/systems-registry-extract-2026-04-24.json`.

| System | League | Current status | Backtest readiness | Primary blockers / required fields |
|---|---|---|---|---|
| Mattys 1Q Chase NBA (nba-goose-system) | NBA | tracking / trackable_now | ready_or_near_ready | Closing full-game spread: ready; 1Q ATS line: ready; 3Q ATS line: ready; Quarter settlement outcomes: ready |
| Big Cats NBA 1Q Under (big-cats-nba-1q-under) | NBA | tracking / trackable_now | ready_or_near_ready | NBA full-game total: ready; Exact sportsbook 1Q total: pending |
| The Centurion Comeback (beefs-bounce-back-big-ats-loss) | NBA | awaiting_verification / blocked_missing_data | blocked_missing_data | Previous-game closing spread archive: pending; Previous-game ATS result history: pending; Rest/travel context: pending |
| Beefs Blowout (the-blowout) | NBA | paused / parked_definition_only | definition_only | Recent NBA results: ready; Current full-game spread: ready; Opponent season win percentage: ready; Bet-direction rulebook: ready |
| Hot Teams Matchup (hot-teams-matchup) | NBA | paused / parked_definition_only | definition_only | Recent last-5 results: ready; Season win percentages: ready; Current spread and total: ready; Bet-direction rulebook: ready |
| Fat Tony's Road Chalk (fat-tonys-road-chalk) | NBA | tracking / trackable_now | ready_or_near_ready | Public betting handle splits: ready; Line-move history: ready |
| Coach, No Rest? (coach-no-rest) | NHL | awaiting_data / trackable_now | near_ready_needs_recent_data | NHL schedule / rest rail: ready; Fatigue score rail: ready; Goalie context rail: ready; Aggregated NHL moneylines: ready; Historical outcome validation: pending |
| Swaggy's Stretch Drive (swaggy-stretch-drive) | NHL | awaiting_data / trackable_now | near_ready_needs_recent_data | Standings urgency rules: ready; Goalie + fatigue context rail: ready; MoneyPuck team-strength rail: ready; Official-team news rail: partial; Pricing discipline: ready |
| Yo Adrian! Playoff ZigZag (veal-bangers-zig-playoff-zigzag) | NHL | definition_only / parked_definition_only | definition_only | Series-state inputs: pending; Overreaction rule set: pending |
| BigCat Bonaza PuckLuck (bigcat-bonaza-puckluck) | NHL | paused / parked_definition_only | definition_only | xGoalsPercentage (season): ready; xGoalsFor / goalsFor (finishing luck, offense): ready; goalsAgainst / xGoalsAgainst (finishing luck, defense/goalie): pending; 5v5 strength-state split: pending; NHL standings (sample gate): ready; Aggregated NHL moneylines: r |
| Tony's Tight Bats (tonys-hot-bats) | MLB | paused / parked_definition_only | definition_only | Official lineup status: ready; Top-of-order hitter game logs: ready; Weather / park context: ready; Bullpen workload context: ready; Market availability context: ready; Price discipline / validation layer: partial |
| Veal Banged Up Pitchers (falcons-fight-pummeled-pitchers) | MLB | tracking / trackable_now | ready_or_near_ready | Probable pitchers feed: ready; Prior-start damage log: ready; Current moneyline: ready; Lineup status/context: ready; Weather: ready; Park factors: ready; Bullpen fatigue: ready; F5 market availability: ready |
| Falcons Fight Big Upset Follow-Ups (falcons-fight-big-upset-follow-ups) | MLB | definition_only / parked_definition_only | definition_only | Upset threshold definition: pending; Next-game action rules: pending |
| Robbie's Ripper Fast 5 (robbies-ripper-fast-5) | MLB | tracking / trackable_now | ready_or_near_ready | F5 market availability: ready; Probable pitchers + ERA/WHIP quality scoring: ready; Starter-mismatch gate: ready; Weather / park / bullpen context: ready; F5 inning linescore for grading: partial |
| Dougy Magoo's AI Model (warren-sharp-computer-totals-model) | NFL | source_based / blocked_missing_data | blocked_missing_data | External totals projections: pending; Totals line archive: pending |
| Joey on the LOW LOW (fly-low-goose) | NFL | definition_only / parked_definition_only | definition_only | True qualifier rules: pending |
| Goosies Teaser Pleaser (tonys-teaser-pleaser) | NFL | source_based / blocked_missing_data | blocked_missing_data | Teaser price ledger: pending; Key-number rule capture: pending |
| Home Dog with Majority Handle (nba-home-dog-majority-handle) | NBA | paused / parked_definition_only | definition_only | NBA public ML handle %: ready; Home team moneyline: ready; Bet volume filter: ready |
| Home Super-Majority Handle (Close Game) (nba-home-super-majority-close-game) | NBA | paused / parked_definition_only | definition_only | NBA public ML handle %: ready; Game spread line: ready; Bet volume filter: ready |
| NHL Home Dog — Majority Handle (nhl-home-dog-majority-handle) | NHL | paused / parked_definition_only | definition_only | NHL public ML handle %: ready; NHL home ML price: ready; Intraday line-move history: ready |
| NHL Under — Majority Handle (nhl-under-majority-handle) | NHL | tracking / trackable_now | ready_or_near_ready | NHL public total handle %: ready; Intraday line-move history: ready |
| MLB Home — Majority Handle (mlb-home-majority-handle) | MLB | paused / parked_definition_only | definition_only | MLB public ML handle %: ready; Intraday line-move history: ready |
| MLB Under — Majority Handle (mlb-under-majority-handle) | MLB | tracking / trackable_now | ready_or_near_ready | MLB public total handle %: ready; Intraday line-move history: ready |
| NFL Home Dog — Majority Handle (nfl-home-dog-majority-handle) | NFL | paused / parked_definition_only | definition_only | NFL public ML handle %: ready; NFL home ML price: ready |

## First backtest order

1. Mattys 1Q Chase NBA — requires quarter ATS lines and quarter scores; likely separate from current game-level Ask Goose rows.
2. Big Cats NBA 1Q Under — requires full-game totals plus 1Q score/proxy line.
3. Veal Banged Up Pitchers — MLB moneyline, probable starter prior-start damage, odds.
4. Robbie's Ripper Fast 5 — MLB F5 market, probable starter mismatch, park/weather/bullpen context.
5. Coach, No Rest? — NHL moneyline, rest days/back-to-back flags, final scores.
6. Majority Handle systems — only after historical handle/splits data is confirmed, otherwise blocked.

## Important architecture note

Ask Goose game-level rows are enough for moneyline/spread/total system families, but not enough for all named systems. Quarter systems need period scoring/quarter markets; F5 systems need inning/F5 lines and starter context; handle systems need historical betting splits. The LM should mark missing inputs explicitly instead of fabricating backtests.