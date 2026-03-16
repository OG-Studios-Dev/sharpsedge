const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_V2_BASE = "https://site.api.espn.com/apis/v2/sports/football/nfl";
const CACHE_TTL = 15 * 60 * 1000;

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export type NFLGame = {
  id: string;
  date: string;
  status: string;
  statusDetail: string;
  quarter?: string;
  clock?: string;
  week?: string;
  venue?: string | null;
  homeTeam: {
    id: string;
    abbreviation: string;
    fullName: string;
    record: string;
    logo?: string;
    color: string;
  };
  awayTeam: {
    id: string;
    abbreviation: string;
    fullName: string;
    record: string;
    logo?: string;
    color: string;
  };
  homeScore: number | null;
  awayScore: number | null;
  spread?: string;
  overUnder?: number;
  homeML?: number;
  awayML?: number;
  book?: string;
};

export type NFLTeamStanding = {
  team: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  conference: "AFC" | "NFC";
  division: string;
  position: number;
  logo?: string;
  color: string;
};

export const NFL_TEAM_COLORS: Record<string, string> = {
  ARI: "#97233F",
  ATL: "#A71930",
  BAL: "#241773",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#311D00",
  DAL: "#003594",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#006778",
  KC: "#E31837",
  LAC: "#0080C6",
  LAR: "#003594",
  LV: "#000000",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SEA: "#002244",
  SF: "#AA0000",
  TB: "#D50A0A",
  TEN: "#0C2340",
  WSH: "#5A1414",
};

async function cachedFetch<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.timestamp < ttl) {
    return hit.data as T;
  }

  const response = await fetch(url, { next: { revalidate: Math.round(ttl / 1000) } });
  if (!response.ok) {
    throw new Error(`NFL API error ${response.status}: ${url}`);
  }

  const data = await response.json();
  cache.set(url, { data, timestamp: Date.now() });
  return data;
}

