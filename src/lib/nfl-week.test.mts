import assert from "node:assert/strict";
import test from "node:test";
import nflWeek from "./nfl-week.ts";

const { nflWeekSummary, normalizeNFLWeekParam } = nflWeek;

const team = (abbreviation: string) => ({
  id: abbreviation,
  abbreviation,
  fullName: abbreviation,
  record: "0-0",
  color: "#000000",
});

test("nflWeekSummary describes the complete week instead of a daily slate", () => {
  const games = [
    {
      id: "thu",
      date: "2026-09-10T00:20:00Z",
      status: "Final",
      statusDetail: "Final",
      week: "Week 1",
      homeTeam: team("SEA"),
      awayTeam: team("NE"),
      homeScore: 21,
      awayScore: 17,
    },
    {
      id: "sun",
      date: "2026-09-13T17:00:00Z",
      status: "1:00 PM ET",
      statusDetail: "9/13 - 1:00 PM EDT",
      week: "Week 1",
      homeTeam: team("TEN"),
      awayTeam: team("NYJ"),
      homeScore: 0,
      awayScore: 0,
    },
    {
      id: "mon",
      date: "2026-09-15T00:15:00Z",
      status: "8:15 PM ET",
      statusDetail: "9/14 - 8:15 PM EDT",
      week: "Week 1",
      homeTeam: team("KC"),
      awayTeam: team("DEN"),
      homeScore: 0,
      awayScore: 0,
    },
  ];

  assert.deepEqual(nflWeekSummary(games), {
    number: 1,
    label: "Week 1",
    dateRange: "Sep 9–14",
    gameCount: 3,
    startDate: "2026-09-09",
    endDate: "2026-09-14",
  });
});

test("nflWeekSummary has a truthful empty state", () => {
  assert.deepEqual(nflWeekSummary([]), {
    number: null,
    label: "NFL Week",
    dateRange: null,
    gameCount: 0,
    startDate: null,
    endDate: null,
  });
});

test("normalizeNFLWeekParam accepts only regular-season week numbers", () => {
  assert.equal(normalizeNFLWeekParam("1"), 1);
  assert.equal(normalizeNFLWeekParam("18"), 18);
  assert.equal(normalizeNFLWeekParam("0"), null);
  assert.equal(normalizeNFLWeekParam("19"), null);
  assert.equal(normalizeNFLWeekParam("week-2"), null);
  assert.equal(normalizeNFLWeekParam(null), null);
});
