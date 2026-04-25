# Ask Goose + Learning Model Unified Roadmap — 2026-04-24

- Owner: Magoo
- Goal: keep building toward the perfect Goosalytics system: trustworthy data warehouse, Ask Goose chatbot, system backtester, and learning-model betting pick generator across all sports.
- Proof required: live row counts from Supabase, repo artifacts, build/test output before any launch claim.
- Last updated: 2026-04-24
- Status: Partial — NBA/MLB are the current buildable rails; NHL/NFL need more work before full claims.

## North star

Goosalytics should become a closed-loop sports betting intelligence system:

1. **Warehouse** ingests odds, events, results, context, and system signals.
2. **Ask Goose** answers honest historical betting questions from curated serving tables.
3. **System Backtester** applies named systems over historical rows and produces reproducible year/league/market results.
4. **Learning Model** trains only on verified graded examples, system outcomes, and feature snapshots.
5. **Pick Generator** produces daily value picks with explanation, confidence, edge, and model/system evidence.
6. **QA/Settlement loop** grades everything and feeds results back into the learning layer.

No layer gets to invent missing data. Missing line, score, or context becomes an explicit caveat or exclusion reason.

## Current verified Ask Goose coverage

Live Supabase counts from `ask_goose_query_layer_v1` on 2026-04-24:

| League | Date range | Moneyline graded / total | Spread graded / total | Total graded / total | Current verdict |
|---|---:|---:|---:|---:|---|
| NBA | 2024-02-01 to 2026-04-23 | 40,163 / 47,657 | 5,466 / 61,470 | 66,301 / 74,365 | Strongest rail. Ready for many Ask Goose trend questions, especially ML/totals. Spreads are beta/caveated. |
| MLB | 2024-02-22 to 2026-04-22 | 14,818 / 19,370 | 1,783 / 16,077 | 22,405 / 27,051 | Strong rail for ML/totals; spreads beta/caveated. |
| NHL | 2026-03-01 to 2026-04-10 | 3,570 / 8,780 | 14 / 3,862 | 3,551 / 69,361 | Current-season partial only. Needs historical expansion and spread/puckline repair before broad claims. |
| NFL | none | 0 / 0 | 0 / 0 | 0 / 0 | Not ready. Must build/prove historical rail before Ask Goose or LM claims. |

## User-facing Ask Goose support levels

### Green: can support now with caveats

- NBA moneyline/totals trend questions across available historical range.
- MLB moneyline/totals trend questions across available historical range.
- Basic team/favorite/underdog/home/away splits where existing flags are populated.
- Context questions using current serving fields when data exists: prime time, back-to-back, divisional, previous game result, above/below .500.

Example green-ish questions:

- “NBA road teams on back-to-backs after a loss last year: profitable?”
- “MLB unders in 2024 by team: profitable?”
- “NBA home underdogs last season: profitable?”

### Yellow: beta/caveated

- NBA/MLB spread/ATS questions. Rows exist and are partially repaired, but grading coverage is thinner than ML/totals.
- NHL moneyline/total current-window questions. Useful but not two-year historical yet.
- Named-system backtests requiring quarter/F5/period lines.

### Red: not supported yet

- NFL trend questions.
- Player props as a public Ask Goose research rail.
- Claims requiring historical public bet/handle percentages unless that source is explicitly available.
- “All sports for two years” claims.

## Ask Goose chatbot build direction

Ask Goose should not be an unconstrained free-form SQL agent. It should be a constrained LLM router over curated query families.

### Query families to implement

1. League + market profitability
   - “Are NHL overs profitable?”
   - Filters: league, market_family, side, date range.

2. Team context trend
   - “How do Lakers perform as road favorites?”
   - Filters: team, role, favorite/underdog, market.

3. Schedule/context trend
   - “NBA teams on a road back-to-back after a loss.”
   - Filters: league, team_role, is_back_to_back, previous result, market.

4. Record/standings context
   - “NHL overs for teams under .500.”
   - Filters: league, team/opponent above .500 flags, side, total market.

5. System replay
   - “How did Mattys 1Q Chase perform last year?”
   - Reads from system backtest output, not raw rows directly.

### Required answer contract

Every answer must include:

- league/window/filters used
- sample size
- graded sample size
- wins/losses/pushes
- profit units and ROI
- data caveats
- 3-5 evidence rows
- explicit unsupported message when needed

## Learning model build direction

The learning model should not just train on raw historical rows. It needs tiers.

### Tier 1: market-side baseline

- Inputs: league, market, side, home/away, favorite/underdog, odds bucket, line bucket, rest, previous result, team/opponent pregame record.
- Labels: graded win/loss/push with integrity status OK only.
- Purpose: baseline probabilities and calibration.

### Tier 2: system overlays

- Inputs: deterministic system qualifiers and system historical performance.
- Purpose: tell model when a named angle is historically meaningful or weak.

### Tier 3: market movement + source consensus

- Inputs: opening/closing, best price, sportsbook dispersion, source count, capture phase.
- Purpose: identify true edge vs noisy stale prices.

### Tier 4: sport-specific enrichment

- NBA: rest, back-to-back, previous game result, team strength, quarter systems.
- MLB: starters, bullpen, park/weather, F5 markets.
- NHL: goalie status, rest/fatigue, xG/shot profile if reliable, puckline/totals.
- NFL: only after historical odds/results/context rail is proven.

## Immediate build sequence

1. **NHL expansion proof**
   - Extend Ask Goose NHL historical range beyond current 2026-only slice.
   - Repair NHL puckline/spread grading enough to stop the 14/3,862 spread issue.
   - Prove counts by market/date range.

2. **Ask Goose structured query engine v2**
   - Add parser support for date windows, roles, back-to-back, previous result, prime time, above/below .500, side, and market family.
   - Return structured JSON + natural-language explanation.

3. **System backtest dry-run runner**
   - First target: NBA “Mattys 1Q Chase” because quarter spread data is partially confirmed.
   - Output deterministic ledger and YoY summary without DB writes first.

4. **Training dataset v2**
   - Include only integrity-ok graded rows.
   - Add exclusion reasons.
   - Separate game-level markets from period markets and player props.

5. **Daily pick generator v1 hardening**
   - Model score + system score + edge threshold + odds availability check.
   - No pick without odds, data proof, and clear explanation.

## Non-negotiables

- No NFL claims until NFL serving rows exist and are graded.
- No “2 years all sports” claims until live counts prove it per league/market.
- No model training from ungradeable/manual_review rows.
- No user-facing picks below production thresholds: player props 70%+, team picks 65%+, all picks require 10%+ edge.
- No odds fabrication. If automated odds are missing, pull manually or say unavailable.

## Next proof target

NHL is the next unlock because it already has a large current serving footprint but weak historical range and spread grading. Once NHL is repaired, the public story becomes much stronger:

- NBA + MLB: strong ML/totals, beta spreads.
- NHL: current + historical ML/totals, repaired puckline/spread.
- NFL: next source-rail project.
