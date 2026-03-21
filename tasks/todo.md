# Today picks pipeline hardening — 2026-03-21
- [x] Reproduce why 2026-03-21 NHL slate is empty/incomplete on production
- [x] Patch API so persistence/integrity drift cannot silently zero out the live slate
- [x] Add self-healing/backfill behavior for incomplete empty slates where safe
- [x] Verify build + regression tests locally (live endpoint behavior to re-check after deploy)
- [ ] Deploy fix and re-check live today picks endpoint

# Reagan QA todo — 2026-03-19

- [x] Inspect live Goosalytics picks endpoints/pages for NHL and NBA today
- [x] Verify minimum pick volume vs actual scheduled games
- [x] Cross-check at least one live pick against a trustworthy public source/API
- [x] Verify streak claims are not false/inflated
- [x] Verify yesterday's picks resolve correctly W/L
- [x] Verify /props and /trends are populated/current-looking
- [ ] Patch trivial safe bug only if found, then verify
- [x] Summarize findings with evidence only

## Review
- Live site is generating 3 NHL picks and 3 NBA picks on 2026-03-19; minimum target is met.
- Official public schedules confirm games exist today: NHL 11 games via NHL API; NBA 8 games via ESPN scoreboard API.
- Cross-check passed for Viktor Arvidsson Over 0.5 Points: live pick says 70% hit rate over last 10; NHL public game log shows 7 hits in latest 10.
- No obvious false streak claim found in live pick reasoning. Team streak sample also matched sourced standings: BUF L10 9-1 on live pick matches NHL standings; NBA trend cards for LAC/MIL show W8 and live standings endpoint also shows W8.
- Live /props and /trends pages are populated and current-looking in browser automation; visible today matchups include WPG @ BOS, NYI @ OTT, BUF @ SJS, etc.
- Historical resolution is not healthy: /api/picks/history has 0 rows for 2026-03-18, and all six 2026-03-17 backfilled rows are still pending with null game_id. Resolver code returns pending when gameId is missing, so these rows will not auto-grade.
- No trivial safe repo-only patch was applied because the main live issue is historical/backfill grading, which needs a non-trivial fix plus deployment.

## Implementation Review
- Added authoritative daily slate locking via a new `pick_slates` schema path plus insert-only history persistence; same-date GETs now replay a locked slate instead of regenerating it.
- Stored explicit row provenance and full `pick_snapshot` payloads for new writes so original picks can be replayed without reconstructing fields from labels.
- Removed merge-style result persistence from the resolver; settlement writes now patch only `result`/`updated_at`, with legacy `pick_id` fallback.
- `/api/picks/history` and the history/admin UI now surface reconstructed and incomplete slates instead of masking them with file-backed fallback behavior.
- Local verification passed: `node --test --experimental-strip-types src/lib/pick-history-integrity.test.mts`, `npx tsc --noEmit`, and `npm run build`.
- Manual follow-up is still required in live Supabase: run the updated `scripts/setup-supabase.sql`, then explicitly relabel/seed the 2026-03-17 and 2026-03-18 reconstructed slates in `pick_history`/`pick_slates`.

# Pick performance KPIs — 2026-03-21
- [x] Add shared win % / sample-size helper for pick records
- [x] Show win % beside net units on home record bar
- [x] Show win % beside net units on picks page season record
- [x] Build + verify live UI paths

# Admin ops page — 2026-03-21
- [x] Inspect current admin dashboard structure and nav
- [x] Add IT leader / ops review page in admin
- [x] Create persistent bug log store with status/owner/severity
- [x] Surface open bugs as a dedicated unfixed queue
- [x] Add cron schedule section with add/edit controls
- [x] Build and verify admin routes
- [x] Add incident tracking section
- [x] Add cron run-health metadata (last run / success / failure / consecutive failures)
- [x] Add deploy/system snapshot cards (git + vercel cron visibility)

# Systems Tracking first pass — 2026-03-21
- [x] Inspect existing app structure, nav config, styling patterns, and admin-ops store pattern
- [x] Design a minimal file-backed systems tracking model and seed data
- [x] Add `data/systems-tracking.json` with NBA Goose System seed
- [x] Implement systems tracking store + derived metrics helper
- [x] Build public `/systems` page using existing design language
- [x] Add nav entry in the obvious shared nav config
- [x] Make the UI explicit about missing quarter spread line ingestion and placeholder metrics
- [x] Run `npm run build` and fix any issues
- [x] Commit changes locally with a clear message

## Systems Review
- `npm run build` passed locally.
- `/systems` now reads from a file-backed store and ships an honest first-pass state for the NBA Goose System.
- Metrics intentionally remain placeholder/awaiting data unless quarter-line-backed rows exist in the store.

