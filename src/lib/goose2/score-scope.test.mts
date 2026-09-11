import assert from "node:assert/strict";
import test from "node:test";
import scoreScope from "../../../scripts/lib/goose2-score-scope.mjs";

const { filterRowsBySport, normalizeScoreSport } = scoreScope;

test("normalizeScoreSport accepts a league case-insensitively", () => {
  assert.equal(normalizeScoreSport("nfl"), "NFL");
  assert.equal(normalizeScoreSport("  MLB "), "MLB");
  assert.equal(normalizeScoreSport(undefined), null);
});

test("normalizeScoreSport rejects unsupported leagues", () => {
  assert.throws(() => normalizeScoreSport("EPL"), /Unsupported score sport/);
});

test("filterRowsBySport prevents a league model from scoring other sports", () => {
  const rows = [{ sport: "NFL", id: 1 }, { sport: "MLB", id: 2 }, { sport: "nfl", id: 3 }];
  assert.deepEqual(filterRowsBySport(rows, "NFL").map((row: { id: number }) => row.id), [1, 3]);
  assert.equal(filterRowsBySport(rows, null).length, 3);
});
