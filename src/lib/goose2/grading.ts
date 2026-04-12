import { getMLBF5Linescore } from "@/lib/mlb-api";
import { findMLBTeamAbbreviationByName } from "@/lib/mlb-mappings";
import { getBroadSchedule } from "@/lib/nhl-api";
import { fetchJSON } from "@/lib/pick-resolver";
import { upsertGoose2Results } from "@/lib/goose2/repository";
import type {
  Goose2IntegrityStatus,
  Goose2MarketCandidate,
  Goose2MarketEvent,
  Goose2MarketResult,
  Goose2ResultStatus,
} from "@/lib/goose2/types";

const NBA_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const NHL_BASE = "https://api-web.nhle.com/v1";
const PGA_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard";
const nbaGameIdCache = new Map<string, Promise<{ gameId: string | null; resolution: string; payload?: Record<string, unknown> }>>();
const mlbGameIdCache = new Map<string, Promise<{ gameId: string | null; resolution: string; payload?: Record<string, unknown> }>>();

type GradeableGoose2Market =
  | "moneyline"
  | "spread"
  | "total"
  | "first_five_moneyline"
  | "first_five_total"
  | "player_prop_points"
  | "player_prop_rebounds"
  | "player_prop_assists"
  | "player_prop_shots_on_goal"
  | "player_prop_goals"
  | "player_prop_hits"
  | "player_prop_total_bases"
  | "player_prop_strikeouts"
  | "player_prop_home_runs"
  | "player_prop_threes"
  | "golf_top_5"
  | "golf_top_10"
  | "golf_top_20";

function normalizeTeam(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeMLBTeam(value?: string | null) {
  const normalized = normalizeTeam(value);
  return normalized === "ATH" ? "OAK" : normalized;
}

function toTitleDateHourKey(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13);
}

function isNumericId(value?: string | null) {
  return /^\d+$/.test(String(value ?? "").trim());
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumericStat(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return Number(raw) || 0;
  const made = raw.match(/^(\d+)-/);
  if (made) return parseInt(made[1], 10) || 0;
  return parseInt(raw, 10) || 0;
}

function parseBaseballInnings(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const [whole, fraction] = raw.split(".");
  const innings = toNumber(whole);
  const outs = toNumber(fraction);
  if (!fraction) return innings;
  return innings + Math.min(outs, 2) / 3;
}

function resolveByLine(actual: number, line: number, side: string): Goose2ResultStatus {
  const normalizedSide = side.toLowerCase();
  if (normalizedSide === "under") {
    if (actual < line) return "win";
    if (actual > line) return "loss";
    return "push";
  }
  if (actual > line) return "win";
  if (actual < line) return "loss";
  return "push";
}

function resolveSpreadResult(teamScore: number, opponentScore: number, spreadLine: number): Goose2ResultStatus {
  const adjustedMargin = (teamScore - opponentScore) + spreadLine;
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin < 0) return "loss";
  return "push";
}

function unsupportedResult(candidate: Goose2MarketCandidate, notes: string): Goose2MarketResult {
  return {
    candidate_id: candidate.candidate_id,
    event_id: candidate.event_id,
    result: "ungradeable",
    actual_stat: null,
    actual_stat_text: null,
    closing_line: null,
    closing_odds: null,
    settlement_ts: new Date().toISOString(),
    grade_source: "goose2-grader",
    integrity_status: "manual_review",
    grading_notes: notes,
    source_payload: {
      market_type: candidate.market_type,
      side: candidate.side,
      participant_name: candidate.participant_name,
      opponent_name: candidate.opponent_name,
    },
  };
}

function pendingResult(candidate: Goose2MarketCandidate, notes: string, payload: Record<string, unknown> = {}): Goose2MarketResult {
  return {
    candidate_id: candidate.candidate_id,
    event_id: candidate.event_id,
    result: "pending",
    actual_stat: null,
    actual_stat_text: null,
    closing_line: null,
    closing_odds: null,
    settlement_ts: null,
    grade_source: "goose2-grader",
    integrity_status: "pending",
    grading_notes: notes,
    source_payload: payload,
  };
}

function settledResult(input: {
  candidate: Goose2MarketCandidate;
  result: Goose2ResultStatus;
  actualStat?: number | null;
  actualStatText?: string | null;
  notes?: string | null;
  payload?: Record<string, unknown>;
  integrityStatus?: Goose2IntegrityStatus;
}): Goose2MarketResult {
  return {
    candidate_id: input.candidate.candidate_id,
    event_id: input.candidate.event_id,
    result: input.result,
    actual_stat: input.actualStat ?? null,
    actual_stat_text: input.actualStatText ?? null,
    closing_line: input.candidate.line ?? null,
    closing_odds: input.candidate.odds ?? null,
    settlement_ts: new Date().toISOString(),
    grade_source: "goose2-grader",
    integrity_status: input.integrityStatus ?? "ok",
    grading_notes: input.notes ?? null,
    source_payload: input.payload ?? {},
  };
}

