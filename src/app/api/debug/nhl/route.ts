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
import { getTodaySchedule } from "@/lib/nhl-api";
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

  // Step 2: NHL Context Board
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
          }
        : null,
      ms: Date.now() - t2,
    };
  } catch (err) {
    errors.push("context board failed: " + String(err));
    steps.context_board = { error: String(err) };
  }

  // Step 3: NHL context hints for a sample pick (first game's away team)
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
      team_xgoals_pct: hints.team_xgoals_pct,
      opponent_xgoals_pct: hints.opponent_xgoals_pct,
      warnings: hints.warnings,
      ms: Date.now() - t3,
    };
  } catch (err) {
    errors.push("context hints failed: " + String(err));
    steps.context_hints = { error: String(err) };
  }

  // Step 4: Signal tagger smoke-test
  try {
    const sampleReasoning =
      "Boston Bruins have a strong home record this season. Back-to-back situation for visiting team with travel fatigue. Bruins goalie confirmed. L10 home win rate: 80%.";
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

  // Step 5: NHL feature scorer smoke-test
  try {
    const testSignals = ["goalie_news", "back_to_back", "home_away_split", "rest_days"];
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
      opponent_goalie_quality: snapshot.opponent_goalie_quality,
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
      source: "NHL API (api-web.nhle.com/v1) + MoneyPuck GitHub mirror",
      ingestion: "/api/picks → live-data.ts → nhl-stats-engine.ts + nhl-team-trends.ts",
      feature_path: "nhl-context.ts → nhl-features.ts → scoreNHLFeaturesWithSnapshot()",
      goose_model: "/api/admin/goose-model/generate { sport: NHL }",
      scoring: "signal-tagger + NHL priors + context auto-signals (goalie/rest/travel)",
    },
  });
}
