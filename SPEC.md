# SharpEdge - Sports Betting Edge App

## Overview
SharpEdge is a sports betting trend analysis app that helps users find player props and team trends that have been consistently hitting. It aggregates data across sportsbooks and surfaces high-confidence picks based on historical performance splits.

## Core Concept
- Scrape/aggregate player prop lines from major sportsbooks
- Analyze historical performance across multiple splits
- Surface props with high hit rates so users can make smarter bets
- NOT a sportsbook — it's a research/edge-finding tool

## Target Platforms
- **Mobile (primary):** React Native or responsive web app — must match the reference UI screenshots exactly
- **Web:** Similar layout adapted for desktop viewports

## Design System
- Dark theme (dark navy/charcoal background)
- Card-based layout with rounded corners
- Color-coded confidence tiers (green = high, yellow = mid, red = caution)
- Clean, scannable typography — numbers and percentages prominent
- Bottom tab navigation on mobile

## Core Features

### 1. Player Props (MUST HAVE - #1 Priority)
- List of player prop bets for upcoming games
- Each prop shows:
  - Player name + team + matchup
  - Prop type (Points, Assists, SOG, etc.)
  - Line (Over/Under X.5)
  - Odds from books
  - **3-split trend analysis:**
    - Last 20 games hit rate %
    - Home/Away hit rate %
    - vs Opponent hit rate %
- Tiered ranking (Tier 1 / Tier 2 / Tier 3) based on combined confidence
- Filter by: sport, game, prop type, tier, minimum hit rate

### 2. Team Trends
- Team spread/moneyline trends
- Cover rates over last N games
- Home/away splits
- vs opponent history
- Card layout similar to player props

### 3. Parlay Builder
- Combine multiple props into parlays
- Show historical combo hit rates (e.g., "this 3-leg hit 4/4 last games")
- SGP (Same Game Parlay) suggestions per game
- Auto-calculate combined odds

### 4. League/Sport Selector
- Support multiple leagues: NHL, NBA, NFL, MLB, Soccer (Serie A, EPL, etc.)
- Easy switching between sports
- Each sport has its own relevant prop types

### 5. Game Schedule
- Today's games with start times
- Tap into a game to see all available props and trends for that matchup

## Tech Stack
- **Frontend:** Next.js 14+ (App Router) with Tailwind CSS
- **Mobile:** Responsive web first (PWA-ready), can wrap in Capacitor later
- **Backend:** Next.js API routes
- **Database:** PostgreSQL with Prisma ORM
- **Data:** Start with mock/seed data that matches the reference screenshots
- **Auth:** NextAuth.js (for later — skip in Phase 1)

## Phase 1 Scope (BUILD THIS NOW)
1. Next.js app with dark theme matching reference screenshots
2. Player Props page with mock NHL data — full 3-split trend cards
3. Team Trends page with mock data
4. Parlay/SGP suggestions page with mock data
5. Bottom tab navigation (Props / Teams / Parlays / Settings)
6. League selector
7. Mobile-first responsive design
8. Seed data that mirrors the exact examples from the reference screenshots

## Reference Data (from screenshots)
Use these as seed data:

### Player Props Examples:
- Jesper Bratt Over 0.5 Points vs TOR | -118 | 80% L20, 83% Home, 80% vs TOR
- John Tavares Over 0.5 Points vs NJD | -125 | 85% L20, 90% Away, 80% vs NJD
- Ivan Barbashev Over 0.5 Points vs SEA | -145 | 80% L20, 80% Away, 85% vs SEA
- Nikolaj Ehlers Over 0.5 Points vs VAN | -145 | 80% L20, 80% Away, 100% vs VAN
- Eeli Tolvanen Over 2.5 SOG vs DET

### Team Trends Examples:
- VGK -1.5 vs DET | -219 | 90% cover L20
- STL -1.5 vs SEA | 100% vs SEA, 100% away

### Parlay Examples:
- Rielly + Ehlers + Trouba SOG parlay | 100% hit rate (4/4)
- Matthews Over 0.5 Pts + McMann Over 1.5 SOG SGP | 80-100%

## File Structure
```
sharpedge/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx (redirect to /props)
│   │   ├── props/page.tsx
│   │   ├── teams/page.tsx
│   │   ├── parlays/page.tsx
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── BottomNav.tsx
│   │   ├── PropCard.tsx
│   │   ├── TeamTrendCard.tsx
│   │   ├── ParlayCard.tsx
│   │   ├── LeagueSelector.tsx
│   │   ├── TierBadge.tsx
│   │   └── SplitBar.tsx (visual hit rate bar)
│   ├── data/
│   │   └── seed.ts (mock data matching screenshots)
│   └── lib/
│       └── types.ts
├── public/
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```
