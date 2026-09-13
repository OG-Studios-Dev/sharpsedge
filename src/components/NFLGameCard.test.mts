import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nflGameDisplay from "../lib/nfl-game-display.ts";

const { shouldShowNFLScore } = nflGameDisplay;

test("pregame 0-0 values are not presented as real NFL scores", () => {
  assert.equal(shouldShowNFLScore({ status: "1:00 PM ET", quarter: null }), false);
  assert.equal(shouldShowNFLScore({ status: "3rd", quarter: "3rd" }), true);
  assert.equal(shouldShowNFLScore({ status: "Final", quarter: null }), true);
});

test("weekly NFL game rows do not repeat the week label inside every matchup", () => {
  const source = readFileSync("src/components/NFLGameCard.tsx", "utf8");
  assert.doesNotMatch(source, /game\.week \|\| "NFL"/);
  assert.match(source, /shouldShowNFLScore\(game\)/);
  assert.match(source, /rounded-xl border border-dark-border bg-dark-surface\/90 p-3/);
});
