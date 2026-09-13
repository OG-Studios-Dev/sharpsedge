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

test("selectNFLPickRows publishes four weekly team markets and keeps six qualified player props", () => {
  const eligibleSignal = {
    edge: 0.14,
    primary_learning_signal: {
      test_wins: 80,
      test_losses: 20,
      test_sample: 100,
      promotion_status: "eligible",
    },
  };
  const teamRows = Array.from({ length: 7 }, (_, index) => row({
    id: `team-${index}`,
    candidate_id: `team-${index}`,
    home_team: `Home ${index}`,
    away_team: `Away ${index}`,
    opponent_name: `Away ${index} @ Home ${index}`,
    odds: index === 6 ? -151 : -150 + index,
    evidence_snapshot: eligibleSignal,
  }));
  const propRows = Array.from({ length: 8 }, (_, index) => row({
    id: `prop-${index}`,
    candidate_id: `prop-${index}`,
    market_type: "player_prop_receptions",
    team_name: `Player ${index}`,
    side: "over",
    line: 4.5 + index,
    odds: index === 6 ? -201 : index === 7 ? -200 : -190 + index,
    evidence_snapshot: {
      ...eligibleSignal,
      participantName: `Player ${index}`,
    },
  }));

  const selected = selectNFLPickRows([...teamRows, ...propRows], { now: NOW });

  assert.equal(selected.productionRows.filter((pick) => !pick.market_type.startsWith("player_prop_")).length, 4);
  assert.equal(selected.productionRows.filter((pick) => pick.market_type.startsWith("player_prop_")).length, 6);
  assert.equal(selected.productionRows.some((pick) => pick.id === "team-0"), false);
  assert.equal(selected.productionRows.some((pick) => pick.id === "team-6"), false);
  assert.equal(selected.productionRows.some((pick) => pick.id === "prop-6"), false);
  assert.equal(selected.productionRows.some((pick) => pick.id === "prop-7"), false);
});

test("selectNFLPickRows accepts the exact player-prop price boundary", () => {
  const boundary = row({
    id: "prop-boundary",
    candidate_id: "prop-boundary",
    market_type: "player_prop_receptions",
    team_name: "Boundary Player",
    odds: -200,
    evidence_snapshot: {
      edge: 0.14,
      participantName: "Boundary Player",
      primary_learning_signal: {
        test_wins: 80,
        test_losses: 20,
        test_sample: 100,
        promotion_status: "eligible",
      },
    },
  });
  assert.deepEqual(selectNFLPickRows([boundary], { now: NOW }).productionRows.map((pick) => pick.id), ["prop-boundary"]);
});

test("selectNFLPickRows uses a lenient weekly team policy while retaining the strict player-prop gate", () => {
  const belowTeamGate = row({
    id: "team-69",
    candidate_id: "team-69",
    evidence_snapshot: {
      edge: 0.15,
      primary_learning_signal: {
        test_wins: 69,
        test_losses: 31,
        test_sample: 100,
        promotion_status: "eligible",
      },
    },
  });
  const belowPropGate = row({
    id: "prop-69",
    candidate_id: "prop-69",
    market_type: "player_prop_receiving_yards",
    team_name: "Player 69",
    evidence_snapshot: {
      edge: 0.15,
      participantName: "Player 69",
      primary_learning_signal: {
        test_wins: 69,
        test_losses: 31,
        test_sample: 100,
        promotion_status: "eligible",
      },
    },
  });

  const selected = selectNFLPickRows([belowTeamGate, belowPropGate], { now: NOW });
  assert.deepEqual(selected.productionRows.map((pick) => pick.id), ["team-69"]);
  assert.deepEqual(selected.learningRows.map((pick) => pick.id), ["prop-69"]);
});

