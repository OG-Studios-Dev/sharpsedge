/**
 * GET  /api/admin/goose-model  — list picks (with optional filters)
 * POST /api/admin/goose-model  — capture picks into goose_model_picks
 */

import { NextRequest, NextResponse } from "next/server";
import { listGoosePicks, captureGoosePicks, listSignalWeights, getGooseModelStats } from "@/lib/goose-model/store";
import { tagSignals } from "@/lib/goose-model/signal-tagger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? undefined;
  const sport = searchParams.get("sport") ?? undefined;
  const result = searchParams.get("result") as any ?? undefined;
  const source = searchParams.get("source") as any ?? undefined;
  const view = searchParams.get("view") ?? "picks";

  try {
    if (view === "weights") {
      const weights = await listSignalWeights(sport);
      return NextResponse.json({ weights });
    }

    if (view === "stats") {
      const picks = await listGoosePicks({ date, sport, limit: 5000 });
      const settled = picks.filter((p) => p.result !== "pending");
      const wins = settled.filter((p) => p.result === "win").length;
      const losses = settled.filter((p) => p.result === "loss").length;
      const pushes = settled.filter((p) => p.result === "push").length;
      const stats = {
        total: picks.length,
        wins,
        losses,
        pushes,
        pending: picks.filter((p) => p.result === "pending").length,
        win_rate: settled.length > 0 ? wins / settled.length : 0,
      };
      return NextResponse.json({ stats });
    }

    const picks = await listGoosePicks({ date, sport, result, source, limit: 200 });
    return NextResponse.json({ picks });
  } catch (error) {
    console.error("[goose-model] GET failed", error);
    return NextResponse.json({ error: "Failed to load goose model data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      date: string;
      sport: string;
      picks: Array<{
        pick_label: string;
        pick_type?: "player" | "team";
        player_name?: string | null;
        team?: string | null;
        opponent?: string | null;
        game_id?: string | null;
        reasoning?: string | null;
        signals_present?: string[];
        odds?: number | null;
        book?: string | null;
        hit_rate_at_time?: number | null;
        confidence?: number | null;
        model_version?: string;
        source?: "captured" | "generated";
        pick_snapshot?: Record<string, unknown> | null;
      }>;
    };

    if (!body.date || !body.sport || !Array.isArray(body.picks)) {
      return NextResponse.json({ error: "date, sport, and picks[] are required" }, { status: 400 });
    }

    // Auto-tag signals from reasoning if not provided
    const enrichedPicks = body.picks.map((p) => ({
      ...p,
      pick_type: (p.pick_type ?? "player") as "player" | "team",
      signals_present: p.signals_present ?? tagSignals(p.reasoning, p.pick_label),
    }));

    const stored = await captureGoosePicks({
      date: body.date,
      sport: body.sport,
      picks: enrichedPicks,
    });

    return NextResponse.json({ picks: stored, count: stored.length });
  } catch (error) {
    console.error("[goose-model] POST failed", error);
    return NextResponse.json({ error: "Failed to capture picks" }, { status: 500 });
  }
}
