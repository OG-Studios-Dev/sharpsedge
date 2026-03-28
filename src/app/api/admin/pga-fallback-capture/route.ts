/**
 * GET/POST /api/admin/pga-fallback-capture
 *
 * Fallback odds capture rail for PGA pre-tournament markets.
 * Runs when primary Bovada scraper fails or returns partial data.
 *
 * GET  — Status check + last capture summary
 * POST — Trigger capture from all available fallback sources:
 *        1. The Odds API (ODDS_API_KEY_2) → outright winner lines
 *        2. BettingPros stub (scaffolded; returns [] with limitation note)
 *        3. Manual injection: POST a body with `lines` array to ingest
 *           externally captured lines (e.g. from a Playwright script)
 *
 * MARKETS COVERED (live):
 *   winner — via The Odds API, multiple books (BetRivers, BetMGM, BetOnline, etc.)
 *
 * MARKETS COVERED (scaffolded / manual injection only):
 *   top5, top10, top20, make_cut — BettingPros requires headless browser
 *
 * PROVENANCE STORED (every line):
 *   player, market, odds, source, source_url, captured_at, tournament,
 *   book, event_id, is_fallback=true
 *
 * CRON: Monday 06:00 UTC weekly (wired in vercel.json)
 * Also triggered inside /api/golf/odds-snapshot when Bovada returns empty.
 *
 * SECURITY: x-admin-key or x-scrape-key header required for POST.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runFallbackCapture,
  type FallbackOddsLine,
} from "@/lib/golf/fallback-odds-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getEnv(key: string): string {
  return (process.env[key] ?? "").replace(/\n/g, "").trim();
}

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

function isAuthorized(request: NextRequest): boolean {
  const adminSecret = getEnv("ADMIN_SECRET");
  const scrapeSecret = getEnv("SCRAPE_SECRET");

  // In dev with no secrets configured, allow freely
  if (!adminSecret && !scrapeSecret) return true;

  const authHeader = request.headers.get("authorization");
  const xKey =
    request.headers.get("x-admin-key") ??
    request.headers.get("x-scrape-key");

  if (adminSecret && (authHeader === `Bearer ${adminSecret}` || xKey === adminSecret))
    return true;
  if (scrapeSecret && (authHeader === `Bearer ${scrapeSecret}` || xKey === scrapeSecret))
    return true;

  return false;
}

async function upsertLinesToSupabase(
  lines: FallbackOddsLine[],
): Promise<{ stored: number; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { stored: 0, error: "Supabase not configured" };
  }
  if (lines.length === 0) {
    return { stored: 0, error: null };
  }

  try {
    const rows = lines.map((l) => ({
      player: l.player,
      market: l.market,
      odds: l.odds,
      source: l.source,
      source_url: l.source_url,
      captured_at: l.captured_at,
      tournament: l.tournament,
      book: l.book,
      event_id: l.event_id,
      is_fallback: true,
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/pga_fallback_odds`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });

    if (res.status === 404) {
      return {
        stored: 0,
        error:
          "pga_fallback_odds table not found. Run migration: supabase/migrations/20260328200000_pga_fallback_odds.sql",
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { stored: 0, error: `Supabase error ${res.status}: ${body}` };
    }

    return { stored: rows.length, error: null };
  } catch (err) {
    return { stored: 0, error: String(err) };
  }
}

async function getLastCaptureSummary(): Promise<object | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pga_fallback_odds?select=tournament,source,market,captured_at&order=captured_at.desc&limit=100`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ tournament: string; source: string; market: string; captured_at: string }>;

    if (!rows.length) return { rows: 0, message: "No fallback captures stored yet" };

    const latest = rows[0].captured_at;
    const byMarket: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const tournaments = new Set<string>();

    for (const r of rows) {
      byMarket[r.market] = (byMarket[r.market] ?? 0) + 1;
      bySource[r.source] = (bySource[r.source] ?? 0) + 1;
      tournaments.add(r.tournament);
    }

    return {
      lastCaptureAt: latest,
      rowsInSample: rows.length,
      byMarket,
      bySource,
      tournaments: Array.from(tournaments),
    };
  } catch {
    return null;
  }
}

// ─── GET: status check ────────────────────────────────────────────────────────

export async function GET() {
  const lastCapture = await getLastCaptureSummary();

  return NextResponse.json({
    mode: "status",
    description:
      "PGA fallback odds capture rail. Runs when primary Bovada scraper fails.",
    marketsLive: ["winner"],
    marketsScaffolded: ["top5", "top10", "top20", "make_cut"],
    provenanceFields: [
      "player",
      "market",
      "odds",
      "source",
      "source_url",
      "captured_at",
      "tournament",
      "book",
      "event_id",
      "is_fallback",
    ],
    sources: {
      theoddsapi: {
        status: "live",
        markets: ["winner"],
        note: "Uses ODDS_API_KEY_2. Covers major tournaments only.",
      },
      bettingpros: {
        status: "scaffolded",
        markets: ["winner", "top5", "top10", "top20", "make_cut"],
        note:
          "JS-rendered site — auto-scrape not possible in serverless. " +
          "Manual injection via POST /api/admin/pga-fallback-capture with body {lines:[...]}.",
      },
    },
    automation: {
      cron: "Monday 06:00 UTC (vercel.json)",
      automatic: "Called inside /api/golf/odds-snapshot when Bovada returns empty winner markets",
    },
    lastCapture: lastCapture ?? { message: "Could not fetch — Supabase may not be configured" },
    usage: {
      trigger: "POST /api/admin/pga-fallback-capture (with x-admin-key header)",
      manualInject: "POST /api/admin/pga-fallback-capture with body {lines:[FallbackOddsLine[]]}",
    },
  });
}

// ─── POST: trigger capture ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized — supply x-admin-key or x-scrape-key header" },
      { status: 401 },
    );
  }

  const now = new Date().toISOString();
  let injectLines: FallbackOddsLine[] = [];

  // Allow manual line injection (e.g. from Playwright-captured BettingPros data)
  try {
    const body = await request.json().catch(() => null);
    if (body && Array.isArray(body.lines) && body.lines.length > 0) {
      injectLines = (body.lines as FallbackOddsLine[]).filter(
        (l) =>
          l.player &&
          l.market &&
          typeof l.odds === "number" &&
          l.source &&
          l.tournament,
      );
    }
  } catch {
    // no body or invalid JSON — fine, proceed with auto-capture
  }

  // Run automatic capture from configured sources
  const { allLines, results, summary } = await runFallbackCapture();

  // Merge injected lines with auto-captured
  const dedupedInjectLines = injectLines.map((l) => ({
    ...l,
    is_fallback: true as const,
    captured_at: l.captured_at ?? now,
  }));

  const combinedLines = [...allLines, ...dedupedInjectLines];

  // Store in Supabase
  const { stored, error: storeError } = await upsertLinesToSupabase(combinedLines);

  return NextResponse.json({
    success: true,
    capturedAt: now,
    auto: {
      totalLines: allLines.length,
      summary: {
        byMarket: summary.byMarket,
        bySource: summary.bySource,
        tournamentsFound: summary.tournamentsFound,
      },
    },
    injected: {
      provided: injectLines.length,
      validated: dedupedInjectLines.length,
    },
    combined: {
      totalLines: combinedLines.length,
      stored,
      storeError,
    },
    limitations: summary.limitations,
    sources: results.map((r) => ({
      source: r.source,
      tournament: r.tournament,
      linesFound: r.lines.length,
      markets: r.marketsFound,
      error: r.error,
      limitation: r.limitation,
    })),
  });
}
