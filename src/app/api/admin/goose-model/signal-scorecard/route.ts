/**
 * GET /api/admin/goose-model/signal-scorecard
 *
 * League-by-league signal scorecards: volume, win rate, ROI, and
 * sample confidence by signal and (where feasible) by market type.
 *
 * Returns per-signal stats broken down by sport, with ROI estimates
 * based on implied odds at capture. Minimal sample gates (5+ graded picks)
 * ensure we only surface signals with real evidence.
 *
 * Query params:
 *   ?sport=NHL|NBA|MLB|PGA|ALL  (default ALL)
 *   ?min_sample=5               (default 5)
 *   ?include_market_type=true   (split by market type where available)
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks } from "@/lib/goose-model/store";
import type { GooseModelPick } from "@/lib/goose-model/types";

export const dynamic = "force-dynamic";

const DEFAULT_MIN_SAMPLE = 5;

interface SignalStat {
  signal: string;
  sport: string;
  appearances: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  /** Estimated ROI based on implied odds at capture. Null if no odds data. */
  estimated_roi: number | null;
  /** Average odds at capture (American format) */
  avg_odds: number | null;
  /** Sample confidence: "low" < 10 graded, "medium" < 30, "high" >= 30 */
  sample_confidence: "low" | "medium" | "high";
  /** Whether thin-sample decay was applied to this signal's priors */
  thin_sample_decay_noted: boolean;
  /** Dominant market type when market data is available */
  top_market_types: string[];
}

interface SportScorecard {
  sport: string;
  total_graded: number;
  signals: SignalStat[];
  top_signal: SignalStat | null;
  weak_signals: string[];
  strong_signals: string[];
}

interface SignalScorecardResult {
  generated_at: string;
  sports: SportScorecard[];
  overall_by_signal: SignalStat[];
  summary: string;
}

// Signals known to have thin-sample early-season issues
const THIN_SAMPLE_SIGNALS = new Set([
  "handedness_advantage",
  "lineup_bvp_edge",
  "pitcher_command",
  "opponent_era_lucky",
  "team_era_unlucky",
  "player_shot_quality_edge",
  "shot_danger_edge",
  "opponent_goalie_hd_weakness",
]);

function computeROI(wins: number, losses: number, avgOdds: number | null): number | null {
  if (avgOdds === null || wins + losses === 0) return null;

  // Convert American odds to decimal
  const decOdds = avgOdds >= 0
    ? (avgOdds / 100) + 1
    : (100 / Math.abs(avgOdds)) + 1;

  // ROI = (wins * decOdds - (wins + losses)) / (wins + losses)
  const totalBets = wins + losses;
  const totalReturned = wins * decOdds;
  return Math.round(((totalReturned - totalBets) / totalBets) * 1000) / 10; // as %
}

function sampleConfidence(graded: number): "low" | "medium" | "high" {
  if (graded < 10) return "low";
  if (graded < 30) return "medium";
  return "high";
}

