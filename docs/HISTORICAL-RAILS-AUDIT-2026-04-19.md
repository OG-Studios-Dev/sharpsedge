# Historical Rails Audit (2026-04-19)

Owner: Magoo  
Goal: determine the best realistic historical data stack for Goosalytics ML training across NHL, NBA, MLB, and NFL.  
Proof required: repo files, existing scripts, cache inventory, and provider documentation.  
Last updated: 2026-04-19 11:40 America/Toronto

## Executive verdict

We should **not** build the ML warehouse around a single odds provider.

Best architecture:
1. **Seed historical odds from what we already own** (`tmp/sgo-cache`)
2. **Backfill broader game/odds history from SBR archive rails**
3. **Use official/public league APIs for result truth, schedule truth, and grading**
4. **Use The Odds API historical only selectively**, for high-value gaps like closing-line, CLV, or specific premium markets
5. **Snapshot everything ourselves going forward** so provider plan changes stop dictating our ML roadmap

## Core findings

### 1) We already own meaningful historical inventory
Current repo cache inventory under `tmp/sgo-cache`:
- Total files: **1,174**
- MLB: **310**
- NBA: **382**
- NHL: **382**
- NFL: **100**

Observed date coverage from filenames:
- MLB: `2024-02-01T00_00_00.000Z` → `2026-04-18T00_20_00.000Z`
- NBA: `2024-02-01T00_00_00.000Z` → `2026-04-18T00_20_00.000Z`
- NHL: `2024-02-01T00_00_00.000Z` → `2026-04-18T00_20_00.000Z`
- NFL: `2024-02-01T00_00_00.000Z` → `2026-04-17T23_59_59.000Z`

Interpretation:
- This is already valuable historical seed inventory.
- It should be warehoused now.
- It is not safe to assume the same inventory can be regenerated later from the current SportsGameOdds free tier.

### 2) The repo already has a real SBR historical rail
Existing scripts and evidence:
- `scripts/sbr-historical-scrape.mjs`
- `scripts/backtest-systems.mjs`
- `scripts/backtest-optimize.mjs`

Those scripts point at these archive sources:
- `nba_archive_10Y.json`
- `nhl_archive_10Y.json`
- `mlb_archive_10Y.json`
- `nfl_archive_10Y.json`

The archive URLs are reachable now via raw GitHub.

Interpretation:
- SBR archive is not theoretical in this repo.
- It is already treated as a historical system-testing and backfill rail.
- It is strong enough to use as a major backfill source for team markets and game-level context.

### 3) The Odds API historical exists, but it is not a cheap warehouse backbone
Verified from The Odds API v4 docs:
- historical odds endpoints exist
- historical snapshots go back to **June 6, 2020**
- snapshot cadence is **10-minute intervals**, then **5-minute intervals from September 2022**
- historical event odds for extra markets like props/alternate/period markets are available after **2023-05-03T05:30:00Z**
- historical endpoints are **paid-only**
- cost for historical odds is **10x normal usage** per market per region

Interpretation:
- This is useful for **targeted premium backfill**.
- This is **not** the right primary rail for a broad multi-sport historical warehouse unless we want to spend real money fast.

### 4) Official/public truth rails are already strong for grading
Repo evidence shows the following current truth rails:
- **NHL**: official NHL API already wired in `src/lib/nhl-api.ts`
- **MLB**: MLB Stats API used widely across grading/enrichment
- **NBA**: ESPN-based rails power current NBA truth and grading
- **NFL**: SportsDataIO exists as a usable current direction for betting metadata / IDs, but NFL historical truth rail is weaker in-repo than NHL/MLB

Interpretation:
- NHL and MLB are the cleanest from a truth-data standpoint.
- NBA works technically now, but the licensing/commercial story is weaker.
- NFL is the least mature historical truth stack in this repo today.

## League-by-league audit

---

## NHL

### Historical truth rail
**Best available:** NHL official API

Why:
- Schedule, standings, game results, rosters, and goalie context are already first-class in the repo.
- NHL grading and context logic already relies on official NHL data.

### Historical odds rail
**Best available mix:**
1. existing SGO cache
2. SBR archive
3. targeted Odds API historical only if needed

### Suitability for ML warehouse
**Verdict: strongest overall league right now**

Why:
- clean official result truth
- existing historical odds seed inventory
- realistic archive option for older lines
- current repo already grades NHL outcomes from official rails

### Recommended NHL stack
- Truth: NHL API
- Historical odds seed: `tmp/sgo-cache`
- Older game/line history: SBR archive
- Premium gap-fill: Odds API historical, selectively

---

## NBA

### Historical truth rail
**Technically strong, commercially messy**

Current repo evidence:
- `src/lib/nba-api.ts` uses ESPN hidden API
- file explicitly warns: **not licensed for commercial use**
- `src/lib/sportsdataverse-nba.ts` is another ESPN-based fallback/supplement

### Historical odds rail
**Best available mix:**
1. existing SGO cache
2. SBR archive
3. targeted Odds API historical for specific markets like CLV / quarter lines if budget allows

