# Goose2 Upstream Qualifier Gap — 2026-04-11

## Purpose
Figure out why the selective shadow scorer still sees almost no usable qualifier support on current dates.

## What I verified
### 1. The scorer is not the primary blocker anymore
The scorer is doing the right thing.
It rejects rows when qualifier support is missing.
That part is honest and working.

### 2. System qualifier storage is stale
Local store evidence:
- `data/systems-tracking.json` last `updatedAt`: **2026-04-09T16:55:24.394Z**

Supabase evidence:
- `system_qualifiers` rows exist for:
  - `2026-04-09`
  - `2026-04-08`
  - `2026-04-05`
  - `2026-04-04`
- `system_qualifiers` rows for:
  - `2026-04-10`: **0**
  - `2026-04-11`: **0**

That is the real choke point.

### 3. Some systems show stale snapshots even though their status strings imply they are alive
Examples from local `systems-tracking.json`:
- `coach-no-rest` snapshot still points to **2026-04-09**
- `falcons-fight-pummeled-pitchers` snapshot still points to **2026-04-09**
- `swaggy-stretch-drive` snapshot still points to **2026-04-09**

So the issue is not “scorer too strict.”
The issue is that upstream qualifier refresh has not run cleanly for 4/10 and 4/11.

## What this means
The current architecture only writes actionable qualifier rows into Supabase when system refresh runs and `writeSystemsTrackingData()` persists the refreshed qualification log.

If the refresh job does not run, or runs partially, Goose2 gets:
- candidates
- feature rows
- odds
- model scoring
- **but no fresh qualifier support**

And then the shadow gate correctly blocks everything.

## Hard conclusion
Right now the next real step is **not** loosening the model gate.
It is restoring / validating the daily system-refresh pipeline so `system_qualifiers` gets new rows every day.

## Best next action
1. add an explicit runnable refresh entrypoint for trackable systems
2. run it for current dates
3. verify `system_qualifiers` receives 4/10 and 4/11 rows
4. rerun feature refresh
5. rerun shadow scoring

## Bottom line
We are close, but the missing piece is upstream freshness.

The model is ready to be picky.
Now we need the system layer to actually feed it every day.
