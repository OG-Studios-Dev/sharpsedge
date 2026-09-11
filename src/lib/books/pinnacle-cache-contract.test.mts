import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./pinnacle.ts", import.meta.url), "utf8");

test("Pinnacle does not send its oversized league matchup payload through the Next data cache", () => {
  assert.match(
    source,
    /leagues\/\$\{leagueId\}\/matchups[\s\S]*?cache:\s*"no-store"/,
  );
});
