# Ask Goose User-Facing Scope Note

- **Owner:** Magoo
- **Goal:** Define what users can confidently ask Ask Goose today, based on the current parser and `ask_goose_query_layer_v1` serving rows.
- **Proof required:** Repo/source inspection plus live serving-table counts.
- **Last updated:** 2026-04-24
- **Status:** Done

## Recommended UI copy

### Short info-button copy

Ask Goose answers database-backed betting research questions from Goosalytics historical market rows. It is strongest today for **NBA and MLB game-level moneyline, totals, and supported spread/ATS rows where a spread line is present**. NHL is available but narrower and noisier. Ask about teams, opponents, favorites/underdogs, home/away, overs/unders, records, units, ROI, and recent windows. Goose should caveat thin samples and refuse generic sports chat, news, predictions, player props, and unsupported markets.

### Help-panel copy

**What Ask Goose can answer well right now**
- NBA/MLB team moneyline history: “How have the Raptors done on the moneyline?”
- NBA/MLB game totals: “How have Lakers overs performed?” / “How have Blue Jays unders performed?”
- Team-vs-opponent slices when enough rows exist: “How have the Knicks done against the Celtics?”
- Favorite/underdog splits for team-side markets: “How have the Yankees performed as underdogs?”
- Recent-window questions such as last 10/recent performance, with a sample-size caveat.

**Use caution**
- NHL has query rows, but the current serving layer includes a lot of player-prop-looking rows and only a short date window. Goose should be conservative.
- Spread/ATS questions are now supported with caveats for NBA/MLB where the source provides a spread line and final score. Goose should still show sample size and caveat thin/ungraded slices.
- Totals are game-total rows only when the source row is a real over/under game market; period/quarter/inning totals may appear in raw rows but are not a confident public promise yet.

**What Goose should not answer**
- Generic sports trivia, GOAT debates, news, rumors, injury updates, fantasy advice, or open-ended predictions.
- Player props in the current user-facing Ask Goose scope.
- NFL questions today: the route allows NFL, but the current serving table has zero NFL rows.
- Any question where the matching sample is too small, ungraded, unresolvable, or missing the line needed to grade the bet.

## Confidence tiers

### Tier A — Confident public support

These are safe for the help panel because the parser supports them and live rows are broadly graded.

| League | Market | User wording | Current evidence |
|---|---|---|---|
| NBA | Moneyline | team moneyline, favorites/underdogs, home/away when rows exist | broad graded support |
| NBA | Game totals | over, under, totals | broad graded support |
| NBA | Spread / ATS | spread, ATS, cover where spread line exists | repaired support; keep sample-size caveat |
| MLB | Moneyline | team moneyline, favorites/underdogs, home/away when rows exist | broad graded support |
| MLB | Game totals | over, under, totals | broad graded support |
| MLB | Spread / ATS | spread, ATS, cover where spread line exists | repaired support; Sep 2024 still has score-coverage gaps |

### Tier B — Supported with caveats

| League | Market/slice | Caveat |
|---|---|---|
| NHL | Moneyline | 8,780 rows and 3,570 graded, but current NHL date range is only 2026-03-01 to 2026-04-10 in the live query layer. |
| NHL | Totals | 69,361 rows and 3,551 graded, but raw samples show mixed total submarkets, including period/player-prop-like labels. Public copy should not overpromise broad NHL totals yet. |
| Any supported league | Team-vs-opponent | Parser can infer two matched teams and sort/filter head-to-head rows, but answer quality depends on enough matching graded rows. |
| Any supported league | Recent windows | Parser recognizes `last 5`, `last 10`, `last 25`, and `recent`; implementation slices to the top recent evidence rows after filtering. Always show sample size. |
| Any supported league | Favorite/underdog | Parser recognizes favorite/underdog/dog language and filters `is_favorite` / `is_underdog`. Accuracy depends on correct source flags. |

### Tier C — Parsed or present, but not a confident public promise

| Area | Why not confident |
|---|---|
| Spread / ATS for NBA and MLB | Parser supports spread/ATS/cover wording. After `20260425001500_fix_simple_ask_goose_spread_line_extraction.sql`, spread rows with source `bookSpread`/`fairSpread` can grade from final scores. Keep this beta/caveated until all low-grade windows are re-audited. |
| NHL spread/puckline | NHL has 3,862 spread rows but only 14 graded; use “limited support” or hide from examples until grading is fixed. |
| Period/quarter/half/inning markets | Parser has keywords for P1/Q1/first half, and raw submarket labels exist, but `isGameLevelTeamMarketRow` intentionally narrows team-market focus away from period/quarter/half/inning submarkets. Do not market these as supported yet. |
| Player props | NHL query layer contains `player_prop` rows, but parser intentionally treats likely prop rows as not game-level team markets. User-facing Ask Goose should refuse/caveat player props for now. |
| NFL | API league allowlist includes NFL, but live `ask_goose_query_layer_v1` count is 0 rows. |