function isFinalNHL(boxscore: any) {
  const state = String(boxscore?.gameState ?? "").toUpperCase();
  return state === "OFF" || state === "FINAL";
}

function getNBACompetition(summary: any) {
  return summary?.header?.competitions?.[0] ?? summary?.competitions?.[0] ?? null;
}

function isFinalNBA(summary: any) {
  const competition = getNBACompetition(summary);
  const statusType = competition?.status?.type ?? summary?.status?.type ?? {};
  return statusType?.completed === true;
}

function isFinalMLB(game: any) {
  const abstractState = String(game?.status?.abstractGameState ?? "").toUpperCase();
  const codedState = String(game?.status?.codedGameState ?? "").toUpperCase();
  return abstractState === "FINAL" || ["F", "O"].includes(codedState);
}

async function fetchMLBScheduleGame(gameId: string, date: string) {
  const dateKeys = getAdjacentDateKeys(date);
  const boards = await Promise.all(
    dateKeys.map((dateKey) => fetchJSON<any>(`${MLB_BASE}/schedule?date=${dateKey}&sportId=1&hydrate=linescore`)),
  );
  return boards
    .flatMap((board) => board?.dates ?? [])
    .flatMap((entry: any) => entry?.games ?? [])
    .find((game: any) => String(game?.gamePk ?? "") === gameId) || null;
}

function resolveDirectNumericGameId(event: Goose2MarketEvent, extraCandidates: Array<unknown> = []) {
  const metadataCandidates = [
    event.metadata?.real_game_id,
    event.metadata?.gameId,
    event.metadata?.snapshot_game_id,
    event.metadata?.source_event_id,
  ];
  const candidates = [...extraCandidates, ...metadataCandidates, event.source_event_id].filter((value) => value != null);
  for (const value of candidates) {
    const trimmed = String(value).trim();
    if (isNumericId(trimmed)) return trimmed;
  }
  return null;
}

function resolveDirectNHLGameId(event: Goose2MarketEvent) {
  return resolveDirectNumericGameId(event, [event.odds_api_event_id]);
}

function parseSnapshotGameKey(value?: unknown) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^NHL:([A-Z]{2,4})@([A-Z]{2,4}):(\d{4}-\d{2}-\d{2})T(\d{2})$/);
  if (!match) return null;
  return {
    away: match[1],
    home: match[2],
    date: match[3],
    hourKey: `${match[3]}T${match[4]}`,
  };
}

function getAdjacentDateKeys(dateKey: string) {
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return [dateKey];

  return [-1, 0, 1].map((offset) => {
    const next = new Date(parsed);
    next.setUTCDate(parsed.getUTCDate() + offset);
    return next.toISOString().slice(0, 10);
  });
}

