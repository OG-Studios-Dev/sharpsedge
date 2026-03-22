# Sustainable Source Map — 2026-03-22

Purpose: recommend the next daily data sources to add for Goosalytics model enrichment **without** turning the stack into a brittle scraping hobby.

This roadmap is intentionally constrained by the current product truth:
- the six real focus systems are:
  - NBA Goose System
  - The Blowout
  - Hot Teams Matchup
  - Swaggy Stretch Drive
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- the repo already favors:
  - official APIs where available
  - cheap public APIs with clear caching
  - file-backed seeds/snapshots for slow-moving context
  - aggregated odds snapshots instead of pretending we already have a full warehouse
- the goal is **deeper durable signal**, not more noisy columns

Primary evidence used:
- `docs/CROSS-SPORT-DATA-LAYER.md`
- `docs/SYSTEM-DATA-LOGIC-AUDIT-2026-03-21.md`
- `docs/NHL-CONTEXT.md`
- `docs/MLB-ENRICHMENT.md`
- `src/lib/systems-tracking-store.ts`
- `src/lib/nhl-context.ts`
- `src/lib/mlb-enrichment.ts`
- `src/lib/golf-live-data.ts`
- `docs/NEXT-SPRINT.md` (golf / DataGolf direction)

---

## Executive recommendation

If Goosalytics wants sustainable daily enrichment, the winning pattern is:

1. **Keep official schedule / standings / lineup / boxscore rails as the spine**
2. **Add one durable, high-leverage source per sport-specific gap**
3. **Prefer daily snapshots over live scraping wherever the underlying signal moves slowly**
4. **Only scrape when the source is uniquely valuable and the product can survive stale/missing runs**
5. **Do not add maintenance-heavy “nice to have” feeds until the six live systems have stronger grading and validation rails**

The best near-term additions are not flashy. They are the rails that close current honesty gaps:
- NBA quarter-line history
- MLB starter-quality context
- MLB quality-of-contact context for hot-bats noise control
- NHL injury/news impact context that is more structured than title parsing
- Golf DataGolf API if golf remains strategically important

---

## What the current repo already does well

### Stable rails already present
- **NBA**: ESPN schedule, standings, summaries, embedded odds fallback, aggregated odds, system qualification logic
- **NHL**: NHL API schedule/standings/goalies, MoneyPuck team snapshot mirror + bundled fallback, official team-news links, aggregated odds
- **MLB**: MLB Stats API schedule/live feed/game logs, Open-Meteo weather, seeded Baseball Savant park factors, bullpen workload, F5 market availability when explicitly posted
- **Golf**: ESPN/PGA leaderboard + schedule + tournament history, DataGolf cache/scraper scaffolding, golf odds and prediction board
- **Cross-sport**: archived market snapshots, source freshness metadata, failure-safe persistence

### Current system gaps that matter most
From the repo audit, the main blockers are:
- **NBA Goose System**: quarter-line ingestion completeness and honest settlement coverage
- **The Blowout / Hot Teams Matchup**: richer schedule/form/close-vs-result context could improve confidence, but they still need a real decision rulebook more than exotic sources
- **Swaggy Stretch Drive**: better injury/news impact structure and historical market/CLV rails
- **Tony's Hot Bats**: opponent starter context, quality-of-contact noise control, stronger lineup completeness
- **Falcons Fight Pummeled Pitchers**: historical validation and stronger starter/F5 context

That means the roadmap should prioritize sources that directly improve these weak spots.

---

## Tier 1 — should add soon / sustainable

These are the highest ROI additions because they improve live systems, fit the existing architecture, and are maintainable.

### 1) NBA official play-by-play / boxscore quarter-split rail
- **Source/site name:** NBA Stats / NBA API official game endpoints (or a stable public mirror of official boxscore + play-by-play if direct access/rate limiting is an issue)
- **Sport(s):** NBA
- **Exact data to extract:**
  - official quarter-by-quarter scoring
  - team scoring splits by quarter
  - game status/finalization confirmation
  - ideally possession/pace context by quarter if cheaply available
