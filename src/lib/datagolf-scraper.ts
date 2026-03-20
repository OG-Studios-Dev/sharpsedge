/**
 * DataGolf Public Page Scraper
 * Scrapes DataGolf public pages for PGA rankings, predictions, course-fit, and field data.
 *
 * NOTE:
 * DataGolf changed several public URLs in March 2026.
 * Older routes like /rankings and /predictive-model/pre-tournament now 404.
 * The current public pages embed JSON blobs in inline scripts, so we parse those directly.
 */
import * as cheerio from "cheerio";

const DG_BASE = "https://datagolf.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const DELAY_MS = 2500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DGPage {
  html: string;
  $: cheerio.CheerioAPI;
  url: string;
}

async function fetchPage(path: string): Promise<DGPage | null> {
  try {
    const url = `${DG_BASE}${path}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://datagolf.com/",
      },
    });

    const html = await res.text();
    if (!res.ok) {
      console.error(`[DG Scraper] ${res.status} for ${url}`);
      return {
        html,
        $: cheerio.load(html),
        url: res.url,
      };
    }

    return {
      html,
      $: cheerio.load(html),
      url: res.url,
    };
  } catch (err) {
    console.error(`[DG Scraper] fetch error for ${path}:`, err);
    return null;
  }
}

// --- Types ---

export interface DGPlayerRanking {
  name: string;
  rank: number;
  dgRating: number | null;
  sgTotal: number | null;
  sgOTT: number | null;
  sgAPP: number | null;
  sgARG: number | null;
  sgPUTT: number | null;
  sgT2G: number | null;
}

export interface DGPrediction {
  name: string;
  winProb: number | null;
  top5Prob: number | null;
  top10Prob: number | null;
  top20Prob: number | null;
  makeCutProb: number | null;
}

export interface DGCourseFit {
  name: string;
  fitScore: number | null;
  fitRank: number | null;
}

export interface DGFieldPlayer {
  name: string;
  country: string;
  worldRank: number | null;
}

export interface DGScrapeResult {
  timestamp: string;
  tournament: string;
  rankings: DGPlayerRanking[];
  predictions: DGPrediction[];
  courseFit: DGCourseFit[];
  field: DGFieldPlayer[];
  errors: string[];
}

// --- Helpers ---

function parseNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val !== "string") return null;
  const cleaned = val.replace(/[^0-9.\-]/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizePlayerName(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  if (raw.includes(",")) {
    const [last, first] = raw.split(",", 2).map((part) => part.trim()).filter(Boolean);
    if (first && last) return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }

  return raw.replace(/\s+/g, " ").trim();
}

function uniqueByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const results: T[] = [];

  for (const row of rows) {
    const key = row.name.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(row);
  }

  return results;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractJsonParseVariable<T = unknown>(html: string, variableNames: string[]): T | null {
  for (const variableName of variableNames) {
    const regex = new RegExp(
      `(?:(?:var|let|const)\\s+)?${escapeRegex(variableName)}\\s*=\\s*JSON\\.parse\\('([\\s\\S]*?)'\\);`,
      "m",
    );
    const match = html.match(regex);
    if (!match?.[1]) continue;

    try {
      return JSON.parse(match[1]) as T;
    } catch (err) {
      console.error(`[DG Scraper] Failed to parse JSON.parse payload for ${variableName}:`, err);
    }
  }

  return null;
}

function extractCurrentCourse(html: string): string | null {
  const match = html.match(/var\s+current_course\s*=\s*"([\s\S]*?)";/);
  if (!match?.[1]) return null;
  return decodeHtmlEntities(match[1]).trim();
}

function extractTitleTournament($: cheerio.CheerioAPI): string {
  const title = $("title").text().trim();
  if (!title) return "";
  return title.split("|")[0]?.trim() || title;
}

// --- Scraper Functions ---

export async function fetchDGRankings(): Promise<DGPlayerRanking[]> {
  const page = await fetchPage("/datagolf-rankings");
  if (!page) return [];

  const payload = extractJsonParseVariable<{
    data?: {
      table_data?: {
        data?: Array<Record<string, unknown>>;
      };
    };
  }>(page.html, ["reload_data"]);

  const rows = payload?.data?.table_data?.data;
  if (!Array.isArray(rows)) return [];

  return uniqueByName(rows.map((player) => ({
    name: normalizePlayerName(
      typeof player.player_name === "string"
        ? player.player_name
        : `${String(player.first || "")} ${String(player.last || "")}`,
    ),
    rank: parseNumber(player.dg_rank) ?? parseNumber(player.rank) ?? 0,
    dgRating: parseNumber(player.dg_skill),
    sgTotal: parseNumber(player.dg_skill),
    sgOTT: null,
    sgAPP: null,
    sgARG: null,
    sgPUTT: null,
    sgT2G: null,
  }))).filter((player) => player.name && player.rank > 0);
}

export async function fetchDGPredictions(): Promise<{ tournament: string; predictions: DGPrediction[] }> {
  await delay(DELAY_MS);
  const page = await fetchPage("/predictions/pga-tour");
  if (!page) return { tournament: "", predictions: [] };

  const rows = extractJsonParseVariable<Array<Record<string, unknown>>>(page.html, ["probs"]);
  if (!Array.isArray(rows)) {
    return { tournament: "", predictions: [] };
  }

  const predictions = uniqueByName(rows.map((row) => ({
    name: normalizePlayerName(row.player_name ?? row.pga_name ?? row.name),
    winProb: parseNumber(row.win),
    top5Prob: parseNumber(row.top_5),
    top10Prob: parseNumber(row.top_10),
    top20Prob: parseNumber(row.top_20),
    makeCutProb: parseNumber(row.make_cut),
  }))).filter((player) => player.name);

  const tournament = typeof rows[0]?.event_name === "string"
    ? String(rows[0].event_name).trim()
    : extractTitleTournament(page.$);

  return { tournament, predictions };
}

export async function fetchDGCourseFit(): Promise<DGCourseFit[]> {
  await delay(DELAY_MS);
  const page = await fetchPage("/course-fit-tool");
  if (!page) return [];

  const currentCourse = extractCurrentCourse(page.html);
  const payload = extractJsonParseVariable<Record<string, {
    data?: Array<Record<string, unknown>>;
    event_name?: string;
  }> & {
    players?: {
      data?: Array<Record<string, unknown>>;
      event_name?: string;
    };
  }>(page.html, ["reload_data"]);

  if (!payload) return [];

  const currentData = (currentCourse && payload[currentCourse])
    ? payload[currentCourse]
    : Object.values(payload).find((entry) => Array.isArray(entry?.data));

  const rows = Array.isArray(payload.players?.data)
    ? payload.players.data
    : currentData?.data;
  if (!Array.isArray(rows)) return [];

  const rankedRows = rows
    .map((row) => ({
      name: normalizePlayerName(row.player_name ?? row.name),
      fitScore: parseNumber(row.total_comp),
    }))
    .filter((row) => row.name)
    .sort((left, right) => (right.fitScore ?? Number.NEGATIVE_INFINITY) - (left.fitScore ?? Number.NEGATIVE_INFINITY));

  return rankedRows.map((row, index) => ({
    name: row.name,
    fitScore: row.fitScore,
    fitRank: index + 1,
  }));
}

export async function fetchDGField(): Promise<DGFieldPlayer[]> {
  await delay(DELAY_MS);
  const page = await fetchPage("/fields/pga-tour");
  if (!page) return [];

  const payload = extractJsonParseVariable<{
    players?: Array<Record<string, unknown>>;
  }>(page.html, ["hourly"]);

  const rows = payload?.players;
  if (!Array.isArray(rows)) return [];

  return uniqueByName(rows.map((row) => ({
    name: normalizePlayerName(row.player_name ?? row.name),
    country: typeof row.flag === "string" ? row.flag : "",
    worldRank: parseNumber(row.owgr ?? row.world_rank),
  }))).filter((player) => player.name);
}

/**
 * Full scrape cycle — all endpoints with delays.
 * Returns explicit errors if the public pages changed or parsing failed.
 */
export async function fullScrape(): Promise<DGScrapeResult> {
  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  const rankings = await fetchDGRankings().catch((e) => {
    errors.push(`rankings: ${e}`);
    return [] as DGPlayerRanking[];
  });

  const predictionResult = await fetchDGPredictions().catch((e) => {
    errors.push(`predictions: ${e}`);
    return { tournament: "", predictions: [] as DGPrediction[] };
  });

  const courseFit = await fetchDGCourseFit().catch((e) => {
    errors.push(`courseFit: ${e}`);
    return [] as DGCourseFit[];
  });

  const field = await fetchDGField().catch((e) => {
    errors.push(`field: ${e}`);
    return [] as DGFieldPlayer[];
  });

  if (rankings.length === 0) errors.push("rankings: no rows parsed from /datagolf-rankings");
  if (predictionResult.predictions.length === 0) errors.push("predictions: no rows parsed from /predictions/pga-tour");
  if (courseFit.length === 0) errors.push("courseFit: no rows parsed from /course-fit-tool");
  if (field.length === 0) errors.push("field: no rows parsed from /fields/pga-tour");

  const tournament = predictionResult.tournament || "Unknown";

  return {
    timestamp,
    tournament,
    rankings,
    predictions: predictionResult.predictions,
    courseFit,
    field,
    errors,
  };
}
