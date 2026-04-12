import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NHL_BASE = "https://api-web.nhle.com/v1";

if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env");

function headers(prefer) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function squash(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function isNumericId(value) {
  return /^\d+$/.test(String(value || "").trim());
}

const events = await fetchJson(
  `${supabaseUrl}/rest/v1/goose_market_events?select=event_id,event_date,commence_time,home_team,away_team,home_team_id,away_team_id,source_event_id,odds_api_event_id,metadata&sport=eq.NHL&event_date=eq.${date}&limit=500`,
  { headers: headers() },
);

const prevDate = new Date(`${date}T00:00:00Z`);
prevDate.setUTCDate(prevDate.getUTCDate() - 1);
const prevDateKey = prevDate.toISOString().slice(0, 10);
const schedulePayloads = await Promise.all([
  fetchJson(`${NHL_BASE}/schedule/${prevDateKey}`),
  fetchJson(`${NHL_BASE}/schedule/${date}`),
]);
const scheduleGames = schedulePayloads.flatMap((payload) => (Array.isArray(payload?.gameWeek) ? payload.gameWeek : []).flatMap((day) => day.games || []));

const updates = [];
for (const event of events || []) {
  if (isNumericId(event.source_event_id)) continue;

  const boardDate = String(event.commence_time || event.event_date || "").slice(0, 10);
  const awayAbbrev = squash(event.away_team_id);
  const homeAbbrev = squash(event.home_team_id);
  const awayName = squash(event.away_team);
  const homeName = squash(event.home_team);
  const eventStartMs = event.commence_time ? new Date(event.commence_time).getTime() : NaN;

  const matches = scheduleGames.filter((game) => {
    const gameDate = String(game.startTimeUTC || "").slice(0, 10);
    const gameAwayAbbrev = squash(game.awayTeam?.abbrev);
    const gameHomeAbbrev = squash(game.homeTeam?.abbrev);
    const gameAwayName = squash(`${game.awayTeam?.placeName?.default || game.awayTeam?.placeName || ""} ${game.awayTeam?.commonName?.default || game.awayTeam?.commonName || ""}`) || squash(game.awayTeam?.name?.default || game.awayTeam?.name);
    const gameHomeName = squash(`${game.homeTeam?.placeName?.default || game.homeTeam?.placeName || ""} ${game.homeTeam?.commonName?.default || game.homeTeam?.commonName || ""}`) || squash(game.homeTeam?.name?.default || game.homeTeam?.name);

    const awayMatch = (awayAbbrev && gameAwayAbbrev === awayAbbrev) || (awayName && gameAwayName === awayName);
    const homeMatch = (homeAbbrev && gameHomeAbbrev === homeAbbrev) || (homeName && gameHomeName === homeName);
    const dateClose = gameDate === boardDate || (Number.isFinite(eventStartMs) && Math.abs(new Date(game.startTimeUTC).getTime() - eventStartMs) <= 12 * 60 * 60 * 1000);

    return dateClose && awayMatch && homeMatch;
  });

  let resolved = null;
  if (matches.length === 1) {
    resolved = String(matches[0].id);
  } else if (matches.length > 1 && Number.isFinite(eventStartMs)) {
    const ranked = matches
      .map((game) => ({ game, diffMs: Math.abs(new Date(game.startTimeUTC).getTime() - eventStartMs) }))
      .sort((a, b) => a.diffMs - b.diffMs);
    const best = ranked[0];
    const second = ranked[1];
    if (best && best.diffMs <= 12 * 60 * 60 * 1000 && (!second || second.diffMs !== best.diffMs)) {
      resolved = String(best.game.id);
    }
  }

  if (!resolved) continue;

  updates.push({
    event_id: event.event_id,
    source_event_id: resolved,
    metadata: {
      ...(event.metadata || {}),
      real_game_id: resolved,
      source_event_id_truthful: resolved,
      source_event_id_kind: "league_game_id",
      repaired_at: new Date().toISOString(),
      repair_script: "backfill-goose2-nhl-game-ids.mjs",
    },
  });
}

for (const update of updates) {
  await fetchJson(`${supabaseUrl}/rest/v1/goose_market_events?event_id=eq.${encodeURIComponent(update.event_id)}`, {
    method: "PATCH",
    headers: headers("return=minimal"),
    body: JSON.stringify({
      source_event_id: update.source_event_id,
      metadata: update.metadata,
    }),
  });
}

console.log(JSON.stringify({ ok: true, date, updated: updates.length, sample: updates.slice(0, 5) }, null, 2));
