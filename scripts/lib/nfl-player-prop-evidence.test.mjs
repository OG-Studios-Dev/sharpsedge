import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNFLPlayerPropEvidence,
  extractESPNPlayerGameLogCategories,
  isNFLPlayerPropMarket,
  normalizeNFLPlayerName,
  resolveUniqueNFLAthleteId,
} from "./nfl-player-prop-evidence.mjs";

function gamelog(statName, values) {
  return {
    names: [statName],
    events: Object.fromEntries(values.map((value, index) => [
      `event-${index}`,
      { eventId: `event-${index}`, statistics: [String(value)] },
    ])),
  };
}

test("recognizes the supported NFL player-prop market family", () => {
  assert.equal(isNFLPlayerPropMarket("player_prop_passing_yards"), true);
  assert.equal(isNFLPlayerPropMarket("total"), false);
});

test("normalizes ESPN suffixes without conflating player names", () => {
  assert.equal(normalizeNFLPlayerName("Marvin Harrison Jr."), "marvinharrison");
  assert.equal(normalizeNFLPlayerName("Michael Pittman Sr."), "michaelpittman");
  assert.notEqual(normalizeNFLPlayerName("Josh Allen"), normalizeNFLPlayerName("Josh Allenby"));
});

test("resolves duplicate ESPN athlete names only with a unique active event-team match", () => {
  const athletes = [
    { id: "min-wr", displayName: "Justin Jefferson", status: "active", team: { abbreviation: "MIN", displayName: "Minnesota Vikings" } },
    { id: "cle-db", displayName: "Justin Jefferson", status: "active", team: { abbreviation: "CLE", displayName: "Cleveland Browns" } },
    { id: "old-qb", displayName: "Josh Allen", status: "free-agent", team: { abbreviation: "ARI", displayName: "Arizona Cardinals" } },
    { id: "buf-qb", displayName: "Josh Allen", status: "active", team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
  ];

  assert.equal(resolveUniqueNFLAthleteId(athletes, "Justin Jefferson", ["Minnesota Vikings", "Green Bay Packers"]), "min-wr");
  assert.equal(resolveUniqueNFLAthleteId(athletes, "Josh Allen", ["Buffalo Bills", "New York Jets"]), "buf-qb");
  assert.equal(resolveUniqueNFLAthleteId(athletes, "Justin Jefferson", []), null);
});

test("fails closed when ESPN identity remains ambiguous within the same event team", () => {
  const athletes = [
    { id: "one", displayName: "Example Player Jr.", status: "active", team: { displayName: "Buffalo Bills" } },
    { id: "two", displayName: "Example Player", status: "active", team: { displayName: "Buffalo Bills" } },
  ];
  assert.equal(resolveUniqueNFLAthleteId(athletes, "Example Player", ["Buffalo Bills"]), null);
});

test("identifies a prop once per event, player, and market regardless of book or line", async () => {
  const { buildNFLPlayerPropSelectionKey } = await import("./nfl-player-prop-evidence.mjs");
  const first = buildNFLPlayerPropSelectionKey({
    eventId: "game-1",
    marketType: "player_prop_receiving_yards",
    participantName: "Jauan Jennings",
  });
  const second = buildNFLPlayerPropSelectionKey({
    eventId: "game-1",
    marketType: "player_prop_receiving_yards",
    participantName: "Jauan Jennings Jr.",
  });
  assert.equal(first, second);
});

test("classifies NFL production readiness with prop and team thresholds", async () => {
  const { isNFLProductionReadyShadowRow } = await import("./nfl-player-prop-evidence.mjs");
  const signal = { promotion_status: "eligible", test_wins: 14, test_losses: 6 };
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "player_prop_receptions", odds: -200, edge: 0.1, primary_signal: signal }), true);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "player_prop_receptions", odds: -201, edge: 0.1, primary_signal: signal }), false);
  const weeklySignal = { promotion_status: "shadow_daily_candidate", test_wins: 33, test_losses: 27 };
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "moneyline", odds: -150, edge: 0.05, primary_signal: weeklySignal }), true);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "moneyline", odds: -150, edge: 0.049, primary_signal: weeklySignal }), false);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "moneyline", odds: -150, edge: 0.1, primary_signal: { ...weeklySignal, test_wins: 8, test_losses: 2 } }), false);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "moneyline", odds: -151, edge: 0.1, primary_signal: weeklySignal }), false);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "total", odds: -110, edge: 0.106, primary_signal: { ...weeklySignal, test_wins: 141, test_losses: 100 } }), true);
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "total", odds: -110, edge: 0.2, primary_signal: { ...weeklySignal, promotion_status: "shadow" } }), false);
});

