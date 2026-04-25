# Goosalytics Systems Registry Extract — 2026-04-24

- Owner: Magoo
- Goal: Track down the full systems page/source Marco referenced and extract the named systems for LM year-over-year backtesting.
- Source of truth inspected: `data/systems-tracking.json`
- Systems found: 24
- Status: Done — extraction artifact created; next step is mapping each system to historical backtest eligibility.

## Full system list

| # | System | League | Status | Trackability | Summary | Records | Markets observed |
|---:|---|---|---|---|---|---:|---|
| 1 | Mattys 1Q Chase NBA (nba-goose-system) | NBA | tracking | trackable_now | Road favorite quarter ATS chase: 1Q first, then 3Q only if the opener loses. | 10 | — |
| 2 | Big Cats NBA 1Q Under (big-cats-nba-1q-under) | NBA | tracking | trackable_now | NBA first-quarter under system built from historical total-band validation. Fires when full-game total sits in the 210 to 225 range. | 4 | first-quarter-total |
| 3 | The Centurion Comeback (beefs-bounce-back-big-ats-loss) | NBA | awaiting_verification | blocked_missing_data | NBA revenge-cover angle for teams coming off a brutal ATS miss, cataloged honestly as blocked until prior-game line history is wired in. | 0 | — |
| 4 | Beefs Blowout (the-blowout) | NBA | paused | parked_definition_only | NBA blowout-reaction system is live: when the trigger fires, it stores the qualified team moneyline as a real pick. | 3 | — |
| 5 | Hot Teams Matchup (hot-teams-matchup) | NBA | paused | parked_definition_only | NBA hot-teams collision system is live: when the trigger fires, it stores a real full-game over pick. | 0 | — |
| 6 | Fat Tony's Road Chalk (fat-tonys-road-chalk) | NBA | tracking | trackable_now | Contrarian NBA fade: public piles one-sided on spread, line inflated in that direction, fade the inflated side. Both rails live — Action Network splits + Supaba | 0 | — |
| 7 | Coach, No Rest? (coach-no-rest) | NHL | awaiting_data | trackable_now | NHL rest-disparity system. Backs the better-rested side when one team plays on zero rest (back-to-back) and the opponent has 2+ days off. Daily-trackable from N | 1 | moneyline |
| 8 | Swaggy's Stretch Drive (swaggy-stretch-drive) | NHL | awaiting_data | trackable_now | Late-season NHL live pick rail now uses explicit urgency, goalie, fatigue, MoneyPuck, and price gates. Conservative rules, not a claimed mature edge. | 0 | — |
| 9 | Yo Adrian! Playoff ZigZag (veal-bangers-zig-playoff-zigzag) | NHL | definition_only | parked_definition_only | Classic playoff zig-zag riff preserved exactly by name, but parked until the real rematch filters are defined beyond old-school folklore. | 0 | — |
| 10 | BigCat Bonaza PuckLuck (bigcat-bonaza-puckluck) | NHL | paused | parked_definition_only | NHL 5v5 process-vs-results screener. Targets teams whose xG process diverges meaningfully from actual results — underfinishing teams (high xG%, low goals/xGoals | 7 | moneyline |
| 11 | Tony's Tight Bats (tonys-hot-bats) | MLB | paused | parked_definition_only | MLB tight-bats concept is OFF until recent-hitter context becomes a real directional picks rule with validation. | 100 | context-board, context-total-board |
| 12 | Veal Banged Up Pitchers (falcons-fight-pummeled-pitchers) | MLB | tracking | trackable_now | MLB rebound-starter system. When it passes the gate, it becomes a real stored moneyline pick. | 15 | moneyline |
| 13 | Falcons Fight Big Upset Follow-Ups (falcons-fight-big-upset-follow-ups) | MLB | definition_only | parked_definition_only | MLB post-upset follow-up concept parked until the actual upset threshold and next-game action are specified. | 0 | — |
| 14 | Robbie's Ripper Fast 5 (robbies-ripper-fast-5) | MLB | tracking | trackable_now | MLB first-five qualifier board targeting starter mismatches when F5 markets are posted. Alerts when a meaningful quality gap and live F5 price both exist. Gradi | 100 | context-board |
| 15 | Dougy Magoo's AI Model (warren-sharp-computer-totals-model) | NFL | source_based | blocked_missing_data | External-model totals concept blocked until an actual projections feed and line archive are attached. | 0 | — |
| 16 | Joey on the LOW LOW (fly-low-goose) | NFL | definition_only | parked_definition_only | Reserved NFL Goose-family slot parked until the actual qualifier logic exists on paper. | 0 | — |
| 17 | Goosies Teaser Pleaser (tonys-teaser-pleaser) | NFL | source_based | blocked_missing_data | Source-based NFL teaser framework blocked until teaser prices, leg rules, and key-number screening are actually stored. | 0 | — |
| 18 | Home Dog with Majority Handle (nba-home-dog-majority-handle) | NBA | paused | parked_definition_only | NBA home underdog receiving majority (≥ 55%) of ML handle dollars. Public money contradicts the spread favorite — potential steam on the dog or narrative mis-pr | 0 | — |
| 19 | Home Super-Majority Handle (Close Game) (nba-home-super-majority-close-game) | NBA | paused | parked_definition_only | NBA games where the home team attracts ≥ 65% of ML handle dollars AND the spread is within ±4 points. Super-majority public money on the home side in a genuinel | 0 | — |
| 20 | NHL Home Dog — Majority Handle (nhl-home-dog-majority-handle) | NHL | paused | parked_definition_only | NHL home underdog receiving majority (≥ 60%) of ML handle dollars. Public money contradicts the road favorite — potential steam or narrative mis-pricing. Thresh | 1 | moneyline |
| 21 | NHL Under — Majority Handle (nhl-under-majority-handle) | NHL | tracking | trackable_now | NHL under handle system. When it passes the gate, it becomes a real stored full-game under pick. | 0 | — |
| 22 | MLB Home — Majority Handle (mlb-home-majority-handle) | MLB | paused | parked_definition_only | MLB games where the home team receives ≥ 60% of ML handle dollars. Threshold tightened 2026-03-29 from 55% — 55% fires too broadly given home-team bias baseline | 0 | — |
| 23 | MLB Under — Majority Handle (mlb-under-majority-handle) | MLB | tracking | trackable_now | MLB under handle system. When it passes the gate, it becomes a real stored full-game under pick. | 0 | — |
| 24 | NFL Home Dog — Majority Handle (nfl-home-dog-majority-handle) | NFL | paused | parked_definition_only | NFL home underdog receiving majority (≥ 55%) of ML handle. System logic is wired and ready; dormant during the off-season (no current NFL slate). | 0 | — |

## Marco-provided examples matched

- Mattys 1Q Chase: Mattys 1Q Chase NBA / nba-goose-system
- Veal Banged Up Pitchers: Veal Banged Up Pitchers / falcons-fight-pummeled-pitchers
- Coach: Coach, No Rest? / coach-no-rest
- Robbie: Robbie's Ripper Fast 5 / robbies-ripper-fast-5

## Backtest registry implications

Each system must be treated as a named strategy, not a generic market. For each one, the LM/backtest runner needs:

- canonical `system_id` / `slug`
- league and market family/scope
- exact qualifier rules from `qualifierRules` and `definition`
- required data fields from `dataRequirements`
- record rows / live picks from `records` and `system_qualifiers` where available
- historical eligibility mapping into `ask_goose_query_layer_v1` / Goose2 market-result rows
- yearly output: attempts, wins/losses/pushes, win %, units, ROI, max drawdown if available, and data-quality flags

## JSON artifact

Full structured extract: `tmp/systems-registry-extract-2026-04-24.json`