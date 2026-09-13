const PROP_MARKET_STATS = Object.freeze({
  player_prop_passing_yards: ["passingYards"],
  player_prop_passing_tds: ["passingTouchdowns"],
  player_prop_rushing_yards: ["rushingYards"],
  player_prop_rush_attempts: ["rushingAttempts"],
  player_prop_receiving_yards: ["receivingYards"],
  player_prop_receptions: ["receptions"],
  player_prop_anytime_td: ["rushingTouchdowns", "receivingTouchdowns"],
});

export function isNFLPlayerPropMarket(marketType) {
  return Object.hasOwn(PROP_MARKET_STATS, String(marketType || "").trim().toLowerCase());
}

export function normalizeNFLPlayerName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeNFLTeamName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function athleteStatus(athlete) {
  const status = athlete?.status;
  return String(status?.name ?? status?.type ?? status ?? "").trim().toLowerCase();
}

export function resolveUniqueNFLAthleteId(athletes, playerName, eventTeams = []) {
  const playerKey = normalizeNFLPlayerName(playerName);
  if (!playerKey) return null;

  const activeMatches = (Array.isArray(athletes) ? athletes : []).filter((athlete) => {
    if (!athlete?.id || normalizeNFLPlayerName(athlete?.displayName) !== playerKey) return false;
    const status = athleteStatus(athlete);
    return !status || status === "active";
  });
  if (!activeMatches.length) return null;

  const eventTeamKeys = new Set((Array.isArray(eventTeams) ? eventTeams : [])
    .map(normalizeNFLTeamName)
    .filter(Boolean));
  const candidates = eventTeamKeys.size
    ? activeMatches.filter((athlete) => {
      const team = athlete?.team || {};
      const aliases = [team.abbreviation, team.displayName, team.shortDisplayName, team.name]
        .map(normalizeNFLTeamName)
        .filter(Boolean);
      return aliases.some((alias) => eventTeamKeys.has(alias));
    })
    : activeMatches;
  const ids = Array.from(new Set(candidates.map((athlete) => String(athlete.id))));
  return ids.length === 1 ? ids[0] : null;
}

export function buildNFLPlayerPropSelectionKey({ eventId, marketType, participantName }) {
  return [String(eventId || ""), String(marketType || "").trim().toLowerCase(), normalizeNFLPlayerName(participantName)].join("|");
}

export function isNFLPregameEvent(event, now = Date.now()) {
  const status = String(event?.status ?? "unknown").trim().toLowerCase();
  if (!["scheduled", "unknown"].includes(status)) return false;
  const commenceAt = event?.commence_time ? new Date(event.commence_time).getTime() : Number.NaN;
  const nowAt = new Date(now).getTime();
  return Number.isFinite(commenceAt) && Number.isFinite(nowAt) && commenceAt > nowAt;
}

export function isNFLProductionReadyShadowRow(row) {
  const playerProp = isNFLPlayerPropMarket(row?.market_type);
  const signal = row?.primary_system_signal ?? row?.primary_signal ?? null;
  const status = String(signal?.promotion_status || "").trim().toLowerCase();
  const wins = finiteNumber(signal?.test_wins) ?? 0;
  const losses = finiteNumber(signal?.test_losses) ?? 0;
  const decisions = wins + losses;
  const hitRate = decisions > 0 ? wins / decisions : 0;
  const edge = finiteNumber(row?.edge) ?? 0;
  const odds = finiteNumber(row?.odds) ?? -100000;
  const acceptedStatus = ["eligible", "promoted"].includes(status)
    || (!playerProp && status === "shadow_daily_candidate");
  return acceptedStatus
    && decisions >= (playerProp ? 10 : 50)
    && hitRate >= (playerProp ? 0.7 : 0.55)
    && edge >= (playerProp ? 0.1 : 0.05)
    && odds >= (playerProp ? -200 : -150);
}

export function extractESPNPlayerGameLogCategories(payload) {
  const names = Array.isArray(payload?.names) ? payload.names : [];
  const seasonTypeCategories = (Array.isArray(payload?.seasonTypes) ? payload.seasonTypes : [])
    .flatMap((seasonType) => Array.isArray(seasonType?.categories) ? seasonType.categories : [])
    .filter((category) => Array.isArray(category?.events) && category.events.length > 0)
    .map((category) => ({ names, events: category.events }));
  if (seasonTypeCategories.length) return seasonTypeCategories;

  return (Array.isArray(payload?.categories) ? payload.categories : [])
    .filter((category) => category?.events && Object.keys(category.events).length > 0)
    .map((category) => ({ ...category, names: category.names || names }));
}

function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateNFLPlayerPropEvidence({ marketType, side, line, names: sharedNames = [], categories }) {
  const stats = PROP_MARKET_STATS[String(marketType || "").trim().toLowerCase()];
  const targetLine = finiteNumber(line);
  const normalizedSide = String(side || "").trim().toLowerCase();
  if (!stats || targetLine === null || !["over", "under"].includes(normalizedSide)) return null;

  const valuesByEvent = new Map();
  let matchedStat = false;
  for (const category of Array.isArray(categories) ? categories : []) {
    const names = (Array.isArray(category?.names) && category.names.length ? category.names : sharedNames).map(String);
    const indexes = stats.map((stat) => names.indexOf(stat)).filter((index) => index >= 0);
    if (!indexes.length) continue;
    matchedStat = true;
    for (const [fallbackEventId, event] of Object.entries(category?.events || {})) {
      const eventId = String(event?.eventId || fallbackEventId);
      const row = Array.isArray(event?.statistics)
        ? event.statistics
        : Array.isArray(event?.stats)
          ? event.stats
          : [];
      const values = indexes.map((index) => finiteNumber(row[index]));
      if (values.some((value) => value === null)) continue;
      const sum = values.reduce((total, value) => total + value, 0);
      valuesByEvent.set(eventId, (valuesByEvent.get(eventId) || 0) + sum);
    }
  }
  if (!matchedStat || valuesByEvent.size === 0) return null;

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  for (const value of valuesByEvent.values()) {
    if (value === targetLine) pushes += 1;
    else if ((normalizedSide === "over" && value > targetLine) || (normalizedSide === "under" && value < targetLine)) wins += 1;
    else losses += 1;
  }
  const sample = wins + losses;
  if (sample === 0) return null;
  return { wins, losses, pushes, sample, hitRate: wins / sample };
}

export const NFL_PLAYER_PROP_MARKETS = Object.freeze(Object.keys(PROP_MARKET_STATS));
