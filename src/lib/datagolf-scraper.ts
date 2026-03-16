/**
 * DataGolf Public Page Scraper
 * Scrapes datagolf.com public pages for PGA strokes-gained data.
 * Rate limited: 1 request per 5 seconds. No API key needed.
 */
import * as cheerio from "cheerio";

const DG_BASE = "https://datagolf.com";
const USER_AGENT = "Goosalytics/1.0";
const DELAY_MS = 5000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(path: string): Promise<cheerio.CheerioAPI | null> {
  try {
    const url = `${DG_BASE}${path}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      console.error(`[DG Scraper] ${res.status} for ${url}`);
      return null;
    }
    const html = await res.text();
    return cheerio.load(html);
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
  sgOTT: number | null;  // Off the Tee
  sgAPP: number | null;  // Approach
  sgARG: number | null;  // Around the Green
  sgPUTT: number | null; // Putting
  sgT2G: number | null;  // Tee to Green
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

// --- Scraper Functions ---

function parseNumber(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[^0-9.\-]/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * DataGolf renders most data client-side via JavaScript/React.
 * Public HTML may not contain table data directly.
 * We attempt multiple strategies:
 * 1. Parse server-rendered HTML tables
 * 2. Look for embedded JSON/script data
 * 3. Check for __NEXT_DATA__ or similar hydration payloads
 */
function extractScriptData($: cheerio.CheerioAPI): Record<string, unknown> | null {
  try {
    // Look for Next.js data payload
    const nextData = $("script#__NEXT_DATA__").html();
    if (nextData) {
      return JSON.parse(nextData) as Record<string, unknown>;
    }

    // Look for embedded JSON in script tags
    const scripts = $("script").toArray();
    for (const script of scripts) {
      const content = $(script).html() || "";
      // Look for data assignments like window.__DATA__ = {...}
      const jsonMatch = content.match(/(?:window\.__DATA__|window\.__INITIAL_STATE__|var\s+data)\s*=\s*({[\s\S]+?});?\s*(?:<\/script>|$)/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
        } catch { /* not valid JSON */ }
      }
    }
  } catch { /* ignore */ }
  return null;
}

export async function fetchDGRankings(): Promise<DGPlayerRanking[]> {
  const $ = await fetchPage("/rankings");
  if (!$) return [];

  const rankings: DGPlayerRanking[] = [];

  // Strategy 1: Try embedded script data
  const scriptData = extractScriptData($);
  if (scriptData) {
    // Navigate nested data structures for rankings
    const props = (scriptData as { props?: { pageProps?: { rankings?: Array<Record<string, unknown>> } } })?.props?.pageProps;
    const rankingsData = (props as { rankings?: Array<Record<string, unknown>> })?.rankings;
    if (Array.isArray(rankingsData)) {
      for (const player of rankingsData) {
        rankings.push({
          name: String(player.player_name || player.name || ""),
          rank: Number(player.rank || player.datagolf_rank) || 0,
          dgRating: parseNumber(String(player.dg_skill || player.datagolf_rating || "")),
          sgTotal: parseNumber(String(player.sg_total || "")),
          sgOTT: parseNumber(String(player.sg_ott || player.sg_off_tee || "")),
          sgAPP: parseNumber(String(player.sg_app || player.sg_approach || "")),
          sgARG: parseNumber(String(player.sg_arg || player.sg_around_green || "")),
          sgPUTT: parseNumber(String(player.sg_putt || player.sg_putting || "")),
          sgT2G: parseNumber(String(player.sg_t2g || player.sg_tee_to_green || "")),
        });
      }
      if (rankings.length > 0) return rankings;
    }
  }

  // Strategy 2: Parse HTML table rows
  $("table tbody tr, .rankings-table tr, [class*='ranking'] tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 4) return;

    const name = $(cells[1]).text().trim() || $(cells[0]).text().trim();
    if (!name || name.toLowerCase() === "player") return;

    rankings.push({
      name,
      rank: parseNumber($(cells[0]).text()) || 0,
      dgRating: parseNumber($(cells[2]).text()),
      sgTotal: parseNumber($(cells[3]).text()),
      sgOTT: parseNumber($(cells[4])?.text()),
      sgAPP: parseNumber($(cells[5])?.text()),
      sgARG: parseNumber($(cells[6])?.text()),
      sgPUTT: parseNumber($(cells[7])?.text()),
      sgT2G: parseNumber($(cells[8])?.text()),
    });
  });

  return rankings;
}

export async function fetchDGPredictions(): Promise<{ tournament: string; predictions: DGPrediction[] }> {
  await delay(DELAY_MS);
  const $ = await fetchPage("/predictive-model/pre-tournament");
  if (!$) return { tournament: "", predictions: [] };

  const predictions: DGPrediction[] = [];
  let tournament = $("h1, h2, [class*='tournament']").first().text().trim() || "Unknown";

  // Strategy 1: embedded data
  const scriptData = extractScriptData($);
  if (scriptData) {
    const props = (scriptData as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps;
    const predData = (props as { predictions?: Array<Record<string, unknown>> })?.predictions;
    const tourName = (props as { tournament_name?: string })?.tournament_name;
    if (tourName) tournament = tourName;

    if (Array.isArray(predData)) {
      for (const p of predData) {
        predictions.push({
          name: String(p.player_name || p.name || ""),
          winProb: parseNumber(String(p.win_prob ?? p.win ?? "")),
          top5Prob: parseNumber(String(p.top_5 ?? p.top5 ?? "")),
          top10Prob: parseNumber(String(p.top_10 ?? p.top10 ?? "")),
          top20Prob: parseNumber(String(p.top_20 ?? p.top20 ?? "")),
          makeCutProb: parseNumber(String(p.make_cut ?? p.make_cut_prob ?? "")),
        });
      }
      if (predictions.length > 0) return { tournament, predictions };
    }
  }

  // Strategy 2: HTML table
  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
    if (!name || name.toLowerCase() === "player") return;

    predictions.push({
      name,
      winProb: parseNumber($(cells[1]).text()) ?? parseNumber($(cells[2]).text()),
      top5Prob: parseNumber($(cells[2]).text()) ?? parseNumber($(cells[3]).text()),
      top10Prob: parseNumber($(cells[3]).text()) ?? parseNumber($(cells[4]).text()),
      top20Prob: parseNumber($(cells[4]).text()) ?? parseNumber($(cells[5]).text()),
      makeCutProb: parseNumber($(cells[5]).text()) ?? parseNumber($(cells[6]).text()),
    });
  });

  return { tournament, predictions };
}

export async function fetchDGCourseFit(): Promise<DGCourseFit[]> {
  await delay(DELAY_MS);
  const $ = await fetchPage("/course-fit-tool");
  if (!$) return [];

  const fits: DGCourseFit[] = [];

  const scriptData = extractScriptData($);
  if (scriptData) {
    const props = (scriptData as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps;
    const fitData = (props as { course_fit?: Array<Record<string, unknown>> })?.course_fit;
    if (Array.isArray(fitData)) {
      for (const p of fitData) {
        fits.push({
          name: String(p.player_name || p.name || ""),
          fitScore: parseNumber(String(p.fit_score ?? p.course_fit ?? "")),
          fitRank: parseNumber(String(p.fit_rank ?? p.rank ?? "")),
        });
      }
      if (fits.length > 0) return fits;
    }
  }

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
    if (!name) return;

    fits.push({
      name,
      fitScore: parseNumber($(cells[1]).text()) ?? parseNumber($(cells[2]).text()),
      fitRank: parseNumber($(cells[0]).text()),
    });
  });

  return fits;
}

export async function fetchDGField(): Promise<DGFieldPlayer[]> {
  await delay(DELAY_MS);
  const $ = await fetchPage("/field-updates");
  if (!$) return [];

  const field: DGFieldPlayer[] = [];

  const scriptData = extractScriptData($);
  if (scriptData) {
    const props = (scriptData as { props?: { pageProps?: Record<string, unknown> } })?.props?.pageProps;
    const fieldData = (props as { field?: Array<Record<string, unknown>> })?.field;
    if (Array.isArray(fieldData)) {
      for (const p of fieldData) {
        field.push({
          name: String(p.player_name || p.name || ""),
          country: String(p.country || ""),
          worldRank: parseNumber(String(p.owgr ?? p.world_rank ?? "")),
        });
      }
      if (field.length > 0) return field;
    }
  }

  $("table tbody tr, .field-list li, [class*='field'] tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      field.push({
        name: $(cells[0]).text().trim() || $(cells[1]).text().trim(),
        country: $(cells[1]).text().trim() || "",
        worldRank: parseNumber($(cells[2])?.text()),
      });
    } else {
      const text = $(row).text().trim();
      if (text) field.push({ name: text, country: "", worldRank: null });
    }
  });

  return field;
}

/**
 * Full scrape cycle — all endpoints with delays
 */
export async function fullScrape(): Promise<DGScrapeResult> {
  const errors: string[] = [];
  const timestamp = new Date().toISOString();

  const rankings = await fetchDGRankings().catch((e) => {
    errors.push(`rankings: ${e}`);
    return [] as DGPlayerRanking[];
  });

  const { tournament, predictions } = await fetchDGPredictions().catch((e) => {
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

  return {
    timestamp,
    tournament: tournament || "Unknown",
    rankings,
    predictions,
    courseFit,
    field,
    errors,
  };
}