## Supported question patterns

Ask Goose should accept questions that map to these deterministic filters:

1. **Team x market**
   - Examples: “How have the Lakers done on the moneyline?”, “How have Dodgers overs performed?”
   - Fields used: `league`, `team_name`, `opponent_name`, `market_type`, `market_family`, `side`.

2. **Team vs opponent**
   - Examples: “How have the Knicks done against the Celtics?”, “How have Yankees unders hit vs the Red Sox?”
   - Fields used: `team_name`, `opponent_name`, plus optional market fields.

3. **Favorite / underdog splits**
   - Examples: “How have road dogs performed in MLB?”, “How have the Raptors done as favorites?”
   - Fields used: `is_favorite`, `is_underdog`, `is_home_team_bet`, `is_away_team_bet`.

4. **Totals side questions**
   - Examples: “How often have Blue Jays overs hit?”, “How have NBA unders done recently?”
   - Fields used: `market_family = total`, `market_type`, `side`, `line`, `result`, `graded`.

5. **Performance output questions**
   - Examples: “What is the record?”, “What is the ROI?”, “How many units?”
   - Fields used: `result`, `graded`, `profit_units`, `profit_dollars_10`, `roi_on_10_flat`.

## Unsupported/refusal guidance

Goose should refuse or strongly caveat:

- **Predictions:** “Who will win tonight?” unless reframed as historical data only.
- **News/injuries/rumors:** no live news source is part of this route.
- **Fantasy/player props:** not in current supported scope.
- **NFL:** no rows currently served.
- **Ungraded spread slices:** say the rows exist but cannot be honestly graded yet; supported only when a spread line and final score are available.
- **Tiny samples:** current answer logic warns when fewer than 5 graded rows match; product copy should preserve that warning.
- **Missing-line spread/total rows:** cannot grade without `line`.
- **Generic sports chat:** parser explicitly warns when the question does not look like a betting/database query.

## Exact source table and fields

Current app route reads from:

- `public.ask_goose_query_layer_v1`

Current route select list in `src/app/api/ask-goose/route.ts`:

- `candidate_id`
- `league`
- `event_date`
- `team_name`
- `opponent_name`
- `market_type`
- `submarket_type`
- `market_family`
- `market_scope`
- `side`
- `line`
- `odds`
- `sportsbook`
- `result`
- `graded`
- `profit_units`
- `profit_dollars_10`
- `roi_on_10_flat`
- `segment_key`
- `is_home_team_bet`
- `is_away_team_bet`
- `is_favorite`
- `is_underdog`
- `integrity_status`

Full table schema in `supabase/migrations/20260422000000_ask_goose_query_table_bootstrap.sql` also includes source/context fields such as:

- IDs/context: `canonical_game_id`, `event_id`, `sport`, `season`, `home_team`, `away_team`, `team_role`
- market flags: `is_home_favorite`, `is_away_favorite`, `is_home_underdog`, `is_road_underdog`, `is_road_favorite`, `is_spread_market`, `is_total_market`, `is_moneyline_market`
- totals context: `game_total_line`, `over_odds`, `under_odds`, `is_total_over_bet`, `is_total_under_bet`
- schedule/context: `is_prime_time`, `broadcast_window`, `is_back_to_back`, `is_divisional_game`, `days_since_previous_game`
- pregame records/previous game: `team_win_pct_pre_game`, `opponent_win_pct_pre_game`, `team_above_500_pre_game`, `opponent_above_500_pre_game`, `previous_game_shutout`, `previous_team_role`, `previous_moneyline_result`, `previous_over_result`, `previous_under_result`
- build metadata: `trends_build_version`, `refreshed_at`

## Parser capabilities found

Source: `src/lib/ask-goose/internal-query.ts` and `src/app/api/ask-goose/route.ts`.

- League allowlist: `NHL`, `NBA`, `MLB`, `NFL`; default fallback is `NHL`.
- Team aliases exist for NHL/NBA/MLB/NFL, but NBA/MLB aliases are mostly nicknames rather than full team names.
- Betting-question detection keywords include: `win rate`, `roi`, `units`, `profit`, `record`, `system`, `trend`, `cover`, `favorite`, `underdog`, `over`, `under`, `moneyline`, `spread`, `ats`, `perform`, `performance`, `lately`, `recent`, `against`, `head to head`, `total`.
- Market parser maps:
  - `moneyline` / `ml` → `moneyline`
  - `spread` / `ats` / `cover` → `spread`
  - `total` / `over` / `under` → `total`
  - `p1` / `period 1` / `first period` → `period_1`
  - `q1` / `first quarter` → `quarter_1`
  - `1h` / `first half` → `first_half`