function dateStamp(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function statusFor(event: any) {
  const statusType = event?.status?.type ?? {};
  const clock = String(event?.status?.displayClock || "").trim();
  const period = Number(event?.status?.period ?? 0);

  if (statusType?.completed) {
    return {
      status: "Final",
      statusDetail: String(statusType?.shortDetail || "Final"),
      quarter: undefined,
      clock: undefined,
    };
  }

  if (String(statusType?.state || "").toLowerCase() === "in") {
    return {
      status: "Live",
      statusDetail: String(statusType?.shortDetail || "Live"),
      quarter: period ? `Q${period}` : undefined,
      clock: clock || undefined,
    };
  }

  if (event?.date) {
    const kickoff = new Date(event.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    return {
      status: `${kickoff} ET`,
      statusDetail: String(statusType?.shortDetail || `${kickoff} ET`),
      quarter: undefined,
      clock: undefined,
    };
  }

  return {
    status: "Scheduled",
    statusDetail: "Scheduled",
    quarter: undefined,
    clock: undefined,
  };
}

function parseNFLGame(event: any): NFLGame {
  const competition = event?.competitions?.[0] ?? {};
  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const home = competitors.find((entry: any) => entry?.homeAway === "home") ?? competitors[0] ?? {};
  const away = competitors.find((entry: any) => entry?.homeAway === "away") ?? competitors[1] ?? {};
  const status = statusFor(event);
  const oddsData = competition?.odds?.[0] ?? {};
  const homeAbbrev = String(home?.team?.abbreviation || "").trim();
  const awayAbbrev = String(away?.team?.abbreviation || "").trim();

  return {
    id: String(event?.id ?? ""),
    date: String(event?.date ?? ""),
    status: status.status,
    statusDetail: status.statusDetail,
    quarter: status.quarter,
    clock: status.clock,
    week: String(event?.week?.text || competition?.week?.text || "").trim() || undefined,
    venue: competition?.venue?.fullName || null,
    homeTeam: {
      id: String(home?.team?.id ?? ""),
      abbreviation: homeAbbrev,
      fullName: String(home?.team?.displayName || home?.team?.name || "").trim(),
      record: String(home?.records?.[0]?.summary || "").trim(),
      logo: home?.team?.logo || home?.team?.logos?.[0]?.href,
      color: NFL_TEAM_COLORS[homeAbbrev] || "#4a9eff",
    },
    awayTeam: {
      id: String(away?.team?.id ?? ""),
      abbreviation: awayAbbrev,
      fullName: String(away?.team?.displayName || away?.team?.name || "").trim(),
      record: String(away?.records?.[0]?.summary || "").trim(),
      logo: away?.team?.logo || away?.team?.logos?.[0]?.href,
      color: NFL_TEAM_COLORS[awayAbbrev] || "#4a9eff",
    },
    homeScore: Number.isFinite(Number(home?.score)) ? Number(home.score) : null,
    awayScore: Number.isFinite(Number(away?.score)) ? Number(away.score) : null,
    spread: typeof oddsData?.details === "string" ? oddsData.details : undefined,
    overUnder: typeof oddsData?.overUnder === "number" ? oddsData.overUnder : undefined,
    homeML: typeof oddsData?.homeTeamOdds?.moneyLine === "number" ? oddsData.homeTeamOdds.moneyLine : undefined,
    awayML: typeof oddsData?.awayTeamOdds?.moneyLine === "number" ? oddsData.awayTeamOdds.moneyLine : undefined,
    book: String(oddsData?.provider?.name || "").trim() || undefined,
  };
}

function getUpcomingMilestoneDates() {
  const now = new Date();
  const year = now.getFullYear();

  return [
    new Date(year, now.getMonth(), now.getDate()),
    new Date(year, now.getMonth(), now.getDate() + 1),
    new Date(year, 7, 1),
    new Date(year, 8, 1),
    new Date(year, 8, 15),
  ];
}

export async function getNFLSchedule(): Promise<NFLGame[]> {
  try {
    const dates = getUpcomingMilestoneDates();
    const payloads = await Promise.all(
      dates.map((date) => cachedFetch<any>(`${ESPN_SITE_BASE}/scoreboard?dates=${dateStamp(date)}`)),
    );

    const games = payloads
      .flatMap((payload) => Array.isArray(payload?.events) ? payload.events : [])
      .map(parseNFLGame);

    const deduped = new Map<string, NFLGame>();
    for (const game of games) {
      if (!deduped.has(game.id)) deduped.set(game.id, game);
    }

    return Array.from(deduped.values()).sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  } catch {
    return [];
  }
}

function parseStandingEntry(entry: any, conference: "AFC" | "NFC"): NFLTeamStanding {
  const stats = Array.isArray(entry?.stats) ? entry.stats : [];
  const statMap = Object.fromEntries(
    stats.map((stat: any) => [
      String(stat?.name || stat?.displayName || stat?.abbreviation || "").toLowerCase(),
      stat?.displayValue ?? stat?.value,
    ]),
  );
  const teamAbbrev = String(entry?.team?.abbreviation || "").trim();

  return {
    team: teamAbbrev,
    teamName: String(entry?.team?.displayName || entry?.team?.name || "").trim(),
    wins: Number(statMap.wins ?? 0) || 0,
    losses: Number(statMap.losses ?? 0) || 0,
    ties: Number(statMap.ties ?? 0) || 0,
    conference,
    division: String(statMap.division || statMap.groupshortname || statMap.groupname || entry?.note?.description || "").trim() || "Division",
    position: Number(statMap.rank ?? statMap.playoffseed ?? statMap.position ?? 0) || 0,
    logo: entry?.team?.logos?.[0]?.href || entry?.team?.logo,
    color: NFL_TEAM_COLORS[teamAbbrev] || "#4a9eff",
  };
}

export async function getNFLStandings(season = new Date().getFullYear()): Promise<NFLTeamStanding[]> {
  const seasonsToTry = [season, season - 1];

  for (const targetSeason of seasonsToTry) {
    try {
      const payload = await cachedFetch<any>(`${ESPN_V2_BASE}/standings?season=${targetSeason}`, 30 * 60 * 1000);
      const groups = Array.isArray(payload?.children) ? payload.children : [];
      const standings: NFLTeamStanding[] = groups.flatMap((group: any) => {
        const conference: "AFC" | "NFC" = String(group?.abbreviation || group?.name || "").includes("AFC") ? "AFC" : "NFC";
        const entries = Array.isArray(group?.standings?.entries) ? group.standings.entries : [];
        return entries.map((entry: any) => parseStandingEntry(entry, conference));
      });

      if (standings.length > 0) {
        return standings.sort((left, right) => left.conference.localeCompare(right.conference) || left.position - right.position || right.wins - left.wins);
      }
    } catch {
      // try previous season
    }
  }

  return [];
}
