import assert from "node:assert/strict";
import test from "node:test";
import playerPropSnapshot from "./player-prop-snapshot.ts";

const { attachPersistedOddsApiEventIds, normalizePlayerPropOutcome } = playerPropSnapshot;

test("restores a current NFL Odds API event id from a prior persisted snapshot", () => {
  const events = [{
    gameId: "derived",
    oddsApiEventId: null,
    commenceTime: "1789318800",
    homeTeam: "Carolina Panthers",
    awayTeam: "Chicago Bears",
  }];
  const persisted = [{
    odds_api_event_id: "provider-event-id",
    commence_time: "2026-09-13T17:00:00Z",
    home_team: "Carolina Panthers",
    away_team: "Chicago Bears",
  }];

  attachPersistedOddsApiEventIds(events, persisted);
  assert.equal(events[0].oddsApiEventId, "provider-event-id");
});

test("normalizes anytime-touchdown Yes prices into an over 0.5 prop", () => {
  assert.deepEqual(normalizePlayerPropOutcome("player_anytime_td", {
    name: "Yes",
    description: "Bijan Robinson",
    price: -125,
  }), { direction: "Over", line: 0.5 });
});
