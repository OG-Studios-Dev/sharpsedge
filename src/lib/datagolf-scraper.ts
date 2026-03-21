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

export interface DGVenueInfo {
  courseName: string;
  location: string;
}

export interface DGScrapeResult {
  timestamp: string;
  tournament: string;
  venue: DGVenueInfo | null;
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

type JsonParseAssignment = {
  name: string;
  value: unknown;
};

type CourseFitCandidate = {
  path: string;
  rows: Array<Record<string, unknown>>;
};

const COURSE_FIT_SCORE_KEYS = [
  "total_comp",
  "total_adjustment",
  "total_adj",
  "course_fit",
  "course_fit_adjustment",
  "fit_score",
  "fit",
  "total",
] as const;

function extractJsonParseAssignments(html: string): JsonParseAssignment[] {
  const regex = /(?:(?:var|let|const)\s+)?([\w$]+)\s*=\s*JSON\.parse\((['"])([\s\S]*?)\2\);/gm;
  const matches: JsonParseAssignment[] = [];

  for (const match of Array.from(html.matchAll(regex))) {
    const name = match[1];
    const rawValue = match[3];
    if (!name || !rawValue) continue;

    try {
      matches.push({
        name,
        value: JSON.parse(rawValue),
      });
    } catch (err) {
      console.error(`[DG Scraper] Failed to parse JSON.parse payload for ${name}:`, err);
    }
  }

  return matches;
}

function extractJsonParseVariable<T = unknown>(html: string, variableNames: string[]): T | null {
  const assignments = extractJsonParseAssignments(html);

  for (const variableName of variableNames) {
    const assignment = assignments.find((entry) => entry.name === variableName);
    if (assignment) return assignment.value as T;
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

function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((entry) => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
}

function getCourseFitScore(row: Record<string, unknown>): number | null {
  for (const key of COURSE_FIT_SCORE_KEYS) {
    const value = parseNumber(row[key]);
    if (value !== null) return value;
  }

  return null;
}

function mapCourseFitRows(rows: Array<Record<string, unknown>>): DGCourseFit[] {
  const rankedRows = uniqueByName(rows.map((row) => ({
    name: normalizePlayerName(row.player_name ?? row.pga_name ?? row.player ?? row.name),
    fitScore: getCourseFitScore(row),
  }))).filter((row) => row.name && row.fitScore !== null)
    .sort((left, right) => (right.fitScore ?? Number.NEGATIVE_INFINITY) - (left.fitScore ?? Number.NEGATIVE_INFINITY));

  return rankedRows.map((row, index) => ({
    name: row.name,
    fitScore: row.fitScore,
    fitRank: index + 1,
  }));
}

function collectCourseFitCandidates(
  value: unknown,
  path: string,
  results: CourseFitCandidate[] = [],
): CourseFitCandidate[] {
  if (isRecordArray(value)) {
    results.push({ path, rows: value });
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectCourseFitCandidates(entry, `${path}[${index}]`, results);
    });
    return results;
  }

  if (!value || typeof value !== "object") return results;

  for (const [key, child] of Object.entries(value)) {
    collectCourseFitCandidates(child, `${path}.${key}`, results);
  }

  return results;
}

function scoreCourseFitCandidate(candidate: CourseFitCandidate, currentCourse: string | null) {
  const names = candidate.rows.filter((row) => Boolean(normalizePlayerName(row.player_name ?? row.pga_name ?? row.player ?? row.name))).length;
  const fitScores = candidate.rows.filter((row) => getCourseFitScore(row) !== null).length;
  const normalizedPath = candidate.path.toLowerCase();
  const normalizedCourse = currentCourse?.toLowerCase() ?? "";

  let score = fitScores * 5 + names;
  if (normalizedPath.includes("player")) score += 30;
  if (normalizedPath.includes("course_fit") || normalizedPath.includes("fit")) score += 20;
  if (normalizedCourse && normalizedPath.includes(normalizedCourse)) score += 50;

  return score;
}

function extractBestCourseFitRows(value: unknown, currentCourse: string | null): DGCourseFit[] {
  const candidates = collectCourseFitCandidates(value, "root")
    .map((candidate) => ({
      candidate,
      score: scoreCourseFitCandidate(candidate, currentCourse),
    }))
    .filter(({ candidate, score }) => candidate.rows.length >= 4 && score > 0)
    .sort((left, right) => right.score - left.score);

  for (const { candidate } of candidates) {
    const rows = mapCourseFitRows(candidate.rows);
    if (rows.length > 0) return rows;
  }

  return [];
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
  const assignments = extractJsonParseAssignments(page.html);

  if (payload) {
    const directRows = Array.isArray(payload.players?.data)
      ? payload.players.data
      : (
        currentCourse && isRecordArray(payload[currentCourse]?.data)
          ? payload[currentCourse].data
          : undefined
      );

    if (directRows) {
      const mappedRows = mapCourseFitRows(directRows);
      if (mappedRows.length > 0) return mappedRows;
    }

    const fallbackRows = extractBestCourseFitRows(payload, currentCourse);
    if (fallbackRows.length > 0) return fallbackRows;
  }

  for (const assignment of assignments) {
    const rows = extractBestCourseFitRows(assignment.value, currentCourse);
    if (rows.length > 0) return rows;
  }

  return [];
}

export interface DGFieldResult {
  players: DGFieldPlayer[];
  venue: DGVenueInfo | null;
}

export async function fetchDGField(): Promise<DGFieldResult> {
  await delay(DELAY_MS);
  const page = await fetchPage("/fields/pga-tour");
  if (!page) return { players: [], venue: null };

  // Extract venue metadata from the "data" variable (contains course_name in tee times + location)
  const dataPayload = extractJsonParseVariable<Record<string, unknown>>(page.html, ["data"]);
  let venue: DGVenueInfo | null = null;

  if (dataPayload && typeof dataPayload === "object") {
    // Try to get course_name from first player's tee time
    const tourData = (dataPayload as Record<string, unknown>)["pga"] as Record<string, unknown> | undefined;
    const fieldData = tourData?.["data"] as Array<Record<string, unknown>> | undefined;
    let courseName = "";

    if (Array.isArray(fieldData)) {
      for (const player of fieldData) {
        const teetimes = player?.teetimes as Record<string, Record<string, unknown>> | undefined;
        if (teetimes) {
          const firstRound = Object.values(teetimes)[0];
          if (firstRound?.course_name && typeof firstRound.course_name === "string") {
            courseName = firstRound.course_name;
            break;
          }
        }
      }
    }

    // Location from the hourly weather data (has "Palm Harbor, FL" format in field_avgs header)
    const hourlyPayload = extractJsonParseVariable<Record<string, unknown>>(page.html, ["hourly"]);
    let location = "";

    // The hourly variable doesn't have location directly, but the page title / data variable might
    // Check if there's a location in the cheerio-parsed page
    if (page.$ && typeof page.$.html === "function") {
      const headerText = page.$(".event-info, .event-header, .event-location, h2, h3").text();
      const locationMatch = headerText.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/);
      if (locationMatch) location = locationMatch[1];
    }

    // Also check if the hourly data has it as a string somewhere
    if (!location && hourlyPayload) {
      const raw = JSON.stringify(hourlyPayload).slice(0, 500);
      const locMatch = raw.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/);
      if (locMatch) location = locMatch[1];
    }

    if (courseName) {
      venue = { courseName, location };
    }
  }

  // Extract players from the hourly variable (existing logic)
  const hourlyPayload = extractJsonParseVariable<{
    players?: Array<Record<string, unknown>>;
  }>(page.html, ["hourly"]);

  const rows = hourlyPayload?.players;
  const players = Array.isArray(rows)
    ? uniqueByName(rows.map((row) => ({
        name: normalizePlayerName(row.player_name ?? row.name),
        country: typeof row.flag === "string" ? row.flag : "",
        worldRank: parseNumber(row.owgr ?? row.world_rank),
      }))).filter((player) => player.name)
    : [];

  return { players, venue };
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

  const fieldResult = await fetchDGField().catch((e) => {
    errors.push(`field: ${e}`);
    return { players: [], venue: null } as DGFieldResult;
  });

  if (rankings.length === 0) errors.push("rankings: no rows parsed from /datagolf-rankings");
  if (predictionResult.predictions.length === 0) errors.push("predictions: no rows parsed from /predictions/pga-tour");
  if (courseFit.length === 0) errors.push("courseFit: no rows parsed from /course-fit-tool");
  if (fieldResult.players.length === 0) errors.push("field: no rows parsed from /fields/pga-tour");

  const tournament = predictionResult.tournament || "Unknown";

  return {
    timestamp,
    tournament,
    venue: fieldResult.venue,
    rankings,
    predictions: predictionResult.predictions,
    courseFit,
    field: fieldResult.players,
    errors,
  };
}
