import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function postgrest<T>(path: string) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "GET",
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase request failed (${response.status})`;
    try {
      const payload = await response.json() as { message?: string; error?: string; details?: string };
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  return await response.json() as T;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = (searchParams.get("sport") || "").trim().toUpperCase();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 200), 1), 1000);

    const query = new URLSearchParams({
      select: [
        "candidate_id",
        "sport",
        "league",
        "event_date",
        "team_name",
        "opponent_name",
        "market_type",
        "market_family",
        "segment_key",
        "side",
        "line",
        "odds",
        "result",
        "profit_units",
        "profitable_label"
      ].join(","),
      order: "event_date.desc",
      limit: String(limit),
    });

    if (sport) {
      query.set("sport", `eq.${sport}`);
    }

    const rows = await postgrest<any[]>(`/rest/v1/goose_training_examples_v1?${query.toString()}`);
    const profitable = rows.filter((row) => Number(row?.profitable_label || 0) === 1).length;
    const losses = rows.filter((row) => String(row?.result || "").toLowerCase() === "loss").length;
    const pushes = rows.filter((row) => String(row?.result || "").toLowerCase() === "push").length;
    const units = rows.reduce((sum, row) => sum + Number(row?.profit_units || 0), 0);

    return NextResponse.json({
      ok: true,
      filters: { sport: sport || "ALL", limit },
      summary: {
        rows: rows.length,
        profitable,
        losses,
        pushes,
        units,
      },
      rows: rows.slice(0, 50),
      message: rows.length
        ? `Loaded ${rows.length} training examples for ${sport || "all sports"}.`
        : "No training examples found yet.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Failed to load training summary"),
      rows: [],
      summary: {
        rows: 0,
        profitable: 0,
        losses: 0,
        pushes: 0,
        units: 0,
      },
    }, { status: 500 });
  }
}