- **Systems helped:**
  - NBA Goose System
  - The Blowout
  - Hot Teams Matchup
- **Recommended cadence:**
  - game-day every 10-15 minutes while games are live
  - final settlement pass after games end
  - daily backfill once overnight
- **Source type:** official API
- **Durability/risk notes:**
  - much more durable than scraping score pages
  - main risk is access friction, rate limiting, or anti-bot behavior depending on endpoint choice
  - if direct official endpoints are annoying, a narrow cached collector can still keep this sustainable
- **Why it is worth the maintenance cost:**
  - this directly closes the repo’s biggest honesty gap for Goose: quarter completeness and settlement confidence
  - it also gives Blowout and Hot Teams better quarter-context without inventing anything

### 2) MLB Statcast / Baseball Savant daily hitter + pitcher quality-of-contact snapshot
- **Source/site name:** Baseball Savant Statcast leaderboard/search exports
- **Sport(s):** MLB
- **Exact data to extract:**
  - hitter last-7 / last-14 rolling metrics: hard-hit%, barrel%, xwOBA, avg EV, sweet-spot%
  - pitcher rolling contact suppression or damage metrics: xwOBA allowed, barrel%, hard-hit%, avg EV allowed
  - optionally batter vs pitch-type tendencies if kept narrow later
- **Systems helped:**
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- **Recommended cadence:** daily snapshot, once early morning ET
- **Source type:** public data export / scraper-backed snapshot
- **Durability/risk notes:**
  - safer if ingested as one daily snapshot instead of many per-player requests
  - Baseball Savant pages can be clunky, but daily exports/snapshots are still far more sustainable than constant game-day scraping
  - treat this as a stored daily context rail, not a live dependency during request-time rendering
- **Why it is worth the maintenance cost:**
  - this is the cleanest way to reduce false positives in Tony’s Hot Bats from empty batting-average heat
  - it also upgrades Falcons from “recent shelling” toward “recent shelling plus still-competent underlying pitcher”

### 3) MLB probable-starter quality rail from FanGraphs leaderboard exports
- **Source/site name:** FanGraphs pitcher leaderboards / splits export
- **Sport(s):** MLB
- **Exact data to extract:**
  - season and rolling starter metrics: K-BB%, SIERA, xFIP, swinging-strike%, ground-ball rate
  - handedness
  - split performance vs RHB/LHB if kept narrow
- **Systems helped:**
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- **Recommended cadence:** daily snapshot
- **Source type:** public export / scraper-backed snapshot
- **Durability/risk notes:**
  - better as a daily leaderboard export than as ad hoc page scraping
  - moderate durability risk, but acceptable if snapshot-based and cached in-repo/Supabase
- **Why it is worth the maintenance cost:**
  - the repo explicitly calls out opponent starter context as missing for Tony’s Hot Bats
  - this is a much more honest filter than relying on ERA or vibes alone

### 4) NHL player availability / injury rail from official team game notes + NHL API roster status where available
- **Source/site name:** NHL team official game notes / NHL API roster & gamecenter status surface
- **Sport(s):** NHL
- **Exact data to extract:**
  - confirmed scratches / IR / LTIR tags when exposed
  - top-line / top-pair absences if official notes expose them
  - probable lineup changes and goalie confirmation status
- **Systems helped:**
  - Swaggy Stretch Drive
- **Recommended cadence:**
  - daily baseline snapshot in the morning
  - game-day refresh every 1-2 hours
- **Source type:** official API + official-site scrape
- **Durability/risk notes:**
  - official team sites are annoying but far more defensible than rumor feeds
  - keep scope narrow: availability tags, not quote sentiment theater
  - if a team page fails, the system should degrade gracefully to goalie + standings + MoneyPuck only
- **Why it is worth the maintenance cost:**
  - Swaggy already has urgency/xG/goalie/fatigue; the missing layer is structured availability impact
  - this improves decision quality without chasing social-media nonsense

