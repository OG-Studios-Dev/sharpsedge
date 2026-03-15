# API Resilience & Fallback Strategy

## Current Data Sources + Fallbacks

### NHL
| Priority | Source | Endpoint | Status |
|---|---|---|---|
| Primary | NHL Stats API | api-web.nhle.com/v1 | Free, no key |
| Fallback 1 | ESPN NHL | site.api.espn.com/.../hockey/nhl | Free, no key |
| Fallback 2 | NHL Edge API | edge.nhl.com/api/v1 | Free, no key |
| Emergency | Cached last-known data | Local JSON snapshot | Always available |

**NHL endpoints to monitor:**
- /schedule/{date} — game schedule
- /gamecenter/{id}/boxscore — live scores + player stats
- /standings/now — standings
- /roster/{team}/current — rosters
- /player/{id}/game-log/{season}/2 — player game logs

**Fallback trigger:** If primary returns 5xx or times out 3x in 5 min, switch to ESPN.

### NBA
| Priority | Source | Endpoint | Status |
|---|---|---|---|
| Primary | ESPN NBA | site.api.espn.com/.../basketball/nba | Free, no key |
| Fallback 1 | BallDontLie | api.balldontlie.io/v1 | Free key in env |
| Fallback 2 | NBA CDN | cdn.nba.com/static/json | Free, no key |
| Emergency | Cached last-known data | Local JSON snapshot | Always available |

**ESPN endpoints to monitor:**
- /scoreboard — today's games
- /scoreboard?dates=YYYYMMDD — specific date
- /summary?event={id} — boxscore
- /standings — standings

### MLB
| Priority | Source | Endpoint | Status |
|---|---|---|---|
| Primary | MLB Stats API | statsapi.mlb.com/api/v1 | Free, no key |
| Fallback 1 | ESPN MLB | site.api.espn.com/.../baseball/mlb | Free, no key |
| Emergency | Cached last-known data | Local JSON snapshot | Always available |

### Odds
| Priority | Source | Endpoint | Status |
|---|---|---|---|
| Primary | The Odds API | api.the-odds-api.com/v4 | Key required, 500 req/mo free |
| Fallback | No odds display | Show "Model Line" only | Always available |
| Future | Pinnacle API | Direct feed | Paid, most accurate |

## Resilience Patterns

### 1. Circuit Breaker
```
if (failures >= 3 in last 5 min) {
  switch to fallback for 10 min
  then retry primary
}
```

### 2. Cache-First Strategy
- Cache all API responses for 15 min (already doing this)
- If API fails, serve stale cache with "Last updated X min ago" badge
- Never show empty state if we have ANY cached data

### 3. Graceful Degradation
- API down → show cached schedule + "Live data temporarily unavailable"
- Odds API down → show model lines, hide book prices
- Boxscore API down → picks stay "pending" instead of false W/L

### 4. Data Snapshots (Emergency Fallback)
- Every night at 11 PM: snapshot today's schedule + standings to /data/snapshots/
- On total API failure: serve snapshot data with "Using cached data from [time]"
- Ensures app never shows completely empty

### 5. Multi-Source Verification
- Before marking a pick as W/L, verify with 2 sources if possible
- NHL: check both NHL API + ESPN for final scores
- NBA: check both ESPN + BallDontLie
- Prevents false results from single API glitch

## Monitoring (via Heartbeat/Cron)

### Health check every 30 min:
1. Ping NHL API → log response time + status
2. Ping ESPN NBA → log response time + status
3. Ping MLB API → log response time + status
4. Ping Odds API → log remaining quota
5. If any fail → alert Marco via Telegram

### Metrics to track:
- API response time (p50, p95)
- Error rate per endpoint
- Odds API quota remaining
- Cache hit rate

## Implementation Priority
1. Add ESPN as NHL fallback (1 hour)
2. Cache-first with stale data display (30 min)
3. Circuit breaker pattern (1 hour)
4. Nightly data snapshots (30 min)
5. Multi-source score verification (2 hours)
6. Health monitoring via heartbeat (1 hour)
