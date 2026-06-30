
## 2026-06-04 — MLB prop reasoning must exclude same-day live stats
- When generating same-day MLB prop picks, filter player game logs by target `gameId` and `gameDate` before calculating L10/L8/last3 reasoning. Live in-progress stats can appear in MLB Stats game logs and create false historical claims if not excluded.
- After deleting a false stored pick, rerun active-picks claim checks; do not reuse a hardcoded pre-fix checker as final proof if it still asserts the removed stale claim.

## 2026-06-14 — PGA majors need live schedule/odds sanity checks
- Before a major week, compare Goosalytics fallback course metadata against official tournament sources; static fallback values can drift even when ESPN event IDs are current.
- If live golf odds fall back to local snapshots, verify the tournament label. Old Masters/DK seed files must not mask fresher major odds already captured in Supabase fallback tables.

## 2026-06-29 — System refresh must not overwrite settled grades
- When system qualifiers are upserted from local tracker snapshots, preserve any existing Supabase settled/ungradeable outcome fields. A refresh payload built from stale local `pending` rows can otherwise reset graded records and make profitable/system-health views look broken.
- After fixing a grading backlog, rerun refresh and then re-check DB performance summaries to prove grades survive the next refresh cycle.

## 2026-06-30 — System refresh cannot depend on writable app files in Vercel
- Vercel production runs from a read-only `/var/task`; system refresh must persist qualifiers to Supabase before any local JSON cache write and treat filesystem cache writes as best-effort only.
- Refresh API responses should return the freshly computed in-memory systems, not reread stale packaged JSON after a skipped cache write.

## 2026-06-30 — One system cannot record both sides of the same game
- If a system gate can qualify both teams in one matchup, add an explicit conflict resolver before persistence. Opposite-side rows create fake 1-1 accounting and make profitability meaningless.
- For Veal/Banged Up Pitchers, keep the strongest Falcons score per game, with price as the tiebreaker.
