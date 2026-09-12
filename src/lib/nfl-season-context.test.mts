import assert from "node:assert/strict";
import test from "node:test";
import nflSeasonContext from "./nfl-season-context.ts";

const { resolveNFLSeasonStart } = nflSeasonContext;

test("active September NFL schedule stays in the current season", () => {
  const start = resolveNFLSeasonStart(new Date("2026-09-09T01:00:00Z"), true);
  assert.equal(start.toISOString(), "2026-09-01T04:00:00.000Z");
});

test("September remains in the current NFL season even when an upstream schedule call is empty", () => {
  const start = resolveNFLSeasonStart(new Date("2026-09-11T12:00:00Z"), false);
  assert.equal(start.toISOString(), "2026-09-01T04:00:00.000Z");
});

test("January NFL playoffs belong to the season that started the prior September", () => {
  const start = resolveNFLSeasonStart(new Date("2027-01-10T18:00:00Z"), true);
  assert.equal(start.toISOString(), "2026-09-01T04:00:00.000Z");
});

test("offseason before September counts down to the upcoming current-year season", () => {
  const start = resolveNFLSeasonStart(new Date("2027-05-10T12:00:00Z"), false);
  assert.equal(start.toISOString(), "2027-09-01T04:00:00.000Z");
});
