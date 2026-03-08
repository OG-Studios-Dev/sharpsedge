import { NextRequest, NextResponse } from "next/server";
import { readPicks, savePick } from "@/lib/picks-store";

export async function GET() {
  const picks = await readPicks();
  return NextResponse.json({ picks });
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
