# TODO

- [x] Inspect current goose model vs sandbox responsibilities and answer whether they are the same system.
- [x] Implement an NBA feature registry / weighted signal scaffold aligned to Marco's ranked data priorities.
- [x] Expand the goose learning layer into a fuller NBA-first system: market-aware priors, structured feature snapshots, and sandbox-first learning flow.
- [x] Clean repo noise from the latest learning-system work if needed.
- [x] Add sandbox auto-grading loop.
- [x] Wire richer NBA injury / lineup / minutes context into goose feature snapshots.
- [ ] Wire actual NBA numeric/context features into goose snapshots where current project data allows.
- [ ] Strengthen sandbox/goose learning flow where obvious gaps remain.
- [ ] Verify generate/build behavior locally.
- [ ] Commit and push changes.
- [ ] Add review notes / outcome summary.

## Review
- 3589f31: NBA prior registry + signal tagging + generator scoring hook.
- b938ab6: fuller NBA learning system with market priors, structured snapshots, and sandbox→goose grading bridge.
- b11e3d8: sandbox auto-grade, NBA live context enricher, repo cleanup.
- Current phase: move from heuristic context toward actual numeric NBA feature capture.
