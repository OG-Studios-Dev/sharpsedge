/**
 * GET /api/admin/goose-model/generate-daily
 *
 * Daily cron endpoint (runs ~11am ET via Vercel cron, before games start).
 * Generates top picks for NHL + NBA + MLB + PGA for today's date and
 * persists them in goose_model_picks so the admin section shows today's
 * picks every morning without manual triggering.
 *
 * Can also be triggered manually via POST:
 *   POST { date?: "2026-03-25", sports?: ["NHL","NBA"] }
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

const SPORTS = ["NHL", "NBA", "MLB", "PGA"] as const;

async function generateForSport(
  sport: string,
  date: string,
  baseUrl: string,
): Promise<{ sport: string; success: boolean; picks?: number; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/api/admin/goose-model/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goose-model-cron": "1",
      },
      body: JSON.stringify({ date, sport, topN: 5 }),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { sport, success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json() as { selected_count?: number; message?: string };
    return { sport, success: true, picks: data.selected_count ?? 0 };
  } catch (err) {
    return { sport, success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runDailyGeneration(
  targetDate?: string,
  sports?: string[],
): Promise<{
  date: string;
  sports: Array<{ sport: string; success: boolean; picks?: number; error?: string }>;
  total_picks: number;
}> {
  const date = targetDate ?? new Date().toISOString().slice(0, 10);
  const sportsToRun = (sports ?? [...SPORTS]).map((s) => s.toUpperCase());
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Run sports sequentially to avoid thundering-herd on the pick APIs
  const results: Array<{ sport: string; success: boolean; picks?: number; error?: string }> = [];
  for (const sport of sportsToRun) {
    const r = await generateForSport(sport, date, baseUrl);
    results.push(r);
    console.info("[goose-model/generate-daily]", r);
  }

  return {
    date,
    sports: results,
    total_picks: results.reduce((sum, r) => sum + (r.picks ?? 0), 0),
  };
}

// ── route handlers ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyGeneration();
    console.info("[goose-model/generate-daily] cron completed", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/generate-daily] cron failed", error);
    return NextResponse.json({ error: "Daily generation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string; sports?: string[] };
    const result = await runDailyGeneration(body.date, body.sports);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[goose-model/generate-daily] manual run failed", error);
    return NextResponse.json({ error: "Daily generation failed" }, { status: 500 });
  }
}
