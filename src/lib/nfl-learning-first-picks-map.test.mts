import assert from "node:assert/strict";
import test from "node:test";
import nflLearning from "./nfl-learning-first-picks.ts";

const { mapNFLLearningShadowPick } = nflLearning;

function propRow() {
  return {
    id: "shadow-1",
    candidate_id: "candidate-1",
    pick_date: "2026-09-13",
    market_type: "player_prop_receiving_yards",
    side: "Over",
    line: 20.5,
    odds: -108,
    sportsbook: "DraftKings",
    team_name: "Jauan Jennings",
    opponent_name: null,
    confidence_score: 0.8,
    model_score: 0.8,
    evidence_snapshot: {
      edge: 0.36,
      primary_learning_signal: {
        signal_key: "espn_game_log",
        promotion_status: "eligible",
        test_wins: 15,
        test_losses: 2,
        test_pushes: 0,
        test_sample: 17,
      },
    },
    status: "recorded",
    result: "pending",
    recorded_at: "2026-09-12T17:22:00.000Z",
    capture_ts: "2026-09-12T17:22:00.000Z",
    commence_time: "2026-09-13T17:00:00.000Z",
    home_team: "Seattle Seahawks",
    away_team: "San Francisco 49ers",
  };
}

test("maps NFL player props as player picks with readable labels", () => {
  const pick = mapNFLLearningShadowPick(propRow(), false);
  assert.equal(pick?.type, "player");
  assert.equal(pick?.playerName, "Jauan Jennings");
  assert.equal(pick?.team, "NFL Player Prop");
  assert.equal(pick?.opponent, "San Francisco 49ers @ Seattle Seahawks");
  assert.equal(pick?.propType, "Receiving Yards");
  assert.equal(pick?.direction, "Over");
  assert.equal(pick?.pickLabel, "Over 20.5 Receiving Yards");
});

test("distinct NFL bets in the same event keep distinct display IDs", () => {
  const prefix = "cand:evt:nfl:nfl:e55c6fe19fce094ce214c8b0e5b504e9:";
  const rush = mapNFLLearningShadowPick({
    ...propRow(),
    candidate_id: `${prefix}player-prop-rush-attempts:bhayshul-tuten:under:11.5:betmgm:2026-09-13T00:24`,
  }, false);
  const receptions = mapNFLLearningShadowPick({
    ...propRow(),
    candidate_id: `${prefix}player-prop-receptions:bhayshul-tuten:under:1.5:betmgm:2026-09-13T00:24`,
  }, false);
  assert.ok(rush && receptions);
  assert.notEqual(rush.id, receptions.id, "different markets in one event must not share a pick ID");
});

test("NFL display IDs remain deterministic and separate official from shadow picks", () => {
  const row = propRow();
  const official = mapNFLLearningShadowPick(row, false);
  const repeated = mapNFLLearningShadowPick(row, false);
  const learning = mapNFLLearningShadowPick(row, true);
  assert.ok(official && repeated && learning);
  assert.equal(official.id, repeated.id);
  assert.notEqual(official.id, learning.id);
  assert.match(official.id, /^nfl-official-[a-f0-9]{64}$/);
  assert.match(learning.id, /^nfl-learning-[a-f0-9]{64}$/);
});