### 5) DataGolf API
- **Source/site name:** DataGolf API
- **Sport(s):** Golf
- **Exact data to extract:**
  - player skill ratings
  - pre-tournament win / top-5 / top-10 / make-cut probabilities
  - strokes-gained decomposition
  - course-fit and field-strength context
  - live update endpoints if cost justified later
- **Systems helped:**
  - current golf prediction board and any future golf model layer
- **Recommended cadence:**
  - daily for field + prediction snapshots before tournament start
  - round-based refreshes while event is live
- **Source type:** paid API
- **Durability/risk notes:**
  - highest durability here because it replaces brittle public scraping with a vendor product
  - main risk is cost, not breakage
- **Why it is worth the maintenance cost:**
  - if golf matters strategically, this is the rare paid feed that clearly reduces maintenance burden instead of increasing it
  - much better than doubling down on scraping public DataGolf pages forever

### 6) Expanded cross-sport market history cadence using current aggregator
- **Source/site name:** existing aggregated board snapshot rail (`odds-aggregator` + current books)
- **Sport(s):** NBA, NHL, MLB, golf where available
- **Exact data to extract:**
  - more frequent open / mid / close snapshots
  - explicit first-seen and latest-seen price per market
  - stale-source flags by book and market
- **Systems helped:**
  - NBA Goose System
  - The Blowout
  - Hot Teams Matchup
  - Swaggy Stretch Drive
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- **Recommended cadence:**
  - current hourly is fine as floor
  - add sport-aware cadence: every 30 min on active slates, every 10-15 min in 90 minutes pregame, final close capture near lock
- **Source type:** existing internal aggregator / public API + scraper mix already in repo
- **Durability/risk notes:**
  - this is the lowest-risk improvement because the rail already exists
  - the real work is scheduling and storage policy, not new scraping
- **Why it is worth the maintenance cost:**
  - gives every live system a better historical market context and eventual CLV/validation rail
  - this is foundational, not decorative

---

## Tier 2 — useful but higher-maintenance

These could add signal, but they either carry more operational risk or should wait until Tier 1 is stable.

### 7) NBA team advanced form rail from Basketball Reference or NBA advanced team pages
- **Source/site name:** Basketball Reference team game logs / advanced splits, or official NBA advanced team stats endpoints
- **Sport(s):** NBA
- **Exact data to extract:**
  - rolling offensive rating / defensive rating / net rating
  - pace
  - ATS margin vs closing spread if derivable from your own history
  - home/road splits over last 5/10 games
- **Systems helped:**
  - The Blowout
  - Hot Teams Matchup
  - NBA Goose System
- **Recommended cadence:** daily
- **Source type:** scraper or official API depending endpoint choice
- **Durability/risk notes:**
  - useful, but not essential before the Goose quarter rail and market-history rails are stronger
  - scraping BR is workable but not something to make mission-critical without caching
- **Why it is worth the maintenance cost:**
  - improves form/context quality for Blowout and Hot Teams, especially if those systems stay qualifier-only for a while

### 8) Rotowire / Covers / MLB lineup fallback parser
- **Source/site name:** Rotowire, Covers, or similar lineup pages
- **Sport(s):** MLB
- **Exact data to extract:**
  - likely batting order before MLB official feed posts a complete lineup
  - confirmed/probable starter corrections
- **Systems helped:**
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- **Recommended cadence:** game-day only, every 15-30 min in the lineup window
- **Source type:** scraper / fallback
- **Durability/risk notes:**
  - useful as fallback, but this is exactly the type of brittle dependency the current repo wisely avoided as a primary rail
  - should never overwrite official MLB lineup status; only annotate pre-official expectations
- **Why it is worth the maintenance cost:**
  - can improve same-day usability, but only if clearly labeled as non-official

### 9) NHL natural stat trick or similar public shot-based team/game export
- **Source/site name:** Natural Stat Trick
- **Sport(s):** NHL
- **Exact data to extract:**
  - rolling 5v5 xGF%, SCF%, HDCF%, shooting/save PDO
  - team splits by last 10 / last 20
