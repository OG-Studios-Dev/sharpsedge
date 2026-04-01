/**
 * GolfTopFinishOddsRail
 *
 * Server component — displays Top 5/10/20 finish-market odds.
 *
 * DATA SOURCE PRIORITY:
 * 1. Bovada scraped snapshot (real verified lines) — golf_odds_snapshots table
 * 2. Provisional / Reference Market Odds from /api/golf/finish-market-odds
 *    — derived from multi-book winner consensus (The Odds API: BetRivers,
 *      FanDuel, DraftKings, BetMGM, BetOnline, Betfair, etc.)
 *    — labeled clearly as provisional/Oddschecker-referenced; NOT real book lines
 * 3. Manual Oddschecker injection (if captured via scripts/capture-oddschecker-odds.mjs)
 *
 * INTEGRITY RULE: Every data source is labeled. Provisional odds are never
 * presented as verified sportsbook lines. The label clearly states the source.
 *
 * Data sources:
 *   - getBovadaTopFinishOdds() → golf_odds_snapshots (Supabase)
 *   - /api/golf/finish-market-odds → provisional derivation or manual injection
 * Populated by: /api/golf/odds-snapshot (3× daily cron via Bovada scraper)
 */

import { AlertTriangle, Info } from "lucide-react";
import { getBovadaTopFinishOdds, type BovadaTopFinishOddsLine } from "@/lib/golf-odds";
import type { GolfPredictionBoard } from "@/lib/types";
import type { FinishOddsSnapshot } from "@/lib/golf/oddschecker-scraper";

function formatOdds(odds: number | null): string {
  if (odds === null || !Number.isFinite(odds)) return "–";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function oddsColor(odds: number | null): string {
  if (odds === null) return "text-gray-500";
  // Negative odds = heavy favorite to place (good outcome, short price) → neutral white
  // Low positive odds = mild underdog → amber
  // High positive odds = long shot → green (valuable)
  if (odds < 0) return "text-white";
  if (odds <= 350) return "text-amber-200";
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

// ─── Provisional finish odds fetch (Oddschecker-referenced) ──────────────────

async function fetchProvisionalFinishOdds(
  tournament: string,
): Promise<FinishOddsSnapshot | null> {
  try {
    // Internal fetch via absolute URL (works in server components)
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const slug = tournament.toLowerCase().includes("master") ? "masters" : "pga";
    const res = await fetch(`${baseUrl}/api/golf/finish-market-odds?tournament=${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as FinishOddsSnapshot;
  } catch {
    return null;
  }
}

// ─── Provisional odds table builder ──────────────────────────────────────────

type ProvisionalRow = {
  player: string;
  top5: number | null;
  top10: number | null;
  top20: number | null;
  impliedProbTop5: number;
};

function buildProvisionalRows(snap: FinishOddsSnapshot): ProvisionalRow[] {
  const top5Map = new Map(snap.top5.map((l) => [l.player.toLowerCase(), l]));
  const top10Map = new Map(snap.top10.map((l) => [l.player.toLowerCase(), l]));
  const top20Map = new Map(snap.top20.map((l) => [l.player.toLowerCase(), l]));

  const allNames = new Set([
    ...snap.top5.map((l) => l.player),
    ...snap.top10.map((l) => l.player),
    ...snap.top20.map((l) => l.player),
  ]);

  const rows: ProvisionalRow[] = Array.from(allNames).map((player) => {
    const key = player.toLowerCase();
    const t5 = top5Map.get(key);
    const t10 = top10Map.get(key);
    const t20 = top20Map.get(key);
    return {
      player,
      top5: t5?.odds ?? null,
      top10: t10?.odds ?? null,
      top20: t20?.odds ?? null,
      impliedProbTop5: t5?.impliedProb ?? t10?.impliedProb ?? 0,
    };
  });

  return rows.sort((a, b) => b.impliedProbTop5 - a.impliedProbTop5);
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

  // ── No Bovada finish lines — try provisional/reference market odds ───────
  if (!bovadaMap || bovadaMap.size === 0) {
    const isMastersTournament =
      tournamentName?.toLowerCase().includes("master") ?? false;

    // Only fetch provisional for Masters (and upcoming majors)
    const provisional = isMastersTournament
      ? await fetchProvisionalFinishOdds(tournamentName ?? "masters").catch(() => null)
      : null;

    if (!provisional || (provisional.top5.length === 0 && provisional.top10.length === 0)) {
      // Full no-odds fallback
      return (
        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Top-Finish Odds</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Top 5 / Top 10 / Top 20</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-gray-400">
              No odds available
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-400">
            <p className="font-medium text-white">No odds available</p>
            <p className="mt-1 text-xs text-gray-500">
              Top 5 / Top 10 / Top 20 lines have not been captured yet.
              The snapshot runs 3× daily via{" "}
              <code className="text-gray-400">/api/golf/odds-snapshot</code>.
            </p>
          </div>
        </section>
      );
    }

    // Render provisional / Oddschecker-referenced odds
    const provRows = buildProvisionalRows(provisional);
    const isManual = provisional.source === "oddschecker-manual";
    const isBovadaFallback = provisional.source === "bovada-snapshot";

    return (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Top-Finish Odds</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Top 5 / Top 10 / Top 20</h2>
          </div>
          <span
            className={
              isManual
                ? "rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200"
                : "rounded-full border border-blue-400/20 bg-blue-400/8 px-3 py-1 text-xs font-semibold text-blue-300"
            }
          >
            {isManual
              ? "Oddschecker · Reference"
              : isBovadaFallback
              ? "Bovada (snapshot)"
              : "Provisional · Reference"}
          </span>
        </div>

        {/* Provisional disclaimer banner */}
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/8 px-3 py-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-blue-400" />
          <p className="text-[11px] leading-relaxed text-blue-200">
            <span className="font-semibold">
              {isManual ? "Oddschecker-referenced" : "Provisional / Reference Market Odds"}
            </span>
            {" — "}
            {isManual
              ? "Manually captured from Oddschecker. These are reference market prices, not direct book-verified lines."
              : "Derived from multi-book winner consensus (BetRivers, FanDuel, DraftKings, BetMGM, Betfair, etc.) using implied-probability scaling. NOT verified sportsbook finish-market lines. For reference only."}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          <span>Top 5: <span className="font-medium text-white">{provisional.top5.length} players</span></span>
          <span>Top 10: <span className="font-medium text-white">{provisional.top10.length} players</span></span>
          <span>Top 20: <span className="font-medium text-white">{provisional.top20.length} players</span></span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Player</th>
                <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Top 5</th>
                <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Top 10</th>
                <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Top 20</th>
              </tr>
            </thead>
            <tbody>
              {provRows.slice(0, 40).map((row, i) => (
                <tr key={row.player} className={`border-b border-white/5 ${i % 2 === 0 ? "bg-black/10" : ""}`}>
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
          {isManual
            ? `Source: Oddschecker (manual capture) · Reference odds only · Generated ${formatScrapedAt(provisional.generatedAt)}`
            : `Source: ${provisional.source_label} · Derived from multi-book winner odds · Generated ${formatScrapedAt(provisional.generatedAt)}`}
          {" · NOT verified book lines for finish markets"}
        </p>
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
            <p className="mt-1 text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle size={11} /> Snapshot is for &ldquo;{snapshotTournament}&rdquo; — may not match current tournament
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
        <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 flex items-center gap-1.5">
          <AlertTriangle size={12} /> {ageWarning}
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
