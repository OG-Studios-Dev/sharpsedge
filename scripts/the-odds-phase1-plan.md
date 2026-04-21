# The Odds API Phase 1 Backbone

Owner: Magoo
Goal: Build 2024+ historical backbone for NBA, NHL, MLB, NFL covering moneyline, spreads, totals, odds snapshots, and results.
Proof required: repo diff, runnable script(s), sample output, commit sha.
Last updated: 2026-04-20

## Scope
- Source of truth for historical odds: The Odds API paid historical endpoints
- Markets in phase 1:
  - h2h
  - spreads
  - totals
- Sports in phase 1:
  - basketball_nba
  - icehockey_nhl
  - baseball_mlb
  - americanfootball_nfl
- Time range:
  - 2024-01-01 through now
- Results:
  - store settlement-ready game result fields on canonical game rows when available from existing app rails / captured snapshots
  - do not block odds backfill on perfect deep results history

## Architecture
1. Use historical sport odds endpoint for bulk snapshots
2. Normalize into existing market snapshot / canonical game warehouse shape
3. Persist snapshot metadata + event rows + price rows
4. Add result hydration as a separate pass
5. Verify league-by-league coverage before expanding into props

## Success criteria
- One runnable phase-1 script exists for The Odds API historical backfill
- Script supports sport, date window, and markets=h2h,spreads,totals
- Script outputs honest counts
- Data lands in existing warehouse tables or file artifacts without inventing fake coverage
- We can prove one successful historical pull on at least one phase-1 league/window
