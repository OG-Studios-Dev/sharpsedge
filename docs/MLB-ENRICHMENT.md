# MLB enrichment foundation

This pass adds the first reusable MLB enrichment rail for Goosalytics. It is intentionally modest: lineup status, venue weather context, and park-factor context for today's board per game.

## Current scope
- API route: `GET /api/mlb/enrichment`
- Default board date: today in `America/New_York`
- Coverage:
  - probable pitchers from the existing MLB schedule rail
  - lineup confirmation status from MLB's live game feed
  - weather from Open-Meteo using mapped stadium coordinates
  - park factors from an in-repo seed sourced from Baseball Savant

## Source decisions

### 1) Lineups
- Source: MLB Stats API live feed (`/api/v1.1/game/{gamePk}/feed/live`)
- Why: first-party, stable enough for official batting orders once MLB publishes them
- Honest limitation: pregame confirmed batting orders are not reliably exposed early enough for a stronger promise in this pass
- Behavior:
  - `official` when a club has a full batting order in the live feed
  - `partial` when only part of the game board is populated
  - `unconfirmed` when MLB has not published a usable order yet
- Non-goal in this pass: scraping third-party lineup pages just to force a confirmation label

### 2) Weather
- Source: Open-Meteo forecast API
- Keying: stadium coordinate map maintained in repo (`src/lib/mlb-stadiums.ts`)
- Cadence: cached in-memory for 20 minutes
- Notes:
  - open-air parks get hourly first-pitch weather
  - retractable-roof parks still get outdoor context, but roof status is explicitly unknown
  - indoor/fixed-dome treatment stays conservative

### 3) Park factors
- Source: Baseball Savant Statcast Park Factors page
- Seed style: in-repo JSON snapshot (`src/data/mlb-park-factors.json`)
- Why: avoids live scraping / repeated page fetches on every request
- Current seed: 2025 page, 3-year rolling window (`2023-2025`) where available
- Honest limitation: if a current venue is missing from the public seed, the board returns `missing` instead of inventing a factor

## Freshness and caching
- Schedule: existing MLB schedule fetch path
- Lineups: 5-minute in-memory cache per game
- Weather: 20-minute in-memory cache per stadium/date slot
- Park factors: file-backed seed committed in repo

## Intended downstream uses
- Falcons Fight Pummeled Pitchers: venue/weather/park context now available without touching pick logic
- Tony's Hot Bats: lineup + weather + park-factor groundwork exists, but lineup confirmation is still intentionally conservative
- Quick Rips F5: not supported yet; no F5 market or starter-mismatch model is implied by this rail

## What this pass intentionally does not claim
- no fake lineup confirmation
- no F5 support
- no roof-status certainty for retractable parks
- no third-party scrape dependency just to look more complete