# Systems catalog expansion + park/discard pass — 2026-03-21
- [x] Expand seeded catalog across NHL / NBA / MLB / NFL using fun public-facing system names
- [x] Mark each system clearly as trackable now, parked/definition-only, or blocked by missing data
- [x] For every blocked system, add exact missing-data notes and the source/input needed to unlock tracking later
- [x] Keep main `/systems` page compact while surfacing readiness/trackability at a glance
- [x] Ensure detail pages explain why a system is parked instead of pretending it is live
- [x] Run `npm run build` and review live drill-down UX
- [x] Commit cleanly after review

# Systems page mobile condense pass — 2026-03-21
- [ ] Reduce above-the-fold height on `/systems`, especially on mobile
- [ ] Replace bulky explainer block with compact title row + info icon/popup pattern
- [ ] Keep league pills and first system cards visible earlier without scrolling
- [ ] Make system cards denser for quick scan before drill-down
- [ ] Preserve honest trackability/readiness signals while trimming copy
- [ ] Run `npm run build`, review mobile-first UX, then commit + push

# Systems automation readiness memo — 2026-03-21

## Current stack reality check
- Current reusable rails already in repo:
  - NBA: `getNBASchedule`, `getRecentNBAGames`, `getNBAStandings`, current-game odds, ESPN summaries.
  - NHL: `getUpcomingSchedule`, `getTeamStandings`, `getTeamRecentGames`, `getGameGoalies`, current-game odds.
  - MLB: `getMLBSchedule`, `getRecentMLBGames`, `getMLBBoxscore`, probable pitchers, current-game moneyline/run-line/total odds.
  - NFL: `getNFLSchedule`, `getNFLStandings`, current-game odds.
- Missing across the catalog: historical close archives, public-betting splits, weather, confirmed MLB lineups, F5 markets, teaser pricing, external projection feeds, and structured news/xG tagging.
- That means the fastest next wins are systems that can run on schedule + standings + recent results + current odds, not systems that depend on outside feeds.

## Readiness classification by system
- NBA Goose System — ready to build now (already partially live; quarter-line capture is the only real ingestion gap).
- Beefs Bounce-Back / Big ATS Loss — needs missing data source.
- The Blowout — needs rules tightened.
- Hot Teams Matchup — needs rules tightened.
- Fat Tonys Fade — needs missing data source.
- Coaches Fuming Scoring Drought — needs missing data source.
- Swaggy Stretch Drive — needs rules tightened.
- Veal Bangers Playoff ZigZag — seasonal / defer.
- BigCat Bonaza PuckLuck — needs missing data source.
- Tony’s Hot Bats — needs missing data source.
- Falcons Fight Pummeled Pitchers — ready to build now.
- Falcons Fight Big Upset Follow-Ups — needs missing data source.
- Quick Rips F5 — needs missing data source.
- Warren Sharp Computer Totals Model — needs missing data source.
- Fly Low Goose — needs rules tightened.
- Tony’s Teaser Pleaser — needs missing data source.

## Top 5 after Goose

### 1) Falcons Fight Pummeled Pitchers
- Readiness: ready to build now.
- Why it makes the cut: MLB already has the cleanest non-Goose data stack in repo for team-level automation: probable starters, recent completed games, boxscores, and current prices.
- Exact qualifier rules currently implementable:
  - League = MLB.
  - Upcoming game must have a listed probable starter for the target team.
  - That starter must have a previous MLB start in the last 10 calendar days.
  - Previous start qualifies as “pummeled” if any of these are true: earned runs allowed >= 5, hits allowed >= 8, or innings pitched < 4.0.
  - Keep only starters whose current listed ERA is <= 4.50 to avoid treating obviously bad arms as rebound buys.
  - Only surface spots where current full-game moneyline is between -140 and +125.
- Exact current data inputs:
  - `getMLBSchedule` for upcoming games + probable pitchers.
  - `getRecentMLBGames` to locate the starter’s last team game window.
  - `getMLBBoxscore` for prior-start innings / hits / earned runs.
  - `getMLBOdds` or schedule-attached best moneyline for current price.
- Blockers / ambiguity risks:
  - No injury/velo/beat-report context, so some “bad start” games will really be hidden health issues.
  - Starter changes close to first pitch can flip qualifiers late.
  - This should not pretend to know whether the correct bet is ML, RL, or F5 until tracked.
- Initial product shape: tracked qualifiers + system alerts first; do not auto-publish picks yet.

### 2) Swaggy Stretch Drive
- Readiness: needs rules tightened.
- Why it makes the cut: NHL standings, schedule, goalie status, and moneylines already exist; the missing piece is a hard rulebook, not an external vendor.
- Exact qualifier rules currently implementable:
  - League = NHL.
  - Only run after March 15 and only for regular-season games.
  - Candidate team must be within 4 standings points of the conference playoff cut line with 10 or fewer games left.
  - Candidate team must have a confirmed/probable starting goalie who is not flagged as a backup.
  - Fade out obvious tax spots by requiring current moneyline between -150 and +120.
  - Optional guardrail for v1: skip second leg of a back-to-back if derived rest days = 0 from schedule history.
