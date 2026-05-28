import { NextResponse } from "next/server";
import { getAggregatedOddsEvents } from "@/lib/odds-aggregator";
import type { AggregatedSport } from "@/lib/books/types";

export const dynamic = "force-dynamic";

const SPORTS: AggregatedSport[] = ["NHL", "NBA", "MLB", "NFL", "EPL", "SERIE_A", "PGA"];
const SPORT_TIMEOUT_MS = 2500;

async function checkSport(sport: AggregatedSport) {
  const sportStart = Date.now();
  try {
    const events = await Promise.race([
      getAggregatedOddsEvents(sport),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out after ${SPORT_TIMEOUT_MS}ms`)), SPORT_TIMEOUT_MS);
      }),
    ]);
    const allBooks = new Set<string>();
    events.forEach((e: any) => {
      (e.bookmakers || []).forEach((b: any) => allBooks.add(b.title || b.key || "unknown"));
    });
    return {
      games: events.length,
      books: Array.from(allBooks),
      latencyMs: Date.now() - sportStart,
      status: events.length > 0 ? "✅ OK" : "⚠️ No games",
    };
  } catch (err) {
    return {
      games: 0,
      books: [],
      latencyMs: Date.now() - sportStart,
      status: `❌ Error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export async function GET() {
  const start = Date.now();
  const results: Record<string, { games: number; books: string[]; latencyMs: number; status: string }> = {};

  const sportResults = await Promise.all(SPORTS.map(async (sport) => [sport, await checkSport(sport)] as const));
  for (const [sport, result] of sportResults) {
    results[sport] = result;
  }

  return NextResponse.json({
    name: "The Goose Odds API",
    healthy: Object.values(results).some((r) => r.games > 0),
    totalLatencyMs: Date.now() - start,
    sports: results,
    timestamp: new Date().toISOString(),
  });
}
