/**
 * ufcstats-scraper.ts
 *
 * Scrapes ufcstats.com for historical UFC fighter data.
 * Used as a SUPPLEMENT to src/lib/ufc-api.ts which handles:
 *   - Upcoming events + scheduled fights (API-Sports MMA, 3-day rolling window)
 *   - Live odds via Odds API (mma_mixed_martial_arts)
 *
 * This module adds:
 *   - Career records (W/L/D/NC)
 *   - Fighter stats (SLpM, SApM, str accuracy/defense, TD stats, sub avg)
 *   - Historical fight results (method, round, time)
 *
 * Scrapes ufcstats.com for educational/personal use. Not for commercial redistribution.
 *
 * No external dependencies — uses built-in fetch + regex/string parsing only.
 */

// ─── In-memory cache (10 min TTL) ────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UFCFighterRecord {
  name: string;
  wins: number;
  losses: number;
  draws: number;
  noContests: number;
  weightClass: string;
  height: string;
  reach: string;
  stance: string;
  url: string;
}

export interface UFCFighterStats {
  slpm: number;       // Significant strikes landed per minute
  sapm: number;       // Significant strikes absorbed per minute
  strAccuracy: number; // Strike accuracy %
  strDefense: number;  // Strike defense %
  tdAvg: number;       // Takedown average per 15 min
  tdAccuracy: number;  // Takedown accuracy %
  tdDefense: number;   // Takedown defense %
  subAvg: number;      // Submission attempt average per 15 min
}

