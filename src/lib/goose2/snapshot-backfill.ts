import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { buildGoose2CandidateId, buildGoose2EventId } from "@/lib/goose2/ids";
import { isSyntheticAggregatedEventId } from "@/lib/odds-aggregator";
import { inferGoose2MarketType } from "@/lib/goose2/taxonomy";
import type { Goose2MarketCandidate, Goose2MarketEvent } from "@/lib/goose2/types";

export type SnapshotEventRow = {
  id: string;
  snapshot_id: string;
  sport: string;
  game_id: string;
  odds_api_event_id: string | null;
  commence_time: string | null;
  matchup: string;
  home_team: string;
  away_team: string;
  home_abbrev: string;
  away_abbrev: string;
  captured_at: string;
  source: string;
};

export type SnapshotPriceRow = {
  id: string;
  snapshot_id: string;
  event_snapshot_id: string;
  sport: string;
  game_id: string;
  odds_api_event_id: string | null;
  commence_time: string | null;
  captured_at: string;
  book: string;
  market_type: string;
  outcome: string;
  odds: number;
  line: number | null;
  source: string;
  source_updated_at: string | null;
  source_age_minutes: number | null;
  participant_type?: string | null;
  participant_id?: string | null;
  participant_name?: string | null;
  opponent_name?: string | null;
  prop_type?: string | null;
  prop_market_key?: string | null;
  context?: Record<string, unknown> | null;
};

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

