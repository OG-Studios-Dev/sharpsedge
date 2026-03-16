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

## Master Menu / Navigation Overhaul

### Concept: "Every Cheat Sheet in One Place"
Slide-out menu with full app navigation, organized by category.
Users can favorite items (⭐) as Quick Shortcuts (max 5).

### Sections
**Quick Shortcuts** — user's pinned favorites (stored in Supabase profile)
**Research** — Upcoming Games, DVP, Players, Teams, Games, Props & Odds, H2H
**Cheat Sheets (Premium)** — Best Bets Today, Game Cards, First Scorer, Mismatches, 100% Club, Quick Hitters
**Tools** — Parlay Builder, My Picks, Line Shopping, Sharp Signals
**Account** — Settings, Admin (if role=admin)

### UI
- Hamburger icon in top-right (or user avatar opens menu)
- Slide-out from right, full height, dark overlay
- Close button (X) top right
- Each item: icon + label + ⭐ favorite toggle
- Quick shortcuts shown as horizontal pills at top (removable with X)
- Premium items show 💎 badge (locked for free tier)

### Bottom nav stays
- Keep bottom nav for top 5 most-used: Home, Schedule, Props, Picks, Trends
- Menu adds access to everything else
- Lines tab could move to menu since it's less frequent

## Daily Dashboard — AI Game Previews + Situational Edges

### AI Quick Preview (per game)
- AI-written narrative: "BOS hosts CHI as heavy favorites. Celtics have won 7 of L10..."
- Key stats, injury impact, matchup context
- Written in analyst voice, 2-3 sentences per game

### Situational Edge Cards
- "Bounce-back spot: GSW" — team coming off loss, historically responds well
- "Rest advantage: BOS" — extra day off vs opponent on B2B
- "Home dog: MIA" — underdog at home, historically profitable
- Signal Strength gauge (0-100%)
- SITUATIONAL / EDGE badges

### Upcoming Milestones (prop goldmine)
- Track players approaching career/franchise milestones
- "2 threes from passing Ray Allen for #6 in franchise 3PM"
- Data: career stats vs milestone threshold
- Categories: All-time records, Career scoring, Shooting, Franchise records
- Prop connection: player chasing milestone = extra motivation = prop edge
- "101 close" badge showing how many milestones are near

### Implementation
- AI narrative: use reasoning from picks engine or simple template-based generation
- Situational data: back-to-back detection, rest days, post-loss records from standings
- Milestones: would need career stats database (ESPN has some, or build incrementally)
- Premium feature (Sharp tier)

## Golf AI Picks System (Premium — Sharp Tier)

### Pick Structure (per tournament, 12 picks, 12u)

**🏆 Tournament Winner (3 picks, 1u each)**
- Long shot value: +2000 or longer
- Mid-range: +800 to +2000
- Favorite: +200 to +800

**🔒 Lock Picks (3 picks, 1u each)**
- 1 Top 5 Lock (safest, best form + course fit)
- 1 Top 10 Lock
- 1 Top 20 Lock

**💎 Value Picks (6 picks, 1u each)**
- 2 Top 5 value plays (higher odds, risk/reward)
- 2 Top 10 value plays
- 2 Top 20 value plays

### Timing
- Wednesday night: AI generates picks (before R1 Thursday)
- Thursday R1 tee time: LOCKED
- Sunday final round: RESOLVE
- Weekly record tracking (not daily)

### AI Analysis Factors
- Recent form (last 5 tournaments, weighted by recency)
- Course history (previous results at this venue)
- Strokes Gained: Off-the-tee, Approach, Around Green, Putting
- Current form vs field strength
- Odds value: model probability vs book odds (edge detection)
- Weather/course conditions (future enhancement)

### UI
- Dedicated section on golf home page: "Tournament Picks"
- 3 sections: Winner / Locks / Value
- Each pick: player name, odds, AI reasoning, form badges
- Weekly record card (like daily record for team sports)
- Lock/Unlock badges before/after R1

### Premium Gate
- Free users: see pick NAMES only (blurred odds + reasoning)
- Pro ($4.99): see full picks with odds
- Sharp ($9.99): see picks + AI reasoning + course analysis

## Golf V2 — DataGolf-Powered Analytics

### Data Source: DataGolf API (feeds.datagolf.com)
- API requires key (pricing behind login — likely $25-100/mo)
- Endpoints: player list, predictions, odds, SG data, DFS projections
- Covers: PGA Tour, DP World Tour, LIV Golf, Korn Ferry Tour

### Features to Build (inspired by datagolf.com)

**1. Pre-Tournament Model**
- Win probability per player (model vs books)
- Top 5/10/20/Cut finish probabilities
- Edge detection: model prob vs book odds = value
- Course fit score per player