async function resolveNHLGameId(event: Goose2MarketEvent): Promise<{ gameId: string | null; resolution: string; payload?: Record<string, unknown> }> {
  const direct = resolveDirectNHLGameId(event);
  if (direct) return { gameId: direct, resolution: "direct_numeric_id" };

  const boardDate = String(event.event_date || "").trim();
  const snapshotKey = parseSnapshotGameKey(event.metadata?.snapshot_game_id);
  const away = normalizeTeam(snapshotKey?.away || event.away_team_id || event.away_team);
  const home = normalizeTeam(snapshotKey?.home || event.home_team_id || event.home_team);
  const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
  const eventHourKey = snapshotKey?.hourKey || toTitleDateHourKey(event.commence_time);
  const dateKeys = getAdjacentDateKeys(snapshotKey?.date || boardDate);
  const boards = await Promise.all(
    dateKeys.map((dateKey) => fetchJSON<any>(`${NHL_BASE}/schedule/${dateKey}`)),
  );
  const matches = boards
    .flatMap((board, index) =>
      (board?.gameWeek ?? [])
        .flatMap((day: any) => (day?.games ?? []).map((game: any) => ({ game, requestDate: dateKeys[index] }))),
    )
    .filter(({ game }) => {
      const gameDate = String(game?.startTimeUTC || "").slice(0, 10);
      return gameDate === boardDate
        && normalizeTeam(game?.awayTeam?.abbrev) === away
        && normalizeTeam(game?.homeTeam?.abbrev) === home;
    });

  if (matches.length === 1) {
    const matched = matches[0];
    return {
      gameId: String(matched.game.id),
      resolution: "matched_by_schedule_exact",
      payload: { matched_start: matched.game.startTimeUTC, board_date: boardDate, matched_date: matched.requestDate, away, home },
    };
  }

  if (matches.length > 1) {
    const hourMatched = matches.filter(({ game }) => toTitleDateHourKey(game?.startTimeUTC) === eventHourKey);
    if (hourMatched.length === 1) {
      const matched = hourMatched[0];
      return {
        gameId: String(matched.game.id),
        resolution: "matched_by_schedule_hour_key",
        payload: {
          matched_start: matched.game.startTimeUTC,
          matched_date: matched.requestDate,
          board_date: boardDate,
          away,
          home,
          event_hour_key: eventHourKey,
        },
      };
    }
  }

  if (matches.length > 1 && Number.isFinite(eventStartMs)) {
    const ranked = matches
      .map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game.startTimeUTC).getTime() - eventStartMs) }))
      .sort((a, b) => a.diffMs - b.diffMs);

    const best = ranked[0];
    const second = ranked[1];
    if (best && best.diffMs <= 3 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) {
      return {
        gameId: String(best.game.id),
        resolution: "matched_by_schedule_time_proximity",
        payload: {
          matched_start: best.game.startTimeUTC,
          matched_date: best.requestDate,
          time_diff_minutes: Math.round(best.diffMs / 60000),
          board_date: boardDate,
          away,
          home,
        },
      };
    }
  }

  const broadSchedule = await getBroadSchedule(4);
  const fallbackMatches = broadSchedule.games.filter((game) => {
    const gameDate = String(game.startTimeUTC || "").slice(0, 10);
    return gameDate === boardDate
      && normalizeTeam(game.awayTeam?.abbrev) === away
      && normalizeTeam(game.homeTeam?.abbrev) === home;
  });

  if (fallbackMatches.length === 1) {
    return {
      gameId: String(fallbackMatches[0].id),
      resolution: "matched_by_broad_schedule_exact",
      payload: { matched_start: fallbackMatches[0].startTimeUTC, board_date: boardDate, away, home },
    };
  }

  return {
    gameId: null,
    resolution: "unresolved",
    payload: {
      source_event_id: event.source_event_id,
      odds_api_event_id: event.odds_api_event_id,
      board_date: boardDate,
      searched_dates: dateKeys,
      away,
      home,
    },
  };
}

async function resolveNBAGameId(event: Goose2MarketEvent): Promise<{ gameId: string | null; resolution: string; payload?: Record<string, unknown> }> {
  const cacheKey = event.event_id || `${event.sport}:${event.event_date}:${event.away_team_id || event.away_team}@${event.home_team_id || event.home_team}`;
  const cached = nbaGameIdCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const direct = resolveDirectNumericGameId(event);
    if (direct) return { gameId: direct, resolution: "direct_numeric_id" };

    const boardDate = String(event.event_date || "").trim();
    const away = normalizeTeam(event.away_team_id || event.away_team);
    const home = normalizeTeam(event.home_team_id || event.home_team);
    const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
    const dateKeys = getAdjacentDateKeys(boardDate);
    const boards = await Promise.all(dateKeys.map((dateKey) => fetchJSON<any>(`${NBA_BASE}/scoreboard?dates=${dateKey.replace(/-/g, "")}`)));
    const matches = boards
      .flatMap((board, index) => (board?.events ?? []).map((game: any) => ({ game, requestDate: dateKeys[index] })))
      .filter(({ game }) => {
        const competition = game?.competitions?.[0] ?? {};
        const competitors = competition?.competitors ?? [];
        const homeTeam = competitors.find((entry: any) => entry.homeAway === "home") ?? competitors[0];
        const awayTeam = competitors.find((entry: any) => entry.homeAway === "away") ?? competitors[1];
        return normalizeTeam(awayTeam?.team?.abbreviation) === away
          && normalizeTeam(homeTeam?.team?.abbreviation) === home;
      });

    if (matches.length === 1) {
      const matched = matches[0];
      return {
        gameId: String(matched.game.id),
        resolution: "matched_by_scoreboard_exact",
        payload: { matched_start: matched.game?.date ?? null, board_date: boardDate, matched_date: matched.requestDate, away, home },
      };
    }

    if (matches.length > 1 && Number.isFinite(eventStartMs)) {
      const ranked = matches
        .map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game?.date ?? 0).getTime() - eventStartMs) }))
        .sort((a, b) => a.diffMs - b.diffMs);

      const best = ranked[0];
      const second = ranked[1];
      if (best && best.diffMs <= 3 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) {
        return {
          gameId: String(best.game.id),
          resolution: "matched_by_scoreboard_time_proximity",
          payload: {
            matched_start: best.game?.date ?? null,
            matched_date: best.requestDate,
            time_diff_minutes: Math.round(best.diffMs / 60000),
            board_date: boardDate,
            away,
            home,
          },
        };
      }
    }

    return {
      gameId: null,
      resolution: "unresolved",
      payload: {
        source_event_id: event.source_event_id,
        odds_api_event_id: event.odds_api_event_id,
        board_date: boardDate,
        searched_dates: dateKeys,
        away,
        home,
      },
    };
  })();

  nbaGameIdCache.set(cacheKey, promise);
  return promise;
}

