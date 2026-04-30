import test from "node:test";
import assert from "node:assert/strict";

import internalQuery from "./internal-query.ts";

const { parseAskGooseIntent } = internalQuery;

test("parses home underdogs with totals under as total under context", () => {
  const intent = parseAskGooseIntent("home underdogs when totals were under 205.5", "NBA", []);

  assert.equal(intent.marketType, "total");
  assert.equal(intent.side, "under");
  assert.equal(intent.mentionedUnderdog, true);
  assert.equal(intent.mentionedHome, true);
});

test("parses team unders above .500 as total under with above-.500 team filter", () => {
  const intent = parseAskGooseIntent("Boston Celtics unders when they were above .500", "NBA", []);

  assert.equal(intent.marketType, "total");
  assert.equal(intent.side, "under");
  assert.equal(intent.wantsAbove500Teams, true);
});

test("parses public money over as public split leaning on bet", () => {
  const intent = parseAskGooseIntent("public money over", "NBA", []);

  assert.equal(intent.publicSplitRequested, true);
  assert.equal(intent.publicSplitLean, "on_bet");
});

test("parses public against bet as public split leaning against bet", () => {
  const intent = parseAskGooseIntent("public against bet", "NBA", []);

  assert.equal(intent.publicSplitRequested, true);
  assert.equal(intent.publicSplitLean, "against_bet");
});
