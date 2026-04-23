import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const league = normalizeLeague(body.league);
    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);
    const mode = String(body.mode ?? "batch").trim().toLowerCase();

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
    const rowsRefreshed = mode === "stage"
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
