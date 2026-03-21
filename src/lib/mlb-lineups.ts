import type { MLBGame } from "@/lib/types";

const LINEUP_TTL_MS = 5 * 60 * 1000;
const MLB_LIVE_FEED_BASE = "https://statsapi.mlb.com/api/v1.1/game";

type CacheEntry = {
  timestamp: number;
  data: MLBLineupSnapshot;
};

const lineupCache = new Map<string, CacheEntry>();

export type MLBLineupPlayer = {
  playerId: string;
  name: string;
  position: string;
  battingOrder: number;
  bats?: string;
};

export type MLBLineupSide = {
  teamAbbrev: string;
  status: "official" | "partial" | "unconfirmed";
  players: MLBLineupPlayer[];
  note?: string;
};

export type MLBLineupSnapshot = {
  source: {
    provider: string;
    url: string;
    fetchedAt: string;
    staleAfter: string;
  };
  overallStatus: "official" | "partial" | "unconfirmed";
  away: MLBLineupSide;
  home: MLBLineupSide;
  note?: string;
};

type FeedTeamSide = {
  battingOrder?: Array<number | string>;
  players?: Record<string, {
    person?: { id?: number; fullName?: string };
    battingOrder?: string;
    position?: { abbreviation?: string };
    stats?: { batting?: { battingOrder?: string } };
    gameData?: unknown;
    batSide?: { code?: string };
  }>;
};

function toBattingOrder(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const numeric = Number.parseInt(raw.slice(0, 1), 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function sortPlayers(players: MLBLineupPlayer[]) {
  return [...players]
    .sort((a, b) => a.battingOrder - b.battingOrder || a.name.localeCompare(b.name))
    .slice(0, 9);
}

function isLineupPlayer(player: MLBLineupPlayer | null): player is MLBLineupPlayer {
  return Boolean(player);
}

function parseLineupPlayers(side: FeedTeamSide | undefined): MLBLineupPlayer[] {
  const battingOrderIds = Array.isArray(side?.battingOrder)
    ? side!.battingOrder.map((value) => String(value))
    : [];

  const players = battingOrderIds
    .map((id, index): MLBLineupPlayer | null => {
      const player = side?.players?.[`ID${id}`] ?? side?.players?.[id];
      const order = toBattingOrder(player?.battingOrder) ?? index + 1;
      const name = player?.person?.fullName?.trim();
      const position = player?.position?.abbreviation?.trim();
      if (!name || !position) return null;
      const lineupPlayer: MLBLineupPlayer = {
        playerId: String(player?.person?.id ?? id),
        name,
        position,
        battingOrder: order,
        bats: player?.batSide?.code || undefined,
      };
      return lineupPlayer;
    })
    .filter(isLineupPlayer);

  if (players.length > 0) return sortPlayers(players);

  const fallbackPlayers = Object.values(side?.players ?? {})
    .map((player): MLBLineupPlayer | null => {
      const order = toBattingOrder(player?.battingOrder);
      const name = player?.person?.fullName?.trim();
      const position = player?.position?.abbreviation?.trim();
      if (!order || !name || !position) return null;
      const lineupPlayer: MLBLineupPlayer = {
        playerId: String(player?.person?.id ?? ""),
        name,
        position,
        battingOrder: order,
        bats: player?.batSide?.code || undefined,
      };
      return lineupPlayer;
    })
    .filter(isLineupPlayer);

  return sortPlayers(fallbackPlayers);
}

function getStatus(players: MLBLineupPlayer[]): MLBLineupSide["status"] {
  if (players.length >= 9) return "official";
  if (players.length > 0) return "partial";
  return "unconfirmed";
}

export async function getMLBLineupSnapshot(game: MLBGame): Promise<MLBLineupSnapshot> {
  const cacheKey = game.id;
  const cached = lineupCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < LINEUP_TTL_MS) {
    return cached.data;
  }

  const url = `${MLB_LIVE_FEED_BASE}/${game.id}/feed/live`;
  const fetchedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + LINEUP_TTL_MS).toISOString();

  const emptySide = (teamAbbrev: string): MLBLineupSide => ({
    teamAbbrev,
    status: "unconfirmed",
    players: [],
  });

  try {
    const res = await fetch(url, { next: { revalidate: Math.round(LINEUP_TTL_MS / 1000) } });
    if (!res.ok) throw new Error(`MLB lineup feed error ${res.status}`);
    const payload = await res.json() as {
      liveData?: {
        boxscore?: {
          teams?: {
            away?: FeedTeamSide;
            home?: FeedTeamSide;
          };
        };
      };
    };

    const awayPlayers = parseLineupPlayers(payload.liveData?.boxscore?.teams?.away);
    const homePlayers = parseLineupPlayers(payload.liveData?.boxscore?.teams?.home);

    const awayStatus = getStatus(awayPlayers);
    const homeStatus = getStatus(homePlayers);
    const overallStatus = awayStatus === "official" && homeStatus === "official"
      ? "official"
      : awayPlayers.length > 0 || homePlayers.length > 0
        ? "partial"
        : "unconfirmed";

    const note = overallStatus === "unconfirmed"
      ? "No official batting order is exposed in the MLB live feed yet. This pass keeps probable pitchers and explicitly leaves lineups unconfirmed until MLB publishes an order."
      : overallStatus === "partial"
        ? "At least one club has a usable batting order in the MLB live feed, but the full game board is not fully confirmed yet."
        : undefined;

    const snapshot: MLBLineupSnapshot = {
      source: {
        provider: "MLB Stats API live feed",
        url,
        fetchedAt,
        staleAfter,
      },
      overallStatus,
      away: {
        teamAbbrev: game.awayTeam.abbreviation,
        status: awayStatus,
        players: awayPlayers,
        note: awayStatus === "unconfirmed" ? `${game.awayTeam.abbreviation} lineup not yet published in MLB live feed.` : undefined,
      },
      home: {
        teamAbbrev: game.homeTeam.abbreviation,
        status: homeStatus,
        players: homePlayers,
        note: homeStatus === "unconfirmed" ? `${game.homeTeam.abbreviation} lineup not yet published in MLB live feed.` : undefined,
      },
      note,
    };

    lineupCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });
    return snapshot;
  } catch (error) {
    const snapshot: MLBLineupSnapshot = {
      source: {
        provider: "MLB Stats API live feed",
        url,
        fetchedAt,
        staleAfter,
      },
      overallStatus: "unconfirmed",
      away: emptySide(game.awayTeam.abbreviation),
      home: emptySide(game.homeTeam.abbreviation),
      note: error instanceof Error
        ? `Lineup check failed: ${error.message}`
        : "Lineup check failed.",
    };

    lineupCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });
    return snapshot;
  }
}
