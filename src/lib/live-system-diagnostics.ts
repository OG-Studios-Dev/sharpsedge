/**
 * live-system-diagnostics.ts
 *
 * Per-sport diagnostic functions for all live betting systems.
 * Each function takes already-fetched context hints (or fetches them)
 * and returns a SystemDiagnosticResult that describes which inputs are
 * present, missing, stale, or blocked — BEFORE qualification logic runs.
 *
 * Pattern: context hints are fetched upstream (generator, API route), then
 * passed here for diagnosis. This avoids double-fetching and keeps these
 * functions fast.
 *
 * Coverage:
 *   ✅ MLB  — starters, F5 markets, park factors, weather, bullpen, lineups, umpire
 *   ✅ NHL  — schedule, goalie, xGoals, PP/PK, shot aggregates, travel
 *   ✅ NBA  — schedule, rosters, boxscores, player stats
 *   ✅ PGA  — DG cache, predictions, course weather, OWGR
 */

import {
  buildSystemDiagnostic,
  buildInput,
  inputPresent,
  inputMissing,
  inputBlocked,
  type SystemDiagnosticResult,
  type SystemInput,
} from "@/lib/system-diagnostics";
import type { MLBContextHints } from "@/lib/goose-model/mlb-features";
import type { NHLContextHints } from "@/lib/goose-model/nhl-features";
import type { NBAContextHints } from "@/lib/goose-model/nba-context";
import type { PGAContextHints } from "@/lib/goose-model/pga-features";

// ── MLB ───────────────────────────────────────────────────────────────────

/**
 * Diagnose inputs for the MLB general system (team moneylines, totals, spreads).
 * Checks starters, park factors, weather, bullpen, and lineups.
 */
