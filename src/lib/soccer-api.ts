import { getDateKey, getDateKeyWithOffset } from "@/lib/date-utils";

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_V2_BASE = "https://site.api.espn.com/apis/v2/sports/soccer";
const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const CACHE_TTL = 15 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export type SoccerLeague = "EPL" | "SERIE_A";

export type SoccerMatchTeam = {
  id: string;
  abbreviation: string;
  name: string;
  shortName: string;
  logo?: string;
  color: string;
  score: number | null;
};

export type SoccerMatch = {
  id: string;
  league: SoccerLeague;
  date: string;
  status: string;
  statusDetail: string;
  minute?: string | null;
  venue?: string | null;
  homeTeam: SoccerMatchTeam;
  awayTeam: SoccerMatchTeam;
  score: {
    home: number | null;
    away: number | null;
    halfTimeHome: number | null;
    halfTimeAway: number | null;
  };
  oddsEventId?: string;
  bestThreeWay?: {
    home?: { odds: number; book: string } | null;
    draw?: { odds: number; book: string } | null;
    away?: { odds: number; book: string } | null;
  };
  threeWayBookOdds?: {
    home?: Array<{ book: string; odds: number; line: number; impliedProbability: number }> | null;
    draw?: Array<{ book: string; odds: number; line: number; impliedProbability: number }> | null;
    away?: Array<{ book: string; odds: number; line: number; impliedProbability: number }> | null;
  };
  bestTotal?: {
    line: number;
    over?: { odds: number; book: string } | null;
    under?: { odds: number; book: string } | null;
  } | null;
};

export type SoccerTeamStanding = {
  team: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
  form?: string[];
  logo?: string;
  color: string;
};

export type SoccerMatchSummary = {
  match: SoccerMatch | null;
  stats: Array<{ label: string; home: string; away: string }>;
  headlines: string[];
  headToHead: SoccerMatch[];
};

const LEAGUE_CONFIG: Record<SoccerLeague, {
  espnKey: string;
  footballDataCode: string;
  label: string;
}> = {
  EPL: {
    espnKey: "eng.1",
    footballDataCode: "PL",
    label: "EPL",
  },
  SERIE_A: {
    espnKey: "ita.1",
    footballDataCode: "SA",
    label: "Serie A",
  },
};

const SOCCER_TEAM_PALETTE: Record<string, string> = {
  Arsenal: "#EF0107",
  "Aston Villa": "#95BFE5",
  Bournemouth: "#DA291C",
  Brentford: "#D20000",
  Brighton: "#0057B8",
  Burnley: "#6C1D45",
  Chelsea: "#034694",
  "Crystal Palace": "#1B458F",
  Everton: "#003399",
  Fulham: "#000000",
  "Leeds United": "#1D428A",
  Leicester: "#0053A0",
  "Leicester City": "#0053A0",
  Liverpool: "#C8102E",
  "Manchester City": "#6CABDD",
  "Manchester United": "#DA291C",
  Newcastle: "#241F20",
  "Newcastle United": "#241F20",
  "Nottingham Forest": "#DD0000",
  Southampton: "#D71920",
  Sunderland: "#EB172B",
  "Tottenham Hotspur": "#132257",
  Spurs: "#132257",
  "West Ham United": "#7A263A",
  Wolves: "#FDB913",
  "Wolverhampton Wanderers": "#FDB913",
  Atalanta: "#005CA9",
  Bologna: "#9E1B32",
  Cagliari: "#C8102E",
  Como: "#0047AB",
  Cremonese: "#D71920",
  Empoli: "#005BAC",
  Fiorentina: "#5E2D83",
  Genoa: "#8B1E3F",
  Verona: "#F7D117",
  "Hellas Verona": "#F7D117",
  Inter: "#0068A8",
  "Inter Milan": "#0068A8",
  Juventus: "#111111",
  Lazio: "#9BD1FF",
  Lecce: "#D71920",
  Milan: "#FB090B",
  "AC Milan": "#FB090B",
  Monza: "#D6001C",
  Napoli: "#008CFF",
  Parma: "#F2C100",
  Pisa: "#102B5C",
  Roma: "#8E1F2F",
  Sassuolo: "#0F8A4B",
  Torino: "#7C1F2D",
  Udinese: "#000000",
  Venezia: "#008E5B",
};

