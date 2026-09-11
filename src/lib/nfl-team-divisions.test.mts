import assert from "node:assert/strict";
import test from "node:test";
import nflTeamDivisions from "./nfl-team-divisions.ts";

const { NFL_TEAM_DIVISIONS } = nflTeamDivisions;

test("NFL division map covers all 32 teams", () => {
  assert.equal(Object.keys(NFL_TEAM_DIVISIONS).length, 32);
});

test("NFL division map assigns known conference divisions", () => {
  assert.equal(NFL_TEAM_DIVISIONS.BUF, "East");
  assert.equal(NFL_TEAM_DIVISIONS.KC, "West");
  assert.equal(NFL_TEAM_DIVISIONS.GB, "North");
  assert.equal(NFL_TEAM_DIVISIONS.TB, "South");
});
