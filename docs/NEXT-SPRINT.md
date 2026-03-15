# Next Sprint — Goosalytics Feature Build

## Priority 1: Player Trend Analysis Page

### Trend Card (on Trends page)
- Player name + team logo + matchup
- Prop line + odds + indicator icons (🪿🔥🤑🔒💨 filled/unfilled circles)
- 4 trend splits inline:
  - L10 hit rate
  - vs opponent hit rate
  - Home/Away hit rate
  - Without player hit rate
- Tappable → opens Player Analysis page

### Player Analysis Page (/player/[id]/trend/[propType])
Components:
1. **Header**: Player name, team, matchup, prop line + odds + indicators
2. **4-Signal Breakdown** (LineMate style):
   - ⚡ Recent form: "Hit in 8 of last 10 games" — 80%
   - 🎯 Head-to-head: "Hit in 3 of last 4 games vs CHA" — 75%
   - 🏠 Home/Away: "Hit in 7 of last 7 away games" — 100%
   - 🤕 Teammate impact: "Hit in 5 of last 6 games without N. Reid" — 83%
3. **Deeper Insights**: Opponent defensive rank for stat category
4. **Games Played Table** with tabs:
   - Last 10 / Head to Head / Away Splits
   - Columns: Hit (✅/❌), Date, Versus (logo), Result (W/L + score), stat values
5. **"Add to My Picks" button**

### Data Layer Requirements
- Player game log (last 20 games) — already available via NHL/ESPN APIs
- Opponent filter: filter game log by specific opponent
- Home/Away filter: filter by venue
- Injury data: would need injury feed (placeholder for now)
- Opponent defensive rank: need team defensive stats per category

## Priority 2: Trends Page Redesign
- Match LineMate layout: wider trend cards with splits
- Filter bar: Games ▼, Over+Under ▼, Bet Types ▼, Trend Type ▼
- Indicator circles (filled/unfilled) on each card
- Player / Team / Parlay / SGP tabs

## Priority 3: Supabase Migration
- Create Supabase project (free tier)
- Users table: id, name, email, password_hash, role, created_at, last_login
- Pick history table: id, date, league, pick_data (jsonb), result, created_at
- Migrate auth from JSON files → Supabase Auth or Supabase + NextAuth
- Set env vars on Vercel

## Priority 4: Admin Dashboard (blocked on Supabase)
- Already built, reverted from deploy
- Re-deploy once Supabase is connected

## UI References (from Marco)
- LineMate trend cards with multi-split analysis
- LineMate player analysis page with game log table
- LineMate 100% Club with team logos + odds badges
- LineMate SGP builder with combined hit %
- Navy/glass card theme with real team logos
- Win probability % on game cards

## Completed This Sprint (Mar 14)
- [x] NBA player props (0 → 20, fixed ESPN boxscore home/away)
- [x] Pick resolution pipeline
- [x] AI picks with deep reasoning
- [x] -200 min odds filter
- [x] Expandable pick cards (tap for analysis)
- [x] Trend indicator system (🪿🔥🤑🔒💨)
- [x] Trend indicator filters on Trends page
- [x] Pick History page with sport + month filters
- [x] Clickable record card → history drill-down
- [x] 100% Club section + SGP builder (home page)
- [x] Auth system built (reverted, waiting for Supabase)
- [x] Admin dashboard built (reverted, waiting for Supabase)
- [x] Multi-agent architecture playbook researched
- [x] Home page redesign with sections
- [x] localStorage fresh start (v5)

## Pick Lifecycle System (NEW — Marco's direction)

### Rules
- AI generates preliminary picks by 9 AM ET daily
- Picks are UNLOCKED until their game starts
- While unlocked, AI can swap/adjust picks based on:
  - Injury news
  - Line movement / value changes
  - Starting lineup confirmations (goalies, pitchers)
- Pick LOCKS at game start time — no more changes
- Post-game: auto-resolve W/L/Push

### UI
- 🔓 UNLOCKED badge on pre-game picks ("Pick may change")
- 🔒 LOCKED badge once game begins ("Final pick")
- ⚡ UPDATED highlight if pick was swapped — show what changed and why
- Timestamp: "Locked at 7:02 PM" or "Updated at 2:15 PM"

### Implementation
- Add `lockedAt` and `updatedAt` fields to AIPick type
- Pick generation runs at 9 AM ET via cron/heartbeat
- Before each game starts, re-evaluate pick (check injuries, line movement)
- If better pick available, swap and mark as UPDATED
- Once game starts (gameState !== FUT), set lockedAt timestamp
- Resolver only processes LOCKED picks

### Schedule
- Before 9 AM ET: show "Today's picks loading by 9 AM"
- 9 AM → game time: show picks with 🔓 UNLOCKED
- Game started: 🔒 LOCKED
- Game finished: ✅ W / ❌ L / ⏸️ Push

## Defense vs Position (DVP) — NEW FEATURE

### What it is
Shows which teams allow the MOST or LEAST stats to each position.
Example: "WSH allows THE MOST 3-Pointers Made to SF | Rupert"

### Two views
- **Most Allowed (Favorable)** — soft matchups, target these players
- **Least Allowed (Tough)** — hard matchups, avoid or fade

### Per sport
- **NBA**: Points, Rebounds, Assists, 3PM allowed by position (PG/SG/SF/PF/C)
- **NHL**: Goals, Assists, Shots allowed by position (C/LW/RW/D)
- **NFL**: Passing yards, rushing yards, receiving yards, TDs allowed by position (QB/RB/WR/TE)
- **MLB**: Hits, HRs, RBIs allowed to lineup position (1-9) or batter handedness (L/R)

### Data sources
- NBA: ESPN boxscores — aggregate opponent stats by position over season
- NHL: NHL API game logs — aggregate by position
- NFL: ESPN/NFL API — by position group
- MLB: statsapi — pitcher vs batter splits

### UI
- Page: /dvp or section within /props
- League tabs: NBA / NHL / NFL / MLB
- Toggle: Most Allowed / Least Allowed
- Per game: show matchup, then list of DVP advantages
- Season stats + Last 7 games breakdown
- Link from DVP row to player prop page

### Integration with AI Picks
- DVP data should BOOST pick confidence when player has favorable matchup
- "WSH allows most 3PM to SF" + "Player is SF" + "Player hits 70% of 3PM prop" = STRONG pick
- Add DVP factor to picks-engine scoring

### Priority
- High for NBA + NFL
- Medium for NHL + MLB

## Player Page V2 — LineMate-Level Research (from Marco's reference)

### Components to build
1. **DVP matchup header** — "SA allows 5th most Rebounds to PF (Last 7)"
2. **Mismatch Edge gauge** — circular badge with edge score + "MISMATCH" label
3. **Stat tabs** — PTS / REB / AST / Pts+Reb+Ast / 3PM (clickable, switches prop view)
4. **Filter pills** — League / Team / Home|Away / Stat type
5. **Player info row** — name, position, team, #, opponent, DEF RANK, game time
6. **Hit rate timeline** — L5 / L10 / L20 / Season / vs Opponent percentages
7. **Bar chart per game** — green (hit) / red (miss) bars with prop line drawn across
8. **Date + matchup labels** on each bar
9. **Range slider** — filter by stat range (e.g., rebound chances 7-17)
10. **Trending filters** — quick filter chips for related stats