test("selectNFLPickRows promotes the best four shadow-daily team values without weakening hard integrity gates", () => {
  const weeklyTeamEvidence = (wins: number, losses: number, edge: number, promotionStatus = "shadow_daily_candidate") => ({
    edge,
    primary_learning_signal: {
      test_wins: wins,
      test_losses: losses,
      test_sample: wins + losses,
      promotion_status: promotionStatus,
    },
  });
  const weeklyTeams = Array.from({ length: 5 }, (_, index) => row({
    id: `weekly-${index}`,
    candidate_id: `weekly-${index}`,
    home_team: `Weekly Home ${index}`,
    away_team: `Weekly Away ${index}`,
    opponent_name: `Weekly Away ${index} @ Weekly Home ${index}`,
    evidence_snapshot: weeklyTeamEvidence(141 - index, 100 + index, 0.106 - index * 0.001),
  }));
  const lowEdge = row({
    id: "low-edge-team",
    candidate_id: "low-edge-team",
    home_team: "Low Edge Home",
    away_team: "Low Edge Away",
    evidence_snapshot: weeklyTeamEvidence(35, 25, 0.049),
  });
  const thinSample = row({
    id: "thin-team",
    candidate_id: "thin-team",
    home_team: "Thin Home",
    away_team: "Thin Away",
    evidence_snapshot: weeklyTeamEvidence(8, 2, 0.2),
  });
  const unapprovedShadow = row({
    id: "generic-shadow",
    candidate_id: "generic-shadow",
    home_team: "Shadow Home",
    away_team: "Shadow Away",
    evidence_snapshot: weeklyTeamEvidence(40, 20, 0.15, "shadow"),
  });

  const selected = selectNFLPickRows([...weeklyTeams, lowEdge, thinSample, unapprovedShadow], { now: NOW });

  assert.deepEqual(selected.productionRows.map((pick) => pick.id), ["weekly-0", "weekly-1", "weekly-2", "weekly-3"]);
  assert.equal(selected.productionRows.some((pick) => ["low-edge-team", "thin-team", "generic-shadow"].includes(pick.id)), false);
});

test("selectNFLPickRows rejects a team candidate without real odds", () => {
  const missingOdds = {
    ...row({
      id: "missing-odds",
      candidate_id: "missing-odds",
      evidence_snapshot: {
        edge: 0.15,
        primary_learning_signal: {
          test_wins: 40,
          test_losses: 20,
          test_sample: 60,
          promotion_status: "shadow_daily_candidate",
        },
      },
    }),
    odds: null,
  };

  const selected = selectNFLPickRows([missingOdds], { now: NOW });
  assert.deepEqual(selected.productionRows, []);
});

test("selectNFLPickRows requires at least ten settled decisions for an official NFL player prop", () => {
  const thinSample = row({
    id: "thin-sample",
    candidate_id: "thin-sample",
    market_type: "player_prop_receptions",
    team_name: "Thin Player",
    evidence_snapshot: {
      edge: 0.2,
      participantName: "Thin Player",
      primary_learning_signal: {
        test_wins: 7,
        test_losses: 2,
        test_sample: 9,
        promotion_status: "eligible",
      },
    },
  });
  const provenSample = row({
    id: "proven-sample",
    candidate_id: "proven-sample",
    market_type: "player_prop_receptions",
    team_name: "Proven Player",
    evidence_snapshot: {
      edge: 0.2,
      participantName: "Proven Player",
      primary_learning_signal: {
        test_wins: 7,
        test_losses: 3,
        test_sample: 10,
        promotion_status: "eligible",
      },
    },
  });

  const selected = selectNFLPickRows([thinSample, provenSample], { now: NOW });
  assert.deepEqual(selected.productionRows.map((pick) => pick.id), ["proven-sample"]);
  assert.deepEqual(selected.learningRows.map((pick) => pick.id), ["thin-sample"]);
});

test("selectNFLPickRows collapses the same player prop across books and alternate lines", () => {
  const evidence = {
    edge: 0.2,
    participantName: "Jauan Jennings",
    primary_learning_signal: {
      test_wins: 15,
      test_losses: 2,
      test_sample: 17,
      promotion_status: "eligible",
    },
  };
  const selected = selectNFLPickRows([
    row({ id: "line-20", candidate_id: "line-20", market_type: "player_prop_receiving_yards", team_name: "Jauan Jennings", line: 20.5, odds: -108, evidence_snapshot: evidence }),
    row({ id: "line-22", candidate_id: "line-22", market_type: "player_prop_receiving_yards", team_name: "Jauan Jennings", line: 22.5, odds: -113, evidence_snapshot: evidence }),
  ], { now: NOW });

  assert.equal(selected.productionRows.length, 1);
  assert.equal(selected.duplicatesCollapsed, 1);
});

test("learning rows never contain extra production-qualified candidates beyond the official cap", () => {
  const productionEvidence = {
    edge: 0.2,
    primary_learning_signal: {
      test_wins: 80,
      test_losses: 20,
      test_sample: 100,
      promotion_status: "eligible",
    },
  };
  const rows = Array.from({ length: 8 }, (_, index) => row({
    id: `qualified-${index}`,
    candidate_id: `qualified-${index}`,
    home_team: `Home ${index}`,
    away_team: `Away ${index}`,
    evidence_snapshot: productionEvidence,
  }));
  const selected = selectNFLPickRows(rows, { now: NOW, teamLimit: 6 });

  assert.equal(selected.productionRows.length, 6);
  assert.deepEqual(selected.learningRows, []);
});
