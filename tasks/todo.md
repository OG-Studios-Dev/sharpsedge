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
- [x] Add immutable system qualification logging for all tracked systems
- [x] Add grading / settlement for qualified system plays
- [x] Compute record, win%, units at flat 1u/play
- [x] Surface system performance in product/admin views
- [x] Ensure today’s Gooses Road Favs qualifier is captured if present in live data
- [ ] Build and commit the tracking layer cleanly

### 2026-03-22 hardening verification
- [x] Confirm `writeSystemsTrackingData()` now regenerates `qualificationLog` before persisting, so the file-backed store cannot drift stale after refresh writes
- [x] Rebuild app successfully after the tracking-layer fix (`npm run build`)
- [x] Verify current stored truth stays honest: NBA Goose has one live qualifier row; The Blowout / Hot Teams / Swaggy / Tony's Hot Bats / Falcons currently store zero rows because no honest same-day qualifier was available in the persisted artifact
- [x] Keep settlement-capable vs qualifier-only separation explicit: only NBA Goose currently produces actionable settled performance; the other five remain qualifier-only / alert-only systems
- [ ] Commit the verified hardening patch cleanly


## 2026-03-22 sustainable source rail upgrades
- [ ] 1. Inspect roadmap docs, repo structure, and existing rails/checks.
- [x] 2. Identify sustainable subset to ship now across NBA/MLB/NHL/market health.
- [x] 3. Implement rails + health/freshness/degraded metadata surfaces.
- [x] 4. Update docs/tasks to reflect shipped/deferred items.
- [ ] 5. Run tests/build, fix issues if needed.
- [ ] 6. Commit cleanly and summarize gaps.

## 2026-03-22 Goose settlement honesty follow-up
- [x] Distinguish genuinely pending Goose rows from final-but-ungradeable rows
- [x] Keep final rows with missing quarter inputs out of settled performance math
- [x] Surface ungradeable status in Goose board copy/metrics
- [ ] Run build/tests and commit cleanly
## 2026-03-24 NBA Q1/Q3 fallback + alerting
- [x] Verify existing adapters for NBA Q1/Q3 availability
- [x] Implement minimal production-safe fallback only if a real source exists
- [x] Add daily archive health/alerting when Q1/Q3 rows are zero
- [ ] Build/validate and commit cleanly

## 2026-03-24 Sandbox picks pilot (strictly separated from production)
- [x] Inspect current production pick-history/admin rails and confirm separation requirements
- [x] Write initial pilot spec/implementation plan in repo docs
- [x] Add isolated sandbox schema scaffold (`sandbox_pick_slates`, `sandbox_pick_history`)
- [x] Add isolated TypeScript types + storage helper under `src/lib/sandbox/`
- [x] Add admin-only API + admin sandbox entry point without wiring public UI
- [x] Update 10am sandbox review instructions to explicitly include stats-angle review
- [ ] Build/validate and commit cleanly

## 2026-03-24 Subagent: NBA Q1/Q3 fallback candidate
- [x] Inspect current Pinnacle/Kambi/PointsBet adapters and quarter-market wiring
- [x] Test live candidate availability safely from environment
- [x] Implement strongest production-safe fallback or improve observability with evidence
- [x] Validate with build/tests where available
- [x] Commit changes and capture blocker