export interface UFCFight {
  fighter1: string;
  fighter2: string;
  weightClass: string;
  method: string;   // "KO/TKO" | "Submission" | "Decision - Unanimous" | etc.
  round: number;
  time: string;
  winner: string;   // fighter1 name if fighter1 won, fighter2 name if fighter2 won, "" if draw/NC
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractText(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function parsePercent(val: string): number {
  const n = parseFloat(val.replace('%', '').trim());
  return isNaN(n) ? 0 : n;
}

function parseFloat2(val: string): number {
  const n = parseFloat(val.trim());
  return isNaN(n) ? 0 : n;
}

function parseInt2(val: string): number {
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? 0 : n;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchHtml(url: string): Promise<string | null> {
  const cached = getCached<string>(url);
  if (cached) return cached;

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    setCached(url, html);
    return html;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search ufcstats.com for a fighter by name.
 * Returns array of { name, url, record } matches.
 */
export async function searchUFCFighter(
  name: string
): Promise<Array<{ name: string; url: string; record: string }>> {
  try {
    const encoded = encodeURIComponent(name);
    const url = `http://www.ufcstats.com/statistics/fighters?action=search&SearchStr=${encoded}&page=all`;
    const html = await fetchHtml(url);
    if (!html) return [];

    const results: Array<{ name: string; url: string; record: string }> = [];

    // Each fighter row has a link to their page
    const rowRegex = /<tr[^>]*class="b-statistics__table-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];
      const linkMatch = row.match(/href="(http:\/\/www\.ufcstats\.com\/fighter-details\/[^"]+)"/i);
      if (!linkMatch) continue;

      const fighterUrl = linkMatch[1];

      // Extract cells
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
        stripTags(m[1])
      );

      if (cells.length < 3) continue;

      // Typical columns: First, Last, Nickname, Ht., Wt., Reach, Stance, W, L, D
      const firstName = cells[0] ?? '';
      const lastName = cells[1] ?? '';
      const wins = cells[7] ?? '';
      const losses = cells[8] ?? '';
      const draws = cells[9] ?? '';

      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) continue;

      results.push({
        name: fullName,
        url: fighterUrl,
        record: `${wins}-${losses}-${draws}`,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Fetch a fighter's career record and physical stats by their ufcstats.com URL.
 * Returns null on any error.
 */
export async function getUFCFighterRecord(fighterName: string): Promise<UFCFighterRecord | null> {
  try {
    const results = await searchUFCFighter(fighterName);
    if (!results.length) return null;

    // Take best match — first result
    const best = results[0];
    const html = await fetchHtml(best.url);
    if (!html) return null;

    // Parse record from the fighter detail page
    // Pattern: W-L-D shown in the record section
    const recordMatch = html.match(/(\d+)-(\d+)-(\d+)(?:\s*\((\d+)\s*NC\))?/);
    const wins = recordMatch ? parseInt2(recordMatch[1]) : 0;
    const losses = recordMatch ? parseInt2(recordMatch[2]) : 0;
    const draws = recordMatch ? parseInt2(recordMatch[3]) : 0;
    const noContests = recordMatch?.[4] ? parseInt2(recordMatch[4]) : 0;

    // Physical stats from info list
    const heightMatch = html.match(/Height:<\/i>\s*<span[^>]*>([^<]+)<\/span>/i);
    const reachMatch = html.match(/Reach:<\/i>\s*<span[^>]*>([^<]+)<\/span>/i);
    const stanceMatch = html.match(/STANCE:<\/i>\s*<span[^>]*>([^<]+)<\/span>/i);
    const weightClassMatch = html.match(/Weight class[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);

    return {
      name: best.name,
      wins,
      losses,
      draws,
      noContests,
      weightClass: weightClassMatch ? stripTags(weightClassMatch[1]) : '',
      height: heightMatch ? stripTags(heightMatch[1]) : '',
      reach: reachMatch ? stripTags(reachMatch[1]) : '',
      stance: stanceMatch ? stripTags(stanceMatch[1]) : '',
      url: best.url,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a fighter's career performance stats from their ufcstats.com page URL.
 * Returns null on any error.
 */
export async function getUFCFighterStats(fighterUrl: string): Promise<UFCFighterStats | null> {
  try {
    const html = await fetchHtml(fighterUrl);
    if (!html) return null;

    // Stats are in a table with labels like "SLpM", "Str. Acc.", etc.
    // Pattern: <td ...>value</td> in the career statistics section
    const slpmMatch = html.match(/SLpM[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i)
      ?? html.match(/<td[^>]*>\s*([\d.]+)\s*<\/td>[\s\S]*?SLpM/i);
    const sapmMatch = html.match(/SApM[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i);
    const strAccMatch = html.match(/Str\.?\s*Acc\.?[\s\S]*?<span[^>]*>([\d.]+%?)<\/span>/i);
    const strDefMatch = html.match(/Str\.?\s*Def\.?[\s\S]*?<span[^>]*>([\d.]+%?)<\/span>/i);
    const tdAvgMatch = html.match(/TD\s*Avg\.?[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i);
    const tdAccMatch = html.match(/TD\s*Acc\.?[\s\S]*?<span[^>]*>([\d.]+%?)<\/span>/i);
    const tdDefMatch = html.match(/TD\s*Def\.?[\s\S]*?<span[^>]*>([\d.]+%?)<\/span>/i);
    const subAvgMatch = html.match(/Sub\.?\s*Avg\.?[\s\S]*?<span[^>]*>([\d.]+)<\/span>/i);

    // Fallback: try scraping the stat boxes in order
    // ufcstats fighter page has stats in consistent box format
    const statBoxMatches = html.matchAll(/<p[^>]*class="b-list__box-list-item[^"]*"[^>]*>([\s\S]*?)<\/p>/gi);
    const statBoxes: string[] = [];
    for (const m of Array.from(statBoxMatches)) {
      statBoxes.push(stripTags(m[1]));
    }

    const findStat = (label: string): string => {
      const box = statBoxes.find((b) => b.toLowerCase().includes(label.toLowerCase()));
      if (!box) return '0';
      return box.replace(new RegExp(label, 'i'), '').trim();
    };

    return {
      slpm: slpmMatch ? parseFloat2(slpmMatch[1]) : parseFloat2(findStat('SLpM')),
      sapm: sapmMatch ? parseFloat2(sapmMatch[1]) : parseFloat2(findStat('SApM')),
      strAccuracy: strAccMatch ? parsePercent(strAccMatch[1]) : parsePercent(findStat('Str. Acc')),
      strDefense: strDefMatch ? parsePercent(strDefMatch[1]) : parsePercent(findStat('Str. Def')),
      tdAvg: tdAvgMatch ? parseFloat2(tdAvgMatch[1]) : parseFloat2(findStat('TD Avg')),
      tdAccuracy: tdAccMatch ? parsePercent(tdAccMatch[1]) : parsePercent(findStat('TD Acc')),
      tdDefense: tdDefMatch ? parsePercent(tdDefMatch[1]) : parsePercent(findStat('TD Def')),
      subAvg: subAvgMatch ? parseFloat2(subAvgMatch[1]) : parseFloat2(findStat('Sub. Avg')),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch fight results from a UFC event page URL.
 * Returns empty array on any error.
 */
export async function getUFCEventFights(eventUrl: string): Promise<UFCFight[]> {
  try {
    const html = await fetchHtml(eventUrl);
    if (!html) return [];

    const fights: UFCFight[] = [];

    // Each fight row in the results table
    const rowRegex = /<tr[^>]*class="b-fight-details__table-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const row = rowMatch[1];
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
        stripTags(m[1])
      );

      if (cells.length < 8) continue;

      // Typical columns: W/L, Fighter, Fighter, Weight class, Method, Round, Time, Time format
      const resultCell = cells[0] ?? '';
      const fighter1Cell = cells[1] ?? '';
      const fighter2Cell = cells[2] ?? '';
      const weightClass = cells[3] ?? '';
      const method = cells[4] ?? '';
      const round = parseInt2(cells[5] ?? '0');
      const time = cells[6] ?? '';

      // Fighter names may be multi-line in the cell
      const f1Names = fighter1Cell.split(/\s{2,}/).filter(Boolean);
      const f2Names = fighter2Cell.split(/\s{2,}/).filter(Boolean);
      const fighter1 = f1Names[0] ?? fighter1Cell;
      const fighter2 = f2Names[0] ?? fighter2Cell;

      if (!fighter1 || !fighter2) continue;

      // Winner: "win" in result col = fighter1 won, "loss" = fighter2 won
      const winner =
        resultCell.toLowerCase().includes('win') ? fighter1 :
        resultCell.toLowerCase().includes('loss') ? fighter2 : '';

      fights.push({ fighter1, fighter2, weightClass, method, round, time, winner });
    }

    return fights;
  } catch {
    return [];
  }
}
