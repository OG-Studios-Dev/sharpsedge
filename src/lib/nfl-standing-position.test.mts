import assert from "node:assert/strict";
import test from "node:test";
import nflStandingPosition from "./nfl-standing-position.ts";

const { resolveNFLStandingPosition } = nflStandingPosition;

test("NFL standings preserve a positive provider rank", () => {
  assert.equal(resolveNFLStandingPosition(3, 7), 3);
});

test("NFL standings use conference row order when provider rank is missing", () => {
  assert.equal(resolveNFLStandingPosition(0, 7), 7);
  assert.equal(resolveNFLStandingPosition(undefined, 4), 4);
});
