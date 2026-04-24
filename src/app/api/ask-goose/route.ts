import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import { answerAskGooseQuestion, parseAskGooseIntent, type AskGooseRow } from "@/lib/ask-goose/internal-query";

export const dynamic = "force-dynamic";

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const BROADER_SAMPLE_LIMIT = 250;
const TEAM_QUERY_SAMPLE_LIMIT = 1000;

const LEAGUE_TEAM_ALIASES: Record<string, string[]> = {
  NHL: [
    "ducks", "bruins", "sabres", "flames", "hurricanes", "blackhawks", "avalanche", "blue jackets", "stars", "red wings", "oilers", "panthers", "kings", "wild", "canadiens", "predators", "devils", "islanders", "rangers", "senators", "flyers", "penguins", "sharks", "kraken", "blues", "lightning", "maple leafs", "utah", "canucks", "golden knights", "capitals", "jets",
  ],
  NBA: [
    "hawks", "celtics", "nets", "hornets", "bulls", "cavaliers", "mavericks", "nuggets", "pistons", "warriors", "rockets", "pacers", "clippers", "lakers", "grizzlies", "heat", "bucks", "timberwolves", "pelicans", "knicks", "thunder", "magic", "76ers", "suns", "blazers", "kings", "spurs", "raptors", "jazz", "wizards",
  ],
  MLB: [
    "diamondbacks", "braves", "orioles", "red sox", "cubs", "white sox", "reds", "guardians", "rockies", "tigers", "astros", "royals", "angels", "dodgers", "marlins", "brewers", "twins", "mets", "yankees", "athletics", "phillies", "pirates", "padres", "giants", "mariners", "cardinals", "rays", "rangers", "blue jays", "nationals",
  ],
  NFL: [
    "cardinals", "falcons", "ravens", "bills", "panthers", "bears", "bengals", "browns", "cowboys", "broncos", "lions", "packers", "texans", "colts", "jaguars", "chiefs", "raiders", "chargers", "rams", "dolphins", "vikings", "patriots", "saints", "giants", "jets", "eagles", "steelers", "49ers", "seahawks", "buccaneers", "titans", "commanders",
  ],
};

function normalizeLoose(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function normalizeLeague(raw: string | null) {
  const value = (raw || "").trim().toUpperCase();
  return ALLOWED_LEAGUES.has(value) ? value : "NHL";
}

function normalizeLimit(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function buildQuestionPreview(question: string) {
  const cleaned = question.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 180);
}

function wantsRecentPerformance(question: string) {
  const q = question.toLowerCase();
  return q.includes("lately") || q.includes("recent") || q.includes("perform") || q.includes("performance") || q.includes("record");
}

function looksLikeTeamQuestion(question: string) {
  const q = question.toLowerCase();
  return /how have|\bvs\b|against|head to head|moneyline|spread|total|over|under|favorite|underdog/.test(q);
}

async function postgrest<T>(path: string) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "GET",
    headers: serviceHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase request failed (${response.status})`;
    try {
      const payload = await response.json() as { message?: string; error?: string; details?: string };
      message = payload.message || payload.error || payload.details || message;
    } catch {
      // ignore malformed payloads
    }
    throw new Error(message);
  }

  return await response.json() as T;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const league = normalizeLeague(searchParams.get("league"));
    const limit = normalizeLimit(searchParams.get("limit"));
    const question = buildQuestionPreview(searchParams.get("q") || "");

    const select = [
      "candidate_id",
      "league",
      "event_date",
      "team_name",
      "opponent_name",
      "market_type",
      "submarket_type",
      "market_family",
      "market_scope",
      "side",
      "line",
      "odds",
      "sportsbook",
      "result",
      "graded",
      "profit_units",
      "profit_dollars_10",
      "roi_on_10_flat",
      "segment_key",
      "is_home_team_bet",
      "is_away_team_bet",
      "is_favorite",
      "is_underdog"
    ].join(",");

    const gradedFirst = wantsRecentPerformance(question);
    const wantsBroaderSample = gradedFirst || /how have|trend|team|vs\b|against\b/i.test(question);
    const teamQuestion = looksLikeTeamQuestion(question);
    const fetchLimit = teamQuestion
      ? Math.max(limit, TEAM_QUERY_SAMPLE_LIMIT)
      : wantsBroaderSample
        ? Math.max(limit, BROADER_SAMPLE_LIMIT)
        : limit;
    const primaryQuery = new URLSearchParams({
      select,
      league: `eq.${league}`,
      order: gradedFirst ? "graded.desc,event_date.desc" : "event_date.desc",
      limit: String(fetchLimit),
      ...(gradedFirst ? { graded: "eq.true" } : {}),
    });

    let rows = await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${primaryQuery.toString()}`);

    if (gradedFirst && rows.length === 0) {
      const fallbackQuery = new URLSearchParams({
        select,
        league: `eq.${league}`,
        order: "event_date.desc",
        limit: String(fetchLimit),
      });
      rows = await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${fallbackQuery.toString()}`);
    }

    const previewIntent = parseAskGooseIntent(question, league, rows);
    const normalizedNeedles = [previewIntent.matchedTeam, previewIntent.matchedOpponent]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    if (teamQuestion) {
      const targetedQuery = new URLSearchParams({
        select,
        league: `eq.${league}`,
        order: gradedFirst ? "graded.desc,event_date.desc" : "event_date.desc",
        limit: String(TEAM_QUERY_SAMPLE_LIMIT),
        ...(gradedFirst ? { graded: "eq.true" } : {}),
      });
      const targetedRows = await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${targetedQuery.toString()}`);

      const questionNorm = normalizeLoose(question);
      const aliasNeedles = (LEAGUE_TEAM_ALIASES[league] || []).filter((alias) => questionNorm.includes(normalizeLoose(alias)));
      const allNeedles = Array.from(new Set(normalizedNeedles.concat(aliasNeedles.map((value) => value.toLowerCase()))));

      if (allNeedles.length > 0) {
        rows = targetedRows.filter((row) => {
          const team = normalizeLoose(row.team_name);
          const opp = normalizeLoose(row.opponent_name);
          return allNeedles.some((needle) => {
            const n = normalizeLoose(needle);
            return Boolean(n) && (team.includes(n) || opp.includes(n) || n.includes(team) || n.includes(opp));
          });
        });
      }

      if (rows.length === 0) {
        rows = targetedRows;
      }
    }

    const answer = answerAskGooseQuestion(question, league, rows);

    return NextResponse.json({
      ok: true,
      question,
      filters: { league, limit, fetchLimit },
      summary: {
        rows: answer.sampleSize,
        gradedRows: answer.gradedRows,
        wins: answer.wins,
        losses: answer.losses,
        pushes: answer.pushes,
        totalUnits: answer.totalUnits,
        avgRoi: answer.avgRoi,
      },
      interpretation: answer.intent,
      answer: {
        summaryText: answer.summaryText,
        warnings: answer.warnings,
      },
      rows: answer.evidenceRows,
      empty: answer.sampleSize === 0,
      message: answer.sampleSize === 0
        ? `No persisted Ask Goose rows found for ${league} in the current materialized query layer.`
        : answer.summaryText,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Failed to load Ask Goose data"),
      rows: [],
      summary: {
        rows: 0,
        gradedRows: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        totalUnits: 0,
        avgRoi: 0,
      },
    }, { status: 500 });
  }
}
