# Goose Decision Log Audit — 2026-04-11

## Goal
Figure out why `goose_decision_log` looked broken during simple coverage queries and verify whether decision rows are actually being stored.

## Finding
The table is not broken.

The issue is query shape.

`goose_decision_log` does **not** have its own `sport` column, so direct filters like:
- `.eq('sport', 'NHL')`
- `.eq('sport', 'NBA')`

return PostgREST errors.

That is why earlier count/query attempts failed with misleading blank-message `400 Bad Request` responses.

## Proven error
Direct filtered select:
- query: `goose_decision_log ... eq('sport', 'NHL')`
- result: `400 Bad Request`
- actual error surfaced on plain select:
  - `column goose_decision_log.sport does not exist`

## Verified working query pattern
To filter decision rows by sport, join through `goose_market_events`:

```ts
supabase
  .from('goose_decision_log')
  .select(`
    decision_id,
    event_id,
    candidate_id,
    policy_version,
    decision_ts,
    created_at,
    goose_market_events!inner(sport,event_date,event_label)
  `)
  .eq('goose_market_events.sport', 'NHL')
  .order('created_at', { ascending: false })
  .limit(5)
```

## Proof
This join-based query returned live NHL decision rows successfully, including:
- `decision_id`
- `event_id`
- `candidate_id`
- `policy_version`
- `decision_ts`
- `created_at`
- joined `goose_market_events.sport`

Sample returned rows were for:
- `Calgary Flames @ Colorado Avalanche`
- sport: `NHL`
- policy version: `phase1-shadow`
- created at: `2026-04-11T15:29:50.152908+00:00`

## Conclusion
- `goose_decision_log` storage is working
- the earlier audit failure was caused by filtering on a nonexistent column
- future audits must filter decision rows via `goose_market_events` join, not directly on `goose_decision_log.sport`

## Recommendation
1. Keep using join-based reads for sport/date slices of decision rows
2. If we want simpler direct reporting later, add a denormalized `sport` column intentionally, not by accident
3. Update any audit/debug scripts to stop querying `goose_decision_log.sport`
