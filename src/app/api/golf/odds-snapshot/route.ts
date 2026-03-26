/**
 * /api/golf/odds-snapshot
 * Scrapes Bovada golf odds (winner, top 5/10/20, H2H matchups) for all upcoming
 * PGA Tour events and saves snapshots. Runs 3x daily via Vercel cron.
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/golf_odds_snapshots`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        tournament: snapshot.tournament,
        start_date: snapshot.startDate,
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

  return NextResponse.json(results);
}
