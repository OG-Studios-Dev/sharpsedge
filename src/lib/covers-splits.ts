/**
 * covers-splits.ts
 * Covers.com public consensus betting splits ingestion.
 *
 * Source:  contests.covers.com / www.covers.com
 * Method:  HTML scraping (no public JSON API found — confirmed via dev-tools investigation).
 *
 * Access path:
 *   1. GET https://www.covers.com/sports/{sport}/matchups
 *      → extracts Covers game IDs from "matchupconsensusdetails?gameId=N" hrefs
 *   2. GET https://contests.covers.com/consensus/matchupconsensusdetails?gameId=N
 *      → redirects to UUID-based URL; parses HTML for consensus splits
 *
 * Coverage:
 *   - NBA: ✅ full coverage (~9 games/day)
 *   - NHL: ✅ full coverage (~6 games/day)
 *   - MLB: ✅ full coverage (~12 games/day)
 *   - NFL: ❌ off-season — 0 games on Covers matchups page
 *
 * Data available from Covers:
 *   - ATS (spread) picks% — away vs home
 *   - O/U (total) picks% — over vs under
 *   - Approximate consensus line
 *   - Team names (full/common names, e.g. "L.A. Clippers", "Milwaukee")
 *
 * NOT available from Covers (confirmed missing from HTML):
 *   - Moneyline splits — Covers does not publish ML consensus picks
 *   - Handle/money% — only tickets/picks counts, no dollar-weighted splits
 *
 * Matching strategy:
 *   - Match to Action Network games via normalised team name substring matching
 *   - Falls back to position/index match when name matching is ambiguous
 *
 * Rate limit: 1 req per game + 1 per sport list page ≈ 10–15 req/sport on a full day.
 *   Use concurrency: 3 cap to avoid hammering Covers.
 */

import type { BettingSplitsSport } from "@/lib/betting-splits";

// ── Public types ──────────────────────────────────────────────────────────────

export type CoversSplitsEntry = {
  /** Always "covers" */
  source: "covers";
  sport: BettingSplitsSport;
  /** Covers internal game ID */
  coversGameId: string;
  /** Covers UUID URL slug */
  coversUuid: string | null;
  /** Away team common name (as Covers labels it) */
  awayTeamCovers: string;
  /** Home team common name (as Covers labels it) */
  homeTeamCovers: string;
  /** Away team spread picks% (0–100) */
  spreadAwayPct: number | null;
  /** Home team spread picks% (0–100) */
  spreadHomePct: number | null;
  /** Over picks% (0–100) */
  totalOverPct: number | null;
  /** Under picks% (0–100) */
  totalUnderPct: number | null;
  /** Consensus line (best estimate from Covers table; may vary from opening/closing) */
  consensusSpreadLine: number | null;
  /** Consensus total line (best estimate) */
  consensusTotalLine: number | null;
  /** ISO timestamp of when this entry was scraped */
  scrapedAt: string;
};

export type CoversBoardResult = {
  sport: BettingSplitsSport;
  scrapedAt: string;
  entries: CoversSplitsEntry[];
  gamesFound: number;
  gamesWithSplits: number;
  available: boolean;
  blocker: string | null;
};

// ── Sport path mapping ────────────────────────────────────────────────────────

const COVERS_MATCHUP_SPORT: Record<BettingSplitsSport, string | null> = {
  NBA: "nba",
  NHL: "nhl",
  MLB: "mlb",
  NFL: null, // NFL off-season; Covers has no current games → null = skip
};

const COVERS_HOST = "https://www.covers.com";
const COVERS_CONSENSUS_HOST = "https://contests.covers.com";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── HTML parsing helpers ──────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractPercent(html: string): number | null {
  const m = html.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : null;
}

