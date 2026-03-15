import { TeamTrend } from "@/lib/types";
import { americanOddsToImpliedProbability } from "@/lib/odds-api";
import { MLBGame, MLB_TEAM_COLORS, MLBTeamStanding, getMLBStandings } from "@/lib/mlb-api";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210;
const DEFAULT_TOTAL_LINE = 8.5;

type TeamRecentGame = {
  isHome: boolean;
  opponentAbbrev: string;
  gameDate: string;
  runsFor: number;
  runsAgainst: number;
  win: boolean;
};

function parseRecord(record: string) {
  const [wins, losses] = String(record || "0-0").split("-").map(Number);
  return {
    wins: Number.isFinite(wins) ? wins : 0,
    losses: Number.isFinite(losses) ? losses : 0,
  };
}

function parseStreak(streak: string) {
  const match = String(streak || "").match(/^([WL])(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "W" | "L", count: parseInt(match[2], 10) || 0 };
}

function toPct(rate: number) {
  return Math.round(rate * 100);
}

function buildRecentGamesMap(games: MLBGame[]) {
  const map = new Map<string, TeamRecentGame[]>();
  const completed = games
    .filter((game) => game.status === "Final")
    .sort((a, b) => new Date(b.startTimeUTC).getTime() - new Date(a.startTimeUTC).getTime());

  for (const game of completed) {
    const pairs = [
      {
        team: game.homeTeam.abbreviation,
        opponent: game.awayTeam.abbreviation,
        isHome: true,
        runsFor: game.homeScore ?? 0,
        runsAgainst: game.awayScore ?? 0,
      },
      {
        team: game.awayTeam.abbreviation,
        opponent: game.homeTeam.abbreviation,
        isHome: false,
        runsFor: game.awayScore ?? 0,
        runsAgainst: game.homeScore ?? 0,
      },
    ];

    for (const pair of pairs) {
      if (!map.has(pair.team)) map.set(pair.team, []);
      const existing = map.get(pair.team)!;
      if (existing.length >= 10) continue;
      existing.push({
        isHome: pair.isHome,
        opponentAbbrev: pair.opponent,
        gameDate: game.date,
        runsFor: pair.runsFor,
        runsAgainst: pair.runsAgainst,
        win: pair.runsFor > pair.runsAgainst,
      });
    }
  }

  return map;
}

function buildIterationList(games: MLBGame[], standings: MLBTeamStanding[]) {
  const seen = new Set<string>();
  if (games.length > 0) {
    return games
      .filter((game) => {
        const key = `${game.awayTeam.abbreviation}-${game.homeTeam.abbreviation}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((game) => ({
        homeAbbrev: game.homeTeam.abbreviation,
        awayAbbrev: game.awayTeam.abbreviation,
        homeMLOdds: game.bestMoneyline?.home?.odds ?? STANDARD_JUICE,
        awayMLOdds: game.bestMoneyline?.away?.odds ?? STANDARD_JUICE,
        homeBook: game.bestMoneyline?.home?.book,
        awayBook: game.bestMoneyline?.away?.book,
        homeRunLine: game.bestRunLine?.home ?? null,
        awayRunLine: game.bestRunLine?.away ?? null,
        total: game.bestTotal ?? null,
        gameId: game.id,
      }));
  }

  const topTeams = [...standings]
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
    .slice(0, 12)
    .map((team) => team.teamAbbrev);

  const fallback = [];
  for (let index = 0; index < topTeams.length; index += 2) {
    const homeAbbrev = topTeams[index];
    const awayAbbrev = topTeams[index + 1];
    if (!homeAbbrev || !awayAbbrev) continue;
    fallback.push({
      homeAbbrev,
      awayAbbrev,
      homeMLOdds: STANDARD_JUICE,
      awayMLOdds: STANDARD_JUICE,
      homeBook: undefined,
      awayBook: undefined,
      homeRunLine: null,
      awayRunLine: null,
      total: null,
      gameId: undefined,
    });
  }

  return fallback;
}

export async function buildMLBTeamTrends(
  games: MLBGame[],
  recentGames: MLBGame[] = [],
  season = new Date().getFullYear(),
): Promise<TeamTrend[]> {
  const standings = await getMLBStandings(season);
  if (!standings.length) return [];

  const standingMap = new Map<string, MLBTeamStanding>(
    standings.map((standing) => [standing.teamAbbrev, standing]),
  );
  const recentGamesMap = buildRecentGamesMap(recentGames);
  const iterationList = buildIterationList(games, standings);
  const trends: TeamTrend[] = [];
  let index = 0;

  for (const entry of iterationList) {
    const { homeAbbrev, awayAbbrev, gameId } = entry;
    const homeStanding = standingMap.get(homeAbbrev);
    const awayStanding = standingMap.get(awayAbbrev);

    if (homeStanding) {
      const { wins, losses } = parseRecord(homeStanding.homeRecord);
      const gamesPlayed = wins + losses;
      const rate = gamesPlayed > 0 ? wins / gamesPlayed : 0;
      const implied = americanOddsToImpliedProbability(entry.homeMLOdds) || STANDARD_IMPLIED_PROB;
      trends.push({
        id: `mlb-home-ml-${homeAbbrev}-${index++}`,
        team: homeAbbrev,
        teamColor: MLB_TEAM_COLORS[homeAbbrev] || "#4a9eff",
        opponent: awayAbbrev,
        isAway: false,
        betType: "ML Home Win",
        line: "Home ML",
        odds: entry.homeMLOdds,
        book: entry.homeBook,
        impliedProb: toPct(implied),
        hitRate: toPct(rate),
        edge: toPct(rate - implied),
        league: "MLB",
        gameId,
        splits: [
          {
            label: `Home: ${wins}-${losses}`,
            hitRate: toPct(rate),
            hits: wins,
            total: gamesPlayed,
            type: "home_away",
          },
          {
            label: `Streak: ${homeStanding.streak}`,
            hitRate: 0,
            hits: 0,
            total: 0,
            type: "last_n",
          },
        ],
        indicators: rate >= 0.58 ? [{ type: "hot", active: true }] : [],
      });
    }

    if (awayStanding) {
      const { wins, losses } = parseRecord(awayStanding.awayRecord);
      const gamesPlayed = wins + losses;
      const rate = gamesPlayed > 0 ? wins / gamesPlayed : 0;
      const implied = americanOddsToImpliedProbability(entry.awayMLOdds) || STANDARD_IMPLIED_PROB;
      trends.push({
        id: `mlb-road-ml-${awayAbbrev}-${index++}`,
        team: awayAbbrev,
        teamColor: MLB_TEAM_COLORS[awayAbbrev] || "#4a9eff",
        opponent: homeAbbrev,
        isAway: true,
        betType: "ML Road Win",
        line: "Road ML",
        odds: entry.awayMLOdds,
        book: entry.awayBook,
        impliedProb: toPct(implied),
        hitRate: toPct(rate),
        edge: toPct(rate - implied),
        league: "MLB",
        gameId,
        splits: [
          {
            label: `Road: ${wins}-${losses}`,
            hitRate: toPct(rate),
            hits: wins,
            total: gamesPlayed,
            type: "home_away",
          },
          {
            label: `Streak: ${awayStanding.streak}`,
            hitRate: 0,
            hits: 0,
            total: 0,
            type: "last_n",
          },
        ],
        indicators: rate >= 0.55 ? [{ type: "hot", active: true }] : [],
      });
    }

    for (const teamContext of [
      {
        team: homeAbbrev,
        opponent: awayAbbrev,
        isAway: false,
        odds: entry.homeMLOdds,
        book: entry.homeBook,
        runLine: entry.homeRunLine,
      },
      {
        team: awayAbbrev,
        opponent: homeAbbrev,
        isAway: true,
        odds: entry.awayMLOdds,
        book: entry.awayBook,
        runLine: entry.awayRunLine,
      },
    ]) {
      const standing = standingMap.get(teamContext.team);
      const recent = recentGamesMap.get(teamContext.team) || [];
      if (!standing || recent.length === 0) continue;

      const wins = recent.filter((game) => game.win).length;
      const losses = recent.length - wins;
      const winRate = wins / recent.length;
      const implied = americanOddsToImpliedProbability(teamContext.odds) || STANDARD_IMPLIED_PROB;

      trends.push({
        id: `mlb-team-win-${teamContext.team}-${index++}`,
        team: teamContext.team,
        teamColor: MLB_TEAM_COLORS[teamContext.team] || "#4a9eff",
        opponent: teamContext.opponent,
        isAway: teamContext.isAway,
        betType: "Team Win ML",
        line: "L10",
        odds: teamContext.odds,
        book: teamContext.book,
        impliedProb: toPct(implied),
        hitRate: toPct(winRate),
        edge: toPct(winRate - implied),
        league: "MLB",
        gameId,
        splits: [
          {
            label: `L10: ${wins}-${losses}`,
            hitRate: toPct(winRate),
            hits: wins,
            total: recent.length,
            type: "last_n",
          },
        ],
        indicators: winRate >= 0.7 ? [{ type: "hot", active: true }] : [],
      });

      const favoriteCoverRate = recent.filter((game) => (game.runsFor - game.runsAgainst) >= 2).length / recent.length;
      const dogCoverRate = recent.filter((game) => (game.runsFor - game.runsAgainst) > -2).length / recent.length;
      const favoriteEdge = favoriteCoverRate - implied;
      const dogEdge = dogCoverRate - implied;
      const selectedRunLine = favoriteEdge >= dogEdge
        ? {
            line: teamContext.runLine?.line ?? -1.5,
            hitRate: favoriteCoverRate,
            hits: recent.filter((game) => (game.runsFor - game.runsAgainst) >= 2).length,
          }
        : {
            line: teamContext.runLine?.line ?? 1.5,
            hitRate: dogCoverRate,
            hits: recent.filter((game) => (game.runsFor - game.runsAgainst) > -2).length,
          };

      trends.push({
        id: `mlb-run-line-${teamContext.team}-${index++}`,
        team: teamContext.team,
        teamColor: MLB_TEAM_COLORS[teamContext.team] || "#4a9eff",
        opponent: teamContext.opponent,
        isAway: teamContext.isAway,
        betType: "Run Line",
        line: `${selectedRunLine.line > 0 ? "+" : ""}${selectedRunLine.line}`,
        odds: teamContext.runLine?.odds ?? teamContext.odds,
        book: teamContext.runLine?.book ?? teamContext.book,
        impliedProb: toPct(implied),
        hitRate: toPct(selectedRunLine.hitRate),
        edge: toPct(selectedRunLine.hitRate - implied),
        league: "MLB",
        gameId,
        splits: [
          {
            label: `${teamContext.team} ${selectedRunLine.line > 0 ? "+" : ""}${selectedRunLine.line}: ${selectedRunLine.hits}/${recent.length} L10`,
            hitRate: toPct(selectedRunLine.hitRate),
            hits: selectedRunLine.hits,
            total: recent.length,
            type: "last_n",
          },
        ],
        indicators: selectedRunLine.hitRate >= 0.7 ? [{ type: "hot", active: true }] : [],
      });

      const totalLine = entry.total?.line ?? DEFAULT_TOTAL_LINE;
      const overHits = recent.filter((game) => (game.runsFor + game.runsAgainst) > totalLine).length;
      const underHits = recent.length - overHits;
      const overRate = overHits / recent.length;
      const underRate = underHits / recent.length;
      const totalSelection = overRate >= underRate
        ? { side: "Over", hitRate: overRate, hits: overHits }
        : { side: "Under", hitRate: underRate, hits: underHits };
      const totalOdds = totalSelection.side === "Over"
        ? entry.total?.over?.odds ?? STANDARD_JUICE
        : entry.total?.under?.odds ?? STANDARD_JUICE;
      const totalBook = totalSelection.side === "Over"
        ? entry.total?.over?.book
        : entry.total?.under?.book;
      const totalImplied = americanOddsToImpliedProbability(totalOdds) || STANDARD_IMPLIED_PROB;

      trends.push({
        id: `mlb-total-${teamContext.team}-${index++}`,
        team: teamContext.team,
        teamColor: MLB_TEAM_COLORS[teamContext.team] || "#4a9eff",
        opponent: teamContext.opponent,
        isAway: teamContext.isAway,
        betType: "Total Runs O/U",
        line: `${totalSelection.side} ${totalLine}`,
        odds: totalOdds,
        book: totalBook,
        impliedProb: toPct(totalImplied),
        hitRate: toPct(totalSelection.hitRate),
        edge: toPct(totalSelection.hitRate - totalImplied),
        league: "MLB",
        gameId,
        splits: [
          {
            label: `${totalSelection.side} ${totalLine}: ${totalSelection.hits}/${recent.length} L10`,
            hitRate: toPct(totalSelection.hitRate),
            hits: totalSelection.hits,
            total: recent.length,
            type: "last_n",
          },
        ],
        indicators: totalSelection.hitRate >= 0.7 ? [{ type: "hot", active: true }] : [],
      });

      const streak = parseStreak(standing.streak);
      if (streak && streak.type === "W" && streak.count >= 2) {
        trends.push({
          id: `mlb-streak-${teamContext.team}-${index++}`,
          team: teamContext.team,
          teamColor: MLB_TEAM_COLORS[teamContext.team] || "#4a9eff",
          opponent: teamContext.opponent,
          isAway: teamContext.isAway,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds: teamContext.odds,
          book: teamContext.book,
          impliedProb: toPct(implied),
          hitRate: Math.min(100, toPct(standing.winPct) + streak.count * 4),
          edge: Math.min(100, toPct(standing.winPct - implied) + streak.count * 2),
          league: "MLB",
          gameId,
          splits: [
            {
              label: `Active ${streak.count}-game win streak`,
              hitRate: toPct(standing.winPct),
              hits: standing.wins,
              total: standing.wins + standing.losses,
              type: "last_n",
            },
          ],
          indicators: [{ type: "hot", active: true }],
        });
      }
    }
  }

  return trends.sort((a, b) => (
    (b.edge ?? 0) - (a.edge ?? 0)
    || (b.hitRate ?? 0) - (a.hitRate ?? 0)
  ));
}
