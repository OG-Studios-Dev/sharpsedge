# Ask Goose league-year milestone — 2026-04-24

## Summary

Ask Goose historical serving layer has two league-year ranges materially queryable from `ask_goose_query_layer_v1`.

## Verified live Supabase counts

### MLB 2024 season range
- Range: `2024-03-01 <= event_date < 2024-11-01`
- Serving rows: `40,952`
- Graded / integrity-ok rows: `22,761`
- Grade rate: `0.5558`
- Proof query returned graded rows through `2024-10-31` World Series examples.
- Status: **serving-ready**; **training-ready only on `graded=true AND integrity_status='ok'` subset**.
- Caveat: September 2024 is a low-grade window and needs score/result repair before full-season training trust.

### NBA 2024-25 season range
- Range: `2024-10-01 <= event_date < 2025-07-01`
- Serving rows: `161,250`
- Graded / integrity-ok rows: `91,860`
- Grade rate: `0.5697`
- Proof query returned graded rows through `2025-06-23` Finals examples.
- Status: **serving-ready**; **training-ready only on `graded=true AND integrity_status='ok'` subset**.
- Caveat: October and November 2024 are low-grade windows and need score/result repair before full-season training trust.

## Architecture verdict

The prior query-layer strategy is validated. The historical warehouse should remain protected as source-of-truth. Ask Goose should use a daily/monthly materialized serving layer for fast natural-language evidence retrieval. The learning model should export deterministically from the same layer, but only from graded/integrity-ok rows until low-grade windows are repaired.

## Operational rule

Do not train on all serving rows. Train only on rows where:

```sql
graded = true
and integrity_status = 'ok'
```

Rows that are ungradeable or unresolved can still serve honest Ask Goose responses, but should not become model labels.
