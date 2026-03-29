import { GolfHeadToHeadOdds, GolfOddsBoard, GolfOutrightOdds } from "@/lib/types";

const ODDS_BASE = "https://api.the-odds-api.com/v4";
const CACHE_TTL = 15 * 60 * 1000;
const GOLF_MARKETS = "outrights,h2h";
const DEFAULT_SPORT_KEYS = [
  "golf_pga_tour",
  // Masters: primary key per The Odds API docs (also used by fallback-odds-scraper.ts)
  "golf_masters_tournament_winner",
  // Legacy variant kept as fallback in case The Odds API uses alternate naming
  "golf_the_masters_tournament_winner",
  "golf_us_open_winner",
  "golf_the_open_championship_winner",
  "golf_pga_championship_winner",
];

type CacheEntry<T> = { data: T; timestamp: number };
type RawOddsEvent = {
  id?: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{
        name?: string;
        price?: number;
      }>;
    }>;
  }>;
};

const oddsCache = new Map<string, CacheEntry<RawOddsEvent[]>>();

function normalizeEnv(value?: string) {
  return (value ?? "").replace(/^"|"$/g, "").trim();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getGolfSportKeys() {
  const preferred = normalizeEnv(process.env.GOLF_ODDS_SPORT_KEY);
  const fallback = normalizeEnv(process.env.GOLF_ODDS_FALLBACK_KEYS);
  return uniqueValues([
    preferred,
    ...DEFAULT_SPORT_KEYS,
    ...fallback.split(",").map((entry) => entry.trim()),
  ]);
}

function normalizeName(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function impliedProbability(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

async function fetchOddsForSportKey(sportKey: string): Promise<RawOddsEvent[]> {
  const hit = oddsCache.get(sportKey);
  if (hit && Date.now() - hit.timestamp < CACHE_TTL) {
    return hit.data;
  }

  const apiKey = normalizeEnv(process.env.ODDS_API_KEY);
  if (!apiKey || apiKey === "your_key_here") {
    return [];
  }

  try {
    const response = await fetch(
      `${ODDS_BASE}/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=${GOLF_MARKETS}&oddsFormat=american`,
      { next: { revalidate: 900 } },
    );
    if (!response.ok) {
      return [];
    }
    const data = await response.json() as RawOddsEvent[];
    oddsCache.set(sportKey, { data, timestamp: Date.now() });
    return data;
  } catch {
    return [];
  }
}

function inferTournamentLabel(event: RawOddsEvent) {
  const home = (event.home_team ?? "").trim();
  const away = (event.away_team ?? "").trim();
  if (home && away) return `${away} vs ${home}`;
  if (home || away) return home || away;
  return event.sport_title ?? "Golf Tournament";
}

function extractOutrights(events: RawOddsEvent[]): GolfOutrightOdds[] {
  const best = new Map<string, GolfOutrightOdds>();

  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        if (market.key !== "outrights") continue;
        for (const outcome of market.outcomes ?? []) {
          const playerName = outcome.name?.trim();
          const odds = outcome.price;
          const book = bookmaker.title?.trim();
          if (!playerName || typeof odds !== "number" || !book) continue;

          const existing = best.get(normalizeName(playerName));
          if (!existing || odds > existing.odds) {
            best.set(normalizeName(playerName), { playerName, odds, book });
          }
        }
      }
    }
  }

  return Array.from(best.values()).sort((left, right) => impliedProbability(right.odds) - impliedProbability(left.odds));
}

function extractMatchups(events: RawOddsEvent[]): GolfHeadToHeadOdds[] {
  const best = new Map<string, GolfHeadToHeadOdds>();

  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        if (market.key !== "h2h") continue;
        const outcomes = market.outcomes ?? [];
        if (outcomes.length < 2) continue;

        const [first, second] = outcomes;
        const playerA = first?.name?.trim();
        const playerB = second?.name?.trim();
        const playerAOdds = first?.price;
        const playerBOdds = second?.price;
        const book = bookmaker.title?.trim();

        if (!playerA || !playerB || typeof playerAOdds !== "number" || typeof playerBOdds !== "number" || !book) {
          continue;
        }

        const [left, right] = [playerA, playerB].sort((a, b) => a.localeCompare(b));
        const key = `${normalizeName(left)}::${normalizeName(right)}`;
        const existing = best.get(key);
        const candidate = {
          matchup: `${playerA} vs ${playerB}`,
          playerA,
          playerB,
          playerAOdds,
          playerBOdds,
          book,
        };

        const edge = Math.max(playerAOdds, playerBOdds);
        const existingEdge = existing ? Math.max(existing.playerAOdds, existing.playerBOdds) : Number.NEGATIVE_INFINITY;
        if (!existing || edge > existingEdge) {
          best.set(key, candidate);
        }
      }
    }
  }

  return Array.from(best.values())
    .sort((left, right) => Math.max(right.playerAOdds, right.playerBOdds) - Math.max(left.playerAOdds, left.playerBOdds));
}

