# API Research — Multi-Sport Expansion

## Current Stack (NHL)
- **NHL API** (free, no key) — schedules, rosters, game logs, standings, boxscores
- **The Odds API** (key in env) — ML, spreads, totals, player props across all sports

---

## Recommended Stack by Sport

### NHL (current — keep as-is)
| Data | Source | Cost |
|------|--------|------|
| Schedules, stats, lineups, goalies | NHL API (nhle.com) | Free |
| Odds, props, lines | The Odds API | ~500 req/mo free |

### NBA (next)
| Data | Source | Cost |
|------|--------|------|
| Schedules, scores, boxscores | API-Sports (basketball) | 100 req/day free |
| Lineups, injuries | MySportsFeeds or NBA unofficial API (GitHub) | Free (personal) |
| Odds, props | The Odds API — add `basketball_nba` sport key | Same account |

### MLB
| Data | Source | Cost |
|------|--------|------|
| Schedules, stats | API-Sports (baseball) | 100 req/day free |
| Lineups, starting pitchers | MySportsFeeds | Free (personal) / ~$10/mo paid |
| Odds | The Odds API — add `baseball_mlb` | Same account |

### NFL (last)
| Data | Source | Cost |
|------|--------|------|
| Schedules, stats | API-Sports (american-football) | 100 req/day free |
| Depth charts, injuries | MySportsFeeds | Free (personal) |
| Odds | The Odds API — add `americanfootball_nfl` | Same account |

---

## API Comparison Summary

| API | Sports | Key Data | Free Tier | Best For |
|-----|--------|----------|-----------|----------|
| NHL API (nhle.com) | NHL only | Everything | Unlimited | NHL core data |
| The Odds API | All 4 + more | Odds/lines/props | 500 req/mo | Betting lines |
| API-Sports | All 4 + 30+ sports | Scores, lineups, stats | 100 req/day/sport | Multi-sport stats |
| MySportsFeeds | NHL/NBA/MLB/NFL | Deep stats, lineups, DFS | Free (personal use) | Lineups, injuries |
| Sports Game Odds | All 4 | Odds, props, futures | Limited free | Alternative odds source |

---

## Expansion Plan

### Phase 1 — NHL (done)
- NHL API + The Odds API already integrated

### Phase 2 — NBA
1. Add `basketball_nba` to The Odds API markets fetch
2. Integrate API-Sports basketball for rosters/lineups
3. Port stats engine to NBA (points, rebounds, assists, 3PM props)
4. Build NBA-specific team trends (home/road, ATS, O/U)

### Phase 3 — MLB
1. Add `baseball_mlb` to The Odds API
2. Starting pitcher is the #1 key data point (equivalent to goalie in NHL)
3. MySportsFeeds for confirmed starters
4. Stats: hits, runs, strikeouts, HR props

### Phase 4 — NFL
1. Add `americanfootball_nfl` to The Odds API
2. Injury report is critical (official NFL injury report Wed/Thurs/Fri)
3. Stats: passing yards, rushing yards, receiving yards, TDs, anytime scorer

---

## Notes
- The Odds API already handles all 4 sports — just change the sport slug in the URL
- Starting pitcher (MLB) / Starting QB status (NFL) = equivalent value to starting goalie (NHL)
- MySportsFeeds free tier is personal use only — need paid plan (~$10-30/mo per league) for production
- API-Sports 100 req/day limit could be tight for real-time — cache aggressively (15-min TTL)
- No single free API dominates news/injury reports — aggregate from official league sites + RSS
