import { NextRequest, NextResponse } from "next/server";
import { savePick } from "@/lib/picks-store";
import { getLiveDashboardData } from "@/lib/live-data";
import { selectTopPicks } from "@/lib/picks-engine";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    const date = new Date().toISOString().slice(0, 10);
    const picks = selectTopPicks(data.props || [], data.teamTrends || [], date);
    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date: new Date().toISOString().slice(0, 10) });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.playerName || !body?.team || !body?.opponent || !body?.propType) {
      return NextResponse.json({ error: "Missing required pick fields" }, { status: 400 });
    }

    const saved = await savePick({
      sport: "NHL",
      gameId: body.gameId,
      matchup: body.matchup,
      playerName: body.playerName,
      team: body.team,
      opponent: body.opponent,
      propType: body.propType,
      line: Number(body.line),
      overUnder: body.overUnder === "Under" ? "Under" : "Over",
      odds: Number(body.odds),
      recommendation: body.recommendation || `${body.overUnder ?? "Over"} ${body.line} ${body.propType}`,
      confidence: typeof body.confidence === "number" ? body.confidence : null,
      reasoning: body.reasoning || "",
    });

    return NextResponse.json({ ok: true, pick: saved }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save pick" }, { status: 500 });
  }
}
