import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("NFL schedule header uses in-season neutral copy", () => {
  const component = readFileSync("src/components/NFLScheduleBoard.tsx", "utf8");
  assert.doesNotMatch(component, /offseason runway/i);
  assert.match(component, /weekly matchups/i);
});
