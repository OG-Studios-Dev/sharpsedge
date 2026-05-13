import { NextRequest, NextResponse } from "next/server";
import { getTournamentAnalysis, upsertTournamentAnalysis } from "@/lib/tournament-analysis-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  if (!tournamentId) {
    return NextResponse.json({ error: "tournament_id is required" }, { status: 400 });
  }

  const league = req.nextUrl.searchParams.get("league") ?? "PGA";
  const record = await getTournamentAnalysis(tournamentId, league);
  if (!record) {
    return NextResponse.json({ analysis: null, tournament_id: tournamentId });
  }

  return NextResponse.json({
    analysis: record.analysis,
    tournament_id: record.tournament_id,
    tournament_name: record.tournament_name,
    updated_at: record.updated_at,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.tournament_id || !body?.analysis) {
      return NextResponse.json({ error: "tournament_id and analysis are required" }, { status: 400 });
    }

    const record = await upsertTournamentAnalysis(
      body.tournament_id,
      body.tournament_name ?? "",
      body.analysis,
      body.league ?? "PGA",
    );

    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    console.error("[api/golf/analysis] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save analysis" },
      { status: 500 },
    );
  }
}
