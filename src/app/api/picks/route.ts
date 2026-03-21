import { NextRequest, NextResponse } from "next/server";
import { savePick } from "@/lib/picks-store";
import { createServerClient } from "@/lib/supabase-server";
import { getLiveDashboardData } from "@/lib/live-data";
import { selectTopPicks } from "@/lib/picks-engine";
import { getDateKey } from "@/lib/date-utils";
import { getStoredPickSlate, storeDailyPickSlate } from "@/lib/pick-history-store";
import { shouldRecoverStoredSlate } from "@/lib/pick-history-integrity";

function normalizeGameId(value?: string | number | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return undefined;
  return normalized;
}

function isRealNHLGameId(gameId?: string) {
  return Boolean(gameId && /^\d{10}$/.test(gameId));
}

function buildEphemeralIntegrity(
  date: string,
  pickCount: number,
  message: string,
  priorIntegrity?: Record<string, unknown> | null,
) {
  const previous = (priorIntegrity ?? {}) as Record<string, unknown>;
  const expectedPickCount = typeof previous.expected_pick_count === "number" ? previous.expected_pick_count : pickCount;

  return {
    ...previous,
    date,
    league: "NHL",
    status: pickCount >= expectedPickCount ? "locked" : "incomplete",
    provenance: "original",
    expected_pick_count: expectedPickCount,
    pick_count: pickCount,
    integrity_status: pickCount >= expectedPickCount ? "ok" : "incomplete",
    status_note: message,
  };
}

export async function GET(req: NextRequest) {
  try {
    const requestedDate = req.nextUrl.searchParams.get("date") || getDateKey();
    const lockedSlate = await getStoredPickSlate(requestedDate, "NHL");

    if (lockedSlate.slate && !shouldRecoverStoredSlate(lockedSlate.slate, lockedSlate.records)) {
      return NextResponse.json(
        {
          picks: lockedSlate.picks,
          date: requestedDate,
          source: "history_locked",
          integrity: lockedSlate.slate,
        },
        { status: lockedSlate.slate.integrity_status === "incomplete" ? 409 : 200 },
      );
    }

    const data = await getLiveDashboardData();
    const allowedDates = new Set([requestedDate]);
    const date = requestedDate;
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

    if (picks.length === 0) {
      return NextResponse.json({ picks: [], date, source: "no-qualifying" });
    }

    const normalizedPicks = picks.map((pick) => ({ ...pick, league: pick.league ?? "NHL" }));

    try {
      const stored = await storeDailyPickSlate(normalizedPicks, {
        date,
        league: "NHL",
      });

      return NextResponse.json(
        {
          picks: stored.picks,
          date,
          source: stored.source === "existing" ? "history_locked" : stored.source === "repaired" ? "generated_repaired" : "generated_locked",
          integrity: stored.slate,
        },
        { status: stored.slate?.integrity_status === "incomplete" ? 409 : 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to persist authoritative picks";
      console.error("[api/picks] persistence degraded, serving generated picks:", error);
      return NextResponse.json(
        {
          picks: normalizedPicks,
          date,
          source: "generated_unlocked",
          integrity: buildEphemeralIntegrity(date, normalizedPicks.length, `Serving generated picks without persistence: ${message}`, lockedSlate.slate),
          warning: message,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    console.error("[api/picks] error:", error);
    return NextResponse.json(
      {
        picks: [],
        date: req.nextUrl.searchParams.get("date") || getDateKey(),
        source: "integrity_error",
        error: error instanceof Error ? error.message : "Failed to load authoritative picks",
      },
      { status: 503 },
    );
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
        provenance: "manual_repair",
        provenance_note: "Saved manually from the picks API.",
        pick_snapshot: null,
        updated_at: new Date().toISOString(),
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
