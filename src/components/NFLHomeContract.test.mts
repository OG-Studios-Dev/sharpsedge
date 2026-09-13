import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("NFL home mirrors the core MLB hierarchy before showing the weekly schedule", () => {
  const source = readFileSync("src/components/HomeContent.tsx", "utf8");
  const start = source.indexOf('if (sportLeague === "NFL")');
  const end = source.indexOf('if (sportLeague === "EPL"', start);
  const nflHome = source.slice(start, end);

  const picks = nflHome.indexOf("<HomePicksSection");
  const systems = nflHome.indexOf("nflSystemsSection");
  const schedule = nflHome.indexOf("<NFLScheduleBoard");
  const standings = nflHome.indexOf("<NFLStandingsTable");

  assert.ok(picks >= 0, "NFL home must include Goose AI picks");
  assert.ok(systems > picks, "NFL systems must follow picks");
  assert.ok(schedule > systems, "weekly games must follow systems");
  assert.ok(standings > schedule, "standings must remain available after the weekly board");
  assert.match(nflHome, /This week’s edge, ranked and ready/);
});

test("NFL picks card exposes weekly Goose Learning output without promoting it to AI picks", () => {
  const source = readFileSync("src/components/HomePicksSection.tsx", "utf8");
  assert.match(source, /nfl\.learningPicks/);
  assert.match(source, /Goose Learning · shadow only/);
  assert.match(source, /No official NFL pick cleared both gates this week/);
});

test("synthetic NFL game markets link to the picks board instead of a fake team page", () => {
  const source = readFileSync("src/components/HomePicksSection.tsx", "utf8");
  assert.match(source, /const isSyntheticTeam = isSyntheticGameMarketTeam\(pick\.team\)/);
  assert.match(source, /isSyntheticTeam\s*\?\s*`\/picks\?league=\$\{pick\.league \|\| "NFL"\}`/);
});

test("homepage supplies an NFL-filtered systems card", () => {
  const page = readFileSync("src/app/page.tsx", "utf8");
  const systems = readFileSync("src/components/HomeSystemsSection.tsx", "utf8");
  assert.match(page, /nflSystemsSection=.*HomeSystemsSection[\s\S]*league="NFL"/);
  assert.match(systems, /league\?: string/);
  assert.match(systems, /system\.league === league/);
});