function extractFirstNumber(text: string): number | null {
  const m = text.match(/[-+]?(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Extract game IDs from the Covers matchups page HTML.
 */
function parseMatchupGameIds(html: string): string[] {
  const ids: string[] = [];
  const re = /matchupconsensusdetails\?gameId=(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/**
 * Parse one Covers consensus detail page.
 * Returns structured consensus data or null if page is not parseable.
 */
function parseConsensusDetailPage(
  html: string,
  sport: BettingSplitsSport,
  gameId: string,
  uuid: string | null,
  scrapedAt: string,
): CoversSplitsEntry | null {
  // Extract team names from the title tag:
  // "NBA Picks - {Away} vs {Home} Consensus | M/D/YYYY"
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  let awayTeam = "";
  let homeTeam = "";
  if (titleMatch) {
    const title = titleMatch[1];
    const teamMatch = title.match(/Picks\s*[-–]\s*(.+?)\s+vs\s+(.+?)\s+Consensus/i);
    if (teamMatch) {
      awayTeam = teamMatch[1].trim();
      homeTeam = teamMatch[2].trim();
    }
  }

  if (!awayTeam && !homeTeam) {
    // Fallback: look for alt="TeamName" in img tags (team logos)
    const altRe = /alt="([^"]{2,40})"/g;
    const altMatches: string[] = [];
    let altM: RegExpExecArray | null;
    while ((altM = altRe.exec(html)) !== null) {
      altMatches.push(altM[1]);
    }
    const teams = altMatches.filter((t) => /^[A-Z]/.test(t) && !t.includes("logo") && !t.includes("icon"));
    if (teams.length >= 2) {
      awayTeam = teams[0];
      homeTeam = teams[1];
    }
  }

  // --- ATS section ---
  let spreadAwayPct: number | null = null;
  let spreadHomePct: number | null = null;
  let consensusSpreadLine: number | null = null;

  const atsIdx = html.indexOf("ATS Consensus");
  if (atsIdx >= 0) {
    const atsSection = html.slice(atsIdx, atsIdx + 4000);

    // sideHeadLeft = away picks%
    const leftMatch = atsSection.match(
      /sideHeadLeft[^>]*>[\s\S]{0,200}?(\d{1,3})\s*%/,
    );
    if (leftMatch) spreadAwayPct = parseInt(leftMatch[1], 10);

    // sideHeadRight = home picks%
    const rightMatch = atsSection.match(
      /sideHeadRight[^>]*>[\s\S]{0,200}?(\d{1,3})\s*%/,
    );
    if (rightMatch) spreadHomePct = parseInt(rightMatch[1], 10);

    // Extract spread line — the "most wagered" line row (highest awayWagers + homeWagers)
    // Lines are in awayLine/homeLine divs. Parse all line/wager pairs.
    const lineRe =
      /awayLine[^>]*>([-+]?\d+(?:\.\d+)?)<\/div>[\s\S]{0,400}?awayWagers[^>]*>(\d+)<[\s\S]{0,400}?homeWagers[^>]*>(\d+)</g;
    let bestWagers = 0;
    let bestLine: number | null = null;
    let lr: RegExpExecArray | null;
    while ((lr = lineRe.exec(atsSection)) !== null) {
      const line = parseFloat(lr[1]);
      const wagers = parseInt(lr[2], 10) + parseInt(lr[3], 10);
      if (wagers > bestWagers) {
        bestWagers = wagers;
        bestLine = line;
      }
    }
    consensusSpreadLine = bestLine;
  }

  // --- O/U section ---
  let totalOverPct: number | null = null;
  let totalUnderPct: number | null = null;
  let consensusTotalLine: number | null = null;

  const ouIdx = html.indexOf("O/U Consensus");
  if (ouIdx >= 0) {
    const ouSection = html.slice(ouIdx, ouIdx + 4000);

    // sideHeadLeft = over picks%
    const overMatch = ouSection.match(
      /sideHeadLeft[^>]*>[\s\S]{0,200}?(\d{1,3})\s*%/,
    );
    if (overMatch) totalOverPct = parseInt(overMatch[1], 10);

    // sideHeadRight = under picks%
    const underMatch = ouSection.match(
      /sideHeadRight[^>]*>[\s\S]{0,200}?(\d{1,3})\s*%/,
    );
    if (underMatch) totalUnderPct = parseInt(underMatch[1], 10);

    // Parse line/wager pairs for totals
    let bestTotal: number | null = null;
    let bestTotalWagers = 0;
    const totalLineFullRe =
      /sideHeadMiddle[^>]*>([\d.]+)<\/div>[\s\S]{0,400}?awayWagers[^>]*>(\d+)<[\s\S]{0,400}?homeWagers[^>]*>(\d+)</g;
    let tlrFull: RegExpExecArray | null;
    while ((tlrFull = totalLineFullRe.exec(ouSection)) !== null) {
      const line = parseFloat(tlrFull[1]);
      const wagers = parseInt(tlrFull[2], 10) + parseInt(tlrFull[3], 10);
      if (wagers > bestTotalWagers) {
        bestTotalWagers = wagers;
        bestTotal = line;
      }
    }
    // Fallback: just take first total line number from sideHeadMiddle
    if (bestTotal === null) {
      const middleNumRe = /sideHeadMiddle[^>]*>([\d.]+)</g;
      let mn: RegExpExecArray | null;
      while ((mn = middleNumRe.exec(ouSection)) !== null) {
        const n = parseFloat(mn[1]);
        if (n > 50) {
          // realistic total (not picks count)
          bestTotal = n;
          break;
        }
      }
    }
    consensusTotalLine = bestTotal;
  }

  const hasSplits =
    spreadAwayPct !== null || spreadHomePct !== null || totalOverPct !== null;
  if (!hasSplits) return null;

  return {
    source: "covers",
    sport,
    coversGameId: gameId,
    coversUuid: uuid,
    awayTeamCovers: awayTeam,
    homeTeamCovers: homeTeam,
    spreadAwayPct,
    spreadHomePct,
    totalOverPct,
    totalUnderPct,
    consensusSpreadLine,
    consensusTotalLine,
    scrapedAt,
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function fetchConsensusDetailForGame(
  gameId: string,
  sport: BettingSplitsSport,
  scrapedAt: string,
): Promise<CoversSplitsEntry | null> {
  const url = `${COVERS_CONSENSUS_HOST}/consensus/matchupconsensusdetails?gameId=${gameId}`;
  try {
    const res = await fetchWithTimeout(url, 10000);
    if (!res.ok) return null;
    const html = await res.text();

    // Extract the UUID from the final redirected URL
    const finalUrl = res.url ?? url;
    const uuidMatch = finalUrl.match(/matchupconsensusdetails\/([a-f0-9-]{36})/);
    const uuid = uuidMatch ? uuidMatch[1] : null;

    return parseConsensusDetailPage(html, sport, gameId, uuid, scrapedAt);
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch Covers consensus splits for one sport.
 *
 * Steps:
 *   1. Load the sport matchups page to discover game IDs.
 *   2. Fetch each game's consensus detail page in parallel (concurrency capped at 3).
 *   3. Parse ATS% and O/U% from each page.
 *
 * @param sport  "NBA" | "NHL" | "MLB" | "NFL"
 */
export async function getCoversSplits(sport: BettingSplitsSport): Promise<CoversBoardResult> {
  const scrapedAt = new Date().toISOString();
  const sportSlug = COVERS_MATCHUP_SPORT[sport];

  if (sportSlug === null) {
    return {
      sport,
      scrapedAt,
      entries: [],
      gamesFound: 0,
      gamesWithSplits: 0,
      available: false,
      blocker: `${sport}: Covers matchups page not applicable (off-season or no public splits).`,
    };
  }

  // Step 1: load matchups page
  let matchupsHtml: string;
  try {
    const res = await fetchWithTimeout(`${COVERS_HOST}/sports/${sportSlug}/matchups`, 10000);
    if (!res.ok) {
      return {
        sport,
        scrapedAt,
        entries: [],
        gamesFound: 0,
        gamesWithSplits: 0,
        available: false,
        blocker: `Covers matchups page returned ${res.status} for ${sport}`,
      };
    }
    matchupsHtml = await res.text();
  } catch (err) {
    return {
      sport,
      scrapedAt,
      entries: [],
      gamesFound: 0,
      gamesWithSplits: 0,
      available: false,
      blocker: `Covers matchups fetch error for ${sport}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const gameIds = parseMatchupGameIds(matchupsHtml);
  if (gameIds.length === 0) {
    return {
      sport,
      scrapedAt,
      entries: [],
      gamesFound: 0,
      gamesWithSplits: 0,
      available: false,
      blocker: `Covers matchups page returned 0 game IDs for ${sport} — no games today or page structure changed`,
    };
  }

  // Step 2: fetch consensus detail pages in parallel (concurrency cap = 3)
  const CONCURRENCY = 3;
  const entries: CoversSplitsEntry[] = [];

  for (let i = 0; i < gameIds.length; i += CONCURRENCY) {
    const batch = gameIds.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((id) => fetchConsensusDetailForGame(id, sport, scrapedAt)),
    );
    for (const r of results) {
      if (r) entries.push(r);
    }
  }

  return {
    sport,
    scrapedAt,
    entries,
    gamesFound: gameIds.length,
    gamesWithSplits: entries.length,
    available: entries.length > 0,
    blocker: entries.length === 0
      ? "Covers consensus parse returned no splits — page structure may have changed"
      : null,
  };
}

/**
 * Fetch Covers consensus splits for all covered sports in parallel.
 * NFL returns immediately as blocked (off-season).
 */
export async function getCoversSplitsCrossSport(): Promise<
  Record<BettingSplitsSport, CoversBoardResult>
> {
  const sports: BettingSplitsSport[] = ["NBA", "NHL", "MLB", "NFL"];
  const results = await Promise.all(sports.map((s) => getCoversSplits(s)));
  return Object.fromEntries(sports.map((s, i) => [s, results[i]])) as Record<
    BettingSplitsSport,
    CoversBoardResult
  >;
}

// ── Team name matching helper ─────────────────────────────────────────────────

/**
 * Check if a Covers team name (common/city name) matches a given AN full team name.
 * Both are lowercased and compared as substrings.
 *
 * Examples:
 *   coversName="Milwaukee"      anFull="Milwaukee Bucks"      → true
 *   coversName="L.A. Clippers"  anFull="LA Clippers"          → true
 *   coversName="Golden State"   anFull="Golden State Warriors" → true
 */
export function coversTeamMatchesAn(coversName: string, anFull: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const cn = norm(coversName);
  const an = norm(anFull);

  if (!cn || !an) return false;
  return an.includes(cn) || cn.includes(an);
}
