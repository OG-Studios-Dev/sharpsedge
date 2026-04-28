import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import { answerAskGooseQuestion, parseAskGooseIntent, type AskGooseRow } from "@/lib/ask-goose/internal-query";
import { explainAskGooseAnswer, type AskGooseExplanation } from "@/lib/ask-goose/explanation";

export const dynamic = "force-dynamic";

const ALLOWED_LEAGUES = new Set(["NHL", "NBA", "MLB", "NFL"]);
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const BROADER_SAMPLE_LIMIT = 250;
const TEAM_QUERY_SAMPLE_LIMIT = 1000;
const BROAD_QUERY_PAGE_SIZE = 1000;
const FULL_HISTORICAL_MAX_ROWS = 250000;

const LEAGUE_TEAM_ALIASES: Record<string, string[]> = {
  NHL: [
    "ducks", "anaheim ducks", "bruins", "boston bruins", "sabres", "buffalo sabres", "flames", "calgary flames", "hurricanes", "carolina hurricanes", "blackhawks", "chicago blackhawks", "avalanche", "colorado avalanche", "blue jackets", "columbus blue jackets", "stars", "dallas stars", "red wings", "detroit red wings", "oilers", "edmonton oilers", "panthers", "florida panthers", "kings", "los angeles kings", "wild", "minnesota wild", "canadiens", "montreal canadiens", "habs", "predators", "nashville predators", "devils", "new jersey devils", "islanders", "new york islanders", "rangers", "new york rangers", "senators", "ottawa senators", "flyers", "philadelphia flyers", "penguins", "pittsburgh penguins", "sharks", "san jose sharks", "kraken", "seattle kraken", "blues", "st louis blues", "lightning", "tampa bay lightning", "maple leafs", "toronto maple leafs", "leafs", "utah", "utah hockey club", "canucks", "vancouver canucks", "golden knights", "vegas golden knights", "knights", "capitals", "washington capitals", "jets", "winnipeg jets",
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
  return /how have|\bvs\b|against|head to head|moneyline|spread|total|over|under|favorite|underdogs?|\bdogs?\b/.test(q);
}

function appendHistoricalDateWindow(params: URLSearchParams, intent: ReturnType<typeof parseAskGooseIntent>) {
  if (intent.requestedSeasonStartYear) params.append("event_date", `gte.${intent.requestedSeasonStartYear}-01-01`);
  if (intent.requestedSeasonEndYear) params.append("event_date", `lte.${intent.requestedSeasonEndYear}-12-31`);
}

function appendIntentDbFilters(params: URLSearchParams, intent: ReturnType<typeof parseAskGooseIntent>) {
  if (intent.marketType) params.set("market_family", `eq.${intent.marketType}`);
  if (intent.marketType === "total" && (intent.side === "over" || intent.side === "under")) params.set("side", `ilike.*${intent.side}*`);
  if (intent.mentionedFavorite) params.set("is_favorite", "eq.true");
  if (intent.mentionedUnderdog) params.set("is_underdog", "eq.true");
  if (intent.mentionedHome) params.set("is_home_team_bet", "eq.true");
  if (intent.mentionedAway) params.set("is_away_team_bet", "eq.true");
  if (intent.requestedLine != null) params.set("line", `eq.${intent.requestedLine}`);
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

async function writePostgrest<T>(path: string, body: unknown) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Supabase write failed (${response.status})`;
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


async function fetchPagedAskGooseRows(params: URLSearchParams, maxRows: number) {
  const out: AskGooseRow[] = [];
  let offset = Number(params.get("offset") || 0);
  const pageSize = Math.min(Number(params.get("limit") || BROAD_QUERY_PAGE_SIZE), BROAD_QUERY_PAGE_SIZE);

  while (out.length < maxRows) {
    const pageParams = new URLSearchParams(params);
    pageParams.set("limit", String(Math.min(pageSize, maxRows - out.length)));
    pageParams.set("offset", String(offset));
    const page = await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${pageParams.toString()}`);
    out.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}

async function writeInteraction(payload: AskGooseResponsePayload) {
  try {
    const rows = await writePostgrest<Array<{ id: string }>>("/rest/v1/ask_goose_interactions_v1", {
      league: payload.filters.league,
      question: payload.question,
      normalized_question: payload.interpretation.normalizedQuestion,
      looks_like_betting_question: payload.interpretation.looksLikeBettingQuestion,
      intent: payload.interpretation,
      answer: {
        ...payload.answer,
        explanation: payload.explanation,
      },
      summary: payload.summary,
      evidence_candidate_ids: payload.rows.map((row) => row.candidate_id).filter(Boolean),
      warnings: payload.answer.warnings,
      parser_version: "ask_goose_deterministic_v2_line_thresholds_llm_explainer",
      source_layer_version: "ask_goose_query_layer_v1",
      client_metadata: {
        route: "/api/ask-goose",
        empty: payload.empty,
      },
    });
    return { interactionId: rows[0]?.id ?? null, loggingWarning: null as string | null };
  } catch (error) {
    return {
      interactionId: null,
      loggingWarning: toErrorMessage(error, "Ask Goose interaction logging failed"),
    };
  }
}

