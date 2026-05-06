import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

type ShadowPickRow = {
  pick_date: string;
  sport: string | null;
  status: string | null;
  result: string | null;
  profit_units: number | string | null;
  model_version: string | null;
};

type Summary = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  winRate: number | null;
  roi: number | null;
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emptySummary(): Summary {
  return { total: 0, settled: 0, pending: 0, wins: 0, losses: 0, pushes: 0, units: 0, winRate: null, roi: null };
}

function finalize(summary: Summary): Summary {
  const decisions = summary.wins + summary.losses;
  return {
    ...summary,
    units: Number(summary.units.toFixed(2)),
    winRate: decisions ? Number(((summary.wins / decisions) * 100).toFixed(1)) : null,
    roi: summary.settled ? Number(((summary.units / summary.settled) * 100).toFixed(1)) : null,
  };
}

function summarize(rows: ShadowPickRow[]): Summary {
  const summary = emptySummary();
  for (const row of rows) {
    const result = row.result || "pending";
    summary.total += 1;
    if (result === "pending") summary.pending += 1;
    else summary.settled += 1;
    if (result === "win") summary.wins += 1;
    if (result === "loss") summary.losses += 1;
    if (result === "push" || result === "void") summary.pushes += 1;
    summary.units += num(row.profit_units);
  }
  return finalize(summary);
}

async function resolveActiveModelVersion() {
  const rows = await postgrest<{ active_model_version: string | null }[]>(
    "/rest/v1/goose_learning_lab_spaces?slug=eq.goose-shadow-lab&select=active_model_version&limit=1",
  ).catch(() => []);
  return rows[0]?.active_model_version || "shadow-2026-05-03-expanded-oos";
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const league = (params.get("league") || "ALL").toUpperCase();
    const limit = Math.max(1, Math.min(Number(params.get("limit") || 2000), 5000));
    const modelVersion = params.get("modelVersion") || await resolveActiveModelVersion();

    const filters = [
      "select=pick_date,sport,status,result,profit_units,model_version",
      "lab_slug=eq.goose-shadow-lab",
      `model_version=eq.${encodeURIComponent(modelVersion)}`,
      league !== "ALL" ? `sport=eq.${encodeURIComponent(league)}` : null,
      "order=pick_date.desc",
      `limit=${limit}`,
    ].filter(Boolean).join("&");

    const rows = await postgrest<ShadowPickRow[]>(`/rest/v1/goose_learning_shadow_picks?${filters}`);
    const supportedRows = rows.filter((row) => row.sport !== "PGA");
    const settledRows = supportedRows.filter((row) => row.result && row.result !== "pending");
    const latestDate = supportedRows[0]?.pick_date ?? null;
    const earliestDate = supportedRows.length ? supportedRows[supportedRows.length - 1]?.pick_date ?? null : null;

    return NextResponse.json({
      ok: true,
      locked: true,
      disclosure: "Results only. Learning model picks are not exposed by this endpoint.",
      lab: "goose-shadow-lab",
      modelVersion,
      league,
      latestDate,
      earliestDate,
      overall: summarize(supportedRows),
      settled: summarize(settledRows),
    });
  } catch (error) {
    console.error("[goose-learning/results] failed", error);
    return NextResponse.json({ ok: false, error: toErrorMessage(error, "Failed to load Goose Learning results") }, { status: 500 });
  }
}