- Exact current data inputs:
  - `getTeamStandings` for points / games played / conference / division context.
  - `getUpcomingSchedule` + recent schedule history for games remaining / rest.
  - `getGameGoalies` for starter status and backup detection.
  - Aggregated NHL odds for current moneyline.
- Blockers / ambiguity risks:
  - Repo does not already expose a playoff cut-line helper, so wildcard math must be coded carefully.
  - “Urgency” can become narrative soup unless the standings threshold is kept rigid.
  - Goalie confirmations can arrive late.
- Initial product shape: system alerts only.

### 3) The Blowout
- Readiness: needs rules tightened.
- Why it makes the cut: NBA recent results, standings, and current prices are already present. This can ship as a clean qualifier tracker without pretending ATS history exists.
- Exact qualifier rules currently implementable:
  - League = NBA.
  - Team’s most recent game ended within the last 3 days.
  - Most recent game margin was >= 18 points either for or against that team.
  - Upcoming game spread must be in a manageable band (absolute value <= 6.5).
  - Opponent current win percentage must be >= .450 so the next spot is not just a cellar-dweller tax game.
- Exact current data inputs:
  - `getRecentNBAGames` for prior result margin and recency.
  - `getNBASchedule` for the next scheduled matchup and current spread.
  - `getNBAStandings` for opponent quality filter.
- Blockers / ambiguity risks:
  - This is a post-blowout spot, not the original stronger “relative to closing line” concept; no historical close archive exists.
  - Injuries / rest are not yet wired into the qualifier.
  - Bet direction is still ambiguous, so do not force a side pick initially.
- Initial product shape: tracked qualifiers + alerts, not picks.

### 4) Hot Teams Matchup
- Readiness: needs rules tightened.
- Why it makes the cut: easy to stand up from current NBA rails and useful as a discovery system even before it ever becomes a bet recommendation.
- Exact qualifier rules currently implementable:
  - League = NBA.
  - Both teams have won at least 4 of their last 5 completed games.
  - Both teams have season win percentage >= .550.
  - Current spread is within +/- 5.5.
  - Total is available for the game.
- Exact current data inputs:
  - `getRecentNBAGames` for last-5 win form.
  - `getNBAStandings` for season win percentage.
  - `getNBASchedule` / current odds for spread and total.
- Blockers / ambiguity risks:
  - “Hot” by straight-up wins is a blunt first-pass proxy; no ATS form or injury adjustment.
  - Could end up being more useful as a totals-watchlist than a side system.
  - Needs careful dedupe so the same game does not qualify twice from both team perspectives.
- Initial product shape: system alerts only.

### 5) Veal Bangers Playoff ZigZag
- Readiness: seasonal / defer.
- Why it still belongs in the top 5: the repo can support it with current NHL schedule/results/odds once playoffs start, and it is cleaner than chasing missing-data systems.
- Exact qualifier rules currently implementable:
  - League = NHL.
  - Only run during playoff series rematches.
  - Candidate team lost the prior game in the same series by 2+ goals.
  - Upcoming rematch is within 3 calendar days.
  - Current moneyline is between -125 and +140.
  - Skip if projected starter is a backup goalie.
- Exact current data inputs:
  - `getUpcomingSchedule` / `getBroadSchedule` for matchup continuity.
  - `getNHLGameLanding` or recent game results for prior-game margin.
  - `getGameGoalies` for starter status.
  - Aggregated NHL odds for current moneyline.
- Blockers / ambiguity risks:
  - Needs explicit playoff detection / series-state logic; not hard, but it is not already abstracted.
  - Only becomes testable once playoff slates are live.
  - Still just a filtered rematch concept unless line-move logic is added later.
- Initial product shape: system alerts only.

## Recommended build order
1. Falcons Fight Pummeled Pitchers
   - Best data fit today and easiest to log honestly without inventing inputs.
2. The Blowout
   - Cheap NBA follow-on using existing schedule + recent-results rails; good for qualifier logging.
3. Hot Teams Matchup
   - Same NBA rail reuse, minimal incremental ingestion work, likely useful as an alert surface.
4. Swaggy Stretch Drive
   - Worth building before the NHL stretch run fully closes, but only after the standings rulebook is locked.
5. Veal Bangers Playoff ZigZag
   - Prep the logic now, ship when playoff games are actually on the board.

## What not to prioritize yet
- Anything that needs a brand-new data vendor first: Fat Tonys Fade, Big ATS Loss, Coaches Fuming, BigCat PuckLuck, Tony’s Hot Bats, Quick Rips F5, Warren Sharp totals, Tony’s Teaser Pleaser.
- Fly Low Goose should stay parked until the real NFL Goose rulebook exists; otherwise it is just naming theater.

# Multi-system tracking architecture — 2026-03-21
- [x] Inspect current Goose tracker/store/routes and current cron shape
- [x] Design a reusable tracker-registry pattern for future systems
- [x] Add low-risk generic refresh scaffolding without changing current Goose UI flow
- [x] Write up shared vs system-specific boundaries and schema recommendation
- [x] Run `npm run build` and commit locally if clean
