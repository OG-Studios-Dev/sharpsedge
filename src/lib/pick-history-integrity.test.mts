import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPECTED_DAILY_PICK_COUNT,
  buildSyntheticSlateRecords,
  mapPickHistoryRecordToAIPick,
  mergeSlateRecords,
  normalizePickHistoryRow,
  normalizePickSlateRow,
} from "./pick-history-integrity.ts";

test("legacy reconstructed dates are labeled and keep stored snapshots", () => {
  const record = normalizePickHistoryRow({
    id: "pick-1",
    date: "2026-03-17",
    league: "NHL",
    type: "player",
    player_name: "Sidney Crosby",
    team: "PIT",
    opponent: "NYR",
    pick_label: "Sidney Crosby Over 0.5 Points",
    hit_rate: 72,
    edge: 8,
    odds: -120,
    result: "pending",
    pick_snapshot: {
      id: "pick-1",
      date: "2026-03-17",
      type: "player",
      playerName: "Sidney Crosby",
      team: "PIT",
      teamColor: "#111111",
      opponent: "NYR",
      isAway: false,
      propType: "Points",
      line: 0.5,
      direction: "Over",
      pickLabel: "Sidney Crosby Over 0.5 Points",
      edge: 8,
      hitRate: 72,
      confidence: 74,
      reasoning: "Stored snapshot",
      result: "pending",
      units: 1,
      odds: -120,
      league: "NHL",
    },
  });

  assert.equal(record.provenance, "reconstructed");
  assert.match(record.provenance_note ?? "", /Backfilled|Reconstructed/i);
  assert.equal(record.pick_snapshot?.propType, "Points");
});

test("history rows replay exact snapshot data while respecting settled result", () => {
  const record = normalizePickHistoryRow({
    id: "pick-2",
    date: "2026-03-19",
    league: "NBA",
    pick_type: "player",
    player_name: "Jalen Brunson",
    team: "NYK",
    opponent: "MIA",
    pick_label: "Jalen Brunson Over 24.5 Points",
    hit_rate: 68,
    edge: 6,
    odds: -110,
    result: "win",
    reasoning: "Row reasoning",
    confidence: 70,
    book: "DraftKings",
    game_id: "401585000",
    pick_snapshot: {
      id: "pick-2",
      date: "2026-03-19",
      type: "player",
      playerName: "Jalen Brunson",
      team: "NYK",
      teamColor: "#006BB6",
      opponent: "MIA",
      isAway: false,
      propType: "Points",
      line: 24.5,
      direction: "Over",
      pickLabel: "Jalen Brunson Over 24.5 Points",
      edge: 6,
      hitRate: 68,
      confidence: 70,
      reasoning: "Snapshot reasoning",
      result: "pending",
      units: 1,
      gameId: "401585000",
      odds: -110,
      book: "DraftKings",
      league: "NBA",
    },
  });

  const pick = mapPickHistoryRecordToAIPick(record);

  assert.equal(pick.result, "win");
  assert.equal(pick.propType, "Points");
  assert.equal(pick.line, 24.5);
  assert.equal(pick.gameId, "401585000");
  assert.equal(pick.reasoning, "Row reasoning");
});

test("synthetic slates mark missing picks as incomplete", () => {
  const records = [
    normalizePickHistoryRow({
      id: "pick-a",
      date: "2026-03-19",
      league: "NHL",
      pick_type: "player",
      team: "TOR",
      opponent: "MTL",
      pick_label: "A",
    }),
    normalizePickHistoryRow({
      id: "pick-b",
      date: "2026-03-19",
      league: "NHL",
      pick_type: "player",
      team: "TOR",
      opponent: "MTL",
      pick_label: "B",
    }),
  ];

  const [slate] = buildSyntheticSlateRecords(records);

  assert.equal(slate.pick_count, 2);
  assert.equal(slate.expected_pick_count, EXPECTED_DAILY_PICK_COUNT);
  assert.equal(slate.integrity_status, "incomplete");
});

test("explicit slate rows are preserved when merged with synthetic history data", () => {
  const explicit = normalizePickSlateRow({
    date: "2026-03-18",
    league: "NBA",
    status: "incomplete",
    provenance: "reconstructed",
    provenance_note: "Backfilled from screenshot and user message.",
    expected_pick_count: 3,
    pick_count: 0,
    status_note: "Backfill missing from live history.",
    locked_at: "2026-03-19T00:00:00.000Z",
    created_at: "2026-03-19T00:00:00.000Z",
  });

  const merged = mergeSlateRecords([explicit], [
    normalizePickHistoryRow({
      id: "pick-c",
      date: "2026-03-19",
      league: "NHL",
      pick_type: "team",
      team: "BOS",
      opponent: "BUF",
      pick_label: "BOS Win ML",
    }),
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged.find((slate) => slate.date === "2026-03-18")?.status_note, "Backfill missing from live history.");
  assert.equal(merged.find((slate) => slate.date === "2026-03-19")?.pick_count, 1);
});
