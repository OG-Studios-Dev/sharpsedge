# Current sprint state — 2026-03-21

## Completed system intelligence work
- [x] Strengthen movement/history-driven views with the new snapshot rail and report gaps
- [x] Build the first honest weighted scoring model for Falcons and report gaps
- [x] Build the first actual trigger model for Tony’s Hot Bats and report gaps
- [x] Define and wire Swaggy’s real entry + price discipline rules and report gaps

## Phase 1 — final system data/logic review
- [x] Audit every tracked system for defined input path, logic path, and output/trackability status
- [x] Identify every missing data dependency or missing rule layer by system
- [x] Close any high-leverage obvious gaps tonight where feasible
- [x] Produce a clean tomorrow-7am attack list for unresolved gaps
- [ ] Commit the final review/work cleanly

### Audit findings
- [x] Confirm system rows currently refresh in-place per day inside `data/systems-tracking.json`
- [x] Confirm pick history / pick slates already use a separate persistence pattern and must remain separate
- [x] Confirm most qualifier/watchlist systems do not yet have an honest bet-direction rule, so they cannot claim settled record/win%/units
- [x] Confirm NBA Goose is the only current progression system with native settlement already partially wired
- [x] Fix catalog/store honesty mismatch for `Swaggy Stretch Drive` (code live, store stale)
- [x] Fix catalog/store honesty mismatch for `Tony's Hot Bats` (code live, store stale)
- [x] Write final audit artifact: `docs/SYSTEM-DATA-LOGIC-AUDIT-2026-03-21.md`

### Honest prerequisite call
- [x] Explicitly keep v1 qualification persistence file-backed and separate from Supabase pick history
- [x] Restrict performance metrics to systems with a defined settled action; qualifier/watchlist-only systems remain qualifier logs only

## Phase 2 — system qualification tracking
- [ ] Add immutable system qualification logging for all tracked systems
- [ ] Add grading / settlement for qualified system plays
- [ ] Compute record, win%, units at flat 1u/play
- [ ] Surface system performance in product/admin views
- [ ] Ensure today’s Gooses Road Favs qualifier is captured if present in live data
- [ ] Build and commit the tracking layer cleanly