test("fails closed on missing odds and on events that are not verifiably pregame", async () => {
  const { isNFLPregameEvent, isNFLProductionReadyShadowRow } = await import("./nfl-player-prop-evidence.mjs");
  const signal = { promotion_status: "shadow_daily_candidate", test_wins: 40, test_losses: 20 };
  assert.equal(isNFLProductionReadyShadowRow({ market_type: "total", odds: null, edge: 0.1, primary_signal: signal }), false);
  assert.equal(isNFLPregameEvent({ status: "scheduled", commence_time: "2026-09-13T18:00:00.000Z" }, "2026-09-13T17:59:59.000Z"), true);
  assert.equal(isNFLPregameEvent({ status: "unknown", commence_time: "2026-09-13T18:00:00.000Z" }, "2026-09-13T18:00:00.000Z"), false);
  assert.equal(isNFLPregameEvent({ status: "scheduled", commence_time: null }, "2026-09-13T17:00:00.000Z"), false);
  assert.equal(isNFLPregameEvent({ status: "completed", commence_time: "2026-09-13T19:00:00.000Z" }, "2026-09-13T17:00:00.000Z"), false);
});

test("calculates an over hit rate from historical ESPN game-log rows", () => {
  const evidence = calculateNFLPlayerPropEvidence({
    marketType: "player_prop_receiving_yards",
    side: "over",
    line: 50.5,
    categories: [gamelog("receivingYards", [61, 72, 10, 80, 55, 20, 99, 65, 33, 77])],
  });

  assert.deepEqual(evidence, {
    wins: 7,
    losses: 3,
    pushes: 0,
    sample: 10,
    hitRate: 0.7,
  });
});

test("uses ESPN top-level stat names when categories omit their own names", () => {
  const source = gamelog("receivingYards", [61, 72, 10]);
  const evidence = calculateNFLPlayerPropEvidence({
    marketType: "player_prop_receiving_yards",
    side: "over",
    line: 50.5,
    names: source.names,
    categories: [{ events: source.events }],
  });
  assert.equal(evidence?.wins, 2);
  assert.equal(evidence?.losses, 1);
});

test("reads ESPN season-type event arrays and their stats field", () => {
  const categories = extractESPNPlayerGameLogCategories({
    names: ["receptions"],
    events: { one: { id: "one" } },
    seasonTypes: [{ categories: [{ events: [
      { eventId: "one", stats: ["2"] },
      { eventId: "two", stats: ["1"] },
      { eventId: "three", stats: ["3"] },
    ] }] }],
  });
  const evidence = calculateNFLPlayerPropEvidence({
    marketType: "player_prop_receptions",
    side: "over",
    line: 1.5,
    categories,
  });
  assert.deepEqual(evidence, { wins: 2, losses: 1, pushes: 0, sample: 3, hitRate: 2 / 3 });
});

test("anytime touchdown combines rushing and receiving touchdowns by game", () => {
  const evidence = calculateNFLPlayerPropEvidence({
    marketType: "player_prop_anytime_td",
    side: "over",
    line: 0.5,
    categories: [
      gamelog("rushingTouchdowns", [1, 0, 0, 1]),
      gamelog("receivingTouchdowns", [0, 1, 0, 1]),
    ],
  });

  assert.deepEqual(evidence, {
    wins: 3,
    losses: 1,
    pushes: 0,
    sample: 4,
    hitRate: 0.75,
  });
});

test("excludes game-log events whose requested stat is absent instead of treating them as zero", () => {
  const evidence = calculateNFLPlayerPropEvidence({
    marketType: "player_prop_receiving_yards",
    side: "under",
    line: 50.5,
    categories: [{
      names: ["receivingYards"],
      events: {
        missing: { eventId: "missing", stats: [] },
        played: { eventId: "played", stats: ["42"] },
      },
    }],
  });
  assert.deepEqual(evidence, { wins: 1, losses: 0, pushes: 0, sample: 1, hitRate: 1 });
});

test("returns null when a market cannot be proved from the supplied game log", () => {
  assert.equal(calculateNFLPlayerPropEvidence({
    marketType: "player_prop_passing_yards",
    side: "over",
    line: 250.5,
    categories: [gamelog("receivingYards", [60, 70])],
  }), null);
});
