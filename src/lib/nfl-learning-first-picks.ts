import { formatAmericanOdds } from "@/lib/book-odds";
import { createHash } from "node:crypto";
import { NFL_TEAM_COLORS } from "@/lib/nfl-api";
import {
  nflDisplayDate,
  nflShadowEdge,
  nflShadowHitRate,
  isNFLPlayerPropMarket,
  selectNFLPickRows,
  type NFLShadowCandidate,
} from "@/lib/nfl-pick-selection";
import { getSupabaseServiceRoleKey, getSupabaseUrl, toErrorMessage } from "@/lib/supabase-shared";
import type { AIPick } from "@/lib/types";

const LAB_SLUG = "goose-shadow-lab";
const DEFAULT_NFL_LEARNING_MODEL_VERSION = "shadow-2026-05-25-nfl-foundation";
const NFL_WEEKLY_TEAM_PICK_TARGET = 4;
const NFL_WEEKLY_PLAYER_PROP_LIMIT = 6;
const MAX_PRICE_AGE_HOURS = 36;
const PRODUCTION_TEAM_HIT_RATE = 55;
const PRODUCTION_TEAM_EDGE = 5;
const PRODUCTION_TEAM_MIN_DECISIONS = 50;
const PRODUCTION_PLAYER_PROP_HIT_RATE = 70;
const PRODUCTION_PLAYER_PROP_EDGE = 10;
const PRODUCTION_PLAYER_PROP_MIN_DECISIONS = 10;

type ShadowPickRow = {
  id: string;
  model_version: string;
  pick_date: string;
  candidate_id: string;
  canonical_game_id?: string | null;
  event_id?: string | null;
  market_family?: string | null;
  market_type?: string | null;
  side?: string | null;
  line?: number | null;
  odds?: number | null;
  sportsbook?: string | null;
  team_name?: string | null;
  opponent_name?: string | null;
  model_score?: number | null;
  confidence_score?: number | null;
  evidence_snapshot?: NFLShadowCandidate["evidence_snapshot"];
  status?: string | null;
  result?: string | null;
  recorded_at?: string | null;
};

type LabSpaceRow = { active_model_version?: string | null };
type CandidateMeta = { candidate_id: string; event_id: string; capture_ts: string | null };
type EventMeta = { event_id: string; commence_time: string | null; home_team: string | null; away_team: string | null };

export type NFLLearningFirstResult = {
  picks: AIPick[];
  learningPicks: AIPick[];
  modelVersion: string | null;
  source: "nfl_learning" | "none";
  slateDate: string;
  rawPickDate: string | null;
  thresholds: {
    maxPriceAgeHours: number;
    productionHitRate: number;
    productionEdge: number;
    productionMinDecisions: number;
    productionPlayerPropHitRate: number;
    productionPlayerPropEdge: number;
    productionPlayerPropMinDecisions: number;
    weeklyTeamPickTarget: number;
    weeklyPlayerPropLimit: number;
  };
  diagnostics: {
    rowsRead: number;
    rejectedStale: number;
    rejectedStarted: number;
    duplicatesCollapsed: number;
  };
  fallbackReason?: string;
};

const NFL_PROP_LABELS: Record<string, string> = {
  player_prop_passing_yards: "Passing Yards",
  player_prop_passing_tds: "Passing TDs",
  player_prop_rushing_yards: "Rushing Yards",
  player_prop_rush_attempts: "Rush Attempts",
  player_prop_receiving_yards: "Receiving Yards",
  player_prop_receptions: "Receptions",
  player_prop_anytime_td: "Anytime Touchdown",
};

const NFL_FULL_NAME_TO_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WSH",
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    ...init,
    headers: serviceHeaders(init.headers),
    cache: "no-store",
  });
  if (response.ok) {
    if (response.status === 204) return null as T;
    return await response.json() as T;
  }

  const body = await response.text().catch(() => "");
  throw new Error(`Supabase request failed (${response.status}): ${body.slice(0, 300)}`);
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function stablePickId(candidateId: string, shadowOnly: boolean) {
  const encoded = createHash("sha256").update(candidateId).digest("base64url").slice(0, 32);
  return `nfl-${shadowOnly ? "learning" : "official"}-${encoded}`;
}

