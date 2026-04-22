import { NextRequest, NextResponse } from "next/server";
import { getNBAPlayerGameLog, getNBASchedule, getNBATeamRosterEntries, getRecentNBAGames, NBA_TEAM_COLORS } from "@/lib/nba-api";
import { getAllPlayerPropOdds } from "@/lib/odds-api";
import { findNBAOddsForGame, getNBAEventOdds, getNBAOdds } from "@/lib/nba-odds";
import { getDefenseGridForPlayer } from "@/lib/player-defense";
import { resolvePlayerPropMarket } from "@/lib/player-prop-odds";
import { getPlayerResearchStats } from "@/lib/player-research";
import { BookOdds } from "@/lib/types";

function decodePlayerName(slug: string, fallback?: string | null) {
  if (fallback) return fallback;
  return slug.replace(/-/g, " ").trim();
}

function formatMinutesPlayed(minutesPlayed: number) {
  const totalSeconds = Math.max(0, Math.round(minutesPlayed * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function formatNBANextGameDisplay(
  team: string,
  opponent: string,
  isAway: boolean,
  gameDate: string,
  status: string
) {
  const matchup = `${team} ${isAway ? "@" : "vs"} ${opponent}`;
  const day = gameDate
    ? new Date(`${gameDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })
    : "";
  const time = status && status !== "Final" && status !== "Live" ? status.replace(" ET", "") : "";
  return `${matchup}${day ? ` ${day}` : ""}${time ? ` ${time}` : ""}`.trim();
}

function getUpcomingNBAGame(team: string, games: Awaited<ReturnType<typeof getNBASchedule>>) {
  return games.find((game) => {
    const isTeamGame = game.homeTeam.abbreviation === team || game.awayTeam.abbreviation === team;
    return isTeamGame && game.status !== "Final";
  });
}

export async function GET(req: NextRequest, context: { params: { name: string } }) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const playerName = decodePlayerName(
      context.params.name,
      searchParams.get("playerName")
    );
    const team = searchParams.get("team") || "";
    const opponent = searchParams.get("opponent") || "";
    const propType = searchParams.get("propType") || "Points";
    const overUnder = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
    const market = resolvePlayerPropMarket("NBA", propType);

    if (!playerName || !team) {
      return NextResponse.json({ error: "Missing playerName or team" }, { status: 400 });
    }

    let oddsComparison: BookOdds[] = [];
    if (market) {
      let oddsEventId = searchParams.get("oddsEventId") || "";

      if (!oddsEventId && opponent) {
        const featuredOdds = await getNBAOdds();
        const event = findNBAOddsForGame(featuredOdds, team, opponent);
        oddsEventId = event?.id || "";
      }

      if (oddsEventId) {
        const eventOdds = await getNBAEventOdds(oddsEventId);
        oddsComparison = getAllPlayerPropOdds(eventOdds, market, playerName, overUnder);
      }
    }

    const [recentGames, roster, upcomingGames] = await Promise.all([
      getRecentNBAGames(90),
      getNBATeamRosterEntries(team),
      getNBASchedule(5),
    ]);

    const logs = await getNBAPlayerGameLog(playerName, team, recentGames, 40);
    const rosterEntry = roster.find((player) => normalizeName(player.name) === normalizeName(playerName))
      || roster.find((player) => normalizeName(player.name).includes(normalizeName(playerName)))
      || roster.find((player) => normalizeName(playerName).includes(normalizeName(player.name)));
    const playerPosition = rosterEntry?.position || logs[0]?.position || "";
    const nextGame = getUpcomingNBAGame(team, upcomingGames);
    const opponentAbbrev = nextGame
      ? nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.abbreviation : nextGame.homeTeam.abbreviation
      : "";
    const nextGameInfo = nextGame
      ? {
          gameId: nextGame.id,
          opponent: opponentAbbrev,
          team,
          isAway: nextGame.awayTeam.abbreviation === team,
          startTimeUTC: nextGame.date ? `${nextGame.date}T12:00:00Z` : undefined,
          status: nextGame.status,
          statusDetail: nextGame.statusDetail,
          opponentFullName: nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.fullName : nextGame.homeTeam.fullName,
          teamRecord: nextGame.homeTeam.abbreviation === team ? nextGame.homeTeam.record : nextGame.awayTeam.record,
          opponentRecord: nextGame.homeTeam.abbreviation === team ? nextGame.awayTeam.record : nextGame.homeTeam.record,
          display: formatNBANextGameDisplay(
            team,
            opponentAbbrev,
            nextGame.awayTeam.abbreviation === team,
            nextGame.date,
            nextGame.status
          ),
        }
      : null;
    const defenseGrid = await getDefenseGridForPlayer("NBA", (opponent || nextGameInfo?.opponent || "").toUpperCase(), playerPosition);

    return NextResponse.json({
      league: "NBA",
      playerId: logs[0]?.playerId ? Number(logs[0].playerId) : rosterEntry?.id,
      playerName: logs[0]?.playerName || rosterEntry?.name || playerName,
      team,
      teamColor: NBA_TEAM_COLORS[team] || "#4a9eff",
      oddsComparison,
      headshot: rosterEntry?.headshot || logs[0]?.headshot || null,
      availableStats: getPlayerResearchStats("NBA"),
      nextGame: nextGameInfo,
      defenseGrid,
      player: {
        playerId: logs[0]?.playerId ? Number(logs[0].playerId) : rosterEntry?.id,
        position: playerPosition || "",
        positionLabel: playerPosition || "NBA",
        jerseyNumber: rosterEntry?.jersey || logs[0]?.jersey || null,
        injuryStatus: rosterEntry?.injuryStatus || null,
      },
      games: logs.map((log) => ({
        gameId: log.gameId,
        date: log.gameDate,
        teamAbbrev: team,
        opponent: log.opponentAbbrev,
        opponentAbbrev: log.opponentAbbrev,
        isHome: log.isHome,
        result: log.result,
        score: log.score,
        points: log.points,
        rebounds: log.rebounds,
        assists: log.assists,
        threePointersMade: log.threePointersMade,
        steals: log.steals,
        blocks: log.blocks,
        minutes: formatMinutesPlayed(log.minutesPlayed),
        minutesPlayed: log.minutesPlayed,
      })),
      previousSeasonGames: [],
    });
  } catch {
    return NextResponse.json({
      league: "NBA",
      availableStats: getPlayerResearchStats("NBA"),
      player: {
        playerId: null,
        position: "",
        positionLabel: "NBA",
        jerseyNumber: null,
        injuryStatus: null,
      },
      games: [],
      previousSeasonGames: [],
    }, { status: 500 });
  }
}