- **Systems helped:**
  - Swaggy Stretch Drive
- **Recommended cadence:** daily
- **Source type:** scraper/export
- **Durability/risk notes:**
  - valuable, but overlapping with MoneyPuck enough that this is not a first-wave need
  - extra maintenance only makes sense if it meaningfully outperforms the current MoneyPuck snapshot for Swaggy decisions
- **Why it is worth the maintenance cost:**
  - adds more nuanced form/luck context, but Swaggy does not need two overlapping xG rails before it has stronger injury/news tagging and market history

### 10) MLB umpire assignment rail
- **Source/site name:** MLB umpire assignment pages / trusted public tracker
- **Sport(s):** MLB
- **Exact data to extract:**
  - home plate umpire
  - over/under lean, strikeout/walk tendencies, run environment tendency
- **Systems helped:**
  - Tony's Hot Bats
  - Falcons Fight Pummeled Pitchers
- **Recommended cadence:** game-day only once assignments post
- **Source type:** scraper / public tracker
- **Durability/risk notes:**
  - game-day only and can be flaky depending source
  - should stay contextual rather than core logic at first
- **Why it is worth the maintenance cost:**
  - real edge potential, but not before opponent-starter and Statcast rails are live

### 11) Public betting splits feed for NBA narrative systems
- **Source/site name:** Action Network, VSIN, Pregame, or other public splits pages if accessible
- **Sport(s):** NBA
- **Exact data to extract:**
  - ticket %
  - handle %
  - consensus side / total percentages
- **Systems helped:**
  - mostly future systems, secondarily The Blowout / Hot Teams Matchup as context only
- **Recommended cadence:** every 1-2 hours game-day
- **Source type:** scraper / paid/public hybrid depending source
- **Durability/risk notes:**
  - fragile, inconsistent, and often legally/operationally messy
  - the repo already calls out splits as a blocker for a different NBA system; that honesty is correct
- **Why it is worth the maintenance cost:**
  - only worth it if Marco explicitly wants public-vs-market context. Not essential for the six current focus systems.

---

## Tier 3 — not worth it yet / park

These are tempting, but they are not good value right now.

### 12) Social sentiment / quote scraping from X, Reddit, podcasts, or generic news blurbs
- **Source/site name:** X/Twitter, Reddit, podcasts, blog/news scraping
- **Sport(s):** NBA, NHL, MLB
- **Exact data to extract:** vague sentiment, quote fragments, hype narratives
- **Systems helped:** none reliably
- **Recommended cadence:** none
- **Source type:** scraper / social API / manual
- **Durability/risk notes:**
  - high noise, brittle collection, weak reproducibility
  - easily turns into fake precision and maintenance hell
- **Why it is worth the maintenance cost:** it isn’t, yet

### 13) Browser automation against sportsbook UIs for richer market data
- **Source/site name:** direct sportsbook web frontends via headless browser
- **Sport(s):** NBA, NHL, MLB, golf
- **Exact data to extract:** alternate markets, props, richer close lines
- **Systems helped:** maybe all later
- **Recommended cadence:** none for now
- **Source type:** scraper/browser automation
- **Durability/risk notes:**
  - highest maintenance path on the board
  - constant DOM drift, blocks, geo/account friction
  - unjustified while current systems are still mostly qualifier-first
- **Why it is worth the maintenance cost:** not worth it yet

### 14) Player prop explosion before core systems are validated
- **Source/site name:** any props-heavy source expansion
- **Sport(s):** NBA, MLB, NHL, golf
- **Exact data to extract:** player prop markets and niche alt lines
- **Systems helped:** not the six current focus systems in a foundational way
- **Recommended cadence:** park
- **Source type:** API / scraper
- **Durability/risk notes:**
  - seductive scope creep
  - multiplies storage, rate-limit, and validation burden before core model rails are proven
- **Why it is worth the maintenance cost:** not yet

