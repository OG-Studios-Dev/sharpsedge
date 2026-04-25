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