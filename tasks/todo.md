# TODO

- [x] Inspect current goose model vs sandbox responsibilities and answer whether they are the same system.
- [x] Implement an NBA feature registry / weighted signal scaffold aligned to Marco's ranked data priorities.
- [x] Expand the goose learning layer into a fuller NBA-first system: market-aware priors, structured feature snapshots, and sandbox-first learning flow.
- [x] Clean repo noise from the latest learning-system work if needed.
- [x] Add sandbox auto-grading loop.
- [x] Wire richer NBA injury / lineup / minutes context into goose feature snapshots.
- [x] Wire actual NBA numeric/context features into goose snapshots where current project data allows.
- [x] Improve explicit prop-line parsing and combo-prop mapping.
- [x] Push NBA to done-enough threshold: official-ish injury/lineup continuity rails, stronger learned-weight visibility, and any remaining high-value gaps.
- [x] Explicitly test and document NBA data origin -> ingestion -> feature snapshot path in the running system.
- [x] Verify generate/build behavior locally.
- [x] Commit and push changes.
- [x] Add review notes / outcome summary.

## Review
- 3589f31: NBA prior registry + signal tagging + generator scoring hook.
- b938ab6: fuller NBA learning system with market priors, structured snapshots, and sandbox→goose grading bridge.
- b11e3d8: sandbox auto-grade, NBA live context enricher, repo cleanup.
- de5ed58: real ESPN-derived numeric DvP/pace/L5 feature capture into goose snapshots.
- d132644: prop parser, combo fixes, admin snapshot visibility.
- Marco clarified two priorities: finish NBA properly and prove the data origin/path into the system.
- TBD (this commit): roster parser fixed (flat ESPN array shape), DataSourceEntry/data_source_chain added to NBAFeatureSnapshot + NBAContextHints, /api/debug/nba/pipeline traces full 6-step data origin→ingestion→snapshot path. All 6 steps pass in live system.
