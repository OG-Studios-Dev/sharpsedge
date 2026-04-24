import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);
const NHL_SEASON_WINDOWS = [
  ["2025-10-01", "2025-10-31"],
  ["2025-11-01", "2025-11-30"],
  ["2025-12-01", "2025-12-31"],
  ["2026-01-01", "2026-01-31"],
  ["2026-02-01", "2026-02-28"],
  ["2026-03-01", "2026-03-31"],
  ["2026-04-01", "2026-04-30"],
] as const;

type RpcResponse = {
  message?: string;
  error?: string;
  details?: string;
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function normalizeLeague(raw: unknown) {
  const value = String(raw ?? "NHL").trim().toUpperCase();
  return ALLOWED_LEAGUES.has(value) ? value : null;
}

function normalizeDate(raw: unknown) {
  const value = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function callRpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase RPC failed (${response.status})`;
    try {
      const payload = await response.json() as RpcResponse;
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  return await response.json() as T;
}

async function fetchCount(path: string) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "GET",
    headers: serviceHeaders({ Prefer: "count=exact", Range: "0-0" }),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase count read failed (${response.status})`;
    try {
      const payload = await response.json() as RpcResponse;
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  const contentRange = response.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1] || 0);
  return Number.isFinite(total) ? total : 0;
}

async function hydrateNhlCandidateCache(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return 0;
  return await callRpc<number>("refresh_ask_goose_nhl_candidate_cache_v1_batch", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
}

async function fetchNhlServingCounts(startDate: string, endDate: string) {
  return await callRpc<Array<{ event_date: string; row_count: number }>>("count_ask_goose_nhl_serving_rows_by_date", {
    p_start_date: startDate,
    p_end_date: endDate,
  });
}

async function refreshNhlChunkedQueryLayer(startDate: string, endDate: string) {
  await hydrateNhlCandidateCache(startDate, endDate);
  await callRpc<number>("refresh_ask_goose_nhl_serving_source_v2", {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  const countsByDate = await fetchNhlServingCounts(startDate, endDate);

  let rowsRefreshed = 0;
  for (const entry of countsByDate) {
    const eventDate = String(entry.event_date);
    const totalRows = Number(entry.row_count || 0);
    let chunkStart = 1;
    const chunkSize = 1000;
    let first = true;
    while (chunkStart <= totalRows) {
      rowsRefreshed += Number(await callRpc<number>("refresh_ask_goose_query_layer_nhl_v2_chunk", {
        p_event_date: eventDate,
        p_chunk_start: chunkStart,
        p_chunk_size: chunkSize,
        p_delete_existing: first,
      }) || 0);
      first = false;
      chunkStart += chunkSize;
    }
  }

  return rowsRefreshed;
}

async function refreshWindow(mode: string, league: string, startDate: string | null, endDate: string | null) {
  if (mode === "grade") {
    return await callRpc<number>("grade_ask_goose_game_markets_from_event_scores_v1", {
      p_league: league,
      p_start_date: startDate,
      p_end_date: endDate,
    });
  }

  if (league === "NHL" && mode === "batch") {
    if (!startDate || !endDate) {
      throw new Error("NHL batch refresh requires explicit startDate and endDate");
    }
    const beforeGradeRows = await refreshNhlChunkedQueryLayer(startDate, endDate);
    await callRpc<number>("grade_ask_goose_game_markets_from_event_scores_v1", {
      p_league: league,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    const afterGradeRows = await refreshNhlChunkedQueryLayer(startDate, endDate);
    return beforeGradeRows + afterGradeRows;
  }

  if ((league === "NBA" || league === "MLB") && mode === "batch") {
    const beforeGradeRows = await callRpc<number>("refresh_ask_goose_simple_league_v1", {
      p_league: league,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    await callRpc<number>("grade_ask_goose_game_markets_from_event_scores_v1", {
      p_league: league,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    const afterGradeRows = await callRpc<number>("refresh_ask_goose_simple_league_v1", {
      p_league: league,
      p_start_date: startDate,
      p_end_date: endDate,
    });
    return beforeGradeRows + afterGradeRows;
  }

  return mode === "stage"
    ? await callRpc<number>("refresh_ask_goose_source_stage_v1", {
        p_league: league,
        p_start_date: startDate,
        p_end_date: endDate,
      })
    : await callRpc<number>("refresh_ask_goose_query_layer_v1_batch", {
        p_league: league,
        p_start_date: startDate,
        p_end_date: endDate,
      });
}

async function runNhlWindowedRefresh(mode: string) {
  const windows: Array<{ startDate: string; endDate: string; rowsRefreshed: number; ok: boolean; error?: string }> = [];
  let totalRows = 0;

  for (const [startDate, endDate] of NHL_SEASON_WINDOWS) {
    try {
      const rowsRefreshed = await refreshWindow(mode, "NHL", startDate, endDate);
      totalRows += Number(rowsRefreshed || 0);
      windows.push({ startDate, endDate, rowsRefreshed: Number(rowsRefreshed || 0), ok: true });
    } catch (error) {
      windows.push({
        startDate,
        endDate,
        rowsRefreshed: 0,
        ok: false,
        error: toErrorMessage(error, `Window refresh failed for ${startDate} to ${endDate}`),
      });
      break;
    }
  }

  return {
    rowsRefreshed: totalRows,
    windows,
    completedAllWindows: windows.length === NHL_SEASON_WINDOWS.length && windows.every((window) => window.ok),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const league = normalizeLeague(body.league);
    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);
    const mode = String(body.mode ?? "batch").trim().toLowerCase();
    const forceWindowed = body.windowed === true;

    if (!league) {
      return NextResponse.json({ ok: false, error: "league must be one of NHL, NBA, MLB, NFL" }, { status: 400 });
    }

    if ((startDate && !endDate) || (!startDate && endDate)) {
      return NextResponse.json({ ok: false, error: "startDate and endDate must be provided together" }, { status: 400 });
    }

    const beforeCount = await fetchCount(
      `/rest/v1/ask_goose_query_layer_v1?league=eq.${league}&select=candidate_id`,
    );

    const startedAt = new Date().toISOString();
    const shouldRunWindowed = league === "NHL" && !startDate && !endDate && mode === "batch" && forceWindowed !== false;

    let rowsRefreshed = 0;
    let windows: Array<{ startDate: string; endDate: string; rowsRefreshed: number; ok: boolean; error?: string }> = [];
    let completedAllWindows: boolean | null = null;

    if (shouldRunWindowed) {
      const result = await runNhlWindowedRefresh(mode);
      rowsRefreshed = result.rowsRefreshed;
      windows = result.windows;
      completedAllWindows = result.completedAllWindows;
    } else {
      rowsRefreshed = Number(await refreshWindow(mode, league, startDate, endDate) || 0);
    }

    const afterCount = await fetchCount(
      `/rest/v1/ask_goose_query_layer_v1?league=eq.${league}&select=candidate_id`,
    );

    return NextResponse.json({
      ok: true,
      mode,
      league,
      startDate,
      endDate,
      rowsRefreshed,
      beforeCount,
      afterCount,
      delta: afterCount - beforeCount,
      startedAt,
      finishedAt: new Date().toISOString(),
      windowed: shouldRunWindowed,
      completedAllWindows,
      windows,
      message: `Ask Goose ${mode} refresh completed for ${league}.`,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Ask Goose refresh failed"),
      message: "Ask Goose refresh did not complete.",
    }, { status: 500 });
  }
}
