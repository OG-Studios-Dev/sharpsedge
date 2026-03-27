/**
 * GET /api/debug/nhl
 *
 * End-to-end NHL pipeline health check:
 *   source (NHL API) → schedule → props/trends → context board → feature scoring
 *
 * Steps tested:
 *  1. Schedule fetch (nhl-api)
 *  2. Context board (nhl-context) — goalie, rest, travel, MoneyPuck
 *  3. NHL feature hints for a sample pick
 *  4. Signal tagger smoke-test on a sample reasoning string
 *  5. NHL feature scorer smoke-test
 *
 * Returns a structured health object so CI/admin can detect regressions quickly.
 */

import { NextResponse } from "next/server";
import { getTodaySchedule, getNHLTeamPPStats, getNHLTeamPKStats, getNHLGoalieStrengthStats } from "@/lib/nhl-api";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import {
  fetchNHLContextHints,
  scoreNHLFeaturesWithSnapshot,
  buildNHLWeightMap,
  emptyNHLContextHints,
} from "@/lib/goose-model/nhl-features";
import { tagSignals } from "@/lib/goose-model/signal-tagger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const steps: Record<string, unknown> = {};
  const errors: string[] = [];

  // Step 1: NHL Schedule
  try {
    const t1 = Date.now();
    const schedule = await getTodaySchedule();
    steps.schedule = {
      games: schedule.games.length,
      date: schedule.date,
      sample: schedule.games.slice(0, 3).map((g) => ({
        id: g.id,
        away: g.awayTeam.abbrev,
        home: g.homeTeam.abbrev,
        state: g.gameState,
      })),
      ms: Date.now() - t1,
    };
  } catch (err) {
    errors.push("schedule fetch failed: " + String(err));
    steps.schedule = { error: String(err) };
  }

  // Step 2: PP/PK + Goalie strength stats (direct API check)
  try {
    const t2pp = Date.now();
    const [ppStats, pkStats, goalieStrength] = await Promise.all([
      getNHLTeamPPStats(),
      getNHLTeamPKStats(),
      getNHLGoalieStrengthStats(),
    ]);
    // Find top PP team as sample
    const topPP = [...ppStats].sort((a, b) => b.powerPlayPct - a.powerPlayPct)[0] ?? null;
    const topPK = [...pkStats].sort((a, b) => b.penaltyKillPct - a.penaltyKillPct)[0] ?? null;
    steps.special_teams = {
      ppTeams: ppStats.length,
      pkTeams: pkStats.length,
      goalieStrengthRows: goalieStrength.length,
      topPP: topPP ? { team: topPP.teamAbbrev, pct: topPP.powerPlayPct } : null,
      topPK: topPK ? { team: topPK.teamAbbrev, pct: topPK.penaltyKillPct } : null,
      sampleGoalieStrength: goalieStrength[0] ? {
        goalie: goalieStrength[0].goalieFullName,
        evSavePct: goalieStrength[0].evSavePct,
        ppSavePct: goalieStrength[0].ppSavePct,
        shSavePct: goalieStrength[0].shSavePct,
      } : null,
      note: "PP/PK from api.nhle.com/stats/rest; goalie EV/PP/SH splits from savesByStrength. HIGH-DANGER zone SV% blocked (not in NHL API).",
      ms: Date.now() - t2pp,
    };
  } catch (err) {
    errors.push("special teams fetch failed: " + String(err));
    steps.special_teams = { error: String(err) };
  }

  // Step 3: NHL Context Board
  let contextBoard: Awaited<ReturnType<typeof getTodayNHLContextBoard>> | null = null;
  try {
    const t2 = Date.now();
    contextBoard = await getTodayNHLContextBoard();
    const firstGame = contextBoard.games[0] ?? null;
    steps.context_board = {
      games: contextBoard.games.length,
      date: contextBoard.date,
      season: contextBoard.season,
      moneyPuckSource: contextBoard.meta.sources.moneyPuck.kind,
      moneyPuckTeams: contextBoard.meta.sources.moneyPuck.teamCount,
      specialTeams: contextBoard.meta.sources.specialTeams,
      sourceHealth: contextBoard.sourceHealth.status,
      sampleGame: firstGame
        ? {
            gameId: firstGame.gameId,
            away: firstGame.teams.away.teamAbbrev,
            home: firstGame.teams.home.teamAbbrev,
            awayGoalie: firstGame.teams.away.derived.goalie,
            homeGoalie: firstGame.teams.home.derived.goalie,
            awayRest: firstGame.teams.away.derived.rest,
            homeRest: firstGame.teams.home.derived.rest,
            awayTravel: firstGame.teams.away.derived.travel,
            awayPlayoffPressure: firstGame.teams.away.derived.playoffPressure.urgencyTier,
            homePlayoffPressure: firstGame.teams.home.derived.playoffPressure.urgencyTier,
            awayXGoalsPct: firstGame.teams.away.sourced.moneyPuck?.xGoalsPercentage ?? null,
            homeXGoalsPct: firstGame.teams.home.sourced.moneyPuck?.xGoalsPercentage ?? null,
            awayPP: firstGame.teams.away.sourced.pp,
            homePP: firstGame.teams.home.sourced.pp,
            awayPK: firstGame.teams.away.sourced.pk,
            homePK: firstGame.teams.home.sourced.pk,
            awayPPEfficiency: firstGame.teams.away.derived.ppEfficiency,
            homePPEfficiency: firstGame.teams.home.derived.ppEfficiency,
            awayGoalieStrength: firstGame.teams.away.derived.goalie.strengthSplits,
            homeGoalieStrength: firstGame.teams.home.derived.goalie.strengthSplits,
          }
        : null,
      ms: Date.now() - t2,
    };
  } catch (err) {
    errors.push("context board failed: " + String(err));
    steps.context_board = { error: String(err) };
  }

  // Step 4: NHL context hints for a sample pick (first game's away team)
  const firstGame = contextBoard?.games[0] ?? null;
  const sampleTeam = firstGame?.teams.away.teamAbbrev ?? null;
  const sampleOpponent = firstGame?.teams.home.teamAbbrev ?? null;

  try {
    const t3 = Date.now();
    const hints = sampleTeam
      ? await fetchNHLContextHints(sampleTeam, sampleOpponent)
      : emptyNHLContextHints();
    steps.context_hints = {
      team: sampleTeam,
      opponent: sampleOpponent,
      auto_signals: hints.auto_signals,
      team_goalie_is_backup: hints.team_goalie_is_backup,
      team_is_back_to_back: hints.team_is_back_to_back,
      team_has_long_haul_travel: hints.team_has_long_haul_travel,
      team_three_in_four: hints.team_three_in_four,
      team_rest_days: hints.team_rest_days,
      team_playoff_pressure: hints.team_playoff_pressure,
      opponent_goalie_is_backup: hints.opponent_goalie_is_backup,
      opponent_goalie_quality: hints.opponent_goalie_quality,
      opponent_goalie_sv_pct: hints.opponent_goalie_sv_pct,
      opponent_goalie_gaa: hints.opponent_goalie_gaa,
      opponent_goalie_pp_sv_pct: hints.opponent_goalie_pp_sv_pct,
      opponent_goalie_ev_sv_pct: hints.opponent_goalie_ev_sv_pct,
      team_pp_pct: hints.team_pp_pct,
      opponent_pk_pct: hints.opponent_pk_pct,
      pp_efficiency_differential: hints.pp_efficiency_differential,
      net_special_teams_differential: hints.net_special_teams_differential,
      pp_efficiency_tier: hints.pp_efficiency_tier,
      team_xgoals_pct: hints.team_xgoals_pct,
      opponent_xgoals_pct: hints.opponent_xgoals_pct,
      warnings: hints.warnings,
      ms: Date.now() - t3,
    };
  } catch (err) {
    errors.push("context hints failed: " + String(err));
    steps.context_hints = { error: String(err) };
  }

  // Step 5: Signal tagger smoke-test
  try {
    const sampleReasoning =
      "Boston Bruins have a strong home record this season. Back-to-back situation for visiting team with travel fatigue. Bruins goalie confirmed. L10 home win rate: 80%. Strong PP unit vs weak penalty kill.";
    const signals = tagSignals(sampleReasoning, `${sampleTeam ?? "BOS"} Win ML`);
    steps.signal_tagger = {
      sample_reasoning: sampleReasoning.slice(0, 80) + "...",
      signals_tagged: signals,
      count: signals.length,
    };
  } catch (err) {
    errors.push("signal tagger failed: " + String(err));
    steps.signal_tagger = { error: String(err) };
  }

  // Step 6: NHL feature scorer smoke-test (includes PP signals)
  try {
    const testSignals = ["goalie_news", "back_to_back", "home_away_split", "rest_days", "pp_efficiency_edge"];
    const emptyWeightMap = buildNHLWeightMap([]);
    const { score, snapshot } = scoreNHLFeaturesWithSnapshot(testSignals, emptyWeightMap, null);
    steps.feature_scorer = {
      test_signals: testSignals,
      score: score.toFixed(4),
      snapshot_keys: Object.keys(snapshot),
      goalie_signal_active: snapshot.goalie_signal_active,
      goalie_quality_signal_active: snapshot.goalie_quality_signal_active,
      back_to_back_active: snapshot.back_to_back_active,
      three_in_four_active: snapshot.three_in_four_active,
      pp_efficiency_edge_active: snapshot.pp_efficiency_edge_active,
      goalie_pp_weakness_active: snapshot.goalie_pp_weakness_active,
      opponent_goalie_quality: snapshot.opponent_goalie_quality,
      pp_efficiency_differential: snapshot.pp_efficiency_differential,
      priors_applied: snapshot.signal_priors_applied,
    };
  } catch (err) {
    errors.push("feature scorer failed: " + String(err));
    steps.feature_scorer = { error: String(err) };
  }

  // Summary
  const allPassed = errors.length === 0;
  const status = allPassed ? "ok" : "degraded";

  return NextResponse.json({
    status,
    sport: "NHL",
    errors,
    steps,
    timestamp: new Date().toISOString(),
    pipeline: {
      source: "NHL API (api-web.nhle.com/v1) + NHL Stats REST (api.nhle.com/stats/rest) + MoneyPuck GitHub mirror",
      ingestion: "/api/picks → live-data.ts → nhl-stats-engine.ts + nhl-team-trends.ts",
      feature_path: "nhl-context.ts → nhl-features.ts → scoreNHLFeaturesWithSnapshot()",
      goose_model: "/api/admin/goose-model/generate { sport: NHL }",
      scoring: "signal-tagger + NHL priors + context auto-signals (goalie/rest/travel/PP-efficiency)",
      specialTeamsRails: "api.nhle.com/stats/rest/en/team/{powerplay,penaltykill} + goalie/savesByStrength",
      dataLattice: "src/lib/nhl-data-lattice.ts — canonical schema, provenance, backtest types, source gap map",
      sourceGaps: [
        "HDSV% (high-danger zone save %) — not in NHL API; requires MoneyPuck/NST analytics",
        "Zone-specific xG (HDCF%/HDSA%) — MoneyPuck mirror only exposes aggregate xGoalsPercentage",
        "Player-level injury certainty — nhl.com news links are URL-slug approximation only",
      ],
    },
  });
}
