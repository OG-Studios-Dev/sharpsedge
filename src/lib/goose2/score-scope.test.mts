import assert from "node:assert/strict";
import test from "node:test";
import scoreScope from "../../../scripts/lib/goose2-score-scope.mjs";

const { buildCandidatePagePath, filterRowsBySport, normalizeScoreSport } = scoreScope;

test("normalizeScoreSport accepts a league case-insensitively", () => {
  assert.equal(normalizeScoreSport("nfl"), "NFL");
  assert.equal(normalizeScoreSport("  MLB "), "MLB");
  assert.equal(normalizeScoreSport(undefined), null);
});

test("normalizeScoreSport rejects unsupported leagues", () => {
  assert.throws(() => normalizeScoreSport("EPL"), /Unsupported score sport/);
});

test("candidate page query pushes the sport scope into Supabase before sorting", () => {
  const path = buildCandidatePagePath({
    date: "2026-09-13",
    sport: "NFL",
    select: "candidate_id,event_id,sport,capture_ts",
    limit: 1000,
    offset: 0,
  });
  const url = new URL(path, "https://example.test");
  assert.equal(url.pathname, "/goose_market_candidates");
  assert.equal(url.searchParams.get("event_date"), "eq.2026-09-13");
  assert.equal(url.searchParams.get("sport"), "eq.NFL");
  assert.equal(url.searchParams.get("order"), "capture_ts.desc");
});

test("filterRowsBySport prevents a league model from scoring other sports", () => {
  const rows = [{ sport: "NFL", id: 1 }, { sport: "MLB", id: 2 }, { sport: "nfl", id: 3 }];
  assert.deepEqual(filterRowsBySport(rows, "NFL").map((row: { id: number }) => row.id), [1, 3]);
  assert.equal(filterRowsBySport(rows, null).length, 3);
});