type AskGooseResponsePayload = {
  ok: true;
  question: string;
  filters: { league: string; limit: number; fetchLimit: number };
  summary: {
    rows: number;
    gradedRows: number;
    wins: number;
    losses: number;
    pushes: number;
    totalUnits: number;
    avgRoi: number;
    sourceUnits?: number;
    sourceAvgRoi?: number;
    rawRows?: number;
    dedupedRows?: number;
  };
  interpretation: ReturnType<typeof parseAskGooseIntent>;
  answer: {
    summaryText: string;
    warnings: string[];
    trustNotes?: string[];
  };
  explanation?: AskGooseExplanation;
  rows: AskGooseRow[];
  empty: boolean;
  message: string;
};

async function buildAskGooseAnswer(requestUrl: string, body?: { league?: unknown; limit?: unknown; question?: unknown; q?: unknown }) {
  const { searchParams } = new URL(requestUrl);
  const league = normalizeLeague(String(body?.league ?? searchParams.get("league") ?? ""));
  const limit = normalizeLimit(String(body?.limit ?? searchParams.get("limit") ?? ""));
  const question = buildQuestionPreview(String(body?.question ?? body?.q ?? searchParams.get("q") ?? ""));

    const select = [
      "candidate_id",
      "canonical_game_id",
      "event_id",
      "league",
      "season",
      "event_date",
      "home_team",
      "away_team",
      "team_role",
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
      "is_underdog",
      "is_home_favorite",
      "is_away_favorite",
      "is_home_underdog",
      "is_road_underdog",
      "is_road_favorite",
      "team_wins_pre_game",
      "team_losses_pre_game",
      "team_pushes_pre_game",
      "team_games_played_pre_game",
      "team_current_streak_pre_game",
      "team_win_streak_pre_game",
      "team_loss_streak_pre_game",
      "opponent_wins_pre_game",
      "opponent_losses_pre_game",
      "opponent_pushes_pre_game",
      "opponent_games_played_pre_game",
      "opponent_current_streak_pre_game",
      "opponent_win_streak_pre_game",
      "opponent_loss_streak_pre_game",
      "team_win_pct_pre_game",
      "opponent_win_pct_pre_game",
      "team_above_500_pre_game",
      "opponent_above_500_pre_game",
      "team_league_rank_pre_game",
      "opponent_league_rank_pre_game",
      "favorite_team_role",
      "underdog_team_role",
      "public_bets_pct",
      "public_handle_pct",
      "public_split_source",
      "public_split_snapshot_at",
      "integrity_status"
    ].join(",");

    const preliminaryIntent = parseAskGooseIntent(question, league, []);
    const gradedFirst = wantsRecentPerformance(question);
    const explicitlyHistorical = /last\s+two\s+years|last\s+2\s+years|2024|2025|2026|full\s+(sample|dataset|data)|all\s+(games|data|history)|historical|history|database/i.test(question);
    const wantsFullHistorical = preliminaryIntent.looksLikeBettingQuestion && (!preliminaryIntent.wantsRecentOnly || explicitlyHistorical);
    const wantsBroaderSample = wantsFullHistorical || gradedFirst || /how have|trend|team|vs\b|against\b/i.test(question);
    const teamQuestion = looksLikeTeamQuestion(question);
    const questionNormForFetch = normalizeLoose(question);
    const aliasNeedlesForFetch = Array.from(new Set((LEAGUE_TEAM_ALIASES[league] || [])
      .filter((alias) => questionNormForFetch.includes(normalizeLoose(alias)))
      .map((value) => value.toLowerCase())));
    const useTeamScopedFullFetch = wantsFullHistorical && teamQuestion && aliasNeedlesForFetch.length > 0;
    const fetchLimit = wantsFullHistorical
      ? BROAD_QUERY_PAGE_SIZE
      : teamQuestion
        ? Math.max(limit, TEAM_QUERY_SAMPLE_LIMIT)
        : wantsBroaderSample
          ? Math.max(limit, BROADER_SAMPLE_LIMIT)
          : limit;
    const primaryQuery = new URLSearchParams({
      select,
      league: `eq.${league}`,
      order: gradedFirst && !wantsFullHistorical ? "graded.desc,event_date.desc" : "event_date.desc",
      limit: String(fetchLimit),
      offset: "0",
      ...(gradedFirst && !wantsFullHistorical ? { graded: "eq.true" } : {}),
    });
    if (wantsFullHistorical) {
      appendIntentDbFilters(primaryQuery, preliminaryIntent);
      appendHistoricalDateWindow(primaryQuery, preliminaryIntent);
    }

    let rows = useTeamScopedFullFetch
      ? []
      : wantsFullHistorical
      ? await fetchPagedAskGooseRows(primaryQuery, FULL_HISTORICAL_MAX_ROWS)
      : await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${primaryQuery.toString()}`);

    if (gradedFirst && rows.length === 0) {
      const fallbackQuery = new URLSearchParams({
        select,
        league: `eq.${league}`,
        order: "event_date.desc",
        limit: String(fetchLimit),
        offset: "0",
      });
      rows = await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${fallbackQuery.toString()}`);
    }

    if (teamQuestion) {
      const allNeedles = aliasNeedlesForFetch;
      const extraRows: AskGooseRow[] = [];

      for (const needle of allNeedles) {
        const teamQuery = new URLSearchParams({
          select,
          league: `eq.${league}`,
          order: wantsFullHistorical ? "event_date.desc" : "graded.desc,event_date.desc",
          limit: String(wantsFullHistorical ? BROAD_QUERY_PAGE_SIZE : TEAM_QUERY_SAMPLE_LIMIT),
          offset: "0",
        });
        if (wantsFullHistorical) {
          appendIntentDbFilters(teamQuery, preliminaryIntent);
          appendHistoricalDateWindow(teamQuery, preliminaryIntent);
        }
        teamQuery.set("or", `(team_name.ilike.*${needle}*,opponent_name.ilike.*${needle}*)`);
        const fetched = wantsFullHistorical
          ? await fetchPagedAskGooseRows(teamQuery, FULL_HISTORICAL_MAX_ROWS)
          : await postgrest<AskGooseRow[]>(`/rest/v1/ask_goose_query_layer_v1?${teamQuery.toString()}`);
        extraRows.push(...fetched);
      }

      const mergedRows = Array.from(new Map(rows.concat(extraRows).map((row) => [row.candidate_id, row])).values());

      if (allNeedles.length > 0) {
        rows = mergedRows.filter((row) => {
          const team = normalizeLoose(row.team_name);
          const opp = normalizeLoose(row.opponent_name);
          return allNeedles.some((needle) => {
            const n = normalizeLoose(needle);
            return Boolean(n) && (team.includes(n) || opp.includes(n) || n.includes(team) || n.includes(opp));
          });
        });
      } else {
        rows = mergedRows;
      }

      if (rows.length === 0) {
        rows = mergedRows;
      }
    }

    const normalizedQuestion = question.toLowerCase();
    if (teamQuestion && (/underdogs?|\bdogs?\b/.test(normalizedQuestion) || normalizedQuestion.includes(" as an underdog"))) {
      rows = rows.filter((row) => row.is_underdog === true);
    }

    const answer = answerAskGooseQuestion(question, league, rows);

    const ungradeableRows = answer.evidenceRows.filter((row) => String(row.result || "").toLowerCase() === "ungradeable" || String(row.integrity_status || "").toLowerCase() === "unresolvable").length;
    const lineMissingRows = answer.evidenceRows.filter((row) => row.market_family === "spread" && (row.line === null || row.line === undefined)).length;

    const explanation = await explainAskGooseAnswer(question, league, answer);

    const message = answer.sampleSize === 0
      ? `Goose does not have enough proven ${league} rows for that question yet.`
      : answer.gradedRows === 0 && lineMissingRows > 0
        ? `Matching ${league} spread rows were found, but the source has no spread line for this slice, so Ask Goose cannot honestly grade it yet.`
        : answer.gradedRows === 0 && ungradeableRows > 0
          ? `Matching ${league} rows were found, but this slice is currently ungradeable from available source fields.`
          : answer.gradedRows === 0
            ? `Matching ${league} rows were found, but no graded sample is settled yet for this exact question.`
            : answer.summaryText;

    return {
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
        sourceUnits: answer.sourceUnits,
        sourceAvgRoi: answer.sourceAvgRoi,
        rawRows: answer.rawRows,
        dedupedRows: answer.dedupedRows,
      },
      interpretation: answer.intent,
      answer: {
        summaryText: answer.summaryText,
        warnings: answer.warnings,
        trustNotes: answer.trustNotes,
      },
      explanation,
      rows: answer.evidenceRows,
      empty: answer.sampleSize === 0,
      message,
    } satisfies AskGooseResponsePayload;
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await buildAskGooseAnswer(request.url));
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = await buildAskGooseAnswer(request.url, body);
    const logging = await writeInteraction(payload);

    return NextResponse.json({
      ...payload,
      interactionId: logging.interactionId,
      loggingWarning: logging.loggingWarning,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: toErrorMessage(error, "Failed to answer Ask Goose question"),
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
