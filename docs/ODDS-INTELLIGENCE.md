# Odds Intelligence — Line Shopping, Movement & Sharp Detection

## Overview
Transform Goosalytics from "model-based picks" into a real odds intelligence platform.
Show users the best price, track line movement, and detect sharp money.

## Phase 1: Best Line Display (on every prop + team card)

### Data
- Already fetching from Odds API: DraftKings, FanDuel, BetMGM, Caesars, PointsBet, etc.
- Currently only using best odds for model comparison
- Need to show ALL book prices on each prop

### UI: "Best Line" badge on PropCard and TeamTrendCard
- Show: "Best: FanDuel +105" or "DK -110 | FD +105 | MGM -115"
- Highlight the best price in green
- Show how much edge vs worst price: "Save 15¢ vs DraftKings"

### Implementation
- getPlayerPropOdds() in odds-api.ts already returns all book prices
- Pass full odds array to PropCard, not just best
- New component: OddsComparison.tsx — horizontal scroll of book logos + prices

## Phase 2: Line Movement Tracking

### Data Layer
- New Supabase table: odds_snapshots
  - id, game_id, market (h2h/spread/player_prop), outcome, book, odds, line, timestamp
- Cron job or heartbeat: snapshot odds every 30 min
- Compare current vs opening to calculate movement

### Movement Detection
- Opening line: first snapshot of the day
- Current line: latest snapshot
- Movement = current - opening
- Significant movement: >= 10 cents on ML, >= 0.5 on spread/total, >= 0.5 on player prop

### UI: Movement indicators
- On prop cards: "↑ Moved from -110 to -130" (red = worse for bettor, green = better)
- On team cards: "Line opened NYY -150, now -170 (sharp money on Yankees)"
- New "Line Movement" section on home page: top 5 biggest moves today

## Phase 3: Sharp Money Detection

### Logic
- Steam move: 3+ books move same direction within 60 min
- Reverse line movement: public betting one side but line moves other way (sharp action)
- Consensus shift: > 70% of books adjusted in same direction

### UI: "Sharp Alert" indicator
- New trend indicator: 🧠 Sharp (when sharp money detected)
- Alert card on home page: "SHARP ALERT: NYY ML moved from -150 to -180 across 4 books in 30 min"
- Push notification ready (future feature)

## Phase 4: Odds Intelligence Page (/odds)

### Dedicated page with:
1. **Line Shopping Grid** — all props for today's games with every book's price
   - Columns: Prop | DK | FD | MGM | Caesars | Best
   - Highlight best price per row
   - Sort by edge (difference between best and worst price)

2. **Movement Tracker** — live feed of line movements
   - Filterable by sport, game, bet type
   - Show opening vs current with directional arrow
   - Color coded: green (better for bettor), red (worse)

3. **Sharp Signals** — today's detected sharp moves
   - Steam moves
   - Reverse line movement
   - Consensus shifts

4. **Historical Odds** — chart of odds over time for any prop
   - Simple line chart (opening → current)
   - Future: full time series

## Implementation Priority
1. Best line display on existing cards (1 sprint)
2. Odds snapshot cron + movement detection (1 sprint)
3. Sharp detection logic (1 sprint)
4. Dedicated /odds page (1 sprint)

## API Usage Notes
- Odds API free tier: 500 requests/month
- Each request can include multiple markets
- Snapshot every 30 min × 3 sports × ~30 days = ~4,320 requests/month
- Need to upgrade to paid tier ($20-50/mo) for snapshots OR be strategic about timing
- Alternative: snapshot only 2 hours before game time (reduces to ~500/month)

## Competitive Advantage
- LineMate: does NOT show line movement or sharp detection
- OddsShopper: shows best lines but no AI picks integration
- Goosalytics: AI picks + best lines + movement + sharp = unique combo