### Suitability for ML warehouse
**Verdict: good for internal buildout, not clean enough as final commercial backbone**

Why:
- technically, NBA is very workable right now
- repo already has strong grading and quarter-score fallback paths
- but ESPN-based truth rail carries licensing risk for a commercial product

### Recommended NBA stack
- Near-term internal/training truth: ESPN + sportsdataverse fallback
- Commercial migration target: licensed NBA truth provider before scaling publicly
- Historical odds seed: `tmp/sgo-cache`
- Older game/line history: SBR archive
- Premium gap-fill: Odds API historical for targeted quarter/closing-line work

### Blunt note
NBA is usable for model development now, but it should be treated as a **migration-required rail**, not a forever rail.

---

## MLB

### Historical truth rail
**Best available:** MLB Stats API

Why:
- repo already uses MLB Stats API heavily across grading, lineups, enrichment, F5 linescore, probable starters, bullpen context, umpire extraction, handedness, and BvP
- this is already a serious MLB truth rail, not a stub

### Historical odds rail
**Best available mix:**
1. existing SGO cache
2. SBR archive
3. targeted Odds API historical if closing-line or premium market coverage matters

### Suitability for ML warehouse
**Verdict: best clean league for business-safe buildout**

Why:
- official/public truth rail is already deep
- game-state detail like F5 grading is already in place
- existing historical odds seed exists
- SBR can carry older line archive burden

### Recommended MLB stack
- Truth: MLB Stats API
- Historical odds seed: `tmp/sgo-cache`
- Older lines: SBR archive
- Premium gap-fill: Odds API historical only where value justifies spend

---

## NFL

### Historical truth rail
**Current state: weakest of the four**

Current repo evidence:
- SportsDataIO is present for NFL betting metadata direction
- `scripts/enrich-historical-league-ids.mjs` uses SportsDataIO for NFL historical ID resolution
- no equally mature official/public truth rail is wired in-repo at the same depth as NHL or MLB

### Historical odds rail
**Best available mix:**
1. existing SGO cache
2. SBR archive
3. targeted Odds API historical if we need premium historical event odds or specific props

### Suitability for ML warehouse
**Verdict: workable, but requires the most follow-up work**

Why:
- there is still enough to build an NFL warehouse path
- but NFL needs stronger canonical truth and ID mapping discipline than the other leagues
- historical betting metadata exists directionally, but the stack is not as mature in-repo yet

### Recommended NFL stack
- Truth: strengthen SportsDataIO / public result rail combination
- Historical odds seed: `tmp/sgo-cache`
- Older lines: SBR archive
- Premium gap-fill: Odds API historical when justified

### Blunt note
NFL is not blocked, but it is the least turnkey league in the current repo.

## Recommended source map by function

### A) Historical odds warehouse seed
Use first:
- `tmp/sgo-cache`

### B) Older broad backfill
Use next:
- SBR archive via `scripts/sbr-historical-scrape.mjs`

### C) Result truth / grading
- NHL → NHL API
- MLB → MLB Stats API
- NBA → ESPN now, licensed replacement later
- NFL → SportsDataIO/public result rail strengthening

### D) Premium selective historical enrichment
Use only when ROI is clear:
- The Odds API historical

Best use cases for Odds API historical:
- closing line / opening line features
- CLV research
- specific period markets
- selected props where we truly train and monetize

Bad use case:
- full multi-sport warehouse backfill at scale

## Execution order

### Phase 1 — warehouse what we already own
1. inventory and normalize all `tmp/sgo-cache` files
2. load into a durable historical warehouse table with provenance
3. preserve source metadata: `sportsgameodds_historical`, timestamps, bookmaker, line, market, candidate lineage

### Phase 2 — ingest SBR archive
1. run `scripts/sbr-historical-scrape.mjs`
2. populate `historical_game_odds`
3. keep provenance as `sbr-archive`

### Phase 3 — join to canonical game truth
1. NHL → NHL API IDs
2. MLB → MLB Stats API gamePk
3. NBA → current ESPN ids, then licensed migration later
4. NFL → strengthen SportsDataIO/public result mapping

### Phase 4 — premium selective enrichment
Only after the warehouse is stable:
- add targeted Odds API historical pulls for closing lines, CLV, or high-value prop families

### Phase 5 — never repeat this problem
- keep live/current odds snapshots running continuously
- persist them ourselves
- treat external APIs as input feeds, not memory

## Final recommendation

If the question is: **what should power the Goosalytics ML historical database?**

The answer is:
- **Primary warehouse seed:** existing SGO cache
- **Primary older backfill:** SBR archive
- **Primary truth rails:** NHL API, MLB Stats API, current NBA rail with future licensed migration, stronger NFL result rail
- **Selective premium supplement:** The Odds API historical

## Terminal status
- Done: audit completed with league-by-league verdicts and execution order
- Partial: warehouse ingestion and canonical join implementation still need to be executed