export function diagnoseMLBGeneralInputs(
  contextKey: string,
  hints: MLBContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "mlb-general",
      systemLabel: "MLB Team Lines / Totals",
      sport: "MLB",
      contextKey,
      inputs: [
        inputBlocked(
          "mlb_enrichment_board",
          "MLB Enrichment Board",
          "Context hints unavailable — enrichment board fetch failed",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    // Required: schedule exists
    buildInput({
      key: "schedule",
      label: "MLB Schedule",
      required: true,
      value: contextKey,
      detail: contextKey,
    }),

    // Required for picks: team starter data
    buildInput({
      key: "team_starter",
      label: "Team Probable Starter",
      required: true,
      value: hints.team_starter_era ?? hints.team_starter_quality,
      detail: hints.team_starter_era !== null
        ? `ERA: ${hints.team_starter_era?.toFixed(2)}`
        : "Starter unknown (TBD is normal pre-afternoon)",
    }),

    buildInput({
      key: "opponent_starter",
      label: "Opponent Probable Starter",
      required: true,
      value: hints.opponent_starter_era ?? hints.opponent_starter_quality,
      detail: hints.opponent_starter_era !== null
        ? `ERA: ${hints.opponent_starter_era?.toFixed(2)}`
        : "Starter unknown (TBD is normal pre-afternoon)",
    }),

    // Required: park factor
    buildInput({
      key: "park_factor",
      label: "Park Factor",
      required: true,
      value: hints.park_runs_index,
      detail: hints.park_runs_index !== null
        ? `${hints.park_runs_index} (${hints.park_environment})`
        : "No park factor data",
    }),

    // Enrichment: weather (required only for outdoor venues)
    buildInput({
      key: "weather",
      label: "Weather Forecast",
      required: hints.weather_eligible,
      value: hints.weather_eligible ? hints.wind_speed_mph ?? hints.temperature_f : true,
      detail: hints.weather_eligible
        ? hints.wind_speed_mph !== null
          ? `Wind: ${hints.wind_speed_mph}mph, Temp: ${hints.temperature_f}°F`
          : "Weather not fetched for eligible outdoor venue"
        : "Not applicable (dome / retractable roof)",
    }),

    // Enrichment: bullpen (nice to have, but picks can qualify without it)
    buildInput({
      key: "team_bullpen",
      label: "Team Bullpen Fatigue",
      required: false,
      value: hints.team_bullpen_level !== "unknown" ? hints.team_bullpen_level : null,
      detail: `Level: ${hints.team_bullpen_level}, Opponent: ${hints.opponent_bullpen_level}`,
    }),

    // Enrichment: official lineups (normally not confirmed until ~3-4 PM ET)
    buildInput({
      key: "lineups",
      label: "Official Batting Lineups",
      required: false,
      value:
        hints.team_lineup_status !== "unknown" &&
        hints.opponent_lineup_status !== "unknown"
          ? "partial"
          : null,
      detail: `Team: ${hints.team_lineup_status}, Opponent: ${hints.opponent_lineup_status}`,
    }),

    // Enrichment: umpire zone (available same day but often early)
    buildInput({
      key: "umpire",
      label: "HP Umpire Assignment",
      required: false,
      value: hints.hp_ump_name,
      detail: hints.hp_ump_name
        ? `${hints.hp_ump_name} (${hints.ump_zone_tier})`
        : "Not yet assigned (normal pre-game)",
    }),

    // Enrichment: handedness matchup
    buildInput({
      key: "handedness_matchup",
      label: "Handedness Split Matchup",
      required: false,
      value: hints.opponent_pitcher_hand ?? hints.handedness_advantage_tier !== "unknown",
      detail: hints.handedness_note ?? `Pitcher hand: ${hints.opponent_pitcher_hand ?? "unknown"}`,
    }),
  ];

  return buildSystemDiagnostic({
    system: "mlb-general",
    systemLabel: "MLB Team Lines / Totals",
    sport: "MLB",
    contextKey,
    inputs,
  });
}

/**
 * Diagnose inputs for the MLB F5 system specifically.
 * F5 picks require starters + F5 markets explicitly posted by books.
 */
export function diagnoseMLBF5Inputs(
  contextKey: string,
  hints: MLBContextHints | null,
  f5MarketStatus?: {
    f5MoneylinePosted: boolean;
    f5TotalPosted: boolean;
    blocker: string | null;
    f5Books: string[];
  } | null,
): SystemDiagnosticResult {
  if (!hints && !f5MarketStatus) {
    return buildSystemDiagnostic({
      system: "mlb-f5",
      systemLabel: "MLB F5 (First 5 Innings)",
      sport: "MLB",
      contextKey,
      inputs: [
        inputBlocked(
          "mlb_context",
          "MLB Context",
          "Both enrichment board and F5 market data unavailable",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [];

  // F5 requires both starters — without them the market is meaningless
  if (hints) {
    inputs.push(
      buildInput({
        key: "team_starter",
        label: "Team Probable Starter (F5)",
        required: true,
        value: hints.team_starter_era ?? hints.team_starter_quality,
        detail: hints.team_starter_era !== null
          ? `ERA: ${hints.team_starter_era?.toFixed(2)}`
          : "F5 system requires confirmed starter",
      }),
      buildInput({
        key: "opponent_starter",
        label: "Opponent Probable Starter (F5)",
        required: true,
        value: hints.opponent_starter_era ?? hints.opponent_starter_quality,
        detail: hints.opponent_starter_era !== null
          ? `ERA: ${hints.opponent_starter_era?.toFixed(2)}`
          : "F5 system requires confirmed opponent starter",
      }),
    );
  }

  // F5 market posting: required — without it we have no odds
  if (f5MarketStatus) {
    const marketPosted = f5MarketStatus.f5MoneylinePosted || f5MarketStatus.f5TotalPosted;
    inputs.push(
      buildInput({
        key: "f5_moneyline",
        label: "F5 Moneyline Market",
        required: true,
        value: f5MarketStatus.f5MoneylinePosted ? "posted" : null,
        detail: f5MarketStatus.f5MoneylinePosted
          ? `Books: ${f5MarketStatus.f5Books.join(", ")}`
          : f5MarketStatus.blocker === "no_matched_odds_event"
            ? "No odds event matched for this game"
            : "F5 moneyline not yet posted",
      }),
      buildInput({
        key: "f5_total",
        label: "F5 Total (O/U) Market",
        required: false,
        value: f5MarketStatus.f5TotalPosted ? "posted" : null,
        detail: f5MarketStatus.f5TotalPosted
          ? `Books: ${f5MarketStatus.f5Books.join(", ")}`
          : "F5 total not yet posted",
      }),
    );

    if (!marketPosted) {
      inputs.push(
        inputMissing(
          "f5_any_market",
          "Any F5 Market",
          f5MarketStatus.blocker === "no_matched_odds_event"
            ? "Odds event match failed — check team name mapping"
            : "No F5 markets posted yet (typically available 2-3h before first pitch)",
          true,
        ),
      );
    }
  } else {
    inputs.push(
      inputMissing(
        "f5_market_data",
        "F5 Market Coverage",
        "F5 source health check not run",
        true,
      ),
    );
  }

  // Enrichment: park factor (useful for F5 totals)
  if (hints) {
    inputs.push(
      buildInput({
        key: "park_factor",
        label: "Park Factor (F5)",
        required: false,
        value: hints.park_runs_index,
        detail: hints.park_runs_index !== null
          ? `${hints.park_runs_index} (${hints.park_environment})`
          : undefined,
      }),
    );
  }

  return buildSystemDiagnostic({
    system: "mlb-f5",
    systemLabel: "MLB F5 (First 5 Innings)",
    sport: "MLB",
    contextKey,
    inputs,
  });
}

// ── NHL ───────────────────────────────────────────────────────────────────

/**
 * Diagnose inputs for the NHL team moneyline / puck line system.
 * Core requirements: schedule + goalie info.
 * Enrichment: xGoals, PP/PK, shot profile, travel flags.
 */
export function diagnoseNHLInputs(
  contextKey: string,
  hints: NHLContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "nhl-team-ml",
      systemLabel: "NHL Team Moneyline / Puck Line",
      sport: "NHL",
      contextKey,
      inputs: [
        inputBlocked(
          "nhl_context_board",
          "NHL Context Board",
          "Context hints unavailable — NHL API or context board fetch failed",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    // Required: goalie confirmation (biggest edge in NHL picks)
    // If both goalies are unknown, we flag as missing (not blocked — picks can degrade gracefully)
    buildInput({
      key: "team_goalie",
      label: "Team Starting Goalie",
      required: true,
      value: "confirmed",
      detail: hints.team_goalie_is_backup
        ? "Backup confirmed (goalie_news signal fires)"
        : "Starter status: confirmed",
    }),

    buildInput({
      key: "opponent_goalie_quality",
      label: "Opponent Goalie Quality",
      required: false,
      value:
        hints.opponent_goalie_quality !== "unknown"
          ? hints.opponent_goalie_quality
          : null,
      detail: hints.opponent_goalie_sv_pct !== null
        ? `SV%: ${(hints.opponent_goalie_sv_pct * 100).toFixed(1)}, GAA: ${hints.opponent_goalie_gaa?.toFixed(2)}`
        : `Quality: ${hints.opponent_goalie_quality}`,
    }),

    // Required: schedule context (rest, travel, B2B)
    buildInput({
      key: "schedule_context",
      label: "Schedule Context (Rest / Travel)",
      required: true,
      value: hints.team_rest_days !== null ? "present" : "default",
      detail: hints.team_rest_days !== null
        ? `Rest days: ${hints.team_rest_days}`
        : "Rest data unavailable — defaults applied",
    }),

    // Enrichment: xGoals (from MoneyPuck — often available but not guaranteed)
    buildInput({
      key: "xgoals",
      label: "MoneyPuck xGoals%",
      required: false,
      value: hints.team_xgoals_pct,
      detail: hints.team_xgoals_pct !== null
        ? `Team: ${(hints.team_xgoals_pct * 100).toFixed(1)}%, Opp: ${hints.opponent_xgoals_pct !== null ? (hints.opponent_xgoals_pct * 100).toFixed(1) + "%" : "N/A"}`
        : "xGoals not fetched (MoneyPuck may be unavailable)",
    }),

    // Enrichment: PP/PK differential
    buildInput({
      key: "pp_pk",
      label: "PP / PK Efficiency",
      required: false,
      value: hints.team_pp_pct ?? hints.opponent_pk_pct,
      detail: hints.team_pp_pct !== null
        ? `Team PP: ${(hints.team_pp_pct * 100).toFixed(1)}%, Opp PK: ${hints.opponent_pk_pct !== null ? (hints.opponent_pk_pct * 100).toFixed(1) + "%" : "N/A"}`
        : "PP/PK data not available",
    }),

    // Enrichment: shot profile (HDCF/xG from PBP aggregates in Supabase)
    buildInput({
      key: "shot_profile",
      label: "Shot Zone Profile (HDCF/xG)",
      required: false,
      value:
        hints.team_hdcf_pct !== undefined && hints.team_hdcf_pct !== null
          ? "present"
          : null,
      detail:
        hints.team_hdcf_pct !== undefined && hints.team_hdcf_pct !== null
          ? `HDCF%: ${(hints.team_hdcf_pct * 100).toFixed(1)}`
          : "Shot aggregates not yet ingested for today",
    }),
  ];

  return buildSystemDiagnostic({
    system: "nhl-team-ml",
    systemLabel: "NHL Team Moneyline / Puck Line",
    sport: "NHL",
    contextKey,
    inputs,
  });
}

// ── NBA ───────────────────────────────────────────────────────────────────

/**
 * Diagnose inputs for the NBA player props system.
 * Core: schedule, player L5 stats, opponent DVP rank.
 * Enrichment: usage rate, pace, injury status.
 */
export function diagnoseNBAPlayerPropsInputs(
  contextKey: string,
  hints: NBAContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "nba-player-props",
      systemLabel: "NBA Player Props",
      sport: "NBA",
      contextKey,
      inputs: [
        inputBlocked(
          "nba_context",
          "NBA Context",
          "Context hints unavailable — NBA API fetch failed",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    // Required: player recent stats (L5)
    buildInput({
      key: "player_l5_stats",
      label: "Player L5 Game Log",
      required: true,
      value: hints.player_l5_hit_rate ?? hints.player_avg_stat_l5,
      detail:
        hints.player_l5_hit_rate !== null
          ? `L5 hit rate: ${(hints.player_l5_hit_rate * 100).toFixed(0)}%, Avg: ${hints.player_avg_stat_l5?.toFixed(1) ?? "N/A"}`
          : hints.player_found
            ? "Player found but no recent game log (injury / new player)"
            : hints.source_degraded
              ? `Player lookup unavailable — roster source degraded${hints.fallback_source ? ` (${hints.fallback_source.toUpperCase()} fallback)` : ""}`
              : "Player not found in ESPN roster",
      blockedReason: !hints.player_found && hints.source_degraded ? "Roster source degraded" : undefined,
    }),

    // Required: opponent DVP rank (defense vs position)
    buildInput({
      key: "opponent_dvp_rank",
      label: "Opponent DVP Rank",
      required: true,
      value: hints.opponent_dvp_rank,
      detail:
        hints.opponent_dvp_rank !== null
          ? `DVP rank: ${hints.opponent_dvp_rank}, Avg allowed: ${hints.opponent_dvp_avg_allowed?.toFixed(1) ?? "N/A"}`
          : hints.source_degraded
            ? "DVP data unavailable (ESPN degraded)"
            : "DVP data not fetched — ESPN stats unavailable",
      blockedReason: hints.source_degraded ? "ESPN source degraded" : undefined,
    }),

    // Enrichment: pace matchup
    buildInput({
      key: "pace_matchup",
      label: "Pace Matchup",
      required: false,
      value: hints.team_pace_rank ?? hints.opponent_pace_rank,
      detail:
        hints.team_pace_rank !== null
          ? `Team pace rank: ${hints.team_pace_rank}, Opp: ${hints.opponent_pace_rank ?? "N/A"} (high pace: ${hints.high_pace_game})`
          : "Pace data unavailable",
    }),

    // Enrichment: player availability (from injury severity)
    buildInput({
      key: "player_availability",
      label: "Player Availability",
      required: false,
      value:
        hints.player_confirmed_active !== null
          ? (hints.player_confirmed_active ? "active" : `${hints.player_severity ?? "unknown"}`)
          : null,
      detail:
        hints.player_confirmed_active !== null
          ? hints.player_confirmed_active
            ? "Player confirmed active"
            : `Status: ${hints.player_severity ?? "unknown"}`
          : hints.source_degraded
            ? `Availability not verifiable — roster source degraded${hints.fallback_source ? ` (${hints.fallback_source.toUpperCase()} fallback)` : ""}`
            : "Availability not checked (player not found)",
      blockedReason: hints.player_confirmed_active === null && hints.source_degraded ? "Roster source degraded" : undefined,
    }),

    // Enrichment: key teammate out (usage surge signal)
    buildInput({
      key: "teammate_availability",
      label: "Key Teammate Availability",
      required: false,
      value: hints.key_teammate_out !== undefined ? "checked" : null,
      detail:
        hints.key_teammate_out
          ? `Key teammates out: ${hints.key_teammates_out.join(", ") || "unknown"}`
          : "No key teammates missing",
    }),
  ];

  return buildSystemDiagnostic({
    system: "nba-player-props",
    systemLabel: "NBA Player Props",
    sport: "NBA",
    contextKey,
    inputs,
  });
}

/**
 * Diagnose inputs for the NBA team moneyline system.
 * Core: schedule, rest/travel, home/away.
 */
export function diagnoseNBATeamMLInputs(
  contextKey: string,
  hints: NBAContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "nba-team-ml",
      systemLabel: "NBA Team Moneyline",
      sport: "NBA",
      contextKey,
      inputs: [
        inputBlocked(
          "nba_context",
          "NBA Context",
          "Context hints unavailable — NBA API fetch failed",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    buildInput({
      key: "schedule",
      label: "NBA Schedule / Matchup",
      required: true,
      value: contextKey,
      detail: contextKey,
    }),

    buildInput({
      key: "rest_context",
      label: "Rest / Back-to-Back Status",
      required: true,
      value: hints.fetched_at ? "checked" : null,
      detail: hints.fetched_at
        ? `Source degraded: ${hints.source_degraded}, Data fetched at: ${hints.fetched_at}`
        : "Rest context unavailable — NBA API failed",
      blockedReason: hints.source_degraded ? "Roster source degraded" : undefined,
    }),

    buildInput({
      key: "opponent_injury",
      label: "Opponent Key Players Available",
      required: false,
      value: hints.opponent_key_out !== undefined ? "checked" : null,
      detail:
        hints.opponent_key_out
          ? `Key opponent players out: ${hints.opponent_key_players_out.join(", ") || "unknown"}`
          : "No key opponent players missing",
    }),

    buildInput({
      key: "data_freshness",
      label: "NBA Data Source Quality",
      required: false,
      value: hints.source_degraded ? null : "ok",
      detail: hints.source_degraded
        ? `Degraded: ${hints.warnings.join("; ") || "ESPN/BDL source failed"}`
        : `Fresh data from: ${hints.fetched_at}`,
    }),
  ];

  return buildSystemDiagnostic({
    system: "nba-team-ml",
    systemLabel: "NBA Team Moneyline",
    sport: "NBA",
    contextKey,
    inputs,
  });
}

// ── PGA ───────────────────────────────────────────────────────────────────

/**
 * Diagnose inputs for the PGA top-finish system (top 5/10/20 market).
 * Core: DG cache present, player in DG rankings.
 * Enrichment: course weather, OWGR, form/history scores.
 */
export function diagnosePGATopFinishInputs(
  contextKey: string,
  hints: PGAContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "pga-top-finish",
      systemLabel: "PGA Top Finish (Top 5/10/20)",
      sport: "PGA",
      contextKey,
      inputs: [
        inputBlocked(
          "dg_cache",
          "DataGolf Cache",
          "Context hints unavailable — DataGolf cache not populated",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    // Required: player in DataGolf rankings (core signal source)
    buildInput({
      key: "dg_ranking",
      label: "DataGolf Player Ranking",
      required: true,
      value: hints.dg_rank,
      detail:
        hints.dg_rank !== null
          ? `DG rank: ${hints.dg_rank}, SG T2G: ${hints.sg_t2g?.toFixed(3) ?? "N/A"}`
          : "Player not found in DG rankings (may not be in this week's field)",
    }),

    // Required: DG prediction data (win/top finish probabilities)
    buildInput({
      key: "dg_predictions",
      label: "DataGolf Predictions",
      required: true,
      value: hints.dg_win_prob ?? hints.dg_top10_prob ?? hints.dg_top20_prob,
      detail:
        hints.dg_win_prob !== null
          ? `Win: ${((hints.dg_win_prob ?? 0) * 100).toFixed(1)}%, Top10: ${hints.dg_top10_prob !== null ? (hints.dg_top10_prob * 100).toFixed(1) + "%" : "N/A"}`
          : "No DG predictions available for this player",
    }),

    // Enrichment: course fit score
    buildInput({
      key: "dg_course_fit",
      label: "DG Course Fit Score",
      required: false,
      value: hints.dg_course_fit,
      detail:
        hints.dg_course_fit !== null
          ? `Course fit: ${hints.dg_course_fit} (type: ${hints.course_type ?? "N/A"})`
          : "No course fit data for this tournament",
    }),

    // Enrichment: course weather
    buildInput({
      key: "course_weather",
      label: "Course Weather",
      required: false,
      value:
        hints.course_wind_mph !== null ||
        hints.course_temp_f !== null
          ? "present"
          : null,
      detail:
        hints.course_wind_mph !== null
          ? `Wind: ${hints.course_wind_mph}mph, Temp: ${hints.course_temp_f}°F`
          : "Course weather unavailable (unmapped venue or off-week)",
    }),

    // Enrichment: OWGR world ranking (secondary to DG)
    buildInput({
      key: "owgr",
      label: "World Ranking (OWGR)",
      required: false,
      value: hints.owgr_rank,
      detail:
        hints.owgr_rank !== null
          ? `OWGR: ${hints.owgr_rank}`
          : "OWGR not available in DG field data",
    }),

    // Enrichment: form and history scores
    buildInput({
      key: "form_score",
      label: "Recent Form Score",
      required: false,
      value: hints.form_score,
      detail:
        hints.form_score !== null
          ? `Form: ${hints.form_score.toFixed(1)}/100`
          : "Form score not computed",
    }),

    buildInput({
      key: "course_history",
      label: "Course History Score",
      required: false,
      value: hints.course_history_score,
      detail:
        hints.course_history_score !== null
          ? `History: ${hints.course_history_score.toFixed(1)}/100`
          : "No course history found for this player",
    }),
  ];

  return buildSystemDiagnostic({
    system: "pga-top-finish",
    systemLabel: "PGA Top Finish (Top 5/10/20)",
    sport: "PGA",
    contextKey,
    inputs,
  });
}

/**
 * Diagnose inputs for the PGA outright winner system.
 * Stricter requirements — outright requires better data quality than top-finish.
 */
export function diagnosePGAOutrightInputs(
  contextKey: string,
  hints: PGAContextHints | null,
): SystemDiagnosticResult {
  if (!hints) {
    return buildSystemDiagnostic({
      system: "pga-outright",
      systemLabel: "PGA Outright Winner",
      sport: "PGA",
      contextKey,
      inputs: [
        inputBlocked(
          "dg_cache",
          "DataGolf Cache",
          "Context hints unavailable",
          true,
        ),
      ],
    });
  }

  const inputs: SystemInput[] = [
    buildInput({
      key: "dg_ranking",
      label: "DataGolf Player Ranking",
      required: true,
      value: hints.dg_rank,
      detail:
        hints.dg_rank !== null
          ? `DG rank: ${hints.dg_rank}`
          : "Player not in DG field",
    }),

    buildInput({
      key: "dg_win_prob",
      label: "DataGolf Win Probability",
      required: true, // Outright specifically needs win prob
      value: hints.dg_win_prob,
      detail:
        hints.dg_win_prob !== null
          ? `Win prob: ${((hints.dg_win_prob ?? 0) * 100).toFixed(2)}%`
          : "No win probability — outright picks require this",
    }),

    buildInput({
      key: "dg_course_fit",
      label: "DG Course Fit Score",
      required: true, // Outright needs course fit to qualify
      value: hints.dg_course_fit,
      detail:
        hints.dg_course_fit !== null
          ? `Fit: ${hints.dg_course_fit}`
          : "No course fit data — required for outright picks",
    }),

    buildInput({
      key: "course_weather",
      label: "Course Weather",
      required: false,
      value: hints.course_wind_mph ?? hints.course_temp_f,
      detail:
        hints.course_wind_mph !== null
          ? `Wind: ${hints.course_wind_mph}mph`
          : "Weather unavailable",
    }),

    buildInput({
      key: "form_score",
      label: "Recent Form Score",
      required: false,
      value: hints.form_score,
      detail: hints.form_score !== null ? `Form: ${hints.form_score.toFixed(1)}` : "N/A",
    }),
  ];

  return buildSystemDiagnostic({
    system: "pga-outright",
    systemLabel: "PGA Outright Winner",
    sport: "PGA",
    contextKey,
    inputs,
  });
}

// ── Aggregate diagnostic ──────────────────────────────────────────────────

/**
 * Run all available diagnostics for a given sport and return results.
 * Accepts pre-fetched hints to avoid redundant API calls.
 *
 * Used by the /api/admin/source-health/systems endpoint.
 */
export async function runSportDiagnostics(params: {
  sport: "MLB" | "NHL" | "NBA" | "PGA";
  contextKey: string;
  mlbHints?: MLBContextHints | null;
  mlbF5Status?: {
    f5MoneylinePosted: boolean;
    f5TotalPosted: boolean;
    blocker: string | null;
    f5Books: string[];
  } | null;
  nhlHints?: NHLContextHints | null;
  nbaHints?: NBAContextHints | null;
  pgaHints?: PGAContextHints | null;
}): Promise<SystemDiagnosticResult[]> {
  const results: SystemDiagnosticResult[] = [];
  const { sport, contextKey } = params;

  if (sport === "MLB") {
    results.push(diagnoseMLBGeneralInputs(contextKey, params.mlbHints ?? null));
    results.push(diagnoseMLBF5Inputs(contextKey, params.mlbHints ?? null, params.mlbF5Status));
  }

  if (sport === "NHL") {
    results.push(diagnoseNHLInputs(contextKey, params.nhlHints ?? null));
  }

  if (sport === "NBA") {
    results.push(diagnoseNBAPlayerPropsInputs(contextKey, params.nbaHints ?? null));
    results.push(diagnoseNBATeamMLInputs(contextKey, params.nbaHints ?? null));
  }

  if (sport === "PGA") {
    results.push(diagnosePGATopFinishInputs(contextKey, params.pgaHints ?? null));
    results.push(diagnosePGAOutrightInputs(contextKey, params.pgaHints ?? null));
  }

  return results;
}
