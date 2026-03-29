/**
 * GolfTopFinishOddsRail
 *
 * Server component — displays real Bovada top5/top10/top20 odds from the
 * most recent snapshot stored in Supabase (golf_odds_snapshots table).
 *
 * INTEGRITY RULE: If snapshot is null, empty, or absent, this component
 * renders "No odds available" — it NEVER fabricates or estimates odds.
 * Model probability estimates are clearly labeled as model output, not
 * book lines.
 *
 * Data source: getBovadaTopFinishOdds() → golf_odds_snapshots (Supabase)
 * Populated by: /api/golf/odds-snapshot (3× daily cron via Bovada scraper)
 */

import { getBovadaTopFinishOdds, type BovadaTopFinishOddsLine } from "@/lib/golf-odds";
import type { GolfPredictionBoard } from "@/lib/types";

function formatOdds(odds: number | null): string {
  if (odds === null || !Number.isFinite(odds)) return "–";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function oddsColor(odds: number | null): string {
  if (odds === null) return "text-gray-500";
  if (odds < 0) return "text-red-300";
  if (odds <= 200) return "text-amber-200";
  return "text-emerald-300";
}

function formatScrapedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function snapshotAgeWarning(iso: string): string | null {
  try {
    const ageMs = Date.now() - new Date(iso).getTime();
    const hours = ageMs / (1000 * 60 * 60);
    if (hours > 72) return `Snapshot is ${Math.round(hours / 24)}d old — re-trigger /api/golf/odds-snapshot`;
    if (hours > 24) return `Snapshot is ${Math.round(hours)}h old`;
    return null;
  } catch {
    return null;
  }
}

type TopFinishRow = {
  player: string;
  normalizedKey: string;
  top5: number | null;
  top10: number | null;
  top20: number | null;
};

/**
 * Build a ranked list of players from the Bovada snapshot, sorted by
 * implied probability of top5 finish (most likely first).
 * Players with no top5 line fall back to top10, then top20.
 */
function rankTopFinishPlayers(
  map: Map<string, BovadaTopFinishOddsLine>,
): TopFinishRow[] {
  const rows: TopFinishRow[] = [];

  for (const [key, line] of Array.from(map.entries())) {
    rows.push({
      player: line.top5 !== null || line.top10 !== null || line.top20 !== null
        ? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : key,
      normalizedKey: key,
      top5: line.top5,
      top10: line.top10,
      top20: line.top20,
    });
  }

  // Sort by implied prob: top5 best → top10 → top20 → alphabetical fallback
  rows.sort((a, b) => {
    const scoreA = a.top5 !== null ? (a.top5 > 0 ? 100 / (a.top5 + 100) : Math.abs(a.top5) / (Math.abs(a.top5) + 100)) : 0;
    const scoreB = b.top5 !== null ? (b.top5 > 0 ? 100 / (b.top5 + 100) : Math.abs(b.top5) / (Math.abs(b.top5) + 100)) : 0;
    return scoreB - scoreA || a.player.localeCompare(b.player);
  });

  return rows;
}

export default async function GolfTopFinishOddsRail({
  predictions,
}: {
  predictions?: GolfPredictionBoard | null;
}) {
  // Fetch from Supabase snapshot — returns null if unavailable, stale, or empty
  const bovadaMap = await getBovadaTopFinishOdds().catch(() => null);

  // Get tournament from prediction board or snapshot
  const tournamentName = predictions?.tournament?.name ?? null;

  // ── No snapshot case — honest "no odds" display ─────────────────────────
  if (!bovadaMap || bovadaMap.size === 0) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Top-Finish Odds</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Top 5 / Top 10 / Top 20
            </h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-gray-400">
            Bovada · No odds available
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-400">
          <p className="font-medium text-white">No odds available</p>
          <p className="mt-1 text-xs text-gray-500">
            Top 5 / Top 10 / Top 20 lines from Bovada have not been captured yet
            for this tournament. The snapshot captures 3× daily via{" "}
            <code className="text-gray-400">/api/golf/odds-snapshot</code>.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Odds will appear here once Bovada posts pre-tournament markets.
          </p>
        </div>
      </section>
    );
  }

  // ── Snapshot available — render real odds ────────────────────────────────
  const rows = rankTopFinishPlayers(bovadaMap);

  // Grab metadata from the first entry in the map
  const sampleEntry = Array.from(bovadaMap.values())[0];
  const scrapedAt = sampleEntry.scrapedAt;
  const snapshotTournament = sampleEntry.tournament;
  const ageWarning = snapshotAgeWarning(scrapedAt);

  // Check how many players have each market
  const top5Count = rows.filter((r) => r.top5 !== null).length;
  const top10Count = rows.filter((r) => r.top10 !== null).length;
  const top20Count = rows.filter((r) => r.top20 !== null).length;

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Top-Finish Odds</p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            Top 5 / Top 10 / Top 20
          </h2>
          {tournamentName && snapshotTournament && tournamentName !== snapshotTournament ? (
            <p className="mt-1 text-xs text-amber-400">
              ⚠ Snapshot is for &ldquo;{snapshotTournament}&rdquo; — may not match current tournament
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Bovada · Live
          </span>
          <span className="text-xs text-gray-500">
            {formatScrapedAt(scrapedAt)}
          </span>
        </div>
      </div>

      {ageWarning ? (
        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          ⚠ {ageWarning}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <span>Top 5: <span className="font-medium text-white">{top5Count} players</span></span>
        <span>Top 10: <span className="font-medium text-white">{top10Count} players</span></span>
        <span>Top 20: <span className="font-medium text-white">{top20Count} players</span></span>
      </div>

      {/* Odds table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Player
              </th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Top 5
              </th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Top 10
              </th>
              <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Top 20
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((row, i) => (
              <tr
                key={row.normalizedKey}
                className={`border-b border-white/5 ${i % 2 === 0 ? "bg-black/10" : ""}`}
              >
                <td className="py-2 pr-4 font-medium text-white">
                  <span className="mr-2 text-xs text-gray-500">{i + 1}</span>
                  {row.player}
                </td>
                <td className={`py-2 text-right font-semibold tabular-nums ${oddsColor(row.top5)}`}>
                  {formatOdds(row.top5)}
                </td>
                <td className={`py-2 text-right font-semibold tabular-nums ${oddsColor(row.top10)}`}>
                  {formatOdds(row.top10)}
                </td>
                <td className={`py-2 text-right font-semibold tabular-nums ${oddsColor(row.top20)}`}>
                  {formatOdds(row.top20)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-gray-600">
        Source: Bovada · American odds · Scraped {formatScrapedAt(scrapedAt)} ·
        No fabrication — if odds were not on Bovada at scrape time, they show as –
      </p>
    </section>
  );
}
