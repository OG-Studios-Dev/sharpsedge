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

test("NFL picks API distinguishes the weekly team-value policy from strict player-prop gates", () => {
  const route = readFileSync("src/app/api/nfl/picks/route.ts", "utf8");
  const picksPage = readFileSync("src/app/picks/page.tsx", "utf8");
  assert.match(route, /four best weekly team-market options/);
  assert.match(route, /55% historical hit rate, 50 decisions, and 5% measured edge/);
  assert.match(route, /Player props retain the 70% hit-rate and 10% edge gates/);
  assert.doesNotMatch(picksPage, /65% backtest hit rate/);
  assert.match(picksPage, /weekly team-value or strict player-prop gates/);
});

test("NFL pick loading targets four weekly team options without weakening the six-player-prop ceiling", () => {
  assert.match(source, /const NFL_WEEKLY_TEAM_PICK_TARGET = 4/);
  assert.match(source, /const NFL_WEEKLY_PLAYER_PROP_LIMIT = 6/);
  assert.match(source, /const PRODUCTION_TEAM_HIT_RATE = 55/);
  assert.match(source, /const PRODUCTION_TEAM_EDGE = 5/);
  assert.match(source, /teamLimit: NFL_WEEKLY_TEAM_PICK_TARGET/);
  assert.match(source, /playerPropLimit: NFL_WEEKLY_PLAYER_PROP_LIMIT/);
});
