/**
 * NHL Team Trends Engine
 * Builds live team-level trend cards from NHL standings data.
 * Covers: home win rate, road win rate, current ML streak.
 */

import { TeamTrend } from "@/lib/types";
import { getTeamStandings, TeamStandingRow, NHL_TEAM_COLORS } from "@/lib/nhl-api";
import { NHLGame } from "@/lib/types";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210; // ≈ 0.524

function parseStreak(streakCode: string): { type: "W" | "L"; count: number } | null {
  if (!streakCode) return null;
  const match = streakCode.match(/^([WL])(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "W" | "L", count: parseInt(match[2]) };
}

export async function buildLiveTeamTrends(games: NHLGame[]): Promise<TeamTrend[]> {
  const standings = await getTeamStandings();
  if (!standings.length) return [];

  const standingMap = new Map<string, TeamStandingRow>(
    standings.map((t) => [t.teamAbbrev, t])
  );

  // Only build trends for teams playing today
  const teamsToday = new Set<string>();
  games.forEach((g) => {
    teamsToday.add(g.homeTeam.abbrev);
    teamsToday.add(g.awayTeam.abbrev);
  });

  const trends: TeamTrend[] = [];
  let idx = 0;

  for (const game of games) {
    const homeAbbrev = game.homeTeam.abbrev;
    const awayAbbrev = game.awayTeam.abbrev;
    const homeData = standingMap.get(homeAbbrev);
    const awayData = standingMap.get(awayAbbrev);
    const matchup = `${awayAbbrev} @ ${homeAbbrev}`;

    // ── Home team: home win rate trend ──
    if (homeData) {
      const homeGames = homeData.homeWins + homeData.homeLosses + homeData.homeOtLosses;
      const homeWinRate = homeGames > 0 ? homeData.homeWins / homeGames : 0;
      const edge = homeWinRate - STANDARD_IMPLIED_PROB;

      trends.push({
        id: `team-home-${homeAbbrev}-${game.id}-${idx++}`,
        team: homeAbbrev,
        teamColor: NHL_TEAM_COLORS[homeAbbrev] || "#4a9eff",
        opponent: awayAbbrev,
        isAway: false,
        betType: "ML Home Win",
        line: `Home W: ${homeData.homeWins}-${homeData.homeLosses + homeData.homeOtLosses}`,
        odds: STANDARD_JUICE,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(homeWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NHL",
        splits: [
          {
            label: `Home record: ${homeData.homeWins}W-${homeData.homeLosses + homeData.homeOtLosses}L`,
            hitRate: Math.round(homeWinRate * 100),
            hits: homeData.homeWins,
            total: homeGames,
            type: "home_away",
          },
        ],
        indicators: homeWinRate >= 0.60
          ? [{ label: "Strong home win %", type: "hot" as const, active: true }]
          : [],
      });
    }

    // ── Away team: road win rate trend ──
    if (awayData) {
      const roadGames = awayData.roadWins + awayData.roadLosses + awayData.roadOtLosses;
      const roadWinRate = roadGames > 0 ? awayData.roadWins / roadGames : 0;
      const edge = roadWinRate - STANDARD_IMPLIED_PROB;

      trends.push({
        id: `team-road-${awayAbbrev}-${game.id}-${idx++}`,
        team: awayAbbrev,
        teamColor: NHL_TEAM_COLORS[awayAbbrev] || "#4a9eff",
        opponent: homeAbbrev,
        isAway: true,
        betType: "ML Road Win",
        line: `Road W: ${awayData.roadWins}-${awayData.roadLosses + awayData.roadOtLosses}`,
        odds: STANDARD_JUICE,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(roadWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NHL",
        splits: [
          {
            label: `Road record: ${awayData.roadWins}W-${awayData.roadLosses + awayData.roadOtLosses}L`,
            hitRate: Math.round(roadWinRate * 100),
            hits: awayData.roadWins,
            total: roadGames,
            type: "home_away",
          },
        ],
        indicators: roadWinRate >= 0.55
          ? [{ label: "Strong road win %", type: "hot" as const, active: true }]
          : [],
      });
    }

    // ── Home team: current ML streak ──
    if (homeData) {
      const streak = parseStreak(homeData.streakCode);
      if (streak && streak.type === "W" && streak.count >= 2) {
        trends.push({
          id: `team-streak-${homeAbbrev}-${game.id}-${idx++}`,
          team: homeAbbrev,
          teamColor: NHL_TEAM_COLORS[homeAbbrev] || "#4a9eff",
          opponent: awayAbbrev,
          isAway: false,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: Math.min(100, Math.round((homeData.winPct * 100) + streak.count * 5)),
          edge: Math.round((homeData.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NHL",
          splits: [
            {
              label: `Active ${streak.count}-game win streak`,
              hitRate: Math.round(homeData.winPct * 100),
              hits: homeData.homeWins + homeData.roadWins,
              total: homeData.gamesPlayed,
              type: "last_n",
            },
          ],
          indicators: [{ label: `W${streak.count} active streak`, type: "hot" as const, active: true }],
        });
      }
    }

    // ── Away team: current ML streak ──
    if (awayData) {
      const streak = parseStreak(awayData.streakCode);
      if (streak && streak.type === "W" && streak.count >= 2) {
        trends.push({
          id: `team-streak-${awayAbbrev}-${game.id}-${idx++}`,
          team: awayAbbrev,
          teamColor: NHL_TEAM_COLORS[awayAbbrev] || "#4a9eff",
          opponent: homeAbbrev,
          isAway: true,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: Math.min(100, Math.round((awayData.winPct * 100) + streak.count * 5)),
          edge: Math.round((awayData.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NHL",
          splits: [
            {
              label: `Active ${streak.count}-game win streak`,
              hitRate: Math.round(awayData.winPct * 100),
              hits: awayData.homeWins + awayData.roadWins,
              total: awayData.gamesPlayed,
              type: "last_n",
            },
          ],
          indicators: [{ label: `W${streak.count} active streak`, type: "hot" as const, active: true }],
        });
      }
    }
  }

  // Sort by edge descending
  return trends.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
