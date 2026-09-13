import assert from "node:assert/strict";
import test from "node:test";
import pickDisplay from "./pick-display.ts";

const { formatPickMatchupLabel, isSyntheticGameMarketTeam } = pickDisplay;

test("game-total picks lead with the matchup instead of the synthetic team name", () => {
  assert.equal(
    formatPickMatchupLabel({ team: "Game Total", opponent: "Cleveland Browns @ Jacksonville Jaguars" }),
    "Cleveland Browns @ Jacksonville Jaguars",
  );
});

test("normal team picks keep the familiar team-versus-opponent label", () => {
  assert.equal(formatPickMatchupLabel({ team: "MIA", opponent: "LAD" }), "MIA vs LAD");
  assert.equal(formatPickMatchupLabel({ team: "MIA" }), null);
});

test("synthetic game-market labels are never treated as team logo identifiers", () => {
  assert.equal(isSyntheticGameMarketTeam("Game Total"), true);
  assert.equal(isSyntheticGameMarketTeam("NFL Player Prop"), true);
  assert.equal(isSyntheticGameMarketTeam("MIA"), false);
});

test("NFL player props lead with the real game matchup", () => {
  assert.equal(
    formatPickMatchupLabel({ team: "NFL Player Prop", opponent: "San Francisco 49ers @ Seattle Seahawks" }),
    "San Francisco 49ers @ Seattle Seahawks",
  );
});
