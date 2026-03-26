/**
 * POST /api/admin/goose-model/generate
 * Runs the Goose AI Picks Model generator for a sport + date.
 * Fetches candidates from the live engine, scores them by learned
 * signal weights, and stores the top picks in goose_model_picks.
 *
 * Body: {
 *   date: string;
 *   sport: "NHL" | "NBA" | "MLB" | "PGA";
 *   topN?: number;                // default 5 (prod) or 10 (sandbox)
 *   dry_run?: boolean;            // if true, returns picks but doesn't persist
 *   sandbox?: boolean;            // use relaxed thresholds (55% hitRate, 3% edge, top 10)
 *   experiment_tag?: string;      // default "baseline-v1" in sandbox mode
 *   hit_rate_floor?: number;      // override hit-rate floor (0–100)
 *   edge_floor?: number;          // override edge floor (%)
 * }
 *
 * HARD RULE: odds worse than -200 are always excluded, regardless of
 * sandbox mode, threshold overrides, or sport.
 */

import { NextRequest, NextResponse } from "next/server";
import { captureGoosePicks } from "@/lib/goose-model/store";
import {
  generateGoosePicks,
  aiPicksToGooseCandidates,
  scoredCandidateToPickRow,
  isWithinOddsCap,
  SANDBOX_TOP_N,
  SANDBOX_EXPERIMENT_TAG,
  SANDBOX_ODDS_CAP,
} from "@/lib/goose-model/generator";
import type { AIPick } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchCandidatesForSport(sport: string, date: string): Promise<AIPick[]> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const endpoints: Record<string, string> = {
    NHL: `/api/picks?date=${date}&league=NHL`,
    NBA: `/api/nba/picks?date=${date}`,
    MLB: `/api/mlb/picks?date=${date}`,
    PGA: `/api/golf/picks?date=${date}`,
  };

  const endpoint = endpoints[sport.toUpperCase()];
  if (!endpoint) return [];

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { "x-goose-model-agent": "1" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json() as { picks?: AIPick[] };
    return Array.isArray(data?.picks) ? data.picks : [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      date: string;
      sport: string;
      topN?: number;
      dry_run?: boolean;
      sandbox?: boolean;
      experiment_tag?: string | null;
      hit_rate_floor?: number;
      edge_floor?: number;
    };

    if (!body.date || !body.sport) {
      return NextResponse.json({ error: "date and sport are required" }, { status: 400 });
    }

    const sport = body.sport.toUpperCase();
    const isSandbox = body.sandbox ?? false;
    const isDryRun = body.dry_run ?? false;
    const experimentTag = body.experiment_tag ?? (isSandbox ? SANDBOX_EXPERIMENT_TAG : null);
    const topN = body.topN ?? (isSandbox ? SANDBOX_TOP_N : 5);

    // Fetch candidates from live engine
    const liveAIPicks = await fetchCandidatesForSport(sport, body.date);

    // HARD RULE: apply -200 odds cap before any other processing
    const oddsFiltered = liveAIPicks.filter((p) => isWithinOddsCap(p.odds));
    const oddsRejected = liveAIPicks.length - oddsFiltered.length;

    const candidates = aiPicksToGooseCandidates(oddsFiltered, sport);

    if (!candidates.length) {
      return NextResponse.json({
        date: body.date,
        sport,
        sandbox: isSandbox,
        selected: [],
        scored_count: 0,
        odds_rejected: oddsRejected,
        message: `No candidates found for ${sport}/${body.date} (${oddsRejected} rejected by -${Math.abs(SANDBOX_ODDS_CAP)} odds cap)`,
      });
    }

    // Run model scoring with threshold filters
    const result = await generateGoosePicks({
      date: body.date,
      sport,
      candidates,
      topN,
      sandbox: isSandbox,
      hitRateFloor: body.hit_rate_floor,
      edgeFloor: body.edge_floor,
      experimentTag,
    });

    if (isDryRun) {
      return NextResponse.json({
        date: body.date,
        sport,
        sandbox: isSandbox,
        experiment_tag: experimentTag,
        model_version: result.model_version,
        scored_count: result.scored_candidates.length,
        selected: result.selected,
        odds_rejected: oddsRejected,
        dry_run: true,
      });
    }

    // Persist to goose_model_picks
    const pickRows = result.selected.map((c) =>
      scoredCandidateToPickRow(c, body.date, experimentTag),
    );
    const stored = await captureGoosePicks({
      date: body.date,
      sport,
      picks: pickRows,
    });

    return NextResponse.json({
      date: body.date,
      sport,
      sandbox: isSandbox,
      experiment_tag: experimentTag,
      model_version: result.model_version,
      scored_count: result.scored_candidates.length,
      selected_count: stored.length,
      odds_rejected: oddsRejected,
      picks: stored,
    });
  } catch (error) {
    console.error("[goose-model/generate] failed", error);
    return NextResponse.json({ error: "Generate request failed" }, { status: 500 });
  }
}