function buildSignalStats(
  picks: GooseModelPick[],
  sport: string | null,
  minSample: number,
  includeMarketType: boolean,
): SignalStat[] {
  const map = new Map<string, {
    wins: number; losses: number; pushes: number;
    oddsSum: number; oddsCount: number;
    marketTypes: Map<string, number>;
  }>();

  for (const pick of picks) {
    if (sport && sport !== "ALL" && pick.sport !== sport) continue;
    if (pick.result === "pending") continue;

    const factors = (pick.pick_snapshot as any)?.factors as Record<string, unknown> | undefined;
    const marketType = factors?.prop_type as string | null | undefined;

    for (const signal of pick.signals_present ?? []) {
      if (!signal) continue;
      const existing = map.get(signal) ?? { wins: 0, losses: 0, pushes: 0, oddsSum: 0, oddsCount: 0, marketTypes: new Map() };
      if (pick.result === "win") existing.wins++;
      if (pick.result === "loss") existing.losses++;
      if (pick.result === "push") existing.pushes++;
      if (pick.odds_at_capture !== null) {
        existing.oddsSum += pick.odds_at_capture;
        existing.oddsCount++;
      }
      if (includeMarketType && marketType) {
        existing.marketTypes.set(marketType, (existing.marketTypes.get(marketType) ?? 0) + 1);
      }
      map.set(signal, existing);
    }
  }

  const results: SignalStat[] = [];
  for (const [signal, stats] of Array.from(map.entries())) {
    const graded = stats.wins + stats.losses + stats.pushes;
    if (graded < minSample) continue;

    const settled = stats.wins + stats.losses;
    const winRate = settled > 0 ? Math.round((stats.wins / settled) * 1000) / 10 : 0;
    const avgOdds = stats.oddsCount > 0 ? Math.round(stats.oddsSum / stats.oddsCount) : null;
    const roi = computeROI(stats.wins, stats.losses, avgOdds);

    // Top market types by frequency
    const topMarketTypes = includeMarketType
      ? Array.from(stats.marketTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k]) => k)
      : [];

    results.push({
      signal,
      sport: sport ?? "ALL",
      appearances: graded,
      wins: stats.wins,
      losses: stats.losses,
      pushes: stats.pushes,
      win_rate: winRate,
      estimated_roi: roi,
      avg_odds: avgOdds,
      sample_confidence: sampleConfidence(graded),
      thin_sample_decay_noted: THIN_SAMPLE_SIGNALS.has(signal),
      top_market_types: topMarketTypes,
    });
  }

  return results.sort((a, b) => b.appearances - a.appearances);
}

function buildSportScorecard(
  picks: GooseModelPick[],
  sport: string,
  minSample: number,
  includeMarketType: boolean,
): SportScorecard {
  const sportPicks = picks.filter((p) => p.sport === sport && p.result !== "pending");
  const signals = buildSignalStats(picks, sport, minSample, includeMarketType);

  const strong = signals.filter((s) => s.win_rate >= 60 && s.sample_confidence !== "low").map((s) => s.signal);
  const weak = signals.filter((s) => s.win_rate < 48 && s.sample_confidence !== "low").map((s) => s.signal);
  const top = signals.sort((a, b) => {
    // Rank by: confidence tier first, then win rate
    const confOrder = { high: 2, medium: 1, low: 0 };
    const confDiff = confOrder[b.sample_confidence] - confOrder[a.sample_confidence];
    if (confDiff !== 0) return confDiff;
    return b.win_rate - a.win_rate;
  })[0] ?? null;

  return {
    sport,
    total_graded: sportPicks.length,
    signals: signals.sort((a, b) => b.appearances - a.appearances),
    top_signal: top,
    strong_signals: strong,
    weak_signals: weak,
  };
}

export async function GET(req: NextRequest) {
  try {
    const sport = req.nextUrl.searchParams.get("sport")?.toUpperCase() ?? "ALL";
    const minSample = parseInt(req.nextUrl.searchParams.get("min_sample") ?? String(DEFAULT_MIN_SAMPLE), 10);
    const includeMarketType = req.nextUrl.searchParams.get("include_market_type") !== "false";

    const allPicks = await listGoosePicks({ limit: 5000 });
    const graded = allPicks.filter((p) => p.result !== "pending");

    const sports = sport === "ALL"
      ? ["NHL", "NBA", "MLB", "PGA"]
      : [sport];

    const scorecards = sports.map((s) =>
      buildSportScorecard(graded, s, minSample, includeMarketType),
    );

    const overallBySignal = buildSignalStats(graded, null, minSample, includeMarketType);

    // Summary
    const totalGraded = graded.length;
    const strongCount = scorecards.flatMap((sc) => sc.strong_signals).length;
    const weakCount = scorecards.flatMap((sc) => sc.weak_signals).length;
    const summary = totalGraded === 0
      ? "No graded picks yet — run auto-grade to accumulate signal data."
      : `${totalGraded} graded picks. ${strongCount} strong signal(s) (win rate ≥ 60%). ${weakCount} weak signal(s) (win rate < 48%). Min sample: ${minSample} picks.`;

    const result: SignalScorecardResult = {
      generated_at: new Date().toISOString(),
      sports: scorecards,
      overall_by_signal: overallBySignal,
      summary,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[signal-scorecard] failed", error);
    return NextResponse.json({ error: "Signal scorecard failed" }, { status: 500 });
  }
}
