#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase env');

const headers = (prefer) => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

const NBA_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const NHL_BASE = 'https://api-web.nhle.com/v1';
const SPORTS_DATA_IO = {
  NFL: 'https://api.sportsdata.io/v3/nfl',
};
const SPORTS_DATA_IO_KEY = process.env.SPORTSDATAIO_API_KEY || process.env.SPORTS_DATA_IO_API_KEY || null;

function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

function normalizeTeam(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeMLBTeam(value) {
  const normalized = normalizeTeam(value);
  return normalized === 'ATH' ? 'OAK' : normalized;
}

function toHourKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 13);
}

function getAdjacentDateKeys(dateKey) {
  const parsed = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return [dateKey];
  return [-1, 0, 1].map((offset) => {
    const next = new Date(parsed);
    next.setUTCDate(parsed.getUTCDate() + offset);
    return next.toISOString().slice(0, 10);
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init = {}, attempt = 0) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if ((res.status === 429 || res.status === 403) && attempt < 3) {
      await sleep(1200 * (attempt + 1));
      return fetchJson(url, init, attempt + 1);
    }
    throw new Error(`${res.status} ${url} :: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function select(pathname) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, { headers: headers() });
}

async function patch(pathname, body) {
  return fetchJson(`${supabaseUrl}/rest/v1${pathname}`, {
    method: 'PATCH',
    headers: headers('return=minimal'),
    body: JSON.stringify(body),
  });
}

function resolveDirectNumericGameId(event) {
  const values = [
    event?.metadata?.real_game_id,
    event?.metadata?.gameId,
    event?.metadata?.snapshot_game_id,
    event?.metadata?.source_event_id_truthful,
    event?.source_event_id,
  ].filter((v) => v != null);
  for (const value of values) {
    const trimmed = String(value).trim();
    if (isNumericId(trimmed)) return trimmed;
  }
  return null;
}

async function resolveNHL(event) {
  const direct = resolveDirectNumericGameId(event);
  if (direct) return { gameId: direct, resolution: 'direct_numeric_id' };

  const boardDate = String(event.event_date || '').trim();
  const away = normalizeTeam(event.away_team_id || event.away_team);
  const home = normalizeTeam(event.home_team_id || event.home_team);
  const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
  const eventHourKey = toHourKey(event.commence_time);
  const dateKeys = getAdjacentDateKeys(boardDate);
  const boards = await Promise.all(dateKeys.map((dateKey) => fetchJson(`${NHL_BASE}/schedule/${dateKey}`)));
  const matches = Array.from(new Map(
    boards
      .flatMap((board, index) =>
        (board?.gameWeek ?? [])
          .flatMap((day) => (day?.games ?? []).map((game) => ({ game, requestDate: dateKeys[index] }))),
      )
      .filter(({ game }) => {
        const gameDate = String(game?.startTimeUTC || '').slice(0, 10);
        return gameDate === boardDate
          && normalizeTeam(game?.awayTeam?.abbrev) === away
          && normalizeTeam(game?.homeTeam?.abbrev) === home;
      })
      .map((entry) => [String(entry.game?.id), entry]),
  ).values());

  if (matches.length === 1) return { gameId: String(matches[0].game.id), resolution: 'matched_by_schedule_exact' };
  if (matches.length > 1) {
    const hourMatched = matches.filter(({ game }) => toHourKey(game?.startTimeUTC) === eventHourKey);
    if (hourMatched.length === 1) return { gameId: String(hourMatched[0].game.id), resolution: 'matched_by_schedule_hour_key' };
  }
  if (matches.length > 1 && Number.isFinite(eventStartMs)) {
    const ranked = matches.map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game.startTimeUTC).getTime() - eventStartMs) })).sort((a, b) => a.diffMs - b.diffMs);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.diffMs <= 3 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) return { gameId: String(best.game.id), resolution: 'matched_by_schedule_time_proximity' };
  }
  return { gameId: null, resolution: 'unresolved' };
}

async function resolveNBA(event) {
  const direct = resolveDirectNumericGameId(event);
  if (direct) return { gameId: direct, resolution: 'direct_numeric_id' };

  const boardDate = String(event.event_date || '').trim();
  const away = normalizeTeam(event.away_team_id || event.away_team);
  const home = normalizeTeam(event.home_team_id || event.home_team);
  const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
  const eventHourKey = toHourKey(event.commence_time);
  const dateKeys = getAdjacentDateKeys(boardDate);
  const boards = await Promise.all(dateKeys.map((dateKey) => fetchJson(`${NBA_BASE}/scoreboard?dates=${dateKey.replace(/-/g, '')}`)));
  const matches = Array.from(new Map(
    boards
      .flatMap((board, index) => (board?.events ?? []).map((game) => ({ game, requestDate: dateKeys[index] })))
      .filter(({ game }) => {
        const competition = game?.competitions?.[0] ?? {};
        const competitors = competition?.competitors ?? [];
        const homeTeam = competitors.find((entry) => entry.homeAway === 'home') ?? competitors[0];
        const awayTeam = competitors.find((entry) => entry.homeAway === 'away') ?? competitors[1];
        return normalizeTeam(awayTeam?.team?.abbreviation) === away && normalizeTeam(homeTeam?.team?.abbreviation) === home;
      })
      .map((entry) => [String(entry.game?.id), entry]),
  ).values());

  if (matches.length === 1) return { gameId: String(matches[0].game.id), resolution: 'matched_by_scoreboard_exact' };
  if (matches.length > 1) {
    const hourMatched = matches.filter(({ game }) => toHourKey(game?.date) === eventHourKey);
    if (hourMatched.length === 1) return { gameId: String(hourMatched[0].game.id), resolution: 'matched_by_scoreboard_hour_key' };
  }
  if (matches.length > 1 && Number.isFinite(eventStartMs)) {
    const ranked = matches.map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game?.date ?? 0).getTime() - eventStartMs) })).sort((a, b) => a.diffMs - b.diffMs);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.diffMs <= 3 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) return { gameId: String(best.game.id), resolution: 'matched_by_scoreboard_time_proximity' };
  }
  return { gameId: null, resolution: 'unresolved' };
}

async function resolveMLB(event) {
  const direct = resolveDirectNumericGameId(event);
  if (direct) return { gameId: direct, resolution: 'direct_numeric_id' };

  const boardDate = String(event.event_date || '').trim();
  const away = normalizeMLBTeam(event.away_team_id || event.away_team);
  const home = normalizeMLBTeam(event.home_team_id || event.home_team);
  const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;
  const eventHourKey = toHourKey(event.commence_time);
  const dateKeys = getAdjacentDateKeys(boardDate);
  const boards = await Promise.all(dateKeys.map((dateKey) => fetchJson(`${MLB_BASE}/schedule?date=${dateKey}&sportId=1`)));
  const matches = boards
    .flatMap((board, index) => (board?.dates ?? []).flatMap((entry) => (entry?.games ?? []).map((game) => ({ game, requestDate: dateKeys[index] }))))
    .filter(({ game }) => {
      const awayTeam = normalizeMLBTeam(game?.teams?.away?.team?.abbreviation || game?.teams?.away?.team?.fileCode || game?.teams?.away?.team?.teamCode || '');
      const homeTeam = normalizeMLBTeam(game?.teams?.home?.team?.abbreviation || game?.teams?.home?.team?.fileCode || game?.teams?.home?.team?.teamCode || '');
      return awayTeam === away && homeTeam === home;
    });

  if (matches.length === 1) return { gameId: String(matches[0].game.gamePk), resolution: 'matched_by_schedule_exact' };
  if (matches.length > 1) {
    const hourMatched = matches.filter(({ game }) => toHourKey(game?.gameDate) === eventHourKey);
    if (hourMatched.length === 1) return { gameId: String(hourMatched[0].game.gamePk), resolution: 'matched_by_schedule_hour_key' };
  }
  if (matches.length > 1 && Number.isFinite(eventStartMs)) {
    const ranked = matches.map((entry) => ({ ...entry, diffMs: Math.abs(new Date(entry.game?.gameDate ?? 0).getTime() - eventStartMs) })).sort((a, b) => a.diffMs - b.diffMs);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.diffMs <= 12 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) return { gameId: String(best.game.gamePk), resolution: 'matched_by_schedule_time_proximity' };
  }
  return { gameId: null, resolution: 'unresolved' };
}

async function resolveNFL(event) {
  const direct = resolveDirectNumericGameId(event);
  if (direct) return { gameId: direct, resolution: 'direct_numeric_id' };
  if (!SPORTS_DATA_IO_KEY) return { gameId: null, resolution: 'missing_sportsdataio_key' };

  const season = Number(String(event.event_date || '').slice(0, 4));
  if (!Number.isFinite(season)) return { gameId: null, resolution: 'bad_event_date' };

  const away = normalizeTeam(event.away_team_id || event.away_team);
  const home = normalizeTeam(event.home_team_id || event.home_team);
  const games = await fetchJson(`${SPORTS_DATA_IO.NFL}/scores/json/ScoresBySeason/${season}`, {
    headers: { 'Ocp-Apim-Subscription-Key': SPORTS_DATA_IO_KEY },
  });

  const matches = (games || []).filter((game) => {
    const dateKey = String(game?.Date || '').slice(0, 10);
    return dateKey === String(event.event_date || '').slice(0, 10)
      && normalizeTeam(game?.AwayTeam) === away
      && normalizeTeam(game?.HomeTeam) === home;
  });

  if (matches.length === 1) return { gameId: String(matches[0].GameID || matches[0].GlobalGameID || matches[0].ScoreID), resolution: 'matched_by_scoresbyseason_exact' };
  return { gameId: null, resolution: matches.length > 1 ? 'ambiguous_scoresbyseason_match' : 'unresolved' };
}

async function resolveByLeague(event) {
  const league = String(event.league || event.sport || '').toUpperCase();
  if (league === 'NHL') return resolveNHL(event);
  if (league === 'NBA') return resolveNBA(event);
  if (league === 'MLB') return resolveMLB(event);
  if (league === 'NFL') return resolveNFL(event);
  return { gameId: null, resolution: 'unsupported_league' };
}

const start = process.argv[2];
const end = process.argv[3];
const league = (process.argv[4] || 'NHL').toUpperCase();
if (!start || !end) throw new Error('Usage: node scripts/enrich-historical-league-ids.mjs <YYYY-MM-DD> <YYYY-MM-DD> <LEAGUE>');

const rows = await select(`/goose_market_events?select=event_id,league,sport,event_date,commence_time,home_team,away_team,home_team_id,away_team_id,source_event_id,odds_api_event_id,metadata&league=eq.${league}&event_date=gte.${start}&event_date=lte.${end}&limit=5000`);
const targets = (rows || []).filter((row) => !isNumericId(row?.metadata?.real_game_id) && !isNumericId(row?.source_event_id));

const report = [];
for (const row of targets) {
  try {
    const resolved = await resolveByLeague(row);
    if (!resolved.gameId) {
      report.push({ event_id: row.event_id, updated: false, resolution: resolved.resolution });
      continue;
    }
    const metadata = {
      ...(row.metadata || {}),
      real_game_id: resolved.gameId,
      source_event_id_truthful: resolved.gameId,
      source_event_id_kind: 'league_game_id',
      id_enriched_at: new Date().toISOString(),
      id_enrichment_resolution: resolved.resolution,
      id_enrichment_script: 'enrich-historical-league-ids.mjs',
    };
    await patch(`/goose_market_events?event_id=eq.${encodeURIComponent(row.event_id)}`, {
      source_event_id: resolved.gameId,
      metadata,
    });
    report.push({ event_id: row.event_id, updated: true, game_id: resolved.gameId, resolution: resolved.resolution });
  } catch (error) {
    report.push({ event_id: row.event_id, updated: false, resolution: 'resolver_error', error: String(error.message || error) });
  }
}

console.log(JSON.stringify({ ok: true, league, start, end, scanned: targets.length, updated: report.filter((r) => r.updated).length, unresolved: report.filter((r) => !r.updated).length, sample: report.slice(0, 25) }, null, 2));