const SOCCER_TEAM_ALIASES: Record<string, string[]> = {
  Arsenal: ["ARS"],
  "Aston Villa": ["AVL", "Villa"],
  Bournemouth: ["BOU"],
  Brentford: ["BRE"],
  Brighton: ["BHA", "Brighton & Hove Albion"],
  Burnley: ["BUR"],
  Chelsea: ["CHE"],
  "Crystal Palace": ["CRY", "Palace"],
  Everton: ["EVE"],
  Fulham: ["FUL"],
  "Leeds United": ["LEE", "Leeds"],
  Leicester: ["LEI", "Leicester City"],
  Liverpool: ["LIV"],
  "Manchester City": ["MCI", "Man City", "Manchester City FC"],
  "Manchester United": ["MUN", "Man United", "Manchester United FC"],
  Newcastle: ["NEW", "Newcastle United"],
  "Nottingham Forest": ["NFO", "Forest"],
  Southampton: ["SOU"],
  Sunderland: ["SUN"],
  "Tottenham Hotspur": ["TOT", "Tottenham", "Spurs"],
  "West Ham United": ["WHU", "West Ham"],
  Wolves: ["WOL", "Wolverhampton Wanderers"],
  Atalanta: ["ATA", "Atalanta BC"],
  Bologna: ["BOL"],
  Cagliari: ["CAG"],
  Como: ["COM"],
  Cremonese: ["CRE"],
  Empoli: ["EMP"],
  Fiorentina: ["FIO"],
  Genoa: ["GEN"],
  "Hellas Verona": ["VER", "Verona"],
  Inter: ["INT", "Inter Milan"],
  Juventus: ["JUV"],
  Lazio: ["LAZ"],
  Lecce: ["LEC"],
  Milan: ["MIL", "AC Milan"],
  Monza: ["MON"],
  Napoli: ["NAP"],
  Parma: ["PAR"],
  Pisa: ["PIS"],
  Roma: ["ROM", "AS Roma"],
  Sassuolo: ["SAS"],
  Torino: ["TOR"],
  Udinese: ["UDI"],
  Venezia: ["VEN"],
};

export const SOCCER_TEAM_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(SOCCER_TEAM_ALIASES).flatMap(([name, aliases]) => {
    const color = SOCCER_TEAM_PALETTE[name] || "#4a9eff";
    return [[name, color], ...aliases.map((alias) => [alias, color] as const)];
  }),
);

function toDateStamp(dateKey: string) {
  return dateKey.replace(/-/g, "");
}

async function cachedFetch<T>(url: string, ttl = CACHE_TTL, headers?: HeadersInit): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) {
    return hit.data as T;
  }

  const response = await fetch(url, {
    headers,
    next: { revalidate: Math.max(30, Math.round(ttl / 1000)) },
  });
  if (!response.ok) {
    throw new Error(`Soccer API error ${response.status}: ${url}`);
  }

  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function footballDataHeaders(): HeadersInit | undefined {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  return token ? { "X-Auth-Token": token } : undefined;
}