function resolveMLBScheduleTeamAbbrev(team: any) {
  return normalizeMLBTeam(
    team?.abbreviation
      || team?.fileCode
      || findMLBTeamAbbreviationByName(team?.name || team?.teamName || team?.clubName || team?.locationName || ""),
  );
}

async function resolveMLBGameId(event: Goose2MarketEvent): Promise<{ gameId: string | null; resolution: string; payload?: Record<string, unknown> }> {
  const cacheKey = event.event_id || `${event.sport}:${event.event_date}:${event.away_team_id || event.away_team}@${event.home_team_id || event.home_team}`;
  const cached = mlbGameIdCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const direct = resolveDirectNumericGameId(event);
    if (direct) return { gameId: direct, resolution: "direct_numeric_id" };

    const boardDate = String(event.event_date || "").trim();
    const away = normalizeMLBTeam(event.away_team_id || event.away_team);
    const home = normalizeMLBTeam(event.home_team_id || event.home_team);
    const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
    const eventHourKey = toTitleDateHourKey(event.commence_time);
    const sourceHourMatch = String(event.source_event_id || "").match(/:(\d{4}-\d{2}-\d{2}T\d{2})$/);
    const sourceHourKey = sourceHourMatch?.[1] ?? null;
    const dateKeys = getAdjacentDateKeys(boardDate);
    const boards = await Promise.all(dateKeys.map((dateKey) => fetchJSON<any>(`${MLB_BASE}/schedule?date=${dateKey}&sportId=1`)));
    const matches = boards
      .flatMap((board, index) =>
        (board?.dates ?? [])
          .flatMap((entry: any) => entry?.games ?? [])
          .map((game: any) => ({ game, requestDate: dateKeys[index] })),
      )
      .filter(({ game }) => {
        const awayTeam = resolveMLBScheduleTeamAbbrev(game?.teams?.away?.team);
        const homeTeam = resolveMLBScheduleTeamAbbrev(game?.teams?.home?.team);
        return awayTeam === away && homeTeam === home;
      });

    if (matches.length === 1) {
      const matched = matches[0];
      return {
        gameId: String(matched.game.gamePk),
        resolution: "matched_by_schedule_exact",
        payload: { matched_start: matched.game?.gameDate ?? null, board_date: boardDate, matched_date: matched.requestDate, away, home },
      };
    }

    if (matches.length > 1) {
      const hourMatched = matches.filter(({ game }) => {
        const gameHourKey = toTitleDateHourKey(game?.gameDate);
        return gameHourKey != null && (gameHourKey === eventHourKey || gameHourKey === sourceHourKey);
      });

      if (hourMatched.length === 1) {
        const matched = hourMatched[0];
        return {
          gameId: String(matched.game.gamePk),
          resolution: "matched_by_schedule_hour_key",
          payload: {
            matched_start: matched.game?.gameDate ?? null,
            matched_date: matched.requestDate,
            board_date: boardDate,
            away,
            home,
            event_hour_key: eventHourKey,
            source_hour_key: sourceHourKey,
          },
        };
      }
    }

    if (matches.length > 1 && Number.isFinite(eventStartMs)) {
      const ranked = matches
        .map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game?.gameDate ?? 0).getTime() - eventStartMs) }))
        .sort((a, b) => a.diffMs - b.diffMs);

      const best = ranked[0];
      const second = ranked[1];
      if (best && best.diffMs <= 12 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) {
        return {
          gameId: String(best.game.gamePk),
          resolution: "matched_by_schedule_time_proximity",
          payload: {
            matched_start: best.game?.gameDate ?? null,
            matched_date: best.requestDate,
            time_diff_minutes: Math.round(best.diffMs / 60000),
            board_date: boardDate,
            away,
            home,
            event_hour_key: eventHourKey,
            source_hour_key: sourceHourKey,
          },
        };
      }
    }

    return {
      gameId: null,
      resolution: "unresolved",
      payload: {
        source_event_id: event.source_event_id,
        odds_api_event_id: event.odds_api_event_id,
        board_date: boardDate,
        searched_dates: dateKeys,
        away,
        home,
      },
    };
  })();

  mlbGameIdCache.set(cacheKey, promise);
  return promise;
}

