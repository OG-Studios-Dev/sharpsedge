**NFL BETTING METADATA (SportsDataIO)**

**Key endpoints:**
```
GET /odds/json/BettingMetadata/{key}
GET /odds/json/BettingMarkets/{eventIds}
GET /odds/json/BettingMarketOdds/{marketId}
GET /odds/json/BettingEvents/{eventIds}
```

**Metadata types:**
- **Player props** (passing yards, rushing attempts, TDs, receptions)
- **Team totals** (points scored/allowed)
- **Game lines** (spread, total, ML)
- **Futures** (division winners, playoffs)

**Usage for Goosalytics:**
1. Call `/odds/json/BettingMetadata/NFL` → get active market keys
2. Filter by date/sport/market type
3. Pull odds snapshots every 5min
4. Feed to picks engine + /odds page

**Sample response structure:**
```
{
  "BettingMetadata": [
    {
      "BettingMarketTypeId": "TeamTotalOverUnder",
      "PlayerProps": false,
      "Description": "Team Total",
      "ShortDescription": "Team Total"
    }
  ]
}
```

**Integration:**
- Add to src/lib/sportsdataio.ts
- Cron: every 5min → odds snapshots to Supabase
- UI: /odds → real-time betting metadata + odds

**Deploy:** Live test /api/debug/sportsdataio?sport=NFL&endpoint=betting-metadata