/**
 * /api/golf/finish-market-odds
 *
 * Serves Top 5 / Top 10 / Top 20 finish-market odds for the Masters
 * (or current active PGA major) from the best available source:
 *
 * Priority order:
 * 1. Manual Oddschecker injection (POST'd data in pga_finish_odds table)
 * 2. Bovada snapshot finish lines (from golf_odds_snapshots table)
 * 3. Provisional odds derived from multi-book winner consensus (The Odds API)
 *    — labeled "Provisional / Reference Market Odds"
 *
 * HONEST LABELING: Every response includes a `source` and `source_label`
 * field. Provisional odds are never presented as verified book lines.
 *
 * GET  /api/golf/finish-market-odds?tournament=masters
 *   → Returns FinishOddsSnapshot JSON
 *
 * POST /api/golf/finish-market-odds
 *   → Ingest manually captured Oddschecker data
 *   → Body: { source: "oddschecker-manual", tournament: string,
 *              markets: { top5: PlayerOddsRow[], top10: [], top20: [] } }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  scrapeOddscheckerFinishMarkets,
  deriveProvisionalFinishOdds,
  americanToImplied,
  type FinishOddsSnapshot,
  type FinishOddsLine,
  type WinnerOddsInput,
} from "@/lib/golf/oddschecker-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function getEnv(key: string): string {
  return (process.env[key] ?? "").replace(/^"|"$/g, "").trim();
}

const SUPABASE_URL = () => getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = () => getEnv("SUPABASE_SERVICE_ROLE_KEY");
const ODDS_API_KEY = () => getEnv("ODDS_API_KEY");

// Masters sport key for The Odds API
const MASTERS_SPORT_KEY = "golf_masters_tournament_winner";

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function readManualInjection(tournament: string): Promise<FinishOddsSnapshot | null> {
  const url = SUPABASE_URL();
  const key = SUPABASE_KEY();
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/pga_finish_odds?tournament=eq.${encodeURIComponent(tournament)}&source=eq.oddschecker-manual&order=captured_at.desc&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{ snapshot: FinishOddsSnapshot }>;
    return rows[0]?.snapshot ?? null;
  } catch {
    return null;
  }
}

async function readBovadaFinishSnapshot(): Promise<FinishOddsSnapshot | null> {
  const url = SUPABASE_URL();
  const key = SUPABASE_KEY();
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/golf_odds_snapshots?select=tournament,scraped_at,markets&order=scraped_at.desc&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = await res.json() as Array<{
      tournament: string;
      scraped_at: string;
      markets: {
        top5?: Array<{ player: string; odds: number }>;
        top10?: Array<{ player: string; odds: number }>;
        top20?: Array<{ player: string; odds: number }>;
      };
    }>;
    const snap = rows[0];
    if (!snap) return null;

    const { tournament, scraped_at, markets } = snap;
    const top5 = markets.top5 ?? [];
    const top10 = markets.top10 ?? [];
    const top20 = markets.top20 ?? [];

    // If Bovada snapshot has no finish lines — fall through
    if (top5.length === 0 && top10.length === 0 && top20.length === 0) return null;

    const makeLines = (
      arr: Array<{ player: string; odds: number }>,
      market: "top5" | "top10" | "top20",
    ): FinishOddsLine[] =>
      arr.map((e) => ({
        player: e.player,
        market,
        odds: e.odds,
        impliedProb: americanToImplied(e.odds),
        source: "bovada-snapshot",
        source_label: "Bovada (scraped)",
        captured_at: scraped_at,
        tournament,
        book: "Bovada",
      }));

    return {
      tournament,
      generatedAt: scraped_at,
      source: "bovada-snapshot",
      source_label: "Bovada (scraped snapshot)",
      limitation: null,
      top5: makeLines(top5, "top5"),
      top10: makeLines(top10, "top10"),
      top20: makeLines(top20, "top20"),
    };
  } catch {
    return null;
  }
}

// Also try local file snapshot (dev fallback)
async function readLocalBovadaSnapshot(): Promise<FinishOddsSnapshot | null> {
  try {
    const { readdirSync, readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const dir = join(process.cwd(), "data", "golf-odds-snapshots");
    if (!existsSync(dir)) return null;

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".json") && (f.includes("masters") || f.includes("the-masters")))
      .sort()
      .reverse();

    if (!files.length) return null;

    const raw = readFileSync(join(dir, files[0]), "utf-8");
    let parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) parsed = parsed[0];
    if (!parsed) return null;

    const markets = parsed.markets ?? {};
    const top5 = markets.top5 ?? [];
    const top10 = markets.top10 ?? [];
    const top20 = markets.top20 ?? [];

    if (top5.length === 0 && top10.length === 0 && top20.length === 0) return null;

    const makeLines = (
      arr: Array<{ player: string; odds: number }>,
      market: "top5" | "top10" | "top20",
    ): FinishOddsLine[] =>
      arr.map((e) => ({
        player: e.player,
        market,
        odds: e.odds,
        impliedProb: americanToImplied(e.odds),
        source: "bovada-snapshot",
        source_label: "Bovada (local snapshot)",
        captured_at: parsed.scrapedAt,
        tournament: parsed.tournament,
        book: "Bovada",
      }));

    return {
      tournament: parsed.tournament,
      generatedAt: parsed.scrapedAt,
      source: "bovada-snapshot",
      source_label: "Bovada (local snapshot)",
      limitation: null,
      top5: makeLines(top5, "top5"),
      top10: makeLines(top10, "top10"),
      top20: makeLines(top20, "top20"),
    };
  } catch {
    return null;
  }
}

// ─── Provisional derivation from The Odds API ─────────────────────────────────

async function buildProvisionalFromOddsApi(tournament: string): Promise<FinishOddsSnapshot> {
  const apiKey = ODDS_API_KEY();

  if (!apiKey || apiKey === "your_key_here") {
    return {
      tournament,
      generatedAt: new Date().toISOString(),
      source: "provisional",
      source_label: "Provisional / Reference Market Odds",
      limitation:
        "ODDS_API_KEY not configured — cannot derive provisional finish odds. " +
        "Set ODDS_API_KEY in .env.local or Vercel env vars.",
      top5: [],
      top10: [],
      top20: [],
    };
  }

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${MASTERS_SPORT_KEY}/odds?apiKey=${apiKey}&regions=us,uk,eu,au&markets=outrights&oddsFormat=american`,
      { next: { revalidate: 1800 } }, // 30-min cache
    );

    if (!res.ok) {
      throw new Error(`Odds API returned ${res.status}`);
    }

    const events = await res.json() as Array<{
      sport_title?: string;
      bookmakers?: Array<{
        title?: string;
        markets?: Array<{
          key?: string;
          outcomes?: Array<{ name?: string; price?: number }>;
        }>;
      }>;
    }>;

    if (!events.length) {
      return deriveProvisionalFinishOdds([], tournament);
    }

    const event = events[0];
    const tournamentName = event.sport_title ?? tournament;

    // Collect all odds per player across all books
    const playerOddsMap = new Map<string, number[]>();

    for (const book of event.bookmakers ?? []) {
      for (const market of book.markets ?? []) {
        if (market.key !== "outrights") continue;
        for (const outcome of market.outcomes ?? []) {
          const name = outcome.name?.trim();
          const price = outcome.price;
          if (!name || typeof price !== "number") continue;
          const existing = playerOddsMap.get(name) ?? [];
          existing.push(price);
          playerOddsMap.set(name, existing);
        }
      }
    }

    // Build WinnerOddsInput using best (highest) odds available
    const players: WinnerOddsInput[] = [];
    for (const [player, allOdds] of Array.from(playerOddsMap.entries())) {
      const bestOdds = allOdds.reduce((best, o) => (o > best ? o : best), allOdds[0]);
      players.push({ player, bestOdds, allOdds });
    }

    // Sort by odds (favorites first)
    players.sort((a, b) => a.bestOdds - b.bestOdds);

    return deriveProvisionalFinishOdds(players, tournamentName);
  } catch (err) {
    return {
      tournament,
      generatedAt: new Date().toISOString(),
      source: "provisional",
      source_label: "Provisional / Reference Market Odds",
      limitation: `Provisional odds unavailable: ${String(err)}`,
      top5: [],
      top10: [],
      top20: [],
    };
  }
}

async function storeManualInjection(body: {
  source: string;
  tournament: string;
  snapshot: FinishOddsSnapshot;
}): Promise<boolean> {
  const url = SUPABASE_URL();
  const key = SUPABASE_KEY();
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/rest/v1/pga_finish_odds`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        tournament: body.tournament,
        source: body.source,
        captured_at: new Date().toISOString(),
        snapshot: body.snapshot,
      }),
    });
    return res.ok || res.status === 404; // 404 = table not yet migrated, don't error
  } catch {
    return false;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const tournament = req.nextUrl.searchParams.get("tournament") ?? "masters";

  // Attempt Oddschecker (will fail + return limitation doc)
  const { lines: ocLines, limitation: ocLimitation } =
    await scrapeOddscheckerFinishMarkets(tournament);
  const hasOddschecker = ocLines.length > 0;

  // Priority 1: manual injection in Supabase
  if (!hasOddschecker) {
    const manual = await readManualInjection(tournament);
    if (manual) {
      return NextResponse.json({
        ...manual,
        _meta: {
          source_priority: "manual-injection",
          oddschecker_status: "blocked",
          oddschecker_limitation: ocLimitation,
        },
      });
    }
  }

  // Priority 2: Bovada snapshot with finish lines (Supabase)
  const bovadaDb = await readBovadaFinishSnapshot();
  if (bovadaDb) {
    return NextResponse.json({
      ...bovadaDb,
      _meta: {
        source_priority: "bovada-supabase",
        oddschecker_status: "blocked",
        oddschecker_limitation: ocLimitation,
      },
    });
  }

  // Priority 3: local Bovada snapshot (dev)
  const bovadaLocal = await readLocalBovadaSnapshot();
  if (bovadaLocal) {
    return NextResponse.json({
      ...bovadaLocal,
      _meta: {
        source_priority: "bovada-local",
        oddschecker_status: "blocked",
        oddschecker_limitation: ocLimitation,
      },
    });
  }

  // Priority 4: provisional from The Odds API multi-book winner consensus
  const provisional = await buildProvisionalFromOddsApi(tournament);

  return NextResponse.json({
    ...provisional,
    _meta: {
      source_priority: "provisional",
      oddschecker_status: "blocked",
      oddschecker_limitation: ocLimitation,
    },
  });
}

// POST: ingest manually captured Oddschecker data
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      source?: string;
      tournament?: string;
      markets?: {
        top5?: Array<{ player: string; odds: number }>;
        top10?: Array<{ player: string; odds: number }>;
        top20?: Array<{ player: string; odds: number }>;
      };
    };

    if (!body.tournament || !body.markets) {
      return NextResponse.json(
        { error: "Missing required fields: tournament, markets" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const source = (body.source ?? "oddschecker-manual") as FinishOddsSnapshot["source"];

    const makeLines = (
      arr: Array<{ player: string; odds: number }>,
      market: "top5" | "top10" | "top20",
    ): FinishOddsLine[] =>
      (arr ?? []).map((e) => ({
        player: e.player,
        market,
        odds: e.odds,
        impliedProb: americanToImplied(e.odds),
        source,
        source_label: "Oddschecker (manual capture)",
        captured_at: now,
        tournament: body.tournament!,
        book: null,
      }));

    const snapshot: FinishOddsSnapshot = {
      tournament: body.tournament,
      generatedAt: now,
      source,
      source_label: "Oddschecker (manual capture)",
      limitation: null,
      top5: makeLines(body.markets.top5 ?? [], "top5"),
      top10: makeLines(body.markets.top10 ?? [], "top10"),
      top20: makeLines(body.markets.top20 ?? [], "top20"),
    };

    const stored = await storeManualInjection({
      source,
      tournament: body.tournament,
      snapshot,
    });

    return NextResponse.json({
      success: true,
      stored,
      linesIngested: {
        top5: snapshot.top5.length,
        top10: snapshot.top10.length,
        top20: snapshot.top20.length,
      },
      message: stored
        ? "Oddschecker data stored — will be used as Priority 1 source"
        : "Stored in memory only (Supabase table pga_finish_odds may not exist yet)",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