async function gradeNHL(candidate: Goose2MarketCandidate, event: Goose2MarketEvent): Promise<Goose2MarketResult> {
  const resolvedId = await resolveNHLGameId(event);
  const gameId = resolvedId.gameId;
  if (!gameId) {
    return settledResult({
      candidate,
      result: "ungradeable",
      integrityStatus: "manual_review",
      notes: `NHL event missing resolvable numeric game id. resolution=${resolvedId.resolution}`,
      payload: { ...(resolvedId.payload ?? {}), metadata: event.metadata },
    });
  }
  const boxscore = await fetchJSON<any>(`${NHL_BASE}/gamecenter/${gameId}/boxscore`);
  if (!boxscore || !isFinalNHL(boxscore)) return pendingResult(candidate, "NHL game not final yet.");

  const homeAbbrev = normalizeTeam(boxscore.homeTeam?.abbrev);
  const awayAbbrev = normalizeTeam(boxscore.awayTeam?.abbrev);
  const homeScore = toNumber(boxscore.homeTeam?.score);
  const awayScore = toNumber(boxscore.awayTeam?.score);

  if (candidate.market_type === "moneyline" || candidate.market_type === "spread" || candidate.market_type === "total") {
    if (candidate.market_type === "total") {
      if (candidate.line == null) return unsupportedResult(candidate, "NHL total candidate missing line.");
      const total = homeScore + awayScore;
      return settledResult({
        candidate,
        result: resolveByLine(total, candidate.line, candidate.side),
        actualStat: total,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `NHL full-game total graded from final boxscore (${resolvedId.resolution}).`,
      });
    }

    const isHome = normalizeTeam(candidate.participant_id ?? candidate.participant_name) === homeAbbrev
      || normalizeTeam(candidate.side) === "HOME";
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    if (candidate.market_type === "moneyline") {
      const result = teamScore > oppScore ? "win" : teamScore < oppScore ? "loss" : "push";
      return settledResult({
        candidate,
        result,
        actualStat: teamScore - oppScore,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `NHL moneyline graded from final boxscore (${resolvedId.resolution}).`,
      });
    }

    if (candidate.line == null) return unsupportedResult(candidate, "NHL spread candidate missing line.");
    return settledResult({
      candidate,
      result: resolveSpreadResult(teamScore, oppScore, candidate.line),
      actualStat: teamScore - oppScore,
      actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
      notes: `NHL spread graded from final boxscore (${resolvedId.resolution}).`,
    });
  }

  const participantKey = normalizeTeam(candidate.participant_id ?? candidate.participant_name);
  const side = participantKey === awayAbbrev ? "awayTeam" : participantKey === homeAbbrev ? "homeTeam" : "homeTeam";
  const teamStats = boxscore.playerByGameStats?.[side] || {};
  const skaters = [...(teamStats.forwards || []), ...(teamStats.defense || [])];
  const player = skaters.find((entry: any) => normalizeTeam(entry?.name?.default) === normalizeTeam(candidate.participant_name));
  if (!player) return unsupportedResult(candidate, `NHL player not found in final boxscore: ${candidate.participant_name ?? "unknown"}.`);

  let actual: number | null = null;
  if (candidate.market_type === "player_prop_shots_on_goal") actual = player.shots ?? player.sog ?? null;
  else if (candidate.market_type === "player_prop_goals") actual = player.goals ?? null;
  else if (candidate.market_type === "player_prop_points") actual = (player.goals ?? 0) + (player.assists ?? 0);
  else if (candidate.market_type === "player_prop_assists") actual = player.assists ?? null;
  else return unsupportedResult(candidate, `Unsupported NHL market_type: ${candidate.market_type}.`);

  if (actual == null || candidate.line == null) return unsupportedResult(candidate, "NHL player prop missing stat or line.");
  return settledResult({
    candidate,
    result: resolveByLine(actual, candidate.line, candidate.side),
    actualStat: actual,
    actualStatText: `${candidate.participant_name}: ${actual}`,
    notes: "NHL player prop graded from final boxscore.",
  });
}

