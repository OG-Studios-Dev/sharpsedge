# Rail upgrades shipped — 2026-03-22

This pass intentionally prioritized sustainable rails already supportable by the repo over brittle breadth.

## Shipped now

### 1) NBA Goose quarter / settlement honesty upgrade
- Goose qualifier rows now carry explicit `sourceHealthStatus` and `freshnessSummary` fields.
- Missing quarter-line or quarter-score dependencies are surfaced directly on each row instead of being implied only in notes.
- This keeps settlement completeness honest from day 1, especially when 1Q/3Q market coverage is partial.

### 2) MLB daily quality snapshot upgrade (best sustainable approximation)
- `getMLBEnrichmentBoard()` now exposes:
  - `probableStarters`
  - `starterQuality`
  - `qualitySnapshots`
  - per-game `sourceHealth`
- This is **not** pretending to be a full live Statcast rail.
- Instead, it ships the best sustainable repo-native approximation available right now:
  - hitter quality remains recent-game-log / lineup-aware context
  - pitcher quality uses official probable starters plus conservative ERA/form summary

### 3) MLB probable-starter quality rail
- Probable starters are now first-class on the MLB enrichment board.
- Each side gets a simple quality summary plus a bounded quality score derived from currently available official data.
- This also sharpens downstream MLB systems like Falcons and Tony's Hot Bats without claiming fake precision.

### 4) Market snapshot cadence / health checks
- Market snapshots now include a `health` block with:
  - status
  - cadence minutes vs expected cadence
  - summary text
- Aggregated snapshot API responses now expose this health directly and warn when cadence slips or upstream books are stale.

### 5) NHL official availability / injury rail (conservative approximation)
- The NHL context board now exposes:
  - `availability`
  - `sourceHealth`
- The availability rail is intentionally conservative:
  - official nhl.com team-site links
  - roster-move / game-day signal tags from official headlines
  - no fake player-level injury certainty inference
- Swaggy qualifier rows now store availability/news tag health summaries.

### 6) Daily checks from day 1
- Admin/system health now includes:
  - Market snapshot cadence
  - MLB enrichment board health
  - NHL official availability rail health
- Existing cron tracking was updated so these daily rails are visible as operational surfaces immediately.

## What was intentionally not overclaimed

### Deferred / partial
- Full NBA Goose historical backfill across prior dates: deferred
- Real Statcast daily hitter/pitcher snapshot rail: partial only via sustainable approximation
- True NHL player-level official injury feed: deferred (not honestly present in repo/source stack yet)
- Higher-frequency market-history expansion beyond current hourly cadence: deferred

## Why this cut was chosen
- It improves honesty, freshness visibility, and source durability.
- It strengthens the existing six real systems rather than adding a fragile seventh/eighth pseudo-rail.
- It creates operational checks that can fail loudly instead of silently drifting.
