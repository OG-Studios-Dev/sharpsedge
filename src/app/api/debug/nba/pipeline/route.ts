/**
 * GET /api/debug/nba/pipeline
 *
 * Full end-to-end data-path tracer for NBA.
 *
 * Proves the data origin → ingestion → feature snapshot pipeline by:
 * 1. Fetching today's ESPN schedule (origin)
 * 2. Fetching recent completed game IDs (ingestion index)
 * 3. Fetching a real boxscore (ingestion payload)
 * 4. Running the NBA context enricher on a real player (context enrichment)
 * 5. Running scoreNBAFeaturesWithSnapshot (feature snapshot generation)
 * 6. Showing the data_source_chain that proves each step's origin
 *
 * Use this to verify data flows correctly before running generation.
 */

import { NextResponse } from "next/server";
import { getNBASchedule, getRecentNBAGames, getNBABoxscore, getNBATeamRosterEntries } from "@/lib/nba-api";
import { fetchNBAContextHints } from "@/lib/goose-model/nba-context";
import { scoreNBAFeaturesWithSnapshot, buildNBAWeightMap } from "@/lib/goose-model/nba-features";
import { tagSignals } from "@/lib/goose-model/signal-tagger";
import { getDateKey, NBA_TIME_ZONE } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function GET() {
  const pipeline: Record<string, unknown> = {};
  const errors: string[] = [];
  const startMs = Date.now();

  // ── Step 1: Origin — ESPN schedule ─────────────────────────────────────────
  const s1start = Date.now();
  let schedule: Awaited<ReturnType<typeof getNBASchedule>> = [];
  try {
    schedule = await getNBASchedule();
    const today = getDateKey(new Date(), NBA_TIME_ZONE);
    const todayGames = schedule.filter((g) => g.date === today);
    const activeGames = schedule.filter((g) => g.status !== "Final" && g.date === today);
    pipeline.step1_origin_schedule = {
      ok: true,
      source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
      total_scheduled: schedule.length,
      today: today,
      today_games: todayGames.length,
      active_games: activeGames.length,
      sample: activeGames[0]
        ? {
            id: activeGames[0].id,
            matchup: `${activeGames[0].awayTeam.abbreviation} @ ${activeGames[0].homeTeam.abbreviation}`,
            status: activeGames[0].status,
            date: activeGames[0].date,
          }
        : null,
      ms: Date.now() - s1start,
    };
  } catch (err) {
    errors.push(`Step 1 (schedule): ${err}`);
    pipeline.step1_origin_schedule = { ok: false, error: String(err), ms: Date.now() - s1start };
  }

  // ── Step 2: Ingestion Index — recent completed games ───────────────────────
  const s2start = Date.now();
  let recentGames: Awaited<ReturnType<typeof getRecentNBAGames>> = [];
  try {
    recentGames = await getRecentNBAGames(14);
    const teamsSet = new Set(recentGames.flatMap((g) => [g.homeTeam.abbreviation, g.awayTeam.abbreviation]));
    const teams = Array.from(teamsSet);
    const uniqueGameIds = Array.from(new Set(recentGames.map((g) => g.id)));
    pipeline.step2_ingestion_index = {
      ok: true,
      source: "site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}",
      days_back: 14,
      total_games: recentGames.length,
      unique_game_ids: uniqueGameIds.length,
      teams_covered: teams.length,
      sample_game_ids: uniqueGameIds.slice(0, 5),
      ms: Date.now() - s2start,
    };
  } catch (err) {
    errors.push(`Step 2 (recentGames): ${err}`);
    pipeline.step2_ingestion_index = { ok: false, error: String(err), ms: Date.now() - s2start };
  }

  // ── Step 3: Ingestion Payload — boxscore fetch ─────────────────────────────
  const s3start = Date.now();
  let topPlayerName: string | null = null;
  let topPlayerTeam: string | null = null;
  let topPlayerOpp: string | null = null;

  const firstCompleted = recentGames.find((g) => g.status === "Final");
  if (firstCompleted) {
    try {
      const box = await getNBABoxscore(firstCompleted.id);
      const isHome = true; // pick home team for sample
      const players = isHome ? box.home : box.away;
      const qualified = players
        .filter((p) => parseFloat(p.minutes) >= 20)
        .sort((a, b) => b.points - a.points);
      const top = qualified[0];
      if (top) {
        topPlayerName = top.name;
        topPlayerTeam = firstCompleted.homeTeam.abbreviation;
        topPlayerOpp = firstCompleted.awayTeam.abbreviation;
      }
      pipeline.step3_ingestion_payload = {
        ok: true,
        source: `site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${firstCompleted.id}`,
        game_id: firstCompleted.id,
        matchup: `${firstCompleted.awayTeam.abbreviation} @ ${firstCompleted.homeTeam.abbreviation}`,
        home_players: box.home.length,
        away_players: box.away.length,
        qualified_players_home: box.home.filter((p) => parseFloat(p.minutes) >= 20).length,
        top_player: top
          ? {
              name: top.name,
              pts: top.points,
              reb: top.rebounds,
              ast: top.assists,
              min: top.minutes,
              team: topPlayerTeam,
            }
          : null,
        ms: Date.now() - s3start,
      };
    } catch (err) {
      errors.push(`Step 3 (boxscore): ${err}`);
      pipeline.step3_ingestion_payload = {
        ok: false,
        game_id: firstCompleted.id,
        error: String(err),
        ms: Date.now() - s3start,
      };
    }
  } else {
    pipeline.step3_ingestion_payload = {
      ok: false,
      error: "No completed games in recent window",
      ms: Date.now() - s3start,
    };
  }

  // ── Step 4: Roster + Injury Ingestion ─────────────────────────────────────
  const s4start = Date.now();
  if (topPlayerTeam) {
    try {
      const roster = await getNBATeamRosterEntries(topPlayerTeam);
      const injured = roster.filter((p) => p.injuryStatus);
      const out = roster.filter((p) =>
        /\bout\b|\bdoubtful\b|\binjured\b|\bsuspended\b/i.test(p.injuryStatus ?? ""),
      );
      pipeline.step4_roster_injury_ingestion = {
        ok: true,
        source: `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/roster`,
        team: topPlayerTeam,
        total_players: roster.length,
        players_with_status: injured.length,
        confirmed_out_or_doubtful: out.length,
        out_players: out.map((p) => ({ name: p.name, status: p.injuryStatus })),
        ms: Date.now() - s4start,
      };
    } catch (err) {
      errors.push(`Step 4 (roster): ${err}`);
      pipeline.step4_roster_injury_ingestion = { ok: false, error: String(err), ms: Date.now() - s4start };
    }
  } else {
    pipeline.step4_roster_injury_ingestion = {
      ok: false,
      error: "No team available (step 3 failed)",
      ms: Date.now() - s4start,
    };
  }

  // ── Step 5: Context Enrichment — NBA context hints ─────────────────────────
  const s5start = Date.now();
  let contextHints: Awaited<ReturnType<typeof fetchNBAContextHints>> | null = null;
  if (topPlayerName && topPlayerTeam && topPlayerOpp) {
    try {
      contextHints = await fetchNBAContextHints(
        topPlayerName,
        topPlayerTeam,
        topPlayerOpp,
        "Points",
        20, // sample prop line
      );
      pipeline.step5_context_enrichment = {
        ok: true,
        player: topPlayerName,
        team: topPlayerTeam,
        opponent: topPlayerOpp,
        player_found: contextHints.player_found,
        player_severity: contextHints.player_severity,
        player_confirmed_active: contextHints.player_confirmed_active,
        estimated_minutes_tier: contextHints.estimated_minutes_tier,
        key_teammate_out: contextHints.key_teammate_out,
        key_teammates_out: contextHints.key_teammates_out,
        opponent_key_out: contextHints.opponent_key_out,
        auto_signals: contextHints.auto_signals,
        // Real numeric features
        opponent_dvp_rank: contextHints.opponent_dvp_rank,
        opponent_dvp_avg_allowed: contextHints.opponent_dvp_avg_allowed,
        team_pace_rank: contextHints.team_pace_rank,
        opponent_pace_rank: contextHints.opponent_pace_rank,
        high_pace_game: contextHints.high_pace_game,
        player_avg_minutes_l5: contextHints.player_avg_minutes_l5,
        player_avg_stat_l5: contextHints.player_avg_stat_l5,
        player_l5_hit_rate: contextHints.player_l5_hit_rate,
        // The full data provenance chain — THIS is the key audit trail
        data_source_chain: contextHints.data_source_chain,
        warnings: contextHints.warnings,
        ms: Date.now() - s5start,
      };
    } catch (err) {
      errors.push(`Step 5 (context enricher): ${err}`);
      pipeline.step5_context_enrichment = { ok: false, error: String(err), ms: Date.now() - s5start };
    }
  } else {
    pipeline.step5_context_enrichment = {
      ok: false,
      error: "No player/team available from step 3",
      ms: Date.now() - s5start,
    };
  }

  // ── Step 6: Feature Snapshot Generation ───────────────────────────────────
  const s6start = Date.now();
  if (topPlayerName && contextHints) {
    try {
      // Build a mock pick label to test the scorer
      const pickLabel = `${topPlayerName} Over 20.5 Points`;
      const signals = tagSignals(pickLabel, "NBA");
      const allSignals = Array.from(new Set([...signals, ...contextHints.auto_signals]));

      const { score, snapshot } = scoreNBAFeaturesWithSnapshot(
        allSignals,
        buildNBAWeightMap([]), // empty weight map = all priors
        pickLabel,
        "Points",
        contextHints,
      );

      pipeline.step6_feature_snapshot = {
        ok: true,
        pick_label: pickLabel,
        signals_from_tagger: signals,
        auto_signals_from_context: contextHints.auto_signals,
        merged_signals: allSignals,
        nba_feature_score: score,
        snapshot_market_type: snapshot.market_type,
        snapshot_prior_signals: snapshot.prior_signals,
        snapshot_signal_priors: snapshot.signal_priors_applied,
        snapshot_dvp_advantage: snapshot.dvp_advantage_present,
        snapshot_pace_match: snapshot.high_pace_game,
        snapshot_usage_surge: snapshot.usage_surge_active,
        snapshot_l5_hit_rate: snapshot.player_l5_hit_rate,
        snapshot_l5_avg_stat: snapshot.player_avg_stat_l5,
        // The data_source_chain is now IN the snapshot itself
        snapshot_data_source_chain: snapshot.data_source_chain,
        ms: Date.now() - s6start,
      };
    } catch (err) {
      errors.push(`Step 6 (feature snapshot): ${err}`);
      pipeline.step6_feature_snapshot = { ok: false, error: String(err), ms: Date.now() - s6start };
    }
  } else {
    pipeline.step6_feature_snapshot = {
      ok: false,
      error: "No player or context available",
      ms: Date.now() - s6start,
    };
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const steps = Object.keys(pipeline);
  const okCount = steps.filter((k) => (pipeline[k] as any)?.ok === true).length;
  const failCount = steps.filter((k) => (pipeline[k] as any)?.ok === false).length;

  return NextResponse.json({
    summary: {
      total_steps: steps.length,
      passed: okCount,
      failed: failCount,
      errors: errors.length,
      total_ms: Date.now() - startMs,
      data_path: "ESPN Scoreboard → Recent Games Index → Boxscore Payload → Roster/Injury Ingestion → Context Enricher → Feature Snapshot",
    },
    pipeline,
    errors,
    timestamp: new Date().toISOString(),
  });
}