async function gradeNBA(candidate: Goose2MarketCandidate, event: Goose2MarketEvent): Promise<Goose2MarketResult> {
  const resolvedId = await resolveNBAGameId(event);
  const gameId = resolvedId.gameId;
  if (!gameId) {
    return settledResult({
      candidate,
      result: "ungradeable",
      integrityStatus: "manual_review",
      notes: `NBA event missing resolvable numeric game id. resolution=${resolvedId.resolution}`,
      payload: { ...(resolvedId.payload ?? {}), metadata: event.metadata },
    });
  }
  const summary = await fetchJSON<any>(`${NBA_BASE}/summary?event=${gameId}`);
  if (!summary || !isFinalNBA(summary)) {
    return pendingResult(candidate, "NBA game not final yet.", {
      game_id: gameId,
      resolution: resolvedId.resolution,
      ...(resolvedId.payload ?? {}),
    });
  }

  const competition = getNBACompetition(summary);
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((entry: any) => entry.homeAway === "home") ?? competitors[0];
  const away = competitors.find((entry: any) => entry.homeAway === "away") ?? competitors[1];
  const homeAbbrev = normalizeTeam(home?.team?.abbreviation);
  const awayAbbrev = normalizeTeam(away?.team?.abbreviation);
  const homeScore = toNumber(home?.score);
  const awayScore = toNumber(away?.score);

  if (candidate.market_type === "moneyline" || candidate.market_type === "spread" || candidate.market_type === "total") {
    if (candidate.market_type === "total") {
      if (candidate.line == null) return unsupportedResult(candidate, "NBA total candidate missing line.");
      const total = homeScore + awayScore;
      return settledResult({
        candidate,
        result: resolveByLine(total, candidate.line, candidate.side),
        actualStat: total,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `NBA full-game total graded from ESPN summary (${resolvedId.resolution}).`,
      });
    }

    const isHome = normalizeTeam(candidate.participant_id ?? candidate.participant_name) === homeAbbrev
      || normalizeTeam(candidate.side) === "HOME";
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    if (candidate.market_type === "moneyline") {
      const result = teamScore > oppScore ? "win" : teamScore < oppScore ? "loss" : "push";
      return settledResult({
        candidate,
        result,
        actualStat: teamScore - oppScore,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `NBA moneyline graded from ESPN summary (${resolvedId.resolution}).`,
      });
    }

    if (candidate.line == null) return unsupportedResult(candidate, "NBA spread candidate missing line.");
    return settledResult({
      candidate,
      result: resolveSpreadResult(teamScore, oppScore, candidate.line),
      actualStat: teamScore - oppScore,
      actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
      notes: `NBA spread graded from ESPN summary (${resolvedId.resolution}).`,
    });
  }

  if (candidate.market_type === "first_quarter_spread" || candidate.market_type === "third_quarter_spread") {
    return unsupportedResult(candidate, `${candidate.market_type} retained for storage, but not yet trusted for Goose 2 training settlement.`);
  }

  const playerGroups = (summary.boxscore?.players ?? []);
  const players = playerGroups.flatMap((group: any) =>
    (group.statistics ?? []).flatMap((statsGroup: any) => {
      const labels: string[] = statsGroup.labels ?? [];
      const athletes: any[] = statsGroup.athletes ?? [];
      return athletes.map((athlete: any) => ({
        name: athlete.athlete?.displayName ?? "",
        statsByLabel: Object.fromEntries(labels.map((label, index) => [label, parseNumericStat(athlete.stats?.[index])])),
      }));
    }),
  );

  const player = players.find((entry: any) => normalizeTeam(entry.name) === normalizeTeam(candidate.participant_name));
  if (!player) return unsupportedResult(candidate, `NBA player not found in final summary: ${candidate.participant_name ?? "unknown"}.`);

  let actual: number | null = null;
  if (candidate.market_type === "player_prop_points") actual = player.statsByLabel.PTS ?? null;
  else if (candidate.market_type === "player_prop_rebounds") actual = player.statsByLabel.REB ?? null;
  else if (candidate.market_type === "player_prop_assists") actual = player.statsByLabel.AST ?? null;
  else if (candidate.market_type === "player_prop_threes") actual = player.statsByLabel["3PT"] ?? player.statsByLabel["3PM"] ?? null;
  else return unsupportedResult(candidate, `Unsupported NBA market_type: ${candidate.market_type}.`);

  if (actual == null || candidate.line == null) return unsupportedResult(candidate, "NBA player prop missing stat or line.");
  return settledResult({
    candidate,
    result: resolveByLine(actual, candidate.line, candidate.side),
    actualStat: actual,
    actualStatText: `${candidate.participant_name}: ${actual}`,
    notes: `NBA player prop graded from ESPN final summary (${resolvedId.resolution}).`,
  });
}