async function postgrest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
    ...init,
    headers: {
      ...serviceHeaders(init.headers),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Goose2 snapshot backfill error ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function normalizeTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const millis = trimmed.length === 10 ? numeric * 1000 : numeric;
      const parsed = new Date(millis);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeRequiredTimestamp(value: string | null | undefined, fallback: string) {
  return normalizeTimestamp(value) ?? fallback;
}

function isNumericId(value?: string | null) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function resolveTruthfulSourceEvent(event: SnapshotEventRow) {
  const snapshotGameId = String(event.game_id ?? "").trim() || null;
  const oddsApiEventId = String(event.odds_api_event_id ?? "").trim() || null;
  const normalizedCommenceTime = normalizeTimestamp(event.commence_time);

  if (isNumericId(snapshotGameId)) {
    return {
      sourceEventId: snapshotGameId,
      sourceEventIdKind: "league_game_id",
      snapshotGameId,
      realGameId: snapshotGameId,
    } as const;
  }

  if (oddsApiEventId && !isSyntheticAggregatedEventId(oddsApiEventId)) {
    return {
      sourceEventId: oddsApiEventId,
      sourceEventIdKind: "odds_api_event_id",
      snapshotGameId,
      realGameId: null,
    } as const;
  }

  return {
    sourceEventId: null,
    sourceEventIdKind: "derived_matchup_time",
    snapshotGameId,
    realGameId: null,
    fallbackCommenceTime: normalizedCommenceTime,
  } as const;
}

function mapSnapshotMarketType(price: SnapshotPriceRow): Goose2MarketCandidate["market_type"] {
  if (price.market_type === "moneyline") return "moneyline";
  if (price.market_type === "spread") return "spread";
  if (price.market_type === "total") return "total";
  if (price.market_type === "spread_q1") return "first_quarter_spread";
  if (price.market_type === "spread_q3") return "third_quarter_spread";
  if (price.market_type === "first_five_moneyline") return "first_five_moneyline";
  if (price.market_type === "first_five_total") return "first_five_total";
  return inferGoose2MarketType({ marketType: price.market_type, sport: price.sport, propType: price.prop_type ?? price.prop_market_key ?? undefined });
}

function inferParticipantType(sport: string, explicit?: string | null): Goose2MarketCandidate["participant_type"] {
  if (explicit === "player") return "player";
  if (explicit === "golfer") return "golfer";
  if (sport === "PGA") return "golfer";
  return "team";
}

function inferParticipantNames(event: SnapshotEventRow, outcome: string) {
  const side = outcome.toLowerCase();
  if (side === "home") {
    return {
      participantId: event.home_abbrev,
      participantName: event.home_team,
      opponentId: event.away_abbrev,
      opponentName: event.away_team,
    };
  }
  if (side === "away") {
    return {
      participantId: event.away_abbrev,
      participantName: event.away_team,
      opponentId: event.home_abbrev,
      opponentName: event.home_team,
    };
  }
  return {
    participantId: null,
    participantName: null,
    opponentId: null,
    opponentName: null,
  };
}

export function mapSnapshotRowsToGoose2(input: {
  events: SnapshotEventRow[];
  prices: SnapshotPriceRow[];
}) {
  const eventBySnapshotId = new Map(input.events.map((event) => [event.id, event]));

  const eventRowsById = new Map<string, Goose2MarketEvent>();
  const candidateRows: Goose2MarketCandidate[] = [];

  for (const price of input.prices) {
    const event = eventBySnapshotId.get(price.event_snapshot_id);
    if (!event) continue;

    const normalizedCommenceTime = normalizeTimestamp(event.commence_time);
    const fallbackNow = new Date().toISOString();
    const normalizedEventCapturedAt = normalizeRequiredTimestamp(event.captured_at, fallbackNow);
    const normalizedPriceCapturedAt = normalizeRequiredTimestamp(price.captured_at, normalizedEventCapturedAt);
    const normalizedSourceUpdatedAt = normalizeTimestamp(price.source_updated_at);

    const truthfulSourceEvent = resolveTruthfulSourceEvent(event);
    const truthfulSourceEventId = truthfulSourceEvent.sourceEventId;

    const eventId = buildGoose2EventId({
      sport: event.sport,
      league: event.sport,
      awayTeam: event.away_team,
      homeTeam: event.home_team,
      commenceTime: truthfulSourceEvent.fallbackCommenceTime ?? normalizedCommenceTime,
      source: event.source,
      sourceEventId: truthfulSourceEventId,
    });

    if (!eventRowsById.has(eventId)) {
      eventRowsById.set(eventId, {
        event_id: eventId,
        sport: event.sport,
        league: event.sport,
        event_date: (normalizedCommenceTime ?? normalizedEventCapturedAt).slice(0, 10),
        commence_time: normalizedCommenceTime,
        home_team: event.home_team,
        away_team: event.away_team,
        home_team_id: event.home_abbrev,
        away_team_id: event.away_abbrev,
        event_label: event.matchup,
        status: "scheduled",
        source: event.source,
        source_event_id: truthfulSourceEventId,
        odds_api_event_id: event.odds_api_event_id,
        venue: null,
        metadata: {
          snapshot_id: event.snapshot_id,
          event_snapshot_id: event.id,
          source_event_id_truthful: truthfulSourceEventId,
          source_event_id_kind: truthfulSourceEvent.sourceEventIdKind,
          snapshot_game_id: truthfulSourceEvent.snapshotGameId,
          real_game_id: truthfulSourceEvent.realGameId,
        },
      });
    }

    const inferred = inferParticipantNames(event, price.outcome);
    const marketType = mapSnapshotMarketType(price);
    const participantId = price.participant_id ?? inferred.participantId;
    const participantName = price.participant_name ?? inferred.participantName;
    const opponentName = price.opponent_name ?? inferred.opponentName;

    candidateRows.push({
      candidate_id: buildGoose2CandidateId({
        eventId,
        marketType,
        participantId,
        participantName,
        side: price.outcome,
        line: price.line,
        book: price.book,
        captureTs: normalizedPriceCapturedAt,
      }),
      event_id: eventId,
      sport: event.sport,
      league: event.sport,
      event_date: (normalizedCommenceTime ?? normalizedPriceCapturedAt).slice(0, 10),
      market_type: marketType,
      submarket_type: price.prop_market_key ?? null,
      participant_type: inferParticipantType(event.sport, price.participant_type),
      participant_id: participantId,
      participant_name: participantName,
      opponent_id: inferred.opponentId,
      opponent_name: opponentName,
      side: price.outcome,
      line: price.line,
      odds: price.odds,
      book: price.book,
      sportsbook: price.book,
      capture_ts: normalizedPriceCapturedAt,
      snapshot_id: price.snapshot_id,
      event_snapshot_id: price.event_snapshot_id,
      source: price.source,
      source_market_id: price.id,
      is_best_price: false,
      is_opening: false,
      is_closing: false,
      raw_payload: {
        snapshot_price_id: price.id,
        source_updated_at: normalizedSourceUpdatedAt,
        source_age_minutes: price.source_age_minutes,
      },
      normalized_payload: {
        original_market_type: price.market_type,
        original_outcome: price.outcome,
        prop_type: price.prop_type ?? null,
        prop_market_key: price.prop_market_key ?? null,
        context: price.context ?? {},
      },
    });
  }

  return {
    eventRows: Array.from(eventRowsById.values()),
    candidateRows,
  };
}

export async function loadSnapshotRowsForBackfill(input: { limit?: number; sport?: string; dateKey?: string }) {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 5000);
  const sportClause = input.sport ? `&sport=eq.${encodeURIComponent(input.sport)}` : "";

  const snapshotIds = input.dateKey
    ? (await postgrest<Array<{ id: string }>>(
        `/market_snapshots?select=id&date_key=eq.${encodeURIComponent(input.dateKey)}&order=captured_at.desc&limit=${limit}`,
      )).map((row) => row.id)
    : [];

  const snapshotIdClause = snapshotIds.length
    ? `&snapshot_id=in.(${encodeURIComponent(snapshotIds.map((id) => `"${id}"`).join(","))})`
    : input.dateKey
      ? "&snapshot_id=in.(\"__no_snapshot_match__\")"
      : "";

  const events = await postgrest<SnapshotEventRow[]>(
    `/market_snapshot_events?select=id,snapshot_id,sport,game_id,odds_api_event_id,commence_time,matchup,home_team,away_team,home_abbrev,away_abbrev,captured_at,source&order=captured_at.desc&limit=${limit}${sportClause}${snapshotIdClause}`,
  );

  const eventIds = Array.from(new Set((events ?? []).map((event) => event.id))).slice(0, limit);
  if (!eventIds.length) return { events: [], prices: [] };

  const idList = eventIds.map((id) => `"${id}"`).join(",");
  const prices = await postgrest<SnapshotPriceRow[]>(
    `/market_snapshot_prices?select=id,snapshot_id,event_snapshot_id,sport,game_id,odds_api_event_id,commence_time,captured_at,book,market_type,outcome,odds,line,source,source_updated_at,source_age_minutes,participant_type,participant_id,participant_name,opponent_name,prop_type,prop_market_key,context&event_snapshot_id=in.(${encodeURIComponent(idList)})${sportClause}&order=captured_at.desc&limit=${Math.min(limit * 20, 40000)}`,
  );

  return {
    events: events ?? [],
    prices: prices ?? [],
  };
}