### 15) Full live web scrape dependence for golf DataGolf public pages
- **Source/site name:** DataGolf public web pages only
- **Sport(s):** Golf
- **Exact data to extract:** rankings, predictions, course fit, field updates
- **Systems helped:** golf board
- **Recommended cadence:** park as primary; keep only as temporary fallback
- **Source type:** scraper
- **Durability/risk notes:**
  - the repo already notes URL changes and scraping fragility
  - if golf is important enough, buy the API instead of building around breakable public pages
- **Why it is worth the maintenance cost:** it mostly isn’t, except as a temporary bridge

---

## Best source by system

### NBA Goose System
Best additions:
1. NBA official quarter-split / play-by-play rail
2. stronger cross-sport market-history cadence
3. optional NBA advanced team-form rail

Why:
- Goose is already real, but quarter settlement completeness is the main integrity gap.

### The Blowout
Best additions:
1. stronger market-history cadence
2. NBA advanced team-form rail
3. official quarter-split rail as contextual support

Why:
- the bigger missing piece is still a bet-direction rulebook, so don’t overspend on sources before that exists.

### Hot Teams Matchup
Best additions:
1. stronger market-history cadence
2. NBA advanced team-form rail
3. official quarter-split rail

Why:
- same story as Blowout: better context is useful, but rule clarity matters more than fancy sourcing.

### Swaggy Stretch Drive
Best additions:
1. official NHL availability / injury rail
2. stronger market-history cadence
3. optional second xG/form rail only after the first two are stable

Why:
- urgency + goalie + MoneyPuck + fatigue is already pretty good. What’s missing is structured availability impact and eventual CLV history.

### Tony's Hot Bats
Best additions:
1. Baseball Savant Statcast hitter snapshot
2. FanGraphs starter-quality rail
3. stronger market-history cadence
4. optional lineup fallback parser later

Why:
- this system most needs noise control and opponent-starter context.

### Falcons Fight Pummeled Pitchers
Best additions:
1. FanGraphs starter-quality rail
2. Baseball Savant pitcher-contact snapshot
3. stronger market-history cadence
4. optional umpire rail later

Why:
- Falcons is already live, but needs historical validation and better separation between “blown up once” and “actually broken pitcher.”

---

## Top 5 source additions in priority order

1. **NBA official quarter-split / play-by-play rail**
   - closes the biggest honesty gap in a live system immediately

2. **MLB Statcast daily hitter + pitcher quality-of-contact snapshot (Baseball Savant)**
   - biggest model-quality upgrade for Tony’s Hot Bats and a real assist for Falcons

3. **MLB probable-starter quality snapshot (FanGraphs exports)**
   - directly fills a documented missing dependency in Tony’s Hot Bats and sharpens Falcons

4. **Expanded market snapshot cadence on the existing aggregator**
   - helps all six focus systems and requires less new maintenance than a new source

5. **NHL official availability / injury rail**
   - most valuable next contextual add for Swaggy without going full brittle-news-scrape mode

If golf is strategically important enough to pay for, **DataGolf API** is the next best move after those five.

---

## Implementation bias / rails

To keep this sustainable, each new source should follow these rules:

1. **Snapshot first, query later**
   - for slow-moving leaderboards/ratings, ingest once daily into a normalized cache/table/file
   - do not hit external pages on every request

2. **Sourced vs derived must stay separate**
   - especially for NHL urgency, MLB lineup certainty, and baseball hot-bat logic

3. **Every source gets freshness metadata**
   - fetchedAt
   - staleAfter
   - source kind
   - fallback reason if degraded

4. **Primary + fallback only where truly needed**
   - do not build three fallbacks for a source that is optional context

5. **No source should become critical unless the product can survive it being stale**
   - stale context is acceptable
   - fake certainty is not

---

## Bottom line

The repo is already leaning the right way: official where possible, cached context rails, snapshot history, and honest handling of missing data.

The smartest next moves are:
- fix NBA Goose settlement completeness
- make MLB hitter/starter context smarter with daily snapshot rails
- upgrade Swaggy with structured availability context
- improve market-history cadence before chasing shiny niche feeds
- buy DataGolf API if golf is important enough, instead of betting the product on scraping it