async function gradeMLB(candidate: Goose2MarketCandidate, event: Goose2MarketEvent): Promise<Goose2MarketResult> {
  const resolvedId = await resolveMLBGameId(event);
  const gameId = resolvedId.gameId;
  if (!gameId) {
    return settledResult({
      candidate,
      result: "ungradeable",
      integrityStatus: "manual_review",
      notes: `MLB event missing resolvable numeric game id. resolution=${resolvedId.resolution}`,
      payload: { ...(resolvedId.payload ?? {}), metadata: event.metadata },
    });
  }
  const game = await fetchMLBScheduleGame(gameId, event.event_date);
  if (!game || !isFinalMLB(game)) {
    return pendingResult(candidate, "MLB game not final yet.", {
      game_id: gameId,
      resolution: resolvedId.resolution,
      ...(resolvedId.payload ?? {}),
    });
  }

  const boxscore = await fetchJSON<any>(`${MLB_BASE}/game/${gameId}/boxscore`);
  if (!boxscore) return pendingResult(candidate, "MLB boxscore unavailable.");

  const homeAbbrev = normalizeMLBTeam(boxscore?.teams?.home?.team?.abbreviation || game?.teams?.home?.team?.abbreviation);
  const awayAbbrev = normalizeMLBTeam(boxscore?.teams?.away?.team?.abbreviation || game?.teams?.away?.team?.abbreviation);
  const homeScore = toNumber(game?.teams?.home?.score);
  const awayScore = toNumber(game?.teams?.away?.score);

  if (candidate.market_type === "first_five_moneyline" || candidate.market_type === "first_five_total") {
    const linescore = await getMLBF5Linescore(gameId);
    if (!linescore.isF5Complete) {
      return settledResult({
        candidate,
        result: "ungradeable",
        integrityStatus: "manual_review",
        notes: "MLB game final but F5 linescore did not return 5 complete innings.",
        payload: { innings_complete: linescore.inningsComplete },
      });
    }
    const { awayRunsF5, homeRunsF5, totalRunsF5 } = linescore;
    if (candidate.market_type === "first_five_total") {
      if (candidate.line == null || totalRunsF5 == null) return unsupportedResult(candidate, "MLB F5 total missing line or total runs.");
      return settledResult({
        candidate,
        result: resolveByLine(totalRunsF5, candidate.line, candidate.side),
        actualStat: totalRunsF5,
        actualStatText: `F5 total ${totalRunsF5}`,
        notes: `MLB first five total graded from per-inning linescore (${resolvedId.resolution}).`,
        payload: { away_runs_f5: awayRunsF5, home_runs_f5: homeRunsF5 },
      });
    }

    if (awayRunsF5 == null || homeRunsF5 == null) return unsupportedResult(candidate, "MLB F5 moneyline missing per-side runs.");
    const isHome = normalizeMLBTeam(candidate.participant_id ?? candidate.participant_name) === homeAbbrev
      || normalizeTeam(candidate.side) === "HOME";
    const teamRuns = isHome ? homeRunsF5 : awayRunsF5;
    const oppRuns = isHome ? awayRunsF5 : homeRunsF5;
    const result = teamRuns > oppRuns ? "win" : teamRuns < oppRuns ? "loss" : "push";
    return settledResult({
      candidate,
      result,
      actualStat: teamRuns - oppRuns,
      actualStatText: `F5 ${awayAbbrev} ${awayRunsF5} @ ${homeAbbrev} ${homeRunsF5}`,
      notes: `MLB first five moneyline graded from per-inning linescore (${resolvedId.resolution}).`,
    });
  }

  if (candidate.market_type === "moneyline" || candidate.market_type === "spread" || candidate.market_type === "total") {
    if (candidate.market_type === "total") {
      if (candidate.line == null) return unsupportedResult(candidate, "MLB total candidate missing line.");
      const total = homeScore + awayScore;
      return settledResult({
        candidate,
        result: resolveByLine(total, candidate.line, candidate.side),
        actualStat: total,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `MLB full-game total graded from final schedule/boxscore (${resolvedId.resolution}).`,
      });
    }

    const isHome = normalizeMLBTeam(candidate.participant_id ?? candidate.participant_name) === homeAbbrev
      || normalizeTeam(candidate.side) === "HOME";
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    if (candidate.market_type === "moneyline") {
      const result = teamScore > oppScore ? "win" : teamScore < oppScore ? "loss" : "push";
      return settledResult({
        candidate,
        result,
        actualStat: teamScore - oppScore,
        actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
        notes: `MLB moneyline graded from final score (${resolvedId.resolution}).`,
      });
    }

    if (candidate.line == null) return unsupportedResult(candidate, "MLB spread candidate missing line.");
    return settledResult({
      candidate,
      result: resolveSpreadResult(teamScore, oppScore, candidate.line),
      actualStat: teamScore - oppScore,
      actualStatText: `${awayAbbrev} ${awayScore} @ ${homeAbbrev} ${homeScore}`,
      notes: `MLB run line graded from final score (${resolvedId.resolution}).`,
    });
  }

  const side = normalizeMLBTeam(candidate.participant_id ?? candidate.participant_name) === awayAbbrev ? "away" : "home";
  const players = Object.values<any>(boxscore?.teams?.[side]?.players ?? {});
  const player = players.find((entry: any) => normalizeTeam(entry?.person?.fullName) === normalizeTeam(candidate.participant_name));
  if (!player) return unsupportedResult(candidate, `MLB player not found in final boxscore: ${candidate.participant_name ?? "unknown"}.`);
  if (candidate.line == null) return unsupportedResult(candidate, "MLB player prop missing line.");

  const batting = player?.stats?.batting ?? {};
  const pitching = player?.stats?.pitching ?? {};
  let actual: number | null = null;
  if (candidate.market_type === "player_prop_hits") actual = batting.hits ?? null;
  else if (candidate.market_type === "player_prop_total_bases") actual = batting.totalBases ?? null;
  else if (candidate.market_type === "player_prop_home_runs") actual = batting.homeRuns ?? null;
  else if (candidate.market_type === "player_prop_strikeouts") actual = pitching.strikeOuts ?? null;
  else return unsupportedResult(candidate, `Unsupported MLB market_type: ${candidate.market_type}.`);

  if (actual == null) return unsupportedResult(candidate, "MLB player prop stat unavailable in final boxscore.");
  return settledResult({
    candidate,
    result: resolveByLine(actual, candidate.line, candidate.side),
    actualStat: actual,
    actualStatText: `${candidate.participant_name}: ${actual}`,
    notes: `MLB player prop graded from final boxscore (${resolvedId.resolution}).`,
  });
}

