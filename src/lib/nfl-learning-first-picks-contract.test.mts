import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./nfl-learning-first-picks.ts", import.meta.url), "utf8");

test("NFL pick loading aggregates the current date through the seven-day weekly horizon", () => {
  assert.match(source, /params\.set\("pick_date", `gte\.\$\{date\}`\)/);
  assert.match(source, /pick_date\.lte\.\$\{addDays\(date, 7\)\}/);
  assert.match(source, /fetchShadowRows\(date, modelVersion, allowUpcoming\)/);
  assert.doesNotMatch(source, /const firstDate = rows\[0\]\.pick_date/);
  assert.doesNotMatch(source, /if \(!hasActionableRows\(\) && allowUpcoming\)/);
});

test("NFL picks API truthfully discloses the universal 70 percent official gate", () => {
  const route = readFileSync("src/app/api/nfl/picks/route.ts", "utf8");
  assert.match(route, /70% hit-rate and 10% edge gates/);
  assert.doesNotMatch(route, /65% hit-rate/);
});

test("NFL pick loading exposes six weekly picks in each market bucket", () => {
  assert.match(source, /const NFL_WEEKLY_PICK_TARGET = 6/);
  assert.match(source, /const PRODUCTION_TEAM_HIT_RATE = 70/);
  assert.match(source, /teamLimit: NFL_WEEKLY_PICK_TARGET/);
  assert.match(source, /playerPropLimit: NFL_WEEKLY_PICK_TARGET/);
});