function teamColor(team?: string | null) {
  const raw = String(team || "").trim();
  return NFL_TEAM_COLORS[NFL_FULL_NAME_TO_ABBR[raw] || raw.toUpperCase()] || "#4a9eff";
}

function marketLabel(row: NFLShadowCandidate) {
  const market = row.market_type.toLowerCase();
  const side = String(row.side || row.team_name || "NFL");
  if (market === "moneyline") return `${row.team_name || side} ML`;
  if (market === "spread") return `${row.team_name || side} ${row.line != null && row.line > 0 ? "+" : ""}${row.line ?? ""}`.trim();
  if (market === "total") return `${side.charAt(0).toUpperCase()}${side.slice(1)} ${row.line ?? ""}`.trim();
  if (isNFLPlayerPropMarket(market)) {
    const direction = side.toLowerCase() === "under" ? "Under" : "Over";
    const label = NFL_PROP_LABELS[market] || market.replace(/^player_prop_/, "").replace(/_/g, " ");
    return market === "player_prop_anytime_td" ? label : `${direction} ${row.line ?? ""} ${label}`.trim();
  }
  return `${side} ${market}`;
}

export function mapNFLLearningShadowPick(row: NFLShadowCandidate, shadowOnly: boolean): AIPick | null {
  if (typeof row.odds !== "number") return null;

  const market = row.market_type.toLowerCase();
  const evidence = row.evidence_snapshot || {};
  const signal = evidence.primary_system_edge_signal ?? evidence.primary_learning_signal ?? null;
  const wins = Number(signal?.test_wins ?? 0);
  const losses = Number(signal?.test_losses ?? 0);
  const pushes = Number(signal?.test_pushes ?? 0);
  const sample = Number(signal?.test_sample ?? wins + losses + pushes);
  const hitRate = nflShadowHitRate(row);
  const edge = nflShadowEdge(row);
  const book = row.sportsbook || "Market";
  const displayDate = nflDisplayDate(row.commence_time) || row.pick_date;
  const matchup = row.home_team && row.away_team
    ? `${row.away_team} @ ${row.home_team}`
    : (row.opponent_name || "Opponent TBD");
  const isPlayerProp = isNFLPlayerPropMarket(market);
  const playerName = isPlayerProp ? (row.team_name || row.side || "NFL Player") : undefined;
  const team = isPlayerProp ? "NFL Player Prop" : market === "total" ? "Game Total" : (row.team_name || row.side || "NFL");
  const opponent = isPlayerProp || market === "total"
    ? matchup
    : team === row.home_team
      ? (row.away_team || row.opponent_name || "Opponent TBD")
      : (row.home_team || row.opponent_name || "Opponent TBD");
  const isAway = !isPlayerProp && market !== "total" && Boolean(row.away_team && team === row.away_team);
  const direction = String(row.side || "").toLowerCase() === "under" ? "Under" : "Over";
  const confidence = Math.round(Math.max(0, Math.min(100, Number(row.confidence_score ?? 0) * 100)));
  const signalLabel = signal?.signal_key || "matched NFL learning signal";

  return {
    id: stablePickId(row.candidate_id, shadowOnly),
    date: displayDate,
    type: isPlayerProp ? "player" : "team",
    playerName,
    team,
    teamColor: teamColor(team),
    opponent,
    isAway,
    propType: isPlayerProp ? (NFL_PROP_LABELS[market] || market.replace(/^player_prop_/, "").replace(/_/g, " ")) : undefined,
    direction: isPlayerProp ? direction : undefined,
    betType: row.market_type,
    line: typeof row.line === "number" ? row.line : undefined,
    pickLabel: marketLabel(row),
    edge: Number(edge.toFixed(1)),
    hitRate: Number(hitRate.toFixed(1)),
    confidence,
    reasoning: [
      shadowOnly
        ? "Goose Learning shadow pick — tracked for model training, not an official recommendation."
        : isPlayerProp
          ? "NFL player prop cleared the strict production gates."
          : "NFL weekly best-bet selection — one of the four highest-ranked validated team-market options.",
      `${signalLabel}: ${wins}-${losses}-${pushes} over ${sample} backtest decisions (${hitRate.toFixed(1)}%).`,
      `Measured edge: +${edge.toFixed(1)}%.`,
      `Captured price: ${book} ${formatAmericanOdds(row.odds)}.`,
      isPlayerProp ? `${playerName} — ${matchup}.` : market === "total" ? matchup : `${team} vs ${opponent}.`,
    ].join(" "),
    result: row.result === "win" || row.result === "loss" || row.result === "push" ? row.result : "pending",
    units: 1,
    gameId: row.commence_time ? row.candidate_id : undefined,
    odds: row.odds,
    book,
    sportsbook: book,
    league: "NFL",
  };
}