export async function getGolfOdds(): Promise<GolfOddsBoard | null> {
  const sportKeys = getGolfSportKeys();
  for (const sportKey of sportKeys) {
    const events = await fetchOddsForSportKey(sportKey);
    if (events.length === 0) continue;

    const outrights = extractOutrights(events);
    const h2h = extractMatchups(events);
    const anchorEvent = events.find((event) => (event.bookmakers?.length ?? 0) > 0) ?? events[0];

    return {
      sportKey,
      tournament: inferTournamentLabel(anchorEvent),
      commenceTime: anchorEvent?.commence_time,
      outrights,
      h2h,
    };
  }

  return null;
}

export function findGolfOutright(odds: GolfOddsBoard | null, playerName: string): GolfOutrightOdds | null {
  if (!odds) return null;
  const target = normalizeName(playerName);
  return odds.outrights.find((entry) => normalizeName(entry.playerName) === target) ?? null;
}

// ─── Bovada Top-Finish Odds (from golf_odds_snapshots Supabase table) ─────────
// These are REAL scraped lines from Bovada — not proxy calculations.
// Used in pick generation to replace proxy estimates when real lines exist.

export interface BovadaTopFinishOddsLine {
  top5: number | null;
  top10: number | null;
  top20: number | null;
  book: "Bovada";
  scrapedAt: string;
  tournament: string;
}

export type BovadaTopFinishOddsMap = Map<string, BovadaTopFinishOddsLine>;

interface StoredGolfOddsSnapshot {
  tournament: string;
  scraped_at: string;
  markets: {
    top5?: Array<{ player: string; odds: number }>;
    top10?: Array<{ player: string; odds: number }>;
    top20?: Array<{ player: string; odds: number }>;
  };
}

/**
 * Reads the most recent Bovada golf odds snapshot from Supabase and returns
 * a map of normalized player name → real top-finish odds.
 *
 * Returns null if:
 *   - Supabase is not configured
 *   - No snapshot exists
 *   - The latest snapshot is older than 7 days (stale relative to lock time)
 *
 * HONESTY RULE: This data is sourced from Bovada scrapes only.
 * Never fabricate or interpolate odds — if a player isn't in the snapshot, their
 * entry is absent from the map (caller falls back to proxy or skips the pick).
 */
export async function getBovadaTopFinishOdds(): Promise<BovadaTopFinishOddsMap | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^"|"$/g, "").trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/^"|"$/g, "").trim();

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/golf_odds_snapshots?select=tournament,scraped_at,markets&order=scraped_at.desc&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) return null;

    const rows = await res.json() as StoredGolfOddsSnapshot[];
    const snapshot = rows[0];
    if (!snapshot) return null;

    // Reject stale snapshots (> 7 days old relative to the pick lock window)
    const snapshotAge = Date.now() - new Date(snapshot.scraped_at).getTime();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (snapshotAge > SEVEN_DAYS_MS) return null;

    const markets = snapshot.markets ?? {};
    const top5Map = new Map<string, number>((markets.top5 ?? []).map((e) => [normalizeName(e.player), e.odds]));
    const top10Map = new Map<string, number>((markets.top10 ?? []).map((e) => [normalizeName(e.player), e.odds]));
    const top20Map = new Map<string, number>((markets.top20 ?? []).map((e) => [normalizeName(e.player), e.odds]));

    // Build unified map from all players mentioned in any top-finish market
    const allPlayerKeys = new Set<string>([
      ...Array.from(top5Map.keys()),
      ...Array.from(top10Map.keys()),
      ...Array.from(top20Map.keys()),
    ]);
    const result: BovadaTopFinishOddsMap = new Map();

    for (const key of Array.from(allPlayerKeys)) {
      result.set(key, {
        top5: top5Map.get(key) ?? null,
        top10: top10Map.get(key) ?? null,
        top20: top20Map.get(key) ?? null,
        book: "Bovada",
        scrapedAt: snapshot.scraped_at,
        tournament: snapshot.tournament,
      });
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Look up real Bovada top-finish odds for a specific player.
 * Returns null if the map is unavailable or the player isn't in the snapshot.
 */
export function findBovadaTopFinishOdds(
  map: BovadaTopFinishOddsMap | null,
  playerName: string,
): BovadaTopFinishOddsLine | null {
  if (!map) return null;
  return map.get(normalizeName(playerName)) ?? null;
}
