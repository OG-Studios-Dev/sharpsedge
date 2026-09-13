import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("NFL schedule failures surface as unavailable instead of fake offseason data", () => {
  const route = readFileSync("src/app/api/nfl/dashboard/route.ts", "utf8");
  const api = readFileSync("src/lib/nfl-api.ts", "utf8");
  const board = readFileSync("src/components/NFLScheduleBoard.tsx", "utf8");
  const scheduleFunction = api.slice(api.indexOf("export async function getNFLSchedule"), api.indexOf("function parseStandingEntry"));

  assert.doesNotMatch(scheduleFunction, /catch\s*\{/);
  assert.doesNotMatch(scheduleFunction, /return \[\]/);
  assert.match(route, /status:\s*503/);
  assert.match(route, /NFL dashboard unavailable/);
  assert.match(board, /if \(!response\.ok\) throw new Error/);
});

test("NFL dashboard validates a requested week before loading that complete slate", () => {
  const route = readFileSync("src/app/api/nfl/dashboard/route.ts", "utf8");
  const data = readFileSync("src/lib/nfl-live-data.ts", "utf8");
  assert.match(route, /normalizeNFLWeekParam\(new URL\(request\.url\)\.searchParams\.get\("week"\)\)/);
  assert.match(route, /getNFLDashboardData\(week\)/);
  assert.match(data, /getNFLSchedule\(week\)/);
});
