import { NextResponse } from "next/server";
import { getAggregatedOddsEvents } from "@/lib/odds-aggregator";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const results: Record<string, { games: number; books: string[]; latencyMs: number; status: string }> = {};

  for (const sport of ["NHL", "NBA", "MLB"] as const) {
    const sportStart = Date.now();
    try {
      const events = await getAggregatedOddsEvents(sport);
      const allBooks = new Set<string>();
      events.forEach((e: any) => {
        (e.bookmakers || []).forEach((b: any) => allBooks.add(b.title || b.key || "unknown"));
      });
      results[sport] = {
        games: events.length,
        books: Array.from(allBooks),
        latencyMs: Date.now() - sportStart,
        status: events.length > 0 ? "✅ OK" : "⚠️ No games",
      };
    } catch (err) {
      results[sport] = {
        games: 0,
        books: [],
        latencyMs: Date.now() - sportStart,
        status: `❌ Error: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  return NextResponse.json({
    healthy: Object.values(results).some((r) => r.games > 0),
    totalLatencyMs: Date.now() - start,
    sports: results,
    timestamp: new Date().toISOString(),
  });
}
