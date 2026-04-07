# BallDontLie API — Upgrade Map & Unlock Notes
_Last updated: 2026-04-06_

BDL charges ~$10/month per sport for paid tier access.
Free tier status tested 2026-04-06. Upgrade decisions tracked here.

---

## ✅ PGA — WIRED (Free Tier)

**Key:** `BALLDONTLIE_PGA_KEY` (env var)
**Base URL:** `pga.balldontlie.io`

Free tier unlocks:
- Tournaments (with courses, purse, status, city/state, champion)
- Tournament field
- Tournament results (official final leaderboard — used for pick grading)
- Player round results / stats / scorecards
- Season stats (scoring avg, GIR, driving accuracy, putts/round)
- Course stats
- Futures odds per tournament
- Tee times
- Player props

**Used in:**
- `src/lib/golf/bdl-pga.ts` — adapter
- `src/lib/golf-stats-engine.ts` — season stats + futures enrichment
- `src/lib/golf-live-data.ts` — fetches stats/futures/tee times per dashboard load
- `src/lib/system-grader.ts` — `gradePGAQualifiers()` grades Top5/10/20/Winner picks

**ROI:** High. Fills stats that were always null (GIR, driving accuracy, putts/round),
provides official grading source for PGA picks, adds tee times and futures odds.

---

## ⛔ MLB — NOT WIRED (Free Tier Dead End)

**Key:** Same as NBA (`BALLDONTLIE_API_KEY` at `api.balldontlie.io/v1`)
**Free tier:** Historical data only (pre-2001). No 2025/2026 season data. Standings empty. Injuries 404. Odds paywalled.
**Current source:** `statsapi.mlb.com` (better free source, already wired)

**Paid tier would unlock:**
- Current season games, scores, standings
- Live box scores
- Player stats (current season)
- Injuries
- Betting odds

**Upgrade case:** Low priority. `statsapi.mlb.com` covers scores/stats well for free.
Upgrade if we need richer injury data or odds not available from Odds API.

**Estimated value at $10/month:** Medium. Only worth it if MLB hit rate recovers
and we need deeper enrichment (lineups, injuries, live scoring edge).

---

## ⛔ NHL — NOT WIRED (Free Tier Dead End)

**Free tier:** Teams return all nulls. Games/standings/stats/odds all paywalled.
**Current source:** `api-web.nhle.com` + MoneyPuck (better free sources, already wired)

**Paid tier would unlock:**
- Current season games, scores, standings
- Live play-by-play
- Player stats
- Betting odds (BDL-aggregated)
- Injuries

**Upgrade case:** Low priority. NHL API is excellent free. Only worth it if we need
a second source for redundancy or BDL aggregates better odds than current stack.

**Estimated value at $10/month:** Low-medium. NHL data is already strong.

---

## ⛔ NBA — NOT WIRED (Partial Free Tier)

**Current source:** API-Sports Basketball v2 (already wired as Q1/Q3 fallback)
BDL NBA free tier: limited — no 2025 season odds, no live props.

**Paid tier would unlock:**
- Live quarter-by-quarter scoring (better window than API-Sports 2-day rolling)
- Current season stats, standings, injuries
- Player props
- Betting odds

**Upgrade case:** Medium. The 2-day rolling window on API-Sports is the main gap —
misses Q1/Q3 grading for games older than 48h. BDL paid would fix this.

**Estimated value at $10/month:** Medium. Worth it when NBA Goose is fully firing
and we want reliable retroactive Q1 grading beyond the 2-day window.

---

## ⛔ NFL — NOT WIRED (Free Tier Dead End)

**Free tier:** Teams work. Games start at 2002 (historical only). Players return null names. Stats/standings paywalled.
**Current source:** SportsDataIO (already wired, much richer for NFL)

**Paid tier would unlock:**
- Current season games, scores, standings
- Player stats
- Injuries
- Betting odds

**Upgrade case:** Very low. SportsDataIO already provides superior NFL data.
Only worth considering if SportsDataIO key expires and BDL is cheaper at renewal.

**Estimated value at $10/month:** Low.

---

## ⛔ MMA/UFC — NOT WIRED (Partial Free Tier)

**Key:** Same BDL key works (`api.balldontlie.io/mma`)
**Free tier works:**
- Future events (months out)
- Fighter profiles (record, reach, stance, weight class)

**Free tier paywalled:**
- Individual fight results
- Fight stats (strikes, takedowns, etc.)
- Betting odds

**Current source:** API-Sports MMA v1 (wired in UFC module, 3-day rolling window)

**Paid tier would unlock:**
- Full historical fight results
- Detailed fight stats
- Fighter rankings
- Betting odds
- Real-time results (beyond 3-day window)

**Upgrade case:** Medium-high. UFC module is live but thin on data — API-Sports
3-day window means old UFC card results disappear fast and fighter records are
unavailable. BDL MMA paid would give us permanent fight history + richer profiles.

**Estimated value at $10/month:** High relative to current UFC data gaps.
**Priority: Next sport to upgrade after BDL PGA is fully validated.**

---

## Upgrade Priority Order (when ready to pay)

1. **MMA** — biggest gap vs current source, fighter records + full history unlocked
2. **NBA** — solves Q1/Q3 grading window issue when Goose is fully firing
3. **NHL** — redundancy/resilience; current source is good enough for now
4. **MLB** — only if hit rate recovers and statsapi falls short
5. **NFL** — lowest priority, SportsDataIO already covers this well

---

## Notes
- BDL pricing: ~$10/month per sport (verify at balldontlie.io before purchasing)
- All sports use the same API key format; add new `BALLDONTLIE_{SPORT}_KEY` env vars
- Free tier limits: 5 req/min (PGA confirmed); paid tier rate limits unknown
- NFL BDL base URL: `nfl.balldontlie.io` (tested, confirmed free tier dead end)
- MLB/NHL/NBA BDL base URL: `api.balldontlie.io/v1` or `/nfl/v1` etc.
