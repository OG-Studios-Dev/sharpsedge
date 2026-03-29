/**
 * /api/golf/odds-snapshot
 * Scrapes Bovada golf odds (winner, top 5/10/20, H2H matchups) for all upcoming
 * PGA Tour events and saves snapshots. Runs 3x daily via Vercel cron.
 *
 * FALLBACK RAIL: When Bovada returns empty or <5 winner lines, this route
 * automatically triggers the PGA fallback capture from secondary sources
 * (The Odds API ODDS_API_KEY_2). Results stored in pga_fallback_odds table.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import {
  scrapeBovadaGolfOdds,
  slugify,
  type TournamentOddsSnapshot,
} from "@/lib/golf/bovada-odds-scraper";
import {
  analyzeH2HMatchups,
  analyzeOutrightValue,
  type H2HPick,
  type OutrightPick,
} from "@/lib/golf/h2h-analyzer";
import { runFallbackCapture, type FallbackOddsLine } from "@/lib/golf/fallback-odds-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getEnv(key: string): string {
  const raw = process.env[key] || "";
  return raw.replace(/\\n/g, "").trim();
}

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

interface SnapshotWithAnalysis extends TournamentOddsSnapshot {
  analysis: {
    h2hPicks: H2HPick[];
    outrightValue: OutrightPick[];
    generatedAt: string;
  };
}

async function upsertToSupabase(snapshot: SnapshotWithAnalysis): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    // onConflict=tournament,start_date → later scrapes overwrite the existing row
    const url = `${SUPABASE_URL}/rest/v1/golf_odds_snapshots?on_conflict=tournament,start_date`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        tournament: snapshot.tournament,
        start_date: snapshot.startDate || new Date().toISOString().slice(0, 10),
        scraped_at: snapshot.scrapedAt,
        source: snapshot.source,
        event_id: snapshot.bovadaEventId,
        markets: snapshot.markets,
        analysis: snapshot.analysis,
      }),
    });
    // 404 = table doesn't exist yet (migration pending) — graceful fallback
    if (res.status === 404) return false;
    return res.ok;
  } catch {
    return false;
  }
}

function saveToFile(snapshot: SnapshotWithAnalysis, dateStr: string): boolean {
  try {
    const dir = join(process.cwd(), "data", "golf-odds-snapshots");
    mkdirSync(dir, { recursive: true });
    const slug = slugify(snapshot.tournament);
    const path = join(dir, `${dateStr}-${slug}.json`);
    writeFileSync(path, JSON.stringify(snapshot, null, 2));
    return true;
  } catch {
    return false; // Vercel FS is read-only in prod — expected
  }
}

function alreadySnapshotted(tournament: string, dateStr: string): boolean {
  try {
    const dir = join(process.cwd(), "data", "golf-odds-snapshots");
    const slug = slugify(tournament);
    return existsSync(join(dir, `${dateStr}-${slug}.json`));
  } catch {
    return false;
  }
}

async function storeFallbackLines(lines: FallbackOddsLine[]): Promise<{ stored: number; error: string | null }> {
  if (!SUPABASE_URL || !SUPABASE_KEY || lines.length === 0) {
    return { stored: 0, error: SUPABASE_URL && SUPABASE_KEY ? null : "Supabase not configured" };
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
    if (res.status === 404) return { stored: 0, error: "pga_fallback_odds table not found — run migration" };
    return res.ok ? { stored: rows.length, error: null } : { stored: 0, error: `Supabase ${res.status}` };
  } catch (err) {
    return { stored: 0, error: String(err) };
  }
}

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().slice(0, 10);
  const force = req.nextUrl.searchParams.get("force") === "true";

  // Scrape all upcoming golf events from Bovada
  const snapshots = await scrapeBovadaGolfOdds();

  const results = {
    date: today,
    found: snapshots.map((s) => s.tournament),
    saved: [] as string[],
    skipped: [] as string[],
    h2hPicks: {} as Record<string, H2HPick[]>,
    outrightValue: {} as Record<string, OutrightPick[]>,
    errors: [] as string[],
    fallback: null as null | {
      triggered: boolean;
      reason: string;
      linesStored: number;
      bySource: Record<string, number>;
      byMarket: Record<string, number>;
      limitations: string[];
      storeError: string | null;
    },
  };

  for (const snap of snapshots) {
    // Skip if already snapshotted today (unless forced)
    if (!force && alreadySnapshotted(snap.tournament, today)) {
      results.skipped.push(snap.tournament);
      continue;
    }

    // Run H2H and outright analysis
    const h2hPicks = analyzeH2HMatchups(snap.markets.matchups);
    const outrightValue = analyzeOutrightValue(snap.markets.winner);

    const enriched: SnapshotWithAnalysis = {
      ...snap,
      analysis: {
        h2hPicks,
        outrightValue,
        generatedAt: new Date().toISOString(),
      },
    };

    // Save to file (local dev) + Supabase (prod)
    const fileSaved = saveToFile(enriched, today);
    const dbSaved = await upsertToSupabase(enriched);

    if (fileSaved || dbSaved) {
      results.saved.push(snap.tournament);
      results.h2hPicks[snap.tournament] = h2hPicks.slice(0, 10); // Top 10 H2H picks
      results.outrightValue[snap.tournament] = outrightValue.slice(0, 5);
    } else {
      results.errors.push(`${snap.tournament}: could not save to file or DB`);
    }
  }

  // ── Fallback rail: trigger when Bovada returns no winner lines ──────────────
  // Count total winner lines across all Bovada snapshots
  const bovadaWinnerCount = snapshots.reduce(
    (sum, s) => sum + (s.markets.winner?.length ?? 0),
    0,
  );
  const bovadaFailed = snapshots.length === 0 || bovadaWinnerCount < 5;

  if (bovadaFailed) {
    const fallbackReason =
      snapshots.length === 0
        ? "Bovada returned 0 tournaments"
        : `Bovada returned only ${bovadaWinnerCount} winner lines across ${snapshots.length} tournament(s)`;

    try {
      const { allLines, summary } = await runFallbackCapture();
      const { stored, error: storeError } = await storeFallbackLines(allLines);

      results.fallback = {
        triggered: true,
        reason: fallbackReason,
        linesStored: stored,
        bySource: summary.bySource,
        byMarket: summary.byMarket,
        limitations: summary.limitations,
        storeError,
      };
    } catch (err) {
      results.fallback = {
        triggered: true,
        reason: fallbackReason,
        linesStored: 0,
        bySource: {},
        byMarket: {},
        limitations: [],
        storeError: String(err),
      };
    }
  } else {
    results.fallback = {
      triggered: false,
      reason: `Bovada healthy: ${bovadaWinnerCount} winner lines across ${snapshots.length} tournament(s)`,
      linesStored: 0,
      bySource: {},
      byMarket: {},
      limitations: [],
      storeError: null,
    };
  }

  return NextResponse.json(results);
}
