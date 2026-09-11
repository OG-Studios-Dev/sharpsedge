import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./nfl-learning-first-picks.ts", import.meta.url), "utf8");

test("NFL pick loading tries a strictly later slate when same-date rows are not actionable", () => {
  assert.match(source, /params\.set\("pick_date", `gt\.\$\{date\}`\)/);
  assert.match(source, /if \(!hasActionableRows\(\) && allowUpcoming\)/);
});