- Side parser maps `over` and `under`, while avoiding `under` inside `underdog`.
- Recent parser recognizes `last 5`, `last 10`, `last 25`, and `recent`.
- Team-market filter intentionally excludes likely player props and most period/quarter/half/inning submarkets from confident game-level team-market answers.
- Answer output computes: sample size, graded rows, wins, losses, pushes, total units, average ROI, evidence rows, and warnings.

## Current live serving data snapshot

Pulled from Supabase REST against `ask_goose_query_layer_v1` on 2026-04-24.

| League | Date range | Total rows | Moneyline graded/all | Spread graded/all | Total graded/all | Player prop graded/all |
|---|---:|---:|---:|---:|---:|---:|
| NHL | 2026-03-01 → 2026-04-10 | 152,568 | 3,570 / 8,780 | 14 / 3,862 | 3,551 / 69,361 | 0 / 70,565 |
| NBA | 2024-02-01 → 2026-04-23 | 183,492+ | broad graded support | repaired spread support where line exists | broad graded support | 0 / 0 |
| MLB | 2024-02-22 → 2026-04-22 | 62,498+ | broad graded support | repaired spread support where line exists | broad graded support | 0 / 0 |
| NFL | none | 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |

## Product recommendation

For the first user-facing info panel, describe Ask Goose as:

> “Historical betting research for NBA/MLB game moneylines, totals, and supported spread/ATS spots, with limited NHL support.”

Do **not** use the current page’s old example prompts as public examples without updating them. `src/app/ask-goose/page.tsx` currently suggests P1/Q1/NFL-heavy prompts, but live data and parser behavior do not support those as confident public examples today. Spread examples can be used only with sample-size caveats.

Recommended examples for the UI:

- “NBA: How have the Raptors done on the moneyline recently?”
- “NBA: How have Lakers overs performed?”
- “MLB: How have the Blue Jays done as underdogs?”
- “NBA: How have Celtics spreads performed when favored?”
- “MLB: How have Yankees unders performed against the Red Sox?”
- “NHL: How have Leafs moneyline bets performed? (limited sample)”

## Evidence inspected

Files inspected:

- `src/app/api/ask-goose/route.ts`
- `src/lib/ask-goose/internal-query.ts`
- `src/app/ask-goose/page.tsx`
- `supabase/migrations/20260422000000_ask_goose_query_table_bootstrap.sql`
- `supabase/migrations/20260424152000_add_simple_ask_goose_league_materializer.sql`
- `supabase/migrations/20260424165000_grade_ask_goose_game_markets_from_scores.sql`
- `supabase/migrations/20260424223000_grade_ask_goose_by_matchup_scores.sql`
- `supabase/migrations/20260422232000_ask_goose_nhl_serving_source_v2.sql`
- `supabase/migrations/20260423005000_nhl_query_layer_replace_by_day.sql`
- `docs/ask-goose-serving-contract-v2.md`
- `docs/ask-goose-v2-serving-table-contract.md`

Commands/output used:

```bash
rg -l "ask_goose_query_layer|Ask Goose|ask_goose|query layer|query_layer" -S --glob '!node_modules' --glob '!tasks/**' --glob '!logs/**' --glob '!out/**' --glob '!coverage/**' .
```

Key output included `src/app/api/ask-goose/route.ts`, `src/lib/ask-goose/internal-query.ts`, `src/app/ask-goose/page.tsx`, Ask Goose docs, and Supabase migrations listed above.

```bash
# Supabase REST count snapshot, using .env.local service role; secrets omitted.
HEAD /rest/v1/ask_goose_query_layer_v1?league=eq.{LEAGUE}&market_family=eq.{MARKET}&graded=eq.true&select=candidate_id
```

Key output:

```text
NHL total 152568; moneyline 3570/8780 graded/all; spread 14/3862; total 3551/69361; player_prop 0/70565; date range 2026-03-01 to 2026-04-10
NBA total 183492; moneyline 40163/47657; spread 0/61470; total 66301/74365; date range 2024-02-01 to 2026-04-23
MLB total 62498; moneyline 14818/19370; spread 0/16077; total 22405/27051; date range 2024-02-22 to 2026-04-22
NFL total 0
```


## 2026-04-24 spread repair update

After this artifact was first drafted, migration `20260425001500_fix_simple_ask_goose_spread_line_extraction.sql` patched NBA/MLB simple serving materialization to extract spread lines from SportsGameOdds raw payload fields such as `bookSpread` and `fairSpread`. Repaired proof windows:

- MLB Sep 2024 spread rows: `1,783 / 5,107` graded after repair.
- NBA Oct 2024 spread rows: `1,384 / 2,718` graded after repair.
- NBA Nov 2024 spread rows: `4,082 / 6,008` graded after repair.

Product implication: spread/ATS can move from “do not promote” to “beta/caveated support where line + final score exist.” Still do not promise all spread history is clean until the remaining low-grade dates are separately repaired/audited.
