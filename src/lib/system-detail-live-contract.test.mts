import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("system detail renders the live refresh result when serverless file persistence is unavailable", () => {
  const source = readFileSync("src/app/systems/[slug]/page.tsx", "utf8");
  assert.match(source, /const refreshedSystems = await refreshTrackableSystems/);
  assert.match(source, /refreshedSystems\.find\(\(entry\) => entry\.slug === resolvedSlug\)/);
  assert.match(source, /refreshedSystem \|\| storedSystem/);
});
