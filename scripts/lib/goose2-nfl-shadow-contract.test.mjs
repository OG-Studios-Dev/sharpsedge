import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../goose2-score-shadow.mjs", import.meta.url), "utf8");

test("NFL shadow scoring budgets team markets and player props independently", () => {
  assert.match(source, /NFL_TEAM_PICK_TARGET/);
  assert.match(source, /NFL_PLAYER_PROP_PICK_TARGET/);
  assert.match(source, /isNFLPlayerPropMarket\(row\.market_type\)\s*\?\s*NFL_PLAYER_PROP_PICK_TARGET/);
  assert.match(source, /normalizeNFLPlayerName\(row\.participant_name\)/);
  assert.doesNotMatch(source, /countsBySport/);
  assert.match(source, /approved_by_bucket/);
  assert.match(source, /isNFLProductionReadyShadowRow\(row\)/);
  assert.match(source, /counterBucket/);
});

test("NFL scorer orders production-qualified candidates before learning alternatives for the same market", () => {
  const sortStart = source.indexOf("scored.sort");
  const selectionStart = source.indexOf("const picks = []", sortStart);
  const sorter = source.slice(sortStart, selectionStart);
  assert.match(sorter, /isNFLProductionReadyShadowRow\(b\)/);
  assert.match(sorter, /isNFLProductionReadyShadowRow\(a\)/);
});

test("NFL scorer keeps both prop sides until final selection and limits live reads to fresh captures", () => {
  const dedupeStart = source.indexOf("const latestByEventMarketSide");
  const evidenceStart = source.indexOf("const nflPlayerPropEvidence", dedupeStart);
  const dedupe = source.slice(dedupeStart, evidenceStart);
  assert.match(dedupe, /normalizeToken\(row\.side\)/);
  assert.match(source, /capturedAfter/);
  assert.match(source, /candidate query reached the configured cap/);
});
