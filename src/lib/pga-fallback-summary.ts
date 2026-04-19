/**
 * PGA fallback odds summary for UI surfaces.
 *
 * Reads the latest entries from pga_fallback_odds (Supabase) and returns
 * a compact coverage summary for display on the golf page.
 *
 * Coverage facts (honest):
 *   - winner:         live via The Odds API key pool, major tournaments only
 *   - top5/10/20:     scaffolded only — require manual injection or headless browser
 *   - make_cut:       scaffolded only
 */

import { getSupabaseUrl, getSupabaseServiceRoleKey } from "@/lib/supabase-shared";

export type PGAFallbackSummary = {
  available: boolean;
  lastCaptureAt: string | null;
  rowCount: number;
  byMarket: Record<string, number>;
  bySource: Record<string, number>;
  tournaments: string[];
  liveMarkets: string[];
  scaffoldedMarkets: string[];
  limitationNote: string;
};

const LIVE_MARKETS = ["winner"];
const SCAFFOLDED_MARKETS = ["top5", "top10", "top20", "make_cut"];

type FallbackRow = {
  tournament: string;
  source: string;
  market: string;
  captured_at: string;
};

export async function getPGAFallbackSummary(): Promise<PGAFallbackSummary | null> {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/pga_fallback_odds?select=tournament,source,market,captured_at&order=captured_at.desc&limit=200`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: "no-store",
      },
    );

    // Table may not exist yet in some environments
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) return null;

    const rows = (await res.json()) as FallbackRow[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        available: false,
        lastCaptureAt: null,
        rowCount: 0,
        byMarket: {},
        bySource: {},
        tournaments: [],
        liveMarkets: LIVE_MARKETS,
        scaffoldedMarkets: SCAFFOLDED_MARKETS,
        limitationNote:
          "No fallback captures stored yet. Rail is wired — trigger via cron (Monday 06:00 UTC) or POST /api/admin/pga-fallback-capture.",
      };
    }

    const byMarket: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const tournamentsSet = new Set<string>();

    for (const row of rows) {
      byMarket[row.market] = (byMarket[row.market] ?? 0) + 1;
      bySource[row.source] = (bySource[row.source] ?? 0) + 1;
      tournamentsSet.add(row.tournament);
    }

    return {
      available: true,
      lastCaptureAt: rows[0].captured_at,
      rowCount: rows.length,
      byMarket,
      bySource,
      tournaments: Array.from(tournamentsSet),
      liveMarkets: LIVE_MARKETS,
      scaffoldedMarkets: SCAFFOLDED_MARKETS,
      limitationNote:
        "Winner odds are live via The Odds API (major tournaments only). Top 5/10/20 and make-cut require manual injection or a headless scraper — not yet automated.",
    };
  } catch {
    return null;
  }
}
