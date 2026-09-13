import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("NFL schedule is framed as one complete week instead of a daily slate", () => {
  const component = readFileSync("src/components/NFLScheduleBoard.tsx", "utf8");
  assert.doesNotMatch(component, /offseason runway|return "Today"|return "Tomorrow"/i);
  assert.match(component, /data\.meta\.week\.label/);
  assert.match(component, /data\.meta\.week\.dateRange/);
  assert.match(component, /data\.meta\.week\.gameCount/);
  assert.match(component, /weekly matchups/i);
});

test("NFL schedule navigates by whole week rather than individual dates", () => {
  const component = readFileSync("src/components/NFLScheduleBoard.tsx", "utf8");
  assert.match(component, /aria-label="Previous NFL week"/);
  assert.match(component, /aria-label="Next NFL week"/);
  assert.match(component, /\/api\/nfl\/dashboard\?week=\$\{selectedWeek\}/);
});