async function getActiveModelVersion() {
  const rows = await postgrest<LabSpaceRow[]>(`/rest/v1/goose_learning_lab_spaces?slug=eq.${encodeURIComponent(LAB_SLUG)}&select=active_model_version&limit=1`);
  return rows?.[0]?.active_model_version || null;
}

async function fetchShadowRows(date: string, modelVersion: string | null, allowUpcoming: boolean) {
  const params = new URLSearchParams({
    select: "*",
    lab_slug: `eq.${LAB_SLUG}`,
    sport: "eq.NFL",
    status: "eq.recorded",
    order: allowUpcoming ? "pick_date.asc,confidence_score.desc,recorded_at.desc" : "confidence_score.desc,recorded_at.desc",
    limit: "500",
  });
  if (modelVersion) params.set("model_version", `eq.${modelVersion}`);
  if (allowUpcoming) {
    params.set("pick_date", `gte.${date}`);
    params.set("and", `(pick_date.lte.${addDays(date, 7)})`);
  } else {
    params.set("pick_date", `eq.${date}`);
  }
  return postgrest<ShadowPickRow[]>(`/rest/v1/goose_learning_shadow_picks?${params.toString()}`);
}

async function fetchByIds<T>(table: string, column: string, values: string[], select: string) {
  const unique = Array.from(new Set(values.filter(Boolean)));
  const all: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 40) {
    const group = unique.slice(offset, offset + 40);
    const quoted = group.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
    const params = new URLSearchParams({ select, limit: "5000" });
    params.set(column, `in.(${quoted})`);
    all.push(...await postgrest<T[]>(`/rest/v1/${table}?${params.toString()}`));
  }
  return all;
}

async function enrichRows(rows: ShadowPickRow[]): Promise<NFLShadowCandidate[]> {
  const candidates = await fetchByIds<CandidateMeta>(
    "goose_market_candidates",
    "candidate_id",
    rows.map((row) => row.candidate_id),
    "candidate_id,event_id,capture_ts",
  );
  const candidateById = new Map(candidates.map((row) => [row.candidate_id, row]));
  const events = await fetchByIds<EventMeta>(
    "goose_market_events",
    "event_id",
    rows.map((row) => candidateById.get(row.candidate_id)?.event_id || row.event_id || row.canonical_game_id || ""),
    "event_id,commence_time,home_team,away_team",
  );
  const eventById = new Map(events.map((row) => [row.event_id, row]));

  return rows.map((row) => {
    const candidate = candidateById.get(row.candidate_id);
    const eventId = candidate?.event_id || row.event_id || row.canonical_game_id || "";
    const event = eventById.get(eventId);
    return {
      id: row.id,
      candidate_id: row.candidate_id,
      pick_date: row.pick_date,
      market_type: row.market_type || row.market_family || "moneyline",
      side: row.side ?? null,
      line: row.line ?? null,
      odds: row.odds ?? null,
      sportsbook: row.sportsbook ?? null,
      team_name: row.team_name ?? null,
      opponent_name: row.opponent_name ?? null,
      confidence_score: row.confidence_score ?? null,
      model_score: row.model_score ?? null,
      evidence_snapshot: row.evidence_snapshot ?? null,
      status: row.status ?? null,
      result: row.result ?? null,
      recorded_at: row.recorded_at ?? null,
      capture_ts: candidate?.capture_ts ?? null,
      commence_time: event?.commence_time ?? null,
      home_team: event?.home_team ?? null,
      away_team: event?.away_team ?? null,
    };
  });
}

