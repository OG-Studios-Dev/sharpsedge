# SharpEdge V1 — Decision Log

## Architecture Decisions

### Stack: Next.js 16 + Tailwind v4 + Client-side Storage
**Why:** Fast to build, zero backend costs, easy to deploy on Vercel. Supabase can be added later when we need real user accounts and persistent data.

### Client-side Only (localStorage)
**Why:** V1 is a proof-of-concept. No auth, no database, no API costs. Paper trading state lives in the browser. This lets Marco test the UX and flow without any infrastructure. When we're ready for real users, we'll move state to Supabase.

### Mock Data (no live APIs yet)
**Why:** Sports data APIs (The Odds API, ESPN, etc.) have rate limits and costs. For V1, realistic mock data lets us build and test the full UI without API keys or billing. Phase 2 will integrate live odds.

### NHL First
**Why:** Marco's in Toronto. Hockey makes sense as the starting sport. Can expand to NBA, NFL, soccer later.

### Dark Theme (Slate/Navy base)
**Why:** Every major sportsbook (FanDuel, DraftKings, Bet365) uses dark themes. Users expect it. Colors: green for profit, red for loss, amber/gold for accents.

### Emoji Team Logos
**Why:** Real NHL logos are trademarked. Emoji placeholders work for V1. Can swap to real assets later if this becomes a public product.

### American Odds Format
**Why:** Standard for North American sports betting (+150, -110, etc.). Familiar to the target audience.

## Deployment

### Vercel (free tier)
**Why:** Zero config for Next.js. Auto-deploys from GitHub. Free SSL. Good enough for beta testing.

### GitHub: OG-Studios-Dev/sharpsedge
**Why:** Existing org repo. Connected to Vercel for auto-deploys on push.

## What's in V1

- Dashboard with bankroll, ROI, stats, recent bets, hot trends
- Games page showing today's NHL matchups with odds
- Game detail with team comparison, trend signals, bet slip
- Trends page with sortable/filterable table
- My Bets page with history, P&L chart, pending bet resolution
- Sidebar nav (desktop) + bottom nav (mobile)
- Paper trading: place bets, deduct from bankroll, resolve outcomes
- 16 NHL teams with realistic stats
- 6 mock games with proper odds
- 20 trend signals with hit rates and ROI
- 18 historical sample bets

## What's NOT in V1 (Phase 2+)

- Live odds from real APIs
- User authentication (Supabase Auth)
- Persistent data (Supabase DB)
- Multi-sport support
- Real trend algorithm (currently curated mock trends)
- Push notifications for trend alerts
- Social features (leaderboards, sharing)
- Custom domain
