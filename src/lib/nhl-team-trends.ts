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

  // Build trends for teams playing today, OR fall back to all teams from standings
  const teamsToday = new Set<string>();
  games.forEach((g) => {
    teamsToday.add(g.homeTeam.abbrev);
    teamsToday.add(g.awayTeam.abbrev);
  });

  // If no active games, use top 12 teams from standings so trends are never empty
  const abbrevs = teamsToday.size > 0
    ? Array.from(teamsToday)
    : standings
        .sort((a, b) => b.points - a.points)
        .slice(0, 12)
        .map((t) => t.teamAbbrev);

  // Fetch recent games for all teams in parallel
  const recentGamesMap = new Map<string, TeamRecentGame[]>();
  const recentResults = await Promise.all(abbrevs.map((a) => getTeamRecentGames(a)));
  abbrevs.forEach((a, i) => recentGamesMap.set(a, recentResults[i]));

  const trends: TeamTrend[] = [];
  let idx = 0;

  // Build iteration list: use games if available, else synthesize from abbrevs (fallback)
  const seenTeams = new Set<string>();

  // Build synthetic "game" entries for fallback (no actual game, just standings data)
  const iterationList: Array<{
    homeAbbrev: string;
    awayAbbrev: string;
    homeMLOdds: number;
    awayMLOdds: number;
    homeBook?: string;
    awayBook?: string;
    homeBookOdds?: TeamTrend["bookOdds"];
    awayBookOdds?: TeamTrend["bookOdds"];
    matchup: string;
    gameId: number;
  }> =
    games.length > 0
      ? games
          .filter((g) => {
            if (seenTeams.has(g.homeTeam.abbrev) && seenTeams.has(g.awayTeam.abbrev)) return false;
            seenTeams.add(g.homeTeam.abbrev);
            seenTeams.add(g.awayTeam.abbrev);
            return true;
          })
          .map((g) => ({
            homeAbbrev: g.homeTeam.abbrev,
            awayAbbrev: g.awayTeam.abbrev,
            homeMLOdds: (g as any).bestMoneyline?.home?.odds ?? STANDARD_JUICE,
            awayMLOdds: (g as any).bestMoneyline?.away?.odds ?? STANDARD_JUICE,
            homeBook: (g as any).bestMoneyline?.home?.book,
            awayBook: (g as any).bestMoneyline?.away?.book,
            homeBookOdds: g.moneylineBookOdds?.home ?? [],
            awayBookOdds: g.moneylineBookOdds?.away ?? [],
            matchup: `${g.awayTeam.abbrev} @ ${g.homeTeam.abbrev}`,
            gameId: g.id,
          }))
      : abbrevs.reduce<typeof iterationList>((acc, abbrev, i) => {
          // Pair teams from standings for "vs TBD" display
          if (i % 2 === 0) {
            const opp = abbrevs[i + 1] || "TBD";
            acc.push({
              homeAbbrev: abbrev,
              awayAbbrev: opp,
              homeMLOdds: STANDARD_JUICE,
              awayMLOdds: STANDARD_JUICE,
              homeBookOdds: [],
              awayBookOdds: [],
              matchup: `${opp} @ ${abbrev}`,
              gameId: 0,
            });
          }
          return acc;
        }, []);

  for (const {
    homeAbbrev,
    awayAbbrev,
    homeMLOdds,
    awayMLOdds,
    homeBook,
    awayBook,
    homeBookOdds,
    awayBookOdds,
    matchup,
    gameId,
  } of iterationList) {
    const homeData = standingMap.get(homeAbbrev);
    const awayData = standingMap.get(awayAbbrev);

    // ── Home team: home win rate trend ──
    if (homeData) {
      const homeGames = homeData.homeWins + homeData.homeLosses + homeData.homeOtLosses;
      const homeWinRate = homeGames > 0 ? homeData.homeWins / homeGames : 0;
      const edge = homeWinRate - STANDARD_IMPLIED_PROB;

      trends.push({
        id: `team-home-${homeAbbrev}-${idx}-${idx++}`,
        team: homeAbbrev,
        teamColor: NHL_TEAM_COLORS[homeAbbrev] || "#4a9eff",
        opponent: awayAbbrev,
        isAway: false,
        betType: "ML Home Win",
        line: `Home ML`,
        odds: homeMLOdds,
        book: homeBook,
        bookOdds: homeBookOdds,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(homeWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NHL",
        gameId: gameId ? String(gameId) : undefined,
        splits: [
          {
            label: `Home: ${homeData.homeWins}-${homeData.homeLosses + homeData.homeOtLosses}`,
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
        id: `team-road-${awayAbbrev}-${idx}-${idx++}`,
        team: awayAbbrev,
        teamColor: NHL_TEAM_COLORS[awayAbbrev] || "#4a9eff",
        opponent: homeAbbrev,
        isAway: true,
        betType: "ML Road Win",
        line: `Road ML`,
        odds: awayMLOdds,
        book: awayBook,
        bookOdds: awayBookOdds,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(roadWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NHL",
        gameId: gameId ? String(gameId) : undefined,
        splits: [
          {
            label: `Road: ${awayData.roadWins}-${awayData.roadLosses + awayData.roadOtLosses}`,
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
          id: `team-streak-${homeAbbrev}-${idx}-${idx++}`,
          team: homeAbbrev,
          teamColor: NHL_TEAM_COLORS[homeAbbrev] || "#4a9eff",
          opponent: awayAbbrev,
          isAway: false,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds: homeMLOdds,
          book: homeBook,
          bookOdds: homeBookOdds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: Math.min(100, Math.round((homeData.winPct * 100) + streak.count * 5)),
          edge: Math.round((homeData.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NHL",
          gameId: gameId ? String(gameId) : undefined,
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
          id: `team-streak-${awayAbbrev}-${idx}-${idx++}`,
          team: awayAbbrev,
          teamColor: NHL_TEAM_COLORS[awayAbbrev] || "#4a9eff",
          opponent: homeAbbrev,
          isAway: true,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds: awayMLOdds,
          book: awayBook,
          bookOdds: awayBookOdds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: Math.min(100, Math.round((awayData.winPct * 100) + streak.count * 5)),
          edge: Math.round((awayData.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NHL",
          gameId: gameId ? String(gameId) : undefined,
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
    for (const { abbrev, opponentAbbrev, isAway, odds, book, bookOdds } of [
      { abbrev: homeAbbrev, opponentAbbrev: awayAbbrev, isAway: false, odds: homeMLOdds, book: homeBook, bookOdds: homeBookOdds },
      { abbrev: awayAbbrev, opponentAbbrev: homeAbbrev, isAway: true, odds: awayMLOdds, book: awayBook, bookOdds: awayBookOdds },
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
          id: `team-goals-ou-${abbrev}-${idx}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Team Goals O/U",
          line: `O/U ${modelLine}`,
          odds,
          book,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NHL",
          gameId: gameId ? String(gameId) : undefined,
          splits: [
            {
              label: `Over ${modelLine} — ${overGames}/${recent.length} L10`,
              hitRate,
              hits: overGames,
              total: recent.length,
              type: "last_n",
            },
            {
              label: `Season avg: ${avgGoals.toFixed(1)} GF/game`,
              hitRate: 0, // descriptive stat, not a hit rate — % suppressed in UI
              hits: 0,
              total: 0,
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
          id: `team-win-l10-${abbrev}-${idx}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Team Win ML",
          line: `L10`,
          odds,
          book,
          bookOdds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NHL",
          gameId: gameId ? String(gameId) : undefined,
          splits: [
            {
              label: `L10: ${wins}-${losses}`,
              hitRate,
              hits: wins,
              total: recent.length,
              type: "last_n",
            },
          ],
          indicators: hitRate >= 70 ? [{ type: "hot" as const, active: true }] : [],
        });
      }

      // ── H2H ML vs Today's Opponent ──
      const h2hGames = recent.filter((g) => g.opponentAbbrev === opponentAbbrev);
      if (h2hGames.length >= 2) {
        const h2hWins = h2hGames.filter((g) => g.win).length;
        const h2hHitRate = Math.round((h2hWins / h2hGames.length) * 100);
        const h2hEdge = h2hHitRate - Math.round(STANDARD_IMPLIED_PROB * 100);

        trends.push({
          id: `team-h2h-${abbrev}-vs-${opponentAbbrev}-${idx}-${idx++}`,
          team: abbrev,
          teamColor: NHL_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: `H2H ML`,
          line: `vs ${opponentAbbrev}`,
          odds,
          book,
          bookOdds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: h2hHitRate,
          edge: h2hEdge,
          league: "NHL",
          gameId: gameId ? String(gameId) : undefined,
          splits: [
            {
              label: `H2H ${h2hWins}-${h2hGames.length - h2hWins} vs ${opponentAbbrev}`,
              hitRate: h2hHitRate,
              hits: h2hWins,
              total: h2hGames.length,
              type: "vs_opponent",
            },
          ],
          indicators: h2hHitRate >= 70 ? [{ type: "vs_opponent" as const, active: true }] : [],
        });
      }

      // Score First & Win removed — NHL API doesn't provide period-level scoring data
      // Re-enable when a data source with period-level goals is available
    }
  }

  // Sort by edge descending
  return trends.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
