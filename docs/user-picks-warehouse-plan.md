# User Picks Warehouse Plan

## Goal
Unify product picks, user picks, grading, and future leaderboard/contest logic under one canonical warehouse model.

## Principles
- Every pick is saved immediately as pending.
- Every pick stores locked odds, line, book, and snapshot.
- Grading happens later from verified data, never from memory.
- User-owned entries and canonical market picks are related, not duplicated conceptually.
- Product picks and user picks should converge on the same grading/outcome rails.

## Current layers

### Existing
- `pick_history`: product/app pick history
- `pick_slates`: locked daily product slates
- `user_picks`: user-owned pick objects
- `user_pick_stats`: per-user rollup placeholder

### New canonical warehouse layer
- `market_events`: canonical game/event rail
- `market_picks`: canonical pick/grading rail for model picks, user-linked picks, imports, and manual entries
- `user_pick_entries`: user-facing entries linked to canonical graded market picks

## Responsibilities

### `user_picks`
User-owned object for profile/history UX.
Stores:
- who placed it
- locked display snapshot
- stake/units
- current lifecycle state

### `market_picks`
Canonical grading object.
Stores:
- what the actual pick was
- market type / bet type / player/team/game context
- locked price context
- grading status
- settled result
- grading notes/source

### `user_pick_entries`
Join layer from user-owned picks to canonical grading records.
Stores:
- ownership
- display ordering
- parlay/single structure
- locked line/odds/book snapshot at placement

## Near-term next steps
1. Backfill product pick generation onto `market_picks`
2. Grade canonical `market_picks` instead of ad hoc user/product rails
3. Sync `user_pick_entries.entry_status` from canonical graded outcomes
4. Compute `user_pick_stats` from `user_pick_entries`
5. Build public profile + leaderboard tables off those rollups

## Non-goals right now
- full contest engine
- public capper pages
- multi-user social feed
- payout logic

Those come after the warehouse and grading rails are trustworthy.
