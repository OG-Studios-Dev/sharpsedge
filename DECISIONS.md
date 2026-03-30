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

---

## Picks Volume Policy — No Forced Minimum (2026-03-29)

**Decision:** Remove forced-fill-to-3 behavior in the picks engine. Adopt a
no-minimum, soft-band (3–5), hard-max (7) volume policy for all sports.

**Rationale:**
- Goal is 70%+ hit rate and profitability per sport. Spraying marginal picks
  hurts both metrics.
- Old code always tried to produce exactly 3 picks per sport, padding with
  weaker candidates when the qualifying pool was thin.
- Zero picks is now a valid and correct output.

**Policy (condensed):**
- No minimum. If no genuine edges exist, publish nothing.
- Soft ceiling: 5 picks (3 player props + 2 team trends) per sport per day.
- Hard max: 7, only when ≥ 5 qualifying picks each clear 15% edge.
- Quality gates unchanged: 65% hit rate + 10% edge (MLB: 8%) + odds ≤ -200.

**Spec:** `docs/PICKS_POLICY.md`

**Files changed:**
- `src/lib/picks-engine.ts` — removed fill-to-3 loops; added `pickVolumeTargets()` helper
- `src/lib/goose-model/generator.ts` — added `PROD_HARD_MAX`, `PROD_STRONG_EDGE_FLOOR`; updated `generateGoosePicks` to use dynamic cap

---

## Goose V2 / Learning Model — Not Production Ready (2026-03-29)

**Decision:** Goose V2 (the ML signal-weighted picks engine in `src/lib/goose-model/`) is **not production ready** and must not be exposed to users in any form until explicit readiness gates are met.

**Rationale:**
- Model launched 2026-03-27 (Opening Day). Graded sample is near-zero. Signal priors are hand-calibrated estimates, not empirically validated.
- No user-facing toggle, surface, or marketing around the model until all 6 readiness gates in `docs/GOOSE-V2-READINESS.md` pass.

**Key rules locked in:**
1. Pick generation and grading must be fully automated via cron. No manual intervention required on a normal day.
2. Admin UI (`/admin/goose-model`) is for monitoring, auditing, overrides, and debugging only.
3. Goose V2 picks may eventually become a user-facing alternate mode (e.g. slider/toggle), but only after gates are cleared and an explicit Stage 1 → Stage 2 rollout decision is made.
4. The `-200` odds hard cap is non-negotiable in all sandbox and production experiments.

**Spec:** `docs/GOOSE-V2-READINESS.md`
