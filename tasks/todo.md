# MLB enrichment slice — bullpen fatigue + early F5 rail — 2026-03-21
- [x] Inspect MLB enrichment foundation and current odds rails
- [x] Design modest bullpen fatigue derivation + honest F5 market adapter
- [x] Implement enrichment/API surface with freshness/source metadata
- [ ] Run npm run build
- [ ] Review diffs and commit locally

## Review
- Bullpen context is derived from MLB Stats API final-game boxscores over the last three calendar days.
- F5 support is intentionally explicit-only: it surfaces first-five markets only when a source/book exposes them directly.
- No synthetic F5 pricing is inferred from full-game markets.
