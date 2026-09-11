import assert from "node:assert/strict";
import test from "node:test";
import nflPickSelection from "./nfl-pick-selection.ts";
import type { NFLShadowCandidate } from "./nfl-pick-selection.ts";

const { nflDisplayDate, selectNFLPickRows } = nflPickSelection;

const NOW = "2026-09-08T18:00:00.000Z";

function row(overrides: Partial<NFLShadowCandidate>): NFLShadowCandidate {
  return {
    id: overrides.id ?? "row",
    candidate_id: overrides.candidate_id ?? "candidate",
    pick_date: overrides.pick_date ?? "2026-09-10",
    market_type: overrides.market_type ?? "total",
    side: overrides.side ?? "over",
    line: overrides.line ?? 44.5,
    odds: overrides.odds ?? -110,
    sportsbook: overrides.sportsbook ?? "DraftKings",
    team_name: overrides.team_name ?? "Over",
    opponent_name: overrides.opponent_name ?? "Seattle Seahawks @ New England Patriots",
    confidence_score: overrides.confidence_score ?? 0.43,
    model_score: overrides.model_score ?? 0.59,
    evidence_snapshot: overrides.evidence_snapshot ?? {
      edge: 0.102,
      primary_learning_signal: {
        test_wins: 146,
        test_losses: 105,
        test_pushes: 0,
        test_sample: 251,
      },
    },
    status: overrides.status ?? "recorded",
    result: overrides.result ?? "pending",
    recorded_at: overrides.recorded_at ?? "2026-09-08T17:00:00.000Z",
    capture_ts: overrides.capture_ts ?? "2026-09-08T16:00:00.000Z",
    commence_time: overrides.commence_time ?? "2026-09-10T00:20:00.000Z",
    home_team: overrides.home_team ?? "New England Patriots",
    away_team: overrides.away_team ?? "Seattle Seahawks",
  };
}

test("nflDisplayDate converts the UTC event date to Toronto game day", () => {
  assert.equal(nflDisplayDate("2026-09-10T00:20:00.000Z"), "2026-09-09");
});

test("selectNFLPickRows rejects stale prices and collapses duplicate books", () => {
  const freshTotal = row({ id: "total-dk", candidate_id: "total-dk", odds: -110 });
  const worseDuplicate = row({
    id: "total-bovada",
    candidate_id: "total-bovada",
    sportsbook: "Bovada",
    odds: -115,
    capture_ts: "2026-09-08T15:59:00.000Z",
  });
  const staleAltLine = row({
    id: "total-stale",
    candidate_id: "total-stale",
    sportsbook: "Pinnacle",
    line: 51.5,
    odds: 215,
    capture_ts: "2026-08-31T20:00:00.000Z",
  });
  const moneyline = row({
    id: "ml",
    candidate_id: "ml",
    market_type: "moneyline",
    side: "home",
    line: null,
    odds: 120,
    team_name: "New England Patriots",
    confidence_score: 0.74,
    evidence_snapshot: {
      edge: 0.12,
      primary_learning_signal: {
        test_wins: 70,
        test_losses: 30,
        test_pushes: 0,
        test_sample: 100,
        promotion_status: "eligible",
      },
    },
  });
  const spreadBelowProductionEdge = row({
    id: "spread",
    candidate_id: "spread",
    market_type: "spread",
    side: "away",
    line: 3.5,
    odds: -105,
    team_name: "Seattle Seahawks",
    confidence_score: 0.68,
    evidence_snapshot: {
      edge: 0.09,
      primary_learning_signal: {
        test_wins: 66,
        test_losses: 34,
        test_pushes: 0,
        test_sample: 100,
      },
    },
  });

  const selected = selectNFLPickRows(
    [staleAltLine, worseDuplicate, freshTotal, moneyline, spreadBelowProductionEdge],
    { now: NOW, maxAgeHours: 36, limit: 3, productionHitRate: 65, productionEdge: 10 },
  );

  assert.deepEqual(selected.learningRows.map((pick) => pick.id), ["spread", "total-dk"]);
  assert.deepEqual(selected.productionRows.map((pick) => pick.id), ["ml"]);
  assert.equal(selected.learningRows.some((pick) => pick.id === "ml"), false);
  assert.equal(selected.rejectedStale, 1);
  assert.equal(selected.duplicatesCollapsed, 1);
});

test("selectNFLPickRows excludes games that have already started from actionable picks", () => {
  const finished = row({
    id: "finished",
    candidate_id: "finished",
    commence_time: "2026-09-09T01:00:00.000Z",
    capture_ts: "2026-09-09T00:30:00.000Z",
    evidence_snapshot: {
      edge: 0.12,
      primary_learning_signal: {
        test_wins: 70,
        test_losses: 30,
        test_sample: 100,
        promotion_status: "eligible",
      },
    },
  });

  const selected = selectNFLPickRows([finished], { now: "2026-09-09T03:00:00.000Z" });
  assert.deepEqual(selected.learningRows, []);
  assert.deepEqual(selected.productionRows, []);
});

test("selectNFLPickRows keeps shadow-only signals out of official picks", () => {
  const shadowOnly = row({
    id: "shadow-only",
    candidate_id: "shadow-only",
    evidence_snapshot: {
      edge: 0.12,
      primary_learning_signal: {
        test_wins: 70,
        test_losses: 30,
        test_sample: 100,
        promotion_status: "keep_shadow_only",
      },
    },
  });

  const selected = selectNFLPickRows([shadowOnly], { now: NOW });
  assert.deepEqual(selected.learningRows.map((pick) => pick.id), ["shadow-only"]);
  assert.deepEqual(selected.productionRows, []);
});
