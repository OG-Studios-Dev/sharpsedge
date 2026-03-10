/**
 * NHL Team Trends Engine
 * Builds live team-level trend cards from NHL standings data.
 * Covers: home win rate, road win rate, current ML streak.
 */

import { TeamTrend } from "@/lib/types";
import { getTeamStandings, getTeamRecentGames, TeamStandingRow, TeamRecentGame, NHL_TEAM_COLORS } from "@/lib/nhl-api";
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

  // Fetch recent games for all teams in parallel
  const recentGamesMap = new Map<string, TeamRecentGame[]>();
  const abbrevs = Array.from(teamsToday);
  const recentResults = await Promise.all(abbrevs.map((a) => getTeamRecentGames(a)));
  abbrevs.forEach((a, i) => recentGamesMap.set(a, recentResults[i]));

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
          ? [{ type: "hot" as const, active: true }]
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
          ? [{ type: "hot" as const, active: true }]
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
          indicators: [{ type: "hot" as const, active: true }],
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
          indicators: [{ type: "hot" as const, active: true }],
        });
      }
    }

    // Build new analytics for both teams in this game
    for (const { abbrev, opponentAbbrev, isAway } of [
      { abbrev: homeAbbrev, opponentAbbrev: awayAbbrev, isAway: false },
      { abbrev: awayAbbrev, opponentAbbrev: homeAbbrev, isAway: true },
    ]) {
      const data = standingMap.get(abbrev);
      const recent = recentGamesMap.get(abbrev) || [];
      if (!data) continue;

      // ── Team Goals Over/Under ──
      if (data.gamesPlayed > 0) {
        const avgGoals = data.goalsFor / data.gamesPlayed;
        const modelLine = Math.round(avgGoals * 2) / 2;
        const overGames = recent.filter((g) => g.goalsFor > modelLine).length;
        const hitRate = recent.length > 0 ? Math.round((overGames / recent.length) * 100) : 0;
        const edge = hitRate - Math.round(STANDARD_IMPLIED_PROB * 100);

        trends.push({
          id: `team-goals-ou-${abbrev}-${game.id}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Team Goals O/U",
          line: `O/U ${modelLine}`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NHL",
          splits: [
            {
              label: `Over ${modelLine} in L10: ${overGames}/${recent.length}`,
              hitRate,
              hits: overGames,
              total: recent.length,
              type: "last_n",
            },
            {
              label: `Season avg: ${avgGoals.toFixed(1)} GF/game`,
              hitRate: Math.round(avgGoals * 30), // normalized display
              hits: data.goalsFor,
              total: data.gamesPlayed,
              type: "home_away",
            },
          ],
          indicators: hitRate >= 70 ? [{ type: "hot" as const, active: true }] : [],
        });
      }

      // ── Team Win/Loss Trend (Last 10) ──
      if (recent.length > 0) {
        const wins = recent.filter((g) => g.win).length;
        const losses = recent.length - wins;
        const hitRate = Math.round((wins / recent.length) * 100);
        const edge = hitRate - Math.round(STANDARD_IMPLIED_PROB * 100);

        trends.push({
          id: `team-win-l10-${abbrev}-${game.id}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Team Win ML",
          line: `L10: ${wins}W-${losses}L`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NHL",
          splits: [
            {
              label: `Last 10 games: ${wins}W-${losses}L`,
              hitRate,
              hits: wins,
              total: recent.length,
              type: "last_n",
            },
          ],
          indicators: hitRate >= 70 ? [{ type: "hot" as const, active: true }] : [],
        });
      }

      // ── Team Score First & Win ──
      // TODO: scoredFirst data is unavailable from club-schedule-season endpoint.
      // Once period-level scoring data is accessible, enable this metric.
      const scoredFirstGames = recent.filter((g) => g.scoredFirst);
      if (scoredFirstGames.length > 0) {
        const scoredFirstAndWon = scoredFirstGames.filter((g) => g.win).length;
        const hitRate = Math.round((scoredFirstAndWon / scoredFirstGames.length) * 100);
        const edge = hitRate - Math.round(STANDARD_IMPLIED_PROB * 100);

        trends.push({
          id: `team-score-first-${abbrev}-${game.id}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Score First & Win",
          line: "Score First W%",
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NHL",
          splits: [
            {
              label: `Scored first & won: ${scoredFirstAndWon}/${scoredFirstGames.length}`,
              hitRate,
              hits: scoredFirstAndWon,
              total: scoredFirstGames.length,
              type: "last_n",
            },
          ],
          indicators: hitRate >= 75 ? [{ type: "hot" as const, active: true }] : [],
        });
      }
    }
  }

  // Sort by edge descending
  return trends.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
