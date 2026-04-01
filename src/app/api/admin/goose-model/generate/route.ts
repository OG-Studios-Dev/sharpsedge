/**
 * POST /api/admin/goose-model/generate
 * Runs the Goose AI Picks Model generator for a sport + date.
 * Fetches candidates from the live engine, scores them by learned
 * signal weights, and stores the top picks in goose_model_picks.
 *
 * Body: {
 *   date: string;
 *   sport: "NHL" | "NBA" | "MLB" | "PGA";
 *   topN?: number;                // default 3 (prod) or 10 (sandbox)
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
  PROD_TOP_N,
} from "@/lib/goose-model/generator";
import type { AIPick } from "@/lib/types";

export const dynamic = "force-dynamic";

async function fetchCandidatesForSport(sport: string, date: string, baseUrl: string): Promise<AIPick[]> {

  const endpointCandidates: Record<string, string[]> = {
    NHL: [`/api/picks?date=${date}&league=NHL`, "/api/picks?league=NHL", "/api/picks"],
    NBA: [`/api/nba/picks?date=${date}`, "/api/nba/picks"],
    MLB: [`/api/mlb/picks?date=${date}`, "/api/mlb/picks"],
    PGA: [`/api/golf/picks?date=${date}`, "/api/golf/picks"],
  };

  const endpoints = endpointCandidates[sport.toUpperCase()];
  if (!endpoints?.length) return [];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        headers: { "x-goose-model-agent": "1" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { picks?: AIPick[] };
      if (Array.isArray(data?.picks) && data.picks.length > 0) {
        return data.picks;
      }
    } catch {
      // try the next fallback endpoint
    }
  }

  return [];
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
    const topN = body.topN ?? (isSandbox ? SANDBOX_TOP_N : PROD_TOP_N);
    const requestOrigin = req.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin || "http://localhost:3000";

    // Fetch candidates from live engine
    const liveAIPicks = await fetchCandidatesForSport(sport, body.date, baseUrl);

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

    const fallbackSelected =
      isSandbox &&
      result.selected.length === 0 &&
      candidates.length > 0 &&
      (body.hit_rate_floor === 0 || body.edge_floor === 0)
        ? await generateGoosePicks({
            date: body.date,
            sport,
            candidates,
            topN,
            sandbox: false,
            hitRateFloor: 0,
            edgeFloor: 0,
            experimentTag,
          })
        : null;

    const finalResult = fallbackSelected && fallbackSelected.selected.length > 0 ? fallbackSelected : result;

    if (isDryRun) {
      return NextResponse.json({
        date: body.date,
        sport,
        sandbox: isSandbox,
        experiment_tag: experimentTag,
        model_version: finalResult.model_version,
        scored_count: finalResult.scored_candidates.length,
        selected: finalResult.selected,
        odds_rejected: oddsRejected,
        dry_run: true,
      });
    }

    // Persist to goose_model_picks
    const pickRows = finalResult.selected.map((c) =>
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
      model_version: finalResult.model_version,
      scored_count: finalResult.scored_candidates.length,
      selected_count: stored.length,
      odds_rejected: oddsRejected,
      picks: stored,
      fallback_mode:
        finalResult !== result
          ? "sandbox-wide-net-selected-from-scored-candidates"
          : null,
    });
  } catch (error) {
    console.error("[goose-model/generate] failed", error);
    return NextResponse.json({ error: "Generate request failed" }, { status: 500 });
  }
}
