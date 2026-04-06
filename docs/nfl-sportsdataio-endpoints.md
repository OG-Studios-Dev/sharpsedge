**NFL UTILITY ENDPOINTS (SportsDataIO)**

Base URL: `https://api.sportsdata.io/v3/nfl`

Auth: `Ocp-Apim-Subscription-Key: b0a7899b93af643b96f6f4adfcf9c02c`

**Key endpoints from docs:**
```
GET /scores/json/News
GET /scores/json/NewsByDate/{date}
GET /scores/json/NewsByPlayerID/{playerID}
GET /scores/json/CurrentSeason
GET /scores/json/ActiveLeagues
GET /scores/json/Leagues
GET /scores/json/Timezones
GET /scores/json/Venues
GET /scores/json/Stadiums
GET /scores/json/TeamRankings/{season}/{seasonType}/{scope}/{statType}
```

**Test priority (low quota first):**
1. `/scores/json/CurrentSeason` — active season
2. `/scores/json/ActiveLeagues` — live leagues
3. `/scores/json/Stadiums` — venue data
4. `/scores/json/News` — latest news

**Player/team lookup:**
- `/stats/json/Players` — all players
- `/stats/json/Teams/{season}` — team list

**Deploy plan:**
src/lib/sportsdataio.ts + /api/debug/sportsdataio

Live test: https://goosalytics.vercel.app/api/debug/sportsdataio?sport=NFL