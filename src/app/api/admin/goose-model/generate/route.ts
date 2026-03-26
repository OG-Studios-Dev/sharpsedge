/**
 * POST /api/admin/goose-model/generate
 * Runs the Goose AI Picks Model generator for a sport + date.
 * Fetches candidates from the live engine, scores them by learned
 * signal weights, and stores the top picks in goose_model_picks.
 *
 * Body: {
 *   date: string;
 *   sport: "NHL" | "NBA" | "MLB" | "PGA";
 *   topN?: number;           // default 5
 *   dry_run?: boolean;       // if true, returns picks but doesn't persist
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { captureGoosePicks } from "@/lib/goose-model/store";
import { generateGoosePicks, aiPicksToGooseCandidates, scoredCandidateToPickRow } from "@/lib/goose-model/generator";
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
    };

    if (!body.date || !body.sport) {
      return NextResponse.json({ error: "date and sport are required" }, { status: 400 });
    }

    const sport = body.sport.toUpperCase();
    const topN = body.topN ?? 5;
    const isDryRun = body.dry_run ?? false;

    // Fetch candidates from live engine
    const liveAIPicks = await fetchCandidatesForSport(sport, body.date);
    const candidates = aiPicksToGooseCandidates(liveAIPicks, sport);

    if (!candidates.length) {
      return NextResponse.json({
        date: body.date,
        sport,
        selected: [],
        scored_count: 0,
        message: "No candidates found for this sport/date",
      });
    }

    // Run model scoring
    const result = await generateGoosePicks({
      date: body.date,
      sport,
      candidates,
      topN,
    });

    if (isDryRun) {
      return NextResponse.json({
        date: body.date,
        sport,
        model_version: result.model_version,
        scored_count: result.scored_candidates.length,
        selected: result.selected,
        dry_run: true,
      });
    }

    // Persist to goose_model_picks
    const pickRows = result.selected.map((c) => scoredCandidateToPickRow(c, body.date));
    const stored = await captureGoosePicks({
      date: body.date,
      sport,
      picks: pickRows,
    });

    return NextResponse.json({
      date: body.date,
      sport,
      model_version: result.model_version,
      scored_count: result.scored_candidates.length,
      selected_count: stored.length,
      picks: stored,
    });
  } catch (error) {
    console.error("[goose-model/generate] failed", error);
    return NextResponse.json({ error: "Generate request failed" }, { status: 500 });
  }
}