function parseGolfPlacement(entry: any, competitors: any[]): number | null {
  const rank = String(entry?.curatedRank?.current ?? entry?.curatedRank?.displayValue ?? entry?.position ?? "").trim().toUpperCase();
  if (rank && rank !== "CUT" && rank !== "MC") {
    const parsed = Number(rank.replace(/^T/, ""));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const score = String(entry?.score ?? "").trim().toUpperCase();
  if (score && score !== "CUT" && score !== "MC" && Array.isArray(competitors) && competitors.length > 0) {
    const uniqueBetterScores = new Set(
      competitors
        .map((candidate) => String(candidate?.score ?? "").trim().toUpperCase())
        .filter((candidateScore) => candidateScore && candidateScore !== score && candidateScore !== "CUT" && candidateScore !== "MC")
        .filter((candidateScore) => parseRelativeGolfScore(candidateScore) < parseRelativeGolfScore(score)),
    );
    return uniqueBetterScores.size + 1;
  }

  const order = Number(entry?.order);
  if (Number.isFinite(order) && order > 0) return order;
  return null;
}

function parseRelativeGolfScore(score: string): number {
  const normalized = String(score || "").trim().toUpperCase();
  if (!normalized || normalized === "E" || normalized === "EVEN") return 0;
  const parsed = Number(normalized.replace(/[^0-9+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function gradePGA(candidate: Goose2MarketCandidate, event: Goose2MarketEvent): Promise<Goose2MarketResult> {
  if (!["golf_top_5", "golf_top_10", "golf_top_20"].includes(candidate.market_type)) {
    return unsupportedResult(candidate, `Unsupported PGA market_type for Goose 2 grading: ${candidate.market_type}.`);
  }

  const scoreboard = await fetchJSON<any>(PGA_SCOREBOARD);
  const pgaEvent = Array.isArray(scoreboard?.events)
    ? scoreboard.events.find((entry: any) => String(entry?.date ?? "").slice(0, 10) === event.event_date) ?? scoreboard?.events?.[0]
    : null;
  const competition = pgaEvent?.competitions?.[0];
  const statusType = competition?.status?.type ?? pgaEvent?.status?.type ?? {};
  if (!pgaEvent || statusType?.completed !== true) return pendingResult(candidate, "PGA event not final yet.");

  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const player = competitors.find((entry: any) => normalizeTeam(entry?.athlete?.displayName) === normalizeTeam(candidate.participant_name));
  if (!player) return unsupportedResult(candidate, `PGA player not found on final leaderboard: ${candidate.participant_name ?? "unknown"}.`);

  const place = parseGolfPlacement(player, competitors);
  if (!place) return unsupportedResult(candidate, "PGA final placement unavailable.");
  const threshold = candidate.market_type === "golf_top_5" ? 5 : candidate.market_type === "golf_top_10" ? 10 : 20;
  return settledResult({
    candidate,
    result: place <= threshold ? "win" : "loss",
    actualStat: place,
    actualStatText: `Finished ${place}`,
    notes: `PGA placement graded against top-${threshold} threshold.`,
  });
}

export async function gradeGoose2Candidate(candidate: Goose2MarketCandidate, event: Goose2MarketEvent): Promise<Goose2MarketResult> {
  const market = candidate.market_type as GradeableGoose2Market | "unknown";
  if (market === "unknown") return unsupportedResult(candidate, "Unknown Goose 2 market_type.");
  if (event.sport === "NHL") return gradeNHL(candidate, event);
  if (event.sport === "NBA") return gradeNBA(candidate, event);
  if (event.sport === "MLB") return gradeMLB(candidate, event);
  if (event.sport === "PGA") return gradePGA(candidate, event);
  return unsupportedResult(candidate, `Unsupported sport for Goose 2 grading: ${event.sport}.`);
}

export async function persistGoose2Grades(input: { candidates: Goose2MarketCandidate[]; events: Goose2MarketEvent[] }) {
  const eventById = new Map(input.events.map((event) => [event.event_id, event]));
  const rows: Goose2MarketResult[] = [];

  for (const candidate of input.candidates) {
    const event = eventById.get(candidate.event_id);
    if (!event) {
      rows.push(unsupportedResult(candidate, "Missing Goose 2 event row for candidate."));
      continue;
    }
    rows.push(await gradeGoose2Candidate(candidate, event));
  }

  await upsertGoose2Results(rows);
  return rows;
}
