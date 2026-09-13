import assert from "node:assert/strict";
import test from "node:test";
import nflApi from "./nfl-api.ts";

const { buildNFLScoreboardUrl, parseNFLScoreboard } = nflApi;

function event(id: string, date: string) {
  return {
    id,
    date,
    status: { type: { state: "pre", shortDetail: "Scheduled" } },
    competitions: [{
      competitors: [
        { homeAway: "home", team: { id: `${id}-home`, abbreviation: "TEN", displayName: "Tennessee Titans" }, records: [{ summary: "0-0" }] },
        { homeAway: "away", team: { id: `${id}-away`, abbreviation: "NYJ", displayName: "New York Jets" }, records: [{ summary: "0-0" }] },
      ],
    }],
  };
}

test("parseNFLScoreboard returns the entire ESPN week with a shared week label", () => {
  const games = parseNFLScoreboard({
    week: { number: 1 },
    events: [
      event("sun", "2026-09-13T17:00:00Z"),
      event("thu", "2026-09-10T00:20:00Z"),
      event("sun", "2026-09-13T17:00:00Z"),
    ],
  });

  assert.deepEqual(games.map((game: { id: string }) => game.id), ["thu", "sun"]);
  assert.deepEqual(games.map((game: { week?: string }) => game.week), ["Week 1", "Week 1"]);
});

test("buildNFLScoreboardUrl requests a complete selected regular-season week", () => {
  assert.match(buildNFLScoreboardUrl(2), /scoreboard\?seasontype=2&week=2&limit=100$/);
  assert.match(buildNFLScoreboardUrl(), /scoreboard\?limit=100$/);
});
