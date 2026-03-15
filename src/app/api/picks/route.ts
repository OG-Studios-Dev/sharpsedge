import { NextRequest, NextResponse } from "next/server";
import { savePick } from "@/lib/picks-store";
import { createServerClient } from "@/lib/supabase-server";
import { getLiveDashboardData } from "@/lib/live-data";
import { selectTopPicks } from "@/lib/picks-engine";
import { getDateKey, getPickDateKeys } from "@/lib/date-utils";
import { persistPicksToSupabase } from "@/lib/persist-picks";

function normalizeGameId(value?: string | number | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function isRealNHLGameId(gameId?: string) {
  return Boolean(gameId && /^\d{10}$/.test(gameId));
}

export async function GET(req: NextRequest) {
  try {
    const data = await getLiveDashboardData();
    const requestedDate = req.nextUrl.searchParams.get("date");
    const allowedDates = new Set(requestedDate ? [requestedDate] : getPickDateKeys());
    const date = requestedDate || data.schedule?.date || getDateKey();
    const scheduledGames = (data.schedule?.games || []).filter((game) => (
      allowedDates.has(getDateKey(new Date(game.startTimeUTC)))
    ));
    const scheduledGameIds = new Set(
      scheduledGames
        .map((game) => normalizeGameId(game.id))
        .filter(isRealNHLGameId),
    );

    const props = (data.props || []).filter((prop) => {
      const gameId = normalizeGameId(prop.gameId);
      return prop.statsSource === "live-nhl" && isRealNHLGameId(gameId) && scheduledGameIds.has(gameId!);
    });
    const teamTrends = (data.teamTrends || []).filter((trend) => {
      const gameId = normalizeGameId(trend.gameId);
      return isRealNHLGameId(gameId) && scheduledGameIds.has(gameId!);
    });
    const picks = selectTopPicks(props, teamTrends, date);

    try {
      await persistPicksToSupabase(picks.map((pick) => ({ ...pick, league: pick.league ?? "NHL" })));
    } catch (error) {
      console.warn("[api/picks] failed to persist picks", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

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

    const sport = body.sport === "NBA" ? "NBA" : body.sport === "MLB" ? "MLB" : "NHL";
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