function normalizeAlias(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveSoccerColor(name: string, abbreviation?: string) {
  if (abbreviation && SOCCER_TEAM_COLORS[abbreviation]) {
    return SOCCER_TEAM_COLORS[abbreviation];
  }

  if (SOCCER_TEAM_COLORS[name]) {
    return SOCCER_TEAM_COLORS[name];
  }

  const normalized = normalizeAlias(name);
  for (const [alias, color] of Object.entries(SOCCER_TEAM_COLORS)) {
    if (normalizeAlias(alias) === normalized) {
      return color;
    }
  }

  return "#4a9eff";
}

export function getSoccerTeamColor(name: string, abbreviation?: string) {
  return resolveSoccerColor(name, abbreviation);
}

function parseSoccerStatus(event: any) {
  const statusType = event?.status?.type ?? {};
  const state = String(statusType?.state || "").toLowerCase();
  const shortDetail = String(statusType?.shortDetail || statusType?.detail || "").trim();

  if (statusType?.completed) {
    return {
      status: "Final",
      statusDetail: shortDetail || "Final",
      minute: null,
    };
  }

  if (state === "in") {
    return {
      status: "Live",
      statusDetail: shortDetail || "Live",
      minute: shortDetail || null,
    };
  }

  if (state === "post") {
    return {
      status: "Postponed",
      statusDetail: shortDetail || "Postponed",
      minute: null,
    };
  }

  if (state === "pre" && event?.date) {
    const kickoff = new Date(event.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      status: kickoff,
      statusDetail: shortDetail || `${kickoff} local`,
      minute: null,
    };
  }

  return {
    status: shortDetail || "Scheduled",
    statusDetail: shortDetail || "Scheduled",
    minute: null,
  };
}

function findCompetitor(competitors: any[], side: "home" | "away") {
  return competitors.find((entry) => entry?.homeAway === side) ?? competitors[side === "home" ? 0 : 1] ?? {};
}

function parseSoccerMatch(event: any, league: SoccerLeague): SoccerMatch {
  const competition = event?.competitions?.[0] ?? {};
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = findCompetitor(competitors, "home");
  const away = findCompetitor(competitors, "away");
  const status = parseSoccerStatus(event);
  const homeScore = Number.isFinite(Number(home?.score)) ? Number(home.score) : null;
  const awayScore = Number.isFinite(Number(away?.score)) ? Number(away.score) : null;
  const halfTime = competition?.situation?.lastPlay?.text || "";
  const halfTimeMatch = String(halfTime).match(/(\d+)-(\d+)/);

  return {
    id: String(event?.id ?? ""),
    league,
    date: String(event?.date ?? ""),
    status: status.status,
    statusDetail: status.statusDetail,
    minute: status.minute,
    venue: competition?.venue?.fullName || competition?.venue?.address?.city || null,
    homeTeam: {
      id: String(home?.team?.id ?? ""),
      abbreviation: String(home?.team?.abbreviation || home?.team?.shortDisplayName || home?.team?.displayName || "").trim(),
      name: String(home?.team?.displayName || home?.team?.name || "").trim(),
      shortName: String(home?.team?.shortDisplayName || home?.team?.abbreviation || home?.team?.displayName || "").trim(),
      logo: home?.team?.logo || home?.team?.logos?.[0]?.href,
      color: resolveSoccerColor(
        String(home?.team?.displayName || home?.team?.name || ""),
        String(home?.team?.abbreviation || ""),
      ),
      score: homeScore,
    },
    awayTeam: {
      id: String(away?.team?.id ?? ""),
      abbreviation: String(away?.team?.abbreviation || away?.team?.shortDisplayName || away?.team?.displayName || "").trim(),
      name: String(away?.team?.displayName || away?.team?.name || "").trim(),
      shortName: String(away?.team?.shortDisplayName || away?.team?.abbreviation || away?.team?.displayName || "").trim(),
      logo: away?.team?.logo || away?.team?.logos?.[0]?.href,
      color: resolveSoccerColor(
        String(away?.team?.displayName || away?.team?.name || ""),
        String(away?.team?.abbreviation || ""),
      ),
      score: awayScore,
    },
    score: {
      home: homeScore,
      away: awayScore,
      halfTimeHome: halfTimeMatch ? Number(halfTimeMatch[1]) : null,
      halfTimeAway: halfTimeMatch ? Number(halfTimeMatch[2]) : null,
    },
  };
}

function parseStandingEntry(entry: any): SoccerTeamStanding {
  const stats = Array.isArray(entry?.stats) ? entry.stats : [];
  const statMap = Object.fromEntries(
    stats.map((stat: any) => [
      String(stat?.name || stat?.displayName || stat?.abbreviation || "").toLowerCase(),
      stat?.displayValue ?? stat?.value,
    ]),
  );
  const teamName = String(entry?.team?.displayName || entry?.team?.name || "").trim();
  const teamAbbrev = String(entry?.team?.abbreviation || entry?.team?.shortDisplayName || "").trim();
  const formRaw = String(statMap.form || statMap["last five"] || statMap["last 5"] || "").trim();

  return {
    team: teamAbbrev || teamName,
    teamName,
    played: Number(statMap.gamesplayed ?? statMap.played ?? 0) || 0,
    won: Number(statMap.wins ?? statMap.win ?? 0) || 0,
    drawn: Number(statMap.ties ?? statMap.draws ?? statMap.draw ?? 0) || 0,
    lost: Number(statMap.losses ?? statMap.loss ?? 0) || 0,
    goalsFor: Number(statMap.pointsfor ?? statMap.goalsfor ?? statMap.gf ?? 0) || 0,
    goalsAgainst: Number(statMap.pointsagainst ?? statMap.goalsagainst ?? statMap.ga ?? 0) || 0,
    goalDifference: Number(statMap.pointsdifferential ?? statMap.goaldifference ?? statMap.gd ?? 0) || 0,
    points: Number(statMap.points ?? 0) || 0,
    position: Number(statMap.rank ?? statMap.position ?? statMap.currentrank ?? 0) || 0,
    form: formRaw ? formRaw.split(/[\s,]+/).filter(Boolean).slice(0, 5) : [],
    logo: entry?.team?.logos?.[0]?.href || entry?.team?.logo,
    color: resolveSoccerColor(teamName, teamAbbrev),
  };
}

function parseFootballDataMatch(match: any, league: SoccerLeague): SoccerMatch {
  const homeName = String(match?.homeTeam?.shortName || match?.homeTeam?.name || "").trim();
  const awayName = String(match?.awayTeam?.shortName || match?.awayTeam?.name || "").trim();
  const homeAbbrev = String(match?.homeTeam?.tla || homeName).trim();
  const awayAbbrev = String(match?.awayTeam?.tla || awayName).trim();
  const status = String(match?.status || "").toUpperCase();

  const matchStatus = status === "FINISHED"
    ? { status: "Final", statusDetail: "Final", minute: null as string | null }
    : status === "IN_PLAY" || status === "PAUSED"
      ? { status: "Live", statusDetail: status === "PAUSED" ? "HT" : "Live", minute: status === "PAUSED" ? "HT" : "Live" }
      : {
          status: match?.utcDate
            ? new Date(match.utcDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
            : "Scheduled",
          statusDetail: "Scheduled",
          minute: null as string | null,
        };

  return {
    id: String(match?.id ?? ""),
    league,
    date: String(match?.utcDate ?? ""),
    status: matchStatus.status,
    statusDetail: matchStatus.statusDetail,
    minute: matchStatus.minute,
    venue: match?.venue || null,
    homeTeam: {
      id: String(match?.homeTeam?.id ?? ""),
      abbreviation: homeAbbrev,
      name: String(match?.homeTeam?.name || homeName || homeAbbrev),
      shortName: homeName || homeAbbrev,
      logo: match?.homeTeam?.crest,
      color: resolveSoccerColor(String(match?.homeTeam?.name || homeName), homeAbbrev),
      score: typeof match?.score?.fullTime?.home === "number" ? match.score.fullTime.home : null,
    },
    awayTeam: {
      id: String(match?.awayTeam?.id ?? ""),
      abbreviation: awayAbbrev,
      name: String(match?.awayTeam?.name || awayName || awayAbbrev),
      shortName: awayName || awayAbbrev,
      logo: match?.awayTeam?.crest,
      color: resolveSoccerColor(String(match?.awayTeam?.name || awayName), awayAbbrev),
      score: typeof match?.score?.fullTime?.away === "number" ? match.score.fullTime.away : null,
    },
    score: {
      home: typeof match?.score?.fullTime?.home === "number" ? match.score.fullTime.home : null,
      away: typeof match?.score?.fullTime?.away === "number" ? match.score.fullTime.away : null,
      halfTimeHome: typeof match?.score?.halfTime?.home === "number" ? match.score.halfTime.home : null,
      halfTimeAway: typeof match?.score?.halfTime?.away === "number" ? match.score.halfTime.away : null,
    },
  };
}

function parseFootballDataStanding(entry: any): SoccerTeamStanding {
  const teamName = String(entry?.team?.shortName || entry?.team?.name || "").trim();
  const teamAbbrev = String(entry?.team?.tla || teamName).trim();
  const form = String(entry?.form || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5);

  return {
    team: teamAbbrev,
    teamName: String(entry?.team?.name || teamName || teamAbbrev).trim(),
    played: Number(entry?.playedGames ?? 0) || 0,
    won: Number(entry?.won ?? 0) || 0,
    drawn: Number(entry?.draw ?? 0) || 0,
    lost: Number(entry?.lost ?? 0) || 0,
    goalsFor: Number(entry?.goalsFor ?? 0) || 0,
    goalsAgainst: Number(entry?.goalsAgainst ?? 0) || 0,
    goalDifference: Number(entry?.goalDifference ?? 0) || 0,
    points: Number(entry?.points ?? 0) || 0,
    position: Number(entry?.position ?? 0) || 0,
    form,
    logo: entry?.team?.crest,
    color: resolveSoccerColor(String(entry?.team?.name || teamName), teamAbbrev),
  };
}

export async function getSoccerSchedule(league: SoccerLeague, daysAhead = 2): Promise<SoccerMatch[]> {
  const config = LEAGUE_CONFIG[league];

  try {
    const dates = Array.from({ length: Math.max(daysAhead, 0) + 1 }, (_, index) => (
      toDateStamp(getDateKeyWithOffset(index))
    ));

    const payloads = await Promise.all(
      dates.map((date) => cachedFetch<any>(`${ESPN_SITE_BASE}/${config.espnKey}/scoreboard?dates=${date}`)),
    );

    return payloads
      .flatMap((payload) => Array.isArray(payload?.events) ? payload.events : [])
      .map((event) => parseSoccerMatch(event, league))
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  } catch {
    try {
      const today = getDateKey();
      const endDate = getDateKeyWithOffset(daysAhead);
      const payload = await cachedFetch<any>(
        `${FOOTBALL_DATA_BASE}/competitions/${config.footballDataCode}/matches?dateFrom=${today}&dateTo=${endDate}`,
        CACHE_TTL,
        footballDataHeaders(),
      );

      return (Array.isArray(payload?.matches) ? payload.matches : [])
        .map((match: any) => parseFootballDataMatch(match, league))
        .sort((left: SoccerMatch, right: SoccerMatch) => new Date(left.date).getTime() - new Date(right.date).getTime());
    } catch {
      return [];
    }
  }
}

export async function getRecentSoccerMatches(league: SoccerLeague, daysBack = 35): Promise<SoccerMatch[]> {
  const config = LEAGUE_CONFIG[league];

  try {
    const dateStrings = Array.from({ length: Math.max(daysBack, 1) }, (_, index) => (
      toDateStamp(getDateKeyWithOffset((index + 1) * -1))
    ));

    const payloads = await Promise.all(
      dateStrings.map((date) => cachedFetch<any>(`${ESPN_SITE_BASE}/${config.espnKey}/scoreboard?dates=${date}`)),
    );

    return payloads
      .flatMap((payload) => Array.isArray(payload?.events) ? payload.events : [])
      .map((event) => parseSoccerMatch(event, league))
      .filter((match) => match.status === "Final")
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  } catch {
    try {
      const fromDate = getDateKeyWithOffset(daysBack * -1);
      const toDate = getDateKey();
      const payload = await cachedFetch<any>(
        `${FOOTBALL_DATA_BASE}/competitions/${config.footballDataCode}/matches?dateFrom=${fromDate}&dateTo=${toDate}`,
        CACHE_TTL,
        footballDataHeaders(),
      );
      return (Array.isArray(payload?.matches) ? payload.matches : [])
        .map((match: any) => parseFootballDataMatch(match, league))
        .filter((match: SoccerMatch) => match.status === "Final")
        .sort((left: SoccerMatch, right: SoccerMatch) => new Date(right.date).getTime() - new Date(left.date).getTime());
    } catch {
      return [];
    }
  }
}

export async function getSoccerStandings(league: SoccerLeague): Promise<SoccerTeamStanding[]> {
  const config = LEAGUE_CONFIG[league];

  try {
    const payload = await cachedFetch<any>(`${ESPN_V2_BASE}/${config.espnKey}/standings`, 30 * 60 * 1000);
    const containers = Array.isArray(payload?.children) && payload.children.length > 0
      ? payload.children
      : [{ standings: payload?.standings }];

    const entries = containers.flatMap((container: any) => Array.isArray(container?.standings?.entries) ? container.standings.entries : []);
    return entries
      .map(parseStandingEntry)
      .filter((entry: SoccerTeamStanding) => entry.teamName)
      .sort((left, right) => left.position - right.position || right.points - left.points);
  } catch {
    try {
      const payload = await cachedFetch<any>(
        `${FOOTBALL_DATA_BASE}/competitions/${config.footballDataCode}/standings`,
        30 * 60 * 1000,
        footballDataHeaders(),
      );
      const table = payload?.standings?.find((standing: any) => String(standing?.type || "").toUpperCase() === "TOTAL")?.table
        || payload?.standings?.[0]?.table
        || [];

      return table
        .map(parseFootballDataStanding)
        .filter((entry: SoccerTeamStanding) => entry.teamName)
        .sort((left: SoccerTeamStanding, right: SoccerTeamStanding) => left.position - right.position || right.points - left.points);
    } catch {
      return [];
    }
  }
}

function parseSummaryStats(payload: any) {
  const groups = Array.isArray(payload?.statistics) ? payload.statistics
    : Array.isArray(payload?.boxscore?.statistics) ? payload.boxscore.statistics
    : [];

  const rows: Array<{ label: string; home: string; away: string }> = [];
  for (const group of groups) {
    const entries = Array.isArray(group?.stats) ? group.stats : Array.isArray(group?.statistics) ? group.statistics : [];
    for (const entry of entries) {
      const label = String(entry?.name || entry?.label || entry?.displayName || "").trim();
      const home = String(entry?.homeDisplayValue ?? entry?.homeValue ?? entry?.home ?? "").trim();
      const away = String(entry?.awayDisplayValue ?? entry?.awayValue ?? entry?.away ?? "").trim();
      if (!label || (!home && !away)) continue;
      rows.push({ label, home, away });
    }
  }
  return rows;
}

async function getLeagueSummary(league: SoccerLeague, matchId: string): Promise<SoccerMatchSummary | null> {
  const config = LEAGUE_CONFIG[league];

  try {
    const payload = await cachedFetch<any>(`${ESPN_SITE_BASE}/${config.espnKey}/summary?event=${matchId}`);
    const match = payload?.header?.competitions?.[0]
      ? parseSoccerMatch(
          {
            id: payload.header.id,
            date: payload.header.competitions[0].date,
            status: payload.header.competitions[0].status || payload.header?.competitions?.[0]?.status,
            competitions: payload.header.competitions,
          },
          league,
        )
      : null;

    const headToHead = Array.isArray(payload?.headToHeadEvents)
      ? payload.headToHeadEvents.map((event: any) => parseSoccerMatch(event, league))
      : [];

    return {
      match,
      stats: parseSummaryStats(payload),
      headlines: (Array.isArray(payload?.news) ? payload.news : [])
        .map((item: any) => String(item?.headline || "").trim())
        .filter(Boolean)
        .slice(0, 3),
      headToHead,
    };
  } catch {
    return null;
  }
}

export async function getSoccerMatchSummary(matchId: string): Promise<SoccerMatchSummary | null> {
  const [epl, serieA] = await Promise.all([
    getLeagueSummary("EPL", matchId),
    getLeagueSummary("SERIE_A", matchId),
  ]);

  return epl || serieA || null;
}
