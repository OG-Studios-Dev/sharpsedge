import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import nflSystemGrading from "./nfl-system-grading.ts";

const { extractFinalNFLScoreboardResults } = nflSystemGrading;

test("NFL system grading extracts only final ESPN scoreboard results", () => {
  const rows = extractFinalNFLScoreboardResults({
    events: [
      {
        date: "2025-09-05T00:20:00Z",
        status: { type: { completed: true, name: "STATUS_FINAL" } },
        competitions: [{ competitors: [
          { homeAway: "home", score: "24", team: { abbreviation: "PHI" } },
          { homeAway: "away", score: "20", team: { abbreviation: "DAL" } },
        ] }],
      },
      {
        date: "2025-09-06T00:00:00Z",
        status: { type: { completed: false, name: "STATUS_SCHEDULED" } },
        competitions: [{ competitors: [
          { homeAway: "home", score: "0", team: { abbreviation: "KC" } },
          { homeAway: "away", score: "0", team: { abbreviation: "DEN" } },
        ] }],
      },
      {
        date: "2025-09-07T00:00:00Z",
        status: { type: { completed: true, name: "STATUS_FINAL" } },
        competitions: [{ competitors: [
          { homeAway: "home", score: null, team: { abbreviation: "SEA" } },
          { homeAway: "away", score: "17", team: { abbreviation: "NE" } },
        ] }],
      },
    ],
  });

  assert.deepEqual(rows, [{
    homeAbbrev: "PHI",
    awayAbbrev: "DAL",
    homeScore: 24,
    awayScore: 20,
    gameDate: "2025-09-05",
  }]);
});

test("the shared system grader exposes NFL final settlement only through the dedicated NFL path", () => {
  const source = readFileSync(new URL("../system-grader.ts", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../../../.github/workflows/nfl-daily-learning.yml", import.meta.url), "utf8");
  assert.match(source, /systemId === "nfl-home-dog-majority-handle"[\s\S]*"nfl"/);
  assert.match(source, /"nfl-home-dog-majority-handle"[\s\S]*gradingType: "moneyline"/);
  assert.match(workflow, /--data '\{"systemId":"nfl-home-dog-majority-handle"\}'/);
  assert.match(workflow, /api\/admin\/systems\/grade/);
});