export async function getNFLLearningFirstPicks(date: string, allowUpcoming = true): Promise<NFLLearningFirstResult> {
  const thresholds = {
    maxPriceAgeHours: MAX_PRICE_AGE_HOURS,
    productionHitRate: PRODUCTION_TEAM_HIT_RATE,
    productionEdge: PRODUCTION_TEAM_EDGE,
    productionMinDecisions: PRODUCTION_TEAM_MIN_DECISIONS,
    productionPlayerPropHitRate: PRODUCTION_PLAYER_PROP_HIT_RATE,
    productionPlayerPropEdge: PRODUCTION_PLAYER_PROP_EDGE,
    productionPlayerPropMinDecisions: PRODUCTION_PLAYER_PROP_MIN_DECISIONS,
    weeklyTeamPickTarget: NFL_WEEKLY_TEAM_PICK_TARGET,
    weeklyPlayerPropLimit: NFL_WEEKLY_PLAYER_PROP_LIMIT,
  };
  const empty = (fallbackReason: string, modelVersion: string | null = DEFAULT_NFL_LEARNING_MODEL_VERSION): NFLLearningFirstResult => ({
    picks: [],
    learningPicks: [],
    modelVersion,
    source: "none",
    slateDate: date,
    rawPickDate: null,
    thresholds,
    diagnostics: { rowsRead: 0, rejectedStale: 0, rejectedStarted: 0, duplicatesCollapsed: 0 },
    fallbackReason,
  });

  try {
    const configuredModel = process.env.GOOSE_NFL_PROD_MODEL_VERSION || process.env.GOOSE_NFL_LEARNING_MODEL_VERSION || null;
    const activeModel = await getActiveModelVersion().catch(() => null);
    const modelCandidates = Array.from(new Set([configuredModel, DEFAULT_NFL_LEARNING_MODEL_VERSION, activeModel, null])) as Array<string | null>;
    let staleRows = 0;

    for (const modelVersion of modelCandidates) {
      const rows = await fetchShadowRows(date, modelVersion, allowUpcoming);
      const enriched = await enrichRows(rows);
      const selected = selectNFLPickRows(enriched, {
        maxAgeHours: MAX_PRICE_AGE_HOURS,
        teamLimit: NFL_WEEKLY_TEAM_PICK_TARGET,
        playerPropLimit: NFL_WEEKLY_PLAYER_PROP_LIMIT,
        productionHitRate: PRODUCTION_TEAM_HIT_RATE,
        productionPlayerPropHitRate: PRODUCTION_PLAYER_PROP_HIT_RATE,
        productionEdge: PRODUCTION_TEAM_EDGE,
        productionPlayerPropEdge: PRODUCTION_PLAYER_PROP_EDGE,
        productionMinDecisions: PRODUCTION_TEAM_MIN_DECISIONS,
        productionPlayerPropMinDecisions: PRODUCTION_PLAYER_PROP_MIN_DECISIONS,
      });
      staleRows += selected.rejectedStale;

      if (selected.learningRows.length === 0 && selected.productionRows.length === 0) continue;

      const learningPicks = selected.learningRows.map((row) => mapNFLLearningShadowPick(row, true)).filter((pick): pick is AIPick => Boolean(pick));
      const picks = selected.productionRows.map((row) => mapNFLLearningShadowPick(row, false)).filter((pick): pick is AIPick => Boolean(pick));
      return {
        picks,
        learningPicks,
        modelVersion: modelVersion || rows[0]?.model_version || null,
        source: "nfl_learning",
        slateDate: date,
        rawPickDate: rows[0]?.pick_date || null,
        thresholds,
        diagnostics: {
          rowsRead: rows.length,
          rejectedStale: selected.rejectedStale,
          rejectedStarted: selected.rejectedStarted,
          duplicatesCollapsed: selected.duplicatesCollapsed,
        },
      };
    }

    return {
      ...empty(staleRows ? "no_fresh_nfl_learning_prices" : "no_recorded_nfl_learning_picks_for_date"),
      diagnostics: { rowsRead: staleRows, rejectedStale: staleRows, rejectedStarted: 0, duplicatesCollapsed: 0 },
    };
  } catch (error) {
    return empty(toErrorMessage(error, "failed_to_load_nfl_learning_picks"), null);
  }
}

export default {
  getNFLLearningFirstPicks,
  mapNFLLearningShadowPick,
};
