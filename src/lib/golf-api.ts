import {
  GolfLeaderboard,
  GolfPlayer,
  GolfPlayerHistoryResult,
  GolfPlayerSeasonStats,
  GolfTournament,
  GolfTournamentStatus,
} from "@/lib/types";

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/golf";
const ESPN_WEB_BASE = "https://site.web.api.espn.com/apis/site/v2/sports/golf";
const CACHE_TTL = 15 * 60 * 1000;
const HISTORY_SCAN_LIMIT = 10;

type GolfTourKey = "pga" | "liv";
type CacheEntry<T> = { data: T; timestamp: number };

const cache = new Map<string, CacheEntry<unknown>>();

export const GOLF_PLAYER_IMAGES: Record<string, string> = {};

async function cachedFetch<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) {
    return hit.data as T;
  }

  const response = await fetch(url, { next: { revalidate: Math.round(ttl / 1000) } });
  if (!response.ok) {
    throw new Error(`Golf API error ${response.status}: ${url}`);
  }

  const data = await response.json() as T;
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const next = safeString(value);
    if (next) return next;
  }
  return "";
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTournamentDates(startDate?: string, endDate?: string) {
  const startLabel = formatDateLabel(startDate);
  const endLabel = formatDateLabel(endDate);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || "Dates TBD";
}

function formatTeeTime(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function normalizeScore(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "--") return "E";
  if (raw === "EVEN") return "E";
  return raw;
}

function normalizePosition(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "CUT" || raw === "MC") return "CUT";
  return raw;
}

