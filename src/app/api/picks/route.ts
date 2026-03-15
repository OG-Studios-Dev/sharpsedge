import { NextRequest, NextResponse } from "next/server";
import { savePick } from "@/lib/picks-store";
import { createServerClient } from "@/lib/supabase-server";
import { getLiveDashboardData } from "@/lib/live-data";
import { selectTopPicks } from "@/lib/picks-engine";
import { getDateKey } from "@/lib/date-utils";

export async function GET(req: NextRequest) {
  try {
    const data = await getLiveDashboardData();
    const date = req.nextUrl.searchParams.get("date") || getDateKey();
    const picks = selectTopPicks(data.props || [], data.teamTrends || [], date);
    return NextResponse.json({ picks, date });
  } catch {
    return NextResponse.json({ picks: [], date: getDateKey() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.playerName || !body?.team || !body?.opponent || !body?.propType) {
      return NextResponse.json({ error: "Missing required pick fields" }, { status: 400 });
    }

    const sport = body.sport === "NBA" ? "NBA" : "NHL";
    const recordId = `pick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pickLabel = body.recommendation || `${body.overUnder ?? "Over"} ${body.line} ${body.propType}`;

    try {
      const supabase = createServerClient();
      const saved = await supabase.pickHistory.insert({
        id: recordId,
        date: getDateKey(),
        league: sport,
        pick_type: "player",
        player_name: body.playerName,
        team: body.team,
        opponent: body.opponent,
        pick_label: pickLabel,
        hit_rate: typeof body.hitRate === "number" ? body.hitRate : null,
        edge: typeof body.edge === "number" ? body.edge : null,
        odds: Number.isFinite(Number(body.odds)) ? Number(body.odds) : null,
        book: typeof body.book === "string" ? body.book : null,
        result: "pending",
        game_id: typeof body.gameId === "string" ? body.gameId : null,
        reasoning: typeof body.reasoning === "string" ? body.reasoning : "",
        confidence: typeof body.confidence === "number" ? body.confidence : null,
        units: 1,
      });

      return NextResponse.json({ ok: true, pick: saved }, { status: 201 });
    } catch {
      const saved = await savePick({
        sport,
        gameId: body.gameId,
        matchup: body.matchup,
        playerName: body.playerName,
        team: body.team,
        opponent: body.opponent,
        propType: body.propType,
        line: Number(body.line),
        overUnder: body.overUnder === "Under" ? "Under" : "Over",
        odds: Number(body.odds),
        recommendation: pickLabel,
        confidence: typeof body.confidence === "number" ? body.confidence : null,
        reasoning: body.reasoning || "",
      });

      return NextResponse.json({ ok: true, pick: saved }, { status: 201 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to save pick" }, { status: 500 });
  }
}
