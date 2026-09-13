import assert from "node:assert/strict";
import test from "node:test";
import taxonomy from "./taxonomy.ts";

const { inferGoose2MarketType } = taxonomy;

const cases = {
  player_pass_yds: "player_prop_passing_yards",
  player_pass_tds: "player_prop_passing_tds",
  player_rush_yds: "player_prop_rushing_yards",
  player_rush_attempts: "player_prop_rush_attempts",
  player_reception_yds: "player_prop_receiving_yards",
  player_receptions: "player_prop_receptions",
  player_anytime_td: "player_prop_anytime_td",
};

test("The Odds API NFL prop keys map to distinct canonical markets", () => {
  for (const [propType, expected] of Object.entries(cases)) {
    assert.equal(inferGoose2MarketType({ sport: "NFL", propType }), expected, propType);
  }
});