function parseScoreNumber(value: string) {
  if (value === "CUT") return Number.POSITIVE_INFINITY;
  if (value === "E" || value === "EVEN") return 0;
  const parsed = Number(value.replace(/[^0-9+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRelativeScore(value: number | null) {
  if (value === null) return "E";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function getTournamentStatus(event: any, startDate?: string, endDate?: string): GolfTournamentStatus {
  const state = safeString(event?.status?.type?.state).toLowerCase();
  if (event?.status?.type?.completed || state === "post") return "completed";
  if (state === "in") return "in-progress";

  const now = Date.now();
  const start = startDate ? new Date(startDate).getTime() : NaN;
  const end = endDate ? new Date(endDate).getTime() : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now) {
    return "in-progress";
  }
  if (Number.isFinite(end) && end < now) return "completed";
  return "upcoming";
}

function getStatusBadge(tournament: GolfTournament) {
  if (tournament.status === "completed") return "Final";
  if (typeof tournament.round === "number" && tournament.round > 0) return `Round ${tournament.round}`;
  if (tournament.status === "upcoming") return "Upcoming";
  return "In Progress";
}

function flattenStats(input: any): Array<{ name: string; value: string }> {
  const entries: Array<{ name: string; value: string }> = [];
  const groups = Array.isArray(input) ? input : Array.isArray(input?.categories) ? input.categories : [];

  for (const group of groups) {
    const stats = Array.isArray(group?.stats) ? group.stats : Array.isArray(group?.statistics) ? group.statistics : [];
    for (const stat of stats) {
      const name = firstString(stat?.name, stat?.displayName, stat?.shortDisplayName, stat?.label);
      const value = firstString(stat?.displayValue, stat?.value, stat?.summary);
      if (name && value) entries.push({ name, value });
    }
  }

  return entries;
}

function extractStat(entries: Array<{ name: string; value: string }>, patterns: string[]) {
  const match = entries.find((entry) => {
    const normalized = entry.name.toLowerCase();
    return patterns.some((pattern) => normalized.includes(pattern));
  });
  return match?.value ?? "";
}

function parsePercent(value: string) {
  const cleaned = value.replace(/%/g, "").trim();
  return toNumber(cleaned);
}

function parseSeasonStats(competitor: any): GolfPlayerSeasonStats | null {
  const entries = flattenStats(competitor?.statistics);
  if (entries.length === 0) return null;

  const scoringAverage = toNumber(extractStat(entries, ["scoring average", "score avg", "avg score"]));
  const drivingAccuracy = parsePercent(extractStat(entries, ["driving accuracy", "fairways hit"]));
  const gir = parsePercent(extractStat(entries, ["greens in regulation", "gir"]));
  const puttingAverage = toNumber(extractStat(entries, ["putting average", "putts per round", "putts/round"]));

  if ([scoringAverage, drivingAccuracy, gir, puttingAverage].every((value) => value === null)) {
    return null;
  }

  return {
    scoringAverage,
    drivingAccuracy,
    gir,
    puttingAverage,
  };
}

function parseRoundScores(competitor: any) {
  const linescores = Array.isArray(competitor?.linescores) ? competitor.linescores : [];
  return linescores
    .map((line: any) => toNumber(line?.value ?? line?.displayValue ?? line?.score))
    .filter((value: number | null): value is number => value !== null);
}

function parseTodayScore(competitor: any) {
  const direct = toNumber(competitor?.today ?? competitor?.score?.today ?? competitor?.score?.todayScore);
  if (direct !== null) return formatRelativeScore(direct);

  const currentRound = toNumber(competitor?.currentRound);
  const linescores = Array.isArray(competitor?.linescores) ? competitor.linescores : [];
  const candidate = currentRound && currentRound > 0 ? linescores[currentRound - 1] : linescores[linescores.length - 1];
  const parsed = toNumber(candidate?.value ?? candidate?.displayValue);
  return formatRelativeScore(parsed);
}

function parseThru(competitor: any, tournamentStatus: GolfTournamentStatus) {
  const direct = firstString(
    competitor?.status?.thru,
    competitor?.status?.displayValue,
    competitor?.score?.thru,
    competitor?.thru,
  );

  if (direct) {
    const upper = direct.toUpperCase();
    // Filter out ISO dates — thru should be "F", "CUT", a hole number, or time
    if (upper.includes("2026-") || upper.includes("2025-") || upper.includes("T") && upper.includes(":")) {
      // It's a tee time, not a thru value
      if (tournamentStatus === "completed") return "F";
      return formatTeeTime(direct) || "—";
    }
    return upper;
  }
  if (tournamentStatus === "completed") return "F";
  return "—";
}

function getCoursePar(event: any) {
  return (
    toNumber(event?.competitions?.[0]?.venue?.par)
    ?? toNumber(event?.competitions?.[0]?.course?.par)
    ?? toNumber(event?.venue?.par)
    ?? null
  );
}

function getCourseYardage(event: any) {
  return (
    toNumber(event?.competitions?.[0]?.venue?.yardage)
    ?? toNumber(event?.competitions?.[0]?.course?.yardage)
    ?? toNumber(event?.venue?.yardage)
    ?? null
  );
}

/** Fallback course/location data for well-known PGA events when ESPN API returns no venue. */
const KNOWN_COURSES: Record<string, { course: string; location: string; par?: number; yardage?: number }> = {
  "valspar championship": { course: "Innisbrook Resort (Copperhead)", location: "Palm Harbor, FL", par: 71, yardage: 7340 },
  "the sentry": { course: "Kapalua Plantation Course", location: "Kapalua, Maui, HI", par: 73, yardage: 7596 },
  "sony open in hawaii": { course: "Waialae Country Club", location: "Honolulu, HI", par: 70, yardage: 7044 },
  "the american express": { course: "PGA West (Stadium Course)", location: "La Quinta, CA", par: 72, yardage: 7147 },
  "farmers insurance open": { course: "Torrey Pines (South)", location: "San Diego, CA", par: 72, yardage: 7698 },
  "at&t pebble beach pro-am": { course: "Pebble Beach Golf Links", location: "Pebble Beach, CA", par: 72, yardage: 6972 },
  "waste management phoenix open": { course: "TPC Scottsdale (Stadium)", location: "Scottsdale, AZ", par: 71, yardage: 7261 },
  "genesis invitational": { course: "Riviera Country Club", location: "Pacific Palisades, CA", par: 71, yardage: 7322 },
  "the honda classic": { course: "PGA National (Champion)", location: "Palm Beach Gardens, FL", par: 70, yardage: 7125 },
  "arnold palmer invitational": { course: "Bay Hill Club & Lodge", location: "Orlando, FL", par: 72, yardage: 7466 },
  "the players championship": { course: "TPC Sawgrass (Stadium)", location: "Ponte Vedra Beach, FL", par: 72, yardage: 7189 },
  "masters tournament": { course: "Augusta National Golf Club", location: "Augusta, GA", par: 72, yardage: 7510 },
  "pga championship": { course: "Quail Hollow Club", location: "Charlotte, NC", par: 72, yardage: 7600 },
  "u.s. open": { course: "Oakmont Country Club", location: "Oakmont, PA", par: 70, yardage: 7255 },
  "the open championship": { course: "Royal Portrush", location: "Portrush, Northern Ireland", par: 71, yardage: 7317 },
  "the memorial tournament": { course: "Muirfield Village Golf Club", location: "Dublin, OH", par: 72, yardage: 7571 },
  "rocket mortgage classic": { course: "Detroit Golf Club", location: "Detroit, MI", par: 72, yardage: 7370 },
  "travelers championship": { course: "TPC River Highlands", location: "Cromwell, CT", par: 70, yardage: 6841 },
  "rbc canadian open": { course: "Hamilton Golf & CC", location: "Hamilton, ON, Canada", par: 70, yardage: 6968 },
  "the cj cup byron nelson": { course: "TPC Craig Ranch", location: "McKinney, TX", par: 72, yardage: 7468 },
  "charles schwab challenge": { course: "Colonial Country Club", location: "Fort Worth, TX", par: 70, yardage: 7209 },
  "rbc heritage": { course: "Harbour Town Golf Links", location: "Hilton Head, SC", par: 71, yardage: 7099 },
  "zurich classic of new orleans": { course: "TPC Louisiana", location: "Avondale, LA", par: 72, yardage: 7425 },
  "wells fargo championship": { course: "Quail Hollow Club", location: "Charlotte, NC", par: 72, yardage: 7600 },
  "tour championship": { course: "East Lake Golf Club", location: "Atlanta, GA", par: 70, yardage: 7346 },
};

function applyCourseFallback(tournament: GolfTournament): GolfTournament {
  if (tournament.course !== "Course TBD" && tournament.location) return tournament;
  const key = tournament.name.toLowerCase().trim();
  const fallback = KNOWN_COURSES[key];
  if (!fallback) return tournament;
  return {
    ...tournament,
    course: tournament.course === "Course TBD" ? fallback.course : tournament.course,
    location: tournament.location || fallback.location,
    coursePar: tournament.coursePar ?? fallback.par ?? null,
    courseYardage: tournament.courseYardage ?? fallback.yardage ?? null,
  };
}

function getTournamentLocation(event: any) {
  const address = event?.competitions?.[0]?.venue?.address ?? event?.venue?.address ?? {};
  return [safeString(address.city), safeString(address.state), safeString(address.country)].filter(Boolean).join(", ");
}

function parseTournamentFromEvent(event: any, tour: "PGA" | "LIV"): GolfTournament {
  const competition = event?.competitions?.[0] ?? {};
  const startDate = firstString(
    competition?.date,
    event?.date,
    event?.startDate,
    event?.calendar?.startDate,
  );
  const endDate = firstString(
    competition?.endDate,
    event?.endDate,
    event?.calendar?.endDate,
  );
  const tournament: GolfTournament = {
    id: firstString(event?.id, competition?.id),
    name: firstString(event?.name, event?.shortName, competition?.name, event?.label, "Tournament"),
    dates: formatTournamentDates(startDate, endDate),
    course: firstString(
      competition?.venue?.fullName,
      competition?.venue?.displayName,
      event?.venue?.fullName,
      event?.venue?.displayName,
      "Course TBD",
    ),
    purse: firstString(
      competition?.purse?.displayValue,
      event?.purse?.displayValue,
      competition?.format?.displayValue,
      "TBD",
    ),
    status: getTournamentStatus(event, startDate, endDate),
    tour,
    startDate,
    endDate,
    location: getTournamentLocation(event),
    coursePar: getCoursePar(event),
    courseYardage: getCourseYardage(event),
    round: toNumber(competition?.status?.period ?? event?.status?.period),
    statusDetail: firstString(
      competition?.status?.type?.shortDetail,
      competition?.status?.type?.detail,
      event?.status?.type?.shortDetail,
      event?.status?.type?.detail,
    ),
    current: true,
  };

  return applyCourseFallback(tournament);
}

function computePositions(players: GolfPlayer[]) {
  const playable = players
    .filter((player) => player.position !== "CUT")
    .sort((left, right) => parseScoreNumber(left.score) - parseScoreNumber(right.score) || left.name.localeCompare(right.name));

  let cursor = 0;
  while (cursor < playable.length) {
    const groupStart = cursor;
    const score = parseScoreNumber(playable[cursor].score);
    while (cursor < playable.length && parseScoreNumber(playable[cursor].score) === score) {
      cursor += 1;
    }
    const position = groupStart + 1;
    const label = cursor - groupStart > 1 ? `T${position}` : `${position}`;
    for (let index = groupStart; index < cursor; index += 1) {
      playable[index].position = label;
    }
  }

  playable.forEach((player) => {
    const target = players.find((entry) => entry.id === player.id && entry.name === player.name);
    if (target) target.position = player.position;
  });

  return players;
}

function parseLeaderboardPlayers(competitors: any[], tournament: GolfTournament) {
  const players = competitors.map((competitor) => {
    const athlete = competitor?.athlete ?? competitor?.player ?? {};
    const playerId = firstString(athlete?.id, competitor?.id);
    const headshot = firstString(
      athlete?.headshot?.href,
      athlete?.headshot,
      playerId ? `https://a.espncdn.com/i/headshots/golf/players/full/${playerId}.png` : "",
    );
    if (playerId && headshot) {
      GOLF_PLAYER_IMAGES[playerId] = headshot;
    }

    const player: GolfPlayer = {
      id: playerId,
      name: firstString(athlete?.displayName, athlete?.fullName, competitor?.displayName, "Unknown Player"),
      position: normalizePosition(
        competitor?.status?.position?.displayName
          ?? competitor?.status?.position?.shortDisplayName
          ?? competitor?.score?.position?.displayValue
          ?? competitor?.score?.position?.shortDisplayName
          ?? competitor?.position?.displayValue
          ?? competitor?.rankDisplay
          ?? competitor?.rank
          ?? competitor?.order,
      ),
      score: normalizeScore(
        competitor?.score?.displayValue
          ?? competitor?.displayValue
          ?? competitor?.score
          ?? competitor?.toPar,
      ),
      todayScore: parseTodayScore(competitor),
      thru: parseThru(competitor, tournament.status),
      teeTime: formatTeeTime(firstString(
        competitor?.teeTime,
        competitor?.startTime,
        competitor?.teeTimeUtc,
      )),
      status: firstString(
        competitor?.status?.type?.description,
        competitor?.status?.displayValue,
      ),
      roundScores: parseRoundScores(competitor),
      seasonStats: parseSeasonStats(competitor),
      image: headshot || undefined,
    };

    if (player.position === "MC") player.position = "CUT";
    // Store sortOrder for proper leaderboard sorting
    (player as any)._sortOrder = typeof competitor?.sortOrder === "number" ? competitor.sortOrder : 9999;
    return player;
  });

  // Sort by API's sortOrder (most accurate), then fall back to score parsing
  players.sort((a, b) => ((a as any)._sortOrder || 9999) - ((b as any)._sortOrder || 9999));

  // Re-compute positions from sorted order if the API provided sortOrder
  if (players.some((p) => (p as any)._sortOrder < 9999)) {
    return players;
  }

  return tournament.status === "upcoming" ? players : computePositions(players);
}

function parseCutLine(players: GolfPlayer[]) {
  const active = players.filter((player) => player.position !== "CUT");
  if (active.length < 65) return null;
  const sorted = [...active].sort((left, right) => parseScoreNumber(left.score) - parseScoreNumber(right.score));
  const candidate = sorted[Math.min(64, sorted.length - 1)];
  return candidate ? candidate.score : null;
}

function parseScheduleFromScoreboard(scoreboard: any, tour: "PGA" | "LIV", includeCompleted = false) {
  const calendar = Array.isArray(scoreboard?.leagues?.[0]?.calendar) ? scoreboard.leagues[0].calendar : [];
  const events = Array.isArray(scoreboard?.events) ? scoreboard.events : [];
  const eventMap = new Map<string, any>(
    events.map((event: any) => [String(event?.id ?? ""), event]),
  );
  const now = Date.now();

  const schedule: GolfTournament[] = calendar
    .map((entry: any) => {
      // ESPN calendar entries usually expose `id`, not `value`.
      const rawId = firstString(entry?.id, entry?.value);
      const id = rawId || (entry?.label ? `upcoming-${entry.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}` : "");
      const event = eventMap.get(rawId);
      const startDate = firstString(entry?.startDate, event?.date);
      const endDate = firstString(entry?.endDate, event?.endDate, startDate);
      const status = getTournamentStatus(event, startDate, endDate);
      const rawTournament = event
        ? parseTournamentFromEvent(event, tour)
        : applyCourseFallback({
            id,
            name: firstString(entry?.label, "Tournament"),
            dates: formatTournamentDates(startDate, endDate),
            course: "Course TBD",
            purse: "TBD",
            status,
            tour,
            startDate,
            endDate,
            current: status === "in-progress",
          } satisfies GolfTournament);

      return {
        ...rawTournament,
        current: rawTournament.current || status === "in-progress",
      };
    })
    .filter((tournament: GolfTournament) => Boolean(tournament.id))
    .sort((left: GolfTournament, right: GolfTournament) => {
      const leftTime = left.startDate ? new Date(left.startDate).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.startDate ? new Date(right.startDate).getTime() : Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    });

  if (includeCompleted) {
    return schedule;
  }

  const currentOrUpcoming = schedule.filter((tournament: GolfTournament) => (
    tournament.status !== "completed"
    || (tournament.endDate ? new Date(tournament.endDate).getTime() >= now - 3 * 86400000 : false)
  ));

  const ordered = currentOrUpcoming
    .sort((left, right) => {
      const statusRank = (status: GolfTournamentStatus) => (
        status === "in-progress" ? 0 : status === "upcoming" ? 1 : 2
      );
      const statusDiff = statusRank(left.status) - statusRank(right.status);
      if (statusDiff !== 0) return statusDiff;
      const leftTime = left.startDate ? new Date(left.startDate).getTime() : Number.POSITIVE_INFINITY;
      const rightTime = right.startDate ? new Date(right.startDate).getTime() : Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    })
    .slice(0, 8);

  if (!ordered.some((tournament: GolfTournament) => tournament.current)) {
    const nextUpcoming = ordered.find((tournament: GolfTournament) => tournament.status === "upcoming");
    if (nextUpcoming) nextUpcoming.current = true;
  }

  return ordered;
}

async function getGolfScoreboard(tour: GolfTourKey) {
  return cachedFetch<any>(`${ESPN_SITE_BASE}/${tour}/scoreboard`);
}

async function getGolfLeaderboardByEvent(tour: GolfTourKey, eventId: string) {
  return cachedFetch<any>(`${ESPN_WEB_BASE}/leaderboard?league=${tour}&event=${eventId}`);
}

function buildLeaderboardFromEvent(event: any, tourLabel: "PGA" | "LIV", lastUpdated?: string | null): GolfLeaderboard {
  const parsedTournament = parseTournamentFromEvent(event, tourLabel);
  const competition = event?.competitions?.[0] ?? {};
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const players = parseLeaderboardPlayers(competitors, parsedTournament);
  const cutLine = parseCutLine(players);

  return {
    tournament: { ...parsedTournament, cutLine },
    players,
    cutLine,
    lastUpdated: firstString(lastUpdated, competition?.status?.type?.detail),
    statusBadge: getStatusBadge(parsedTournament),
  };
}

async function getGolfLeaderboardForEvent(tour: GolfTourKey, eventId: string): Promise<GolfLeaderboard | null> {
  if (!eventId) return null;

  try {
    const payload = await getGolfLeaderboardByEvent(tour, eventId);
    const event = payload?.events?.[0];
    if (!event) return null;

    return buildLeaderboardFromEvent(payload?.events?.[0], tour === "pga" ? "PGA" : "LIV", payload?.timestamp);
  } catch {
    return null;
  }
}

async function enrichTournament(tournament: GolfTournament, tour: GolfTourKey) {
  if (!tournament.id || (tournament.course !== "Course TBD" && tournament.purse !== "TBD")) {
    return tournament;
  }

  try {
    const payload = await getGolfLeaderboardByEvent(tour, tournament.id);
    const event = payload?.events?.[0];
    if (!event) return tournament;
    const enriched = parseTournamentFromEvent(event, tour === "pga" ? "PGA" : "LIV");
    return {
      ...tournament,
      ...enriched,
      current: tournament.current || enriched.current,
    };
  } catch {
    return tournament;
  }
}

async function getGolfLeaderboard(tour: GolfTourKey): Promise<GolfLeaderboard | null> {
  try {
    const scoreboard = await getGolfScoreboard(tour);
    const tourLabel = tour === "pga" ? "PGA" : "LIV";
    const events = Array.isArray(scoreboard?.events) ? scoreboard.events : [];
    const liveEvent = events.find((event: any) => getTournamentStatus(event, event?.date, event?.endDate) === "in-progress");

    if (!liveEvent) {
      const schedule = await getGolfSchedule(tour);
      const now = Date.now();
      const recentCompleted = schedule
        .filter((tournament: GolfTournament) => tournament.status === "completed")
        .sort((left: GolfTournament, right: GolfTournament) => {
          const leftTime = left.endDate ? new Date(left.endDate).getTime() : 0;
          const rightTime = right.endDate ? new Date(right.endDate).getTime() : 0;
          return rightTime - leftTime;
        })
        .find((tournament: GolfTournament) => {
          const end = tournament.endDate ? new Date(tournament.endDate).getTime() : NaN;
          return Number.isFinite(end) && end >= now - 36 * 60 * 60 * 1000;
        });
      const nextTournament = schedule.find((tournament: GolfTournament) => tournament.status === "upcoming");
      const displayTournament = recentCompleted ?? nextTournament ?? schedule[0];

      return displayTournament
        ? {
            tournament: displayTournament,
            players: [],
            cutLine: null,
            statusBadge: getStatusBadge(displayTournament),
          }
        : null;
    }

    const tournament = parseTournamentFromEvent(liveEvent, tourLabel);

    try {
      const leaderboard = await getGolfLeaderboardForEvent(tour, tournament.id);
      if (leaderboard) return leaderboard;

      const fallbackBoard = buildLeaderboardFromEvent(liveEvent, tourLabel);
      return fallbackBoard;
    } catch {
      const competition = liveEvent?.competitions?.[0] ?? {};
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      const players = parseLeaderboardPlayers(competitors, tournament);
      const cutLine = parseCutLine(players);
      return {
        tournament: { ...tournament, cutLine },
        players,
        cutLine,
        statusBadge: getStatusBadge(tournament),
      };
    }
  } catch {
    return null;
  }
}

const PGA_2026_FALLBACK: GolfTournament[] = [
  { id: "valspar-2026", name: "Valspar Championship", course: "Innisbrook Resort (Copperhead)", location: "Palm Harbor, FL", dates: "Mar 19 - Mar 22", purse: "$9,200,000", status: "upcoming", tour: "PGA", startDate: "2026-03-19", endDate: "2026-03-22", current: true },
  { id: "texas-childrens-2026", name: "Texas Children's Houston Open", course: "Memorial Park Golf Course", location: "Houston, TX", dates: "Mar 26 - Mar 29", purse: "$9,200,000", status: "upcoming", tour: "PGA", startDate: "2026-03-26", endDate: "2026-03-29", current: false },
  { id: "masters-2026", name: "Masters Tournament", course: "Augusta National Golf Club", location: "Augusta, GA", dates: "Apr 9 - Apr 12", purse: "$20,000,000", status: "upcoming", tour: "PGA", startDate: "2026-04-09", endDate: "2026-04-12", current: false },
  { id: "rbc-heritage-2026", name: "RBC Heritage", course: "Harbour Town Golf Links", location: "Hilton Head Island, SC", dates: "Apr 17 - Apr 20", purse: "$9,200,000", status: "upcoming", tour: "PGA", startDate: "2026-04-17", endDate: "2026-04-20", current: false },
  { id: "wells-fargo-2026", name: "Wells Fargo Championship", course: "Quail Hollow Club", location: "Charlotte, NC", dates: "May 7 - May 10", purse: "$9,700,000", status: "upcoming", tour: "PGA", startDate: "2026-05-07", endDate: "2026-05-10", current: false },
  { id: "colonial-2026", name: "Charles Schwab Challenge", course: "Colonial Country Club", location: "Fort Worth, TX", dates: "May 21 - May 24", purse: "$9,200,000", status: "upcoming", tour: "PGA", startDate: "2026-05-21", endDate: "2026-05-24", current: false },
  { id: "memorial-2026", name: "Memorial Tournament", course: "Muirfield Village Golf Club", location: "Dublin, OH", dates: "May 28 - Jun 1", purse: "$20,000,000", status: "upcoming", tour: "PGA", startDate: "2026-05-28", endDate: "2026-06-01", current: false },
  { id: "us-open-2026", name: "U.S. Open", course: "Oakmont Country Club", location: "Oakmont, PA", dates: "Jun 11 - Jun 14", purse: "$21,500,000", status: "upcoming", tour: "PGA", startDate: "2026-06-11", endDate: "2026-06-14", current: false },
  { id: "the-open-2026", name: "The Open Championship", course: "Royal Portrush", location: "Portrush, Northern Ireland", dates: "Jul 16 - Jul 19", purse: "$17,000,000", status: "upcoming", tour: "PGA", startDate: "2026-07-16", endDate: "2026-07-19", current: false },
  { id: "tour-championship-2026", name: "TOUR Championship", course: "East Lake Golf Club", location: "Atlanta, GA", dates: "Aug 27 - Aug 30", purse: "$100,000,000", status: "upcoming", tour: "PGA", startDate: "2026-08-27", endDate: "2026-08-30", current: false },
];

function mergeFallbackSchedule(espnSchedule: GolfTournament[]): GolfTournament[] {
  const now = Date.now();
  // Update status of fallback events based on current date
  const fallback = PGA_2026_FALLBACK.map((t) => {
    const start = t.startDate ? new Date(t.startDate).getTime() : NaN;
    const end = t.endDate ? new Date(t.endDate).getTime() : NaN;
    let status: GolfTournamentStatus = "upcoming";
    if (Number.isFinite(end) && end < now) status = "completed";
    else if (Number.isFinite(start) && start <= now) status = "in-progress";
    return { ...t, status, current: status === "in-progress" };
  });

  if (espnSchedule.length > 0) {
    // Merge: ESPN data wins, but fill gaps with fallback events ESPN doesn't know about
    const espnIds = new Set(espnSchedule.map((t) => t.id));
    const espnNames = new Set(espnSchedule.map((t) => t.name.toLowerCase().slice(0, 15)));
    const extra = fallback.filter((t) => !espnIds.has(t.id) && !espnNames.has(t.name.toLowerCase().slice(0, 15)));
    return [...espnSchedule, ...extra].sort((a, b) => {
      const at = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const bt = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return at - bt;
    });
  }
  return fallback;
}

async function getGolfSchedule(tour: GolfTourKey): Promise<GolfTournament[]> {
  try {
    const scoreboard = await getGolfScoreboard(tour);
    const tourLabel = tour === "pga" ? "PGA" : "LIV";
    const schedule = parseScheduleFromScoreboard(scoreboard, tourLabel, true);
    const enriched = await Promise.all(
      schedule.map((tournament: GolfTournament, index: number) => (
        index < 4 ? enrichTournament(tournament, tour) : Promise.resolve(tournament)
      )),
    );
    return tour === "pga" ? mergeFallbackSchedule(enriched) : enriched;
  } catch {
    return tour === "pga" ? mergeFallbackSchedule([]) : [];
  }
}

async function getGolfPlayerTournamentHistory(playerId: string, tour: GolfTourKey, limit = HISTORY_SCAN_LIMIT): Promise<GolfPlayerHistoryResult[]> {
  if (!playerId) return [];

  const scoreboard = await getGolfScoreboard(tour);
  const schedule = parseScheduleFromScoreboard(scoreboard, tour === "pga" ? "PGA" : "LIV", true);
  const completed = schedule
    .filter((tournament: GolfTournament) => tournament.status === "completed")
    .sort((left: GolfTournament, right: GolfTournament) => {
      const leftTime = left.endDate ? new Date(left.endDate).getTime() : 0;
      const rightTime = right.endDate ? new Date(right.endDate).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, HISTORY_SCAN_LIMIT);

  const history: GolfPlayerHistoryResult[] = [];

  for (const tournament of completed) {
    try {
      const leaderboard = await getGolfLeaderboardByEvent(tour, tournament.id);
      const event = leaderboard?.events?.[0];
      const competition = event?.competitions?.[0] ?? {};
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      const parsedTournament = parseTournamentFromEvent(event, tour === "pga" ? "PGA" : "LIV");
      const players = parseLeaderboardPlayers(competitors, parsedTournament);
      const player = players.find((entry) => entry.id === playerId);
      if (!player) continue;

      history.push({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        course: parsedTournament.course,
        date: tournament.endDate || tournament.startDate || "",
        finish: player.position || "—",
        score: player.score,
        roundScores: player.roundScores,
        madeCut: player.position !== "CUT",
      });
    } catch {
      continue;
    }

    if (history.length >= limit) break;
  }

  return history;
}

export async function getPGALeaderboard() {
  return getGolfLeaderboard("pga");
}

export async function getPGASchedule() {
  const schedule = await getGolfSchedule("pga");

  // Patch "Course TBD" using DataGolf venue data for current/upcoming tournaments
  const hasTBD = schedule.some((t) => t.course === "Course TBD" && (t.current || t.status !== "completed"));
  if (hasTBD) {
    try {
      const { getDGVenueInfo } = await import("./datagolf-cache");
      const venue = await getDGVenueInfo();
      if (venue?.courseName) {
        for (const t of schedule) {
          if (t.course === "Course TBD" && (t.current || t.status === "in-progress")) {
            t.course = venue.courseName;
            if (!t.location && venue.location) t.location = venue.location;
          }
        }
      }
    } catch { /* DG cache unavailable, keep TBD */ }
  }

  return schedule;
}

export async function getPGATournamentLeaderboard(eventId: string) {
  return getGolfLeaderboardForEvent("pga", eventId);
}

export async function getPGATournamentById(eventId: string) {
  if (!eventId) return null;
  const schedule = await getPGASchedule();
  return schedule.find((tournament) => tournament.id === eventId) ?? null;
}

export async function getPlayerTournamentHistory(playerId: string, limit = HISTORY_SCAN_LIMIT) {
  return getGolfPlayerTournamentHistory(playerId, "pga", limit);
}
