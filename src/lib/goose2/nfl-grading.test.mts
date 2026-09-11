import assert from "node:assert/strict";
import test from "node:test";
import grading from "./grading.ts";

const { gradeNFLFromSummary } = grading;

const event = {
  event_id: "evt:nfl:test",
  sport: "NFL",
  league: "NFL",
  event_date: "2025-09-05",
  commence_time: "2025-09-05T00:20:00Z",
  home_team: "Philadelphia Eagles",
  away_team: "Dallas Cowboys",
  home_team_id: "PHI",
  away_team_id: "DAL",
  source_event_id: "401772510",
  odds_api_event_id: null,
  metadata: {},
} as any;

const finalSummary = {
  header: {
    competitions: [{
      status: { type: { completed: true } },
      competitors: [
        { homeAway: "home", team: { abbreviation: "PHI" }, score: "24" },
        { homeAway: "away", team: { abbreviation: "DAL" }, score: "20" },
      ],
    }],
  },
  boxscore: {
    players: [
      {
        team: { abbreviation: "DAL" },
        statistics: [
          { name: "passing", labels: ["C/ATT", "YDS", "AVG", "TD"], athletes: [{ athlete: { displayName: "Dak Prescott" }, stats: ["21/34", "188", "5.5", "0"] }] },
          { name: "rushing", labels: ["CAR", "YDS", "AVG", "TD"], athletes: [{ athlete: { displayName: "Javonte Williams" }, stats: ["15", "54", "3.6", "2"] }] },
          { name: "receiving", labels: ["REC", "YDS", "AVG", "TD"], athletes: [{ athlete: { displayName: "CeeDee Lamb" }, stats: ["7", "110", "15.7", "0"] }] },
        ],
      },
      {
        team: { abbreviation: "PHI" },
        statistics: [],
      },
    ],
  },
};

function candidate(market_type: string, side: string, line: number | null, participant_name: string | null = null, participant_id: string | null = null) {
  return {
    candidate_id: `cand:${market_type}:${participant_name || participant_id || side}`,
    event_id: event.event_id,
    market_type,
    side,
    line,
    odds: -110,
    participant_name,
    participant_id,
    opponent_name: null,
  } as any;
}

test("NFL team markets grade from a completed ESPN summary", () => {
  const total = gradeNFLFromSummary(candidate("total", "over", 43.5), event, finalSummary, "fixture");
  const moneyline = gradeNFLFromSummary(candidate("moneyline", "home", null, "Philadelphia Eagles", "PHI"), event, finalSummary, "fixture");
  const spread = gradeNFLFromSummary(candidate("spread", "away", 4.5, "Dallas Cowboys", "DAL"), event, finalSummary, "fixture");

  assert.equal(total.result, "win");
  assert.equal(total.actual_stat, 44);
  assert.equal(moneyline.result, "win");
  assert.equal(spread.result, "win");
});

test("NFL player props grade passing, rushing, receiving, and anytime touchdowns", () => {
  const cases = [
    ["player_prop_passing_yards", "Dak Prescott", 187.5, 188],
    ["player_prop_passing_tds", "Dak Prescott", 0.5, 0],
    ["player_prop_rushing_yards", "Javonte Williams", 53.5, 54],
    ["player_prop_rush_attempts", "Javonte Williams", 14.5, 15],
    ["player_prop_receiving_yards", "CeeDee Lamb", 109.5, 110],
    ["player_prop_receptions", "CeeDee Lamb", 6.5, 7],
    ["player_prop_anytime_td", "Javonte Williams", 0.5, 1],
  ] as const;

  for (const [market, player, line, actual] of cases) {
    const result = gradeNFLFromSummary(candidate(market, "over", line, player), event, finalSummary, "fixture");
    assert.equal(result.actual_stat, actual, market);
    assert.equal(result.result, actual > line ? "win" : "loss", market);
    assert.equal(result.integrity_status, "ok", market);
  }
});

test("NFL player who did not appear is voided rather than graded win or loss", () => {
  const result = gradeNFLFromSummary(candidate("player_prop_receiving_yards", "over", 45.5, "Did Not Play"), event, finalSummary, "fixture");
  assert.equal(result.result, "void");
  assert.equal(result.integrity_status, "void");
});

test("NFL game remains pending until ESPN marks it complete", () => {
  const summary = structuredClone(finalSummary);
  summary.header.competitions[0].status.type.completed = false;
  const result = gradeNFLFromSummary(candidate("total", "over", 43.5), event, summary, "fixture");
  assert.equal(result.result, "pending");
  assert.equal(result.integrity_status, "pending");
});

test("NFL final payload without both scores stays pending instead of fabricating a 0-0 grade", () => {
  const summary = structuredClone(finalSummary);
  delete (summary.header.competitions[0].competitors[0] as { score?: string }).score;
  const result = gradeNFLFromSummary(candidate("total", "under", 43.5), event, summary, "fixture");
  assert.equal(result.result, "pending");
  assert.equal(result.actual_stat, null);
  assert.equal(result.integrity_status, "pending");
});