**2. Live Tournament Model**
- Real-time win probability updates during rounds
- Live strokes gained tracking
- Position change tracking (who's moving up/down)
- Cut line projection

**3. Course Analytics**
- Course fit analysis: which skills matter most (driving, approach, putting)
- "Where to miss" around the course
- Historical scoring averages by hole
- Course history per player (past results at this venue)

**4. Player Decomposition**
- Strokes Gained breakdown: OTT, Approach, Around Green, Putting
- Skill ratings (DataGolf proprietary)
- Form tracker (recent tournaments weighted by recency)
- Head-to-head comparison tool
- Pressure performance rating
- Career evolution charts

**5. Betting Tools**
- Finish position odds with model edge overlay
- 3-ball & matchup odds + model picks
- Tournament props (top nationality, cut miss, round leader)
- Custom matchup builder (pick any 2 players, get H2H odds)
- Bet tracker for golf-specific bets

**6. Fantasy/DFS**
- DFS salary + projection table
- Optimal lineup suggestions
- Ownership projections

### UI Design
- Leaderboard as primary view (already built)
- Tabs: Leaderboard | Model | Course | Players | Betting
- Player cards: headshot, SG breakdown bars, course fit gauge, form badges
- Course map with skill importance overlay (premium visual)

### Integration Plan
1. Sign up for DataGolf API (Marco needs to create account)
2. Get API key, add to .env.local as DATAGOLF_API_KEY
3. Create src/lib/datagolf-api.ts client
4. Replace ESPN golf data with DataGolf where available
5. Keep ESPN as fallback for basic leaderboard/schedule

### Action Item
Marco: Create account at https://datagolf.com/api-access and get API key

## Gamification (Sharp Tier — FUTURE, wait for Marco's go)

### Leaderboard
- Rank Sharp users by win rate (min 20 picks to qualify)
- Weekly + monthly + all-time views
- Show: rank, username, win %, net units, streak
- Supabase: leaderboard view from user_picks aggregated

### Streak Tracker
- Track consecutive wins per user
- "🔥 5-pick win streak!" notification
- Streak broken → "Streak ended at 7. New record!"
- Store in Supabase user profile: current_streak, best_streak

### Accuracy Badges (earned, permanent)
- 🎯 Sharpshooter: 70%+ win rate (50+ picks)
- 🔫 Sniper: 80%+ win rate (30+ picks)
- ⭐ Perfect Week: all picks in a week hit
- 💯 Perfect Day: all 6 picks in a day hit
- 🏆 Century Club: 100 picks tracked
- 🔥 Hot Streak: 10+ consecutive wins
- 💰 Big Winner: +50 units lifetime
- 🪿 OG Goose: beta user badge (forever)

### Monthly Report Card
- Best sport, best prop type
- P&L by month chart
- Win rate trend over time
- "Your edge: you're 12% better at NBA rebounds than average"

### Gold Profile Badge
- Sharp users: gold ring around avatar
- Beta users: special OG badge
- Free/Pro: default gray ring

### Parlay of the Week
- Users submit their best SGP
- Community votes on best one
- Winner gets featured on home page
- Sharp-only feature

### Implementation Notes
- All stored in Supabase (user_picks, user_badges, user_streaks tables)
- Badge check runs on each pick resolution
- Leaderboard: materialized view or scheduled aggregate
- Needs minimum user base (~50 users) before leaderboard is meaningful

## AI Pick Process — HARD RULES (from Marco)

### Daily Flow
1. **By 9 AM ET**: Generate 3 NHL + 3 NBA picks
2. **Immediately save to Supabase** as PENDING with odds, reasoning, gameId
3. **Before game time**: AI can swap picks if:
   - Injury news (starter ruled out)
   - Line movement (odds shifted significantly)
   - Lineup change (backup goalie, rest day)
4. **If swapped**: 
   - Update pick in Supabase (keep old pick in reasoning as "Changed from X")
   - Mark pick with ⚡ UPDATED highlight on picks page (bright color)
   - Record WHY it changed
5. **At game start**: Pick LOCKS — no more changes
6. **After game**: Resolve W/L/Push, update Supabase
7. **Next morning**: Report results to Marco

### Recording Rules
- NEVER lose track of picks — Supabase is the source of truth
- NEVER backfill picks after games start
- NEVER change a pick after its game has begun
- Record original pick + any changes with timestamps
- Every pick must have: date, league, player/team, line, odds, gameId

### UI: Pick Changes
- Swapped picks show ⚡ UPDATED badge in bright yellow/orange
- Tooltip/detail: "Changed at 2:15 PM — was Tavares O0.5, now Matthews O0.5 (Tavares ruled out)"
- Original pick visible in reasoning text
