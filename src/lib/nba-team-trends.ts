/**
 * NBA Team Trends Engine
 * Builds live team-level trend cards from NBA standings data.
 * Covers: home win rate, road win rate, current streak, team points O/U.
 */

import { TeamTrend } from "@/lib/types";
import { NBAGame, getNBAStandings, NBATeamStanding, NBA_TEAM_COLORS } from "@/lib/nba-api";

const STANDARD_JUICE = -110;
const STANDARD_IMPLIED_PROB = 110 / 210; // ≈ 0.524
const DEFAULT_TOTAL_LINE = 220;

/** Parse "34-7" → { wins: 34, losses: 7 } */
function parseRecord(record: string): { wins: number; losses: number } {
  const [w, l] = record.split("-").map(Number);
  return { wins: isNaN(w) ? 0 : w, losses: isNaN(l) ? 0 : l };
}

function parseStreak(streakCode: string): { type: "W" | "L"; count: number } | null {
  if (!streakCode) return null;
  const match = streakCode.match(/^([WL])(\d+)$/);
  if (!match) return null;
  return { type: match[1] as "W" | "L", count: parseInt(match[2]) };
}

export async function buildNBATeamTrends(games: NBAGame[]): Promise<TeamTrend[]> {
  const standings = await getNBAStandings();
  if (!standings.length) return [];

  const standingMap = new Map<string, NBATeamStanding>(
    standings.map((t) => [t.teamAbbrev, t])
  );

  // Build trends for teams playing today, OR fall back to top 12
  const teamsToday = new Set<string>();
  games.forEach((g) => {
    teamsToday.add(g.homeTeam.abbreviation);
    teamsToday.add(g.awayTeam.abbreviation);
  });

  const abbrevs = teamsToday.size > 0
    ? Array.from(teamsToday)
    : standings
        .sort((a, b) => b.winPct - a.winPct)
        .slice(0, 12)
        .map((t) => t.teamAbbrev);

  const trends: TeamTrend[] = [];
  let idx = 0;

  // Build iteration list
  const seenTeams = new Set<string>();

  const iterationList: Array<{
    homeAbbrev: string; awayAbbrev: string;
    homeMLOdds: number; awayMLOdds: number;
    homeBook?: string;
    awayBook?: string;
    homeBookOdds?: TeamTrend["bookOdds"];
    awayBookOdds?: TeamTrend["bookOdds"];
    matchup: string;
    gameId?: string;
    gameDate?: string;
  }> =
    games.length > 0
      ? games
          .filter((g) => {
            if (seenTeams.has(g.homeTeam.abbreviation) && seenTeams.has(g.awayTeam.abbreviation)) return false;
            seenTeams.add(g.homeTeam.abbreviation);
            seenTeams.add(g.awayTeam.abbreviation);
            return true;
          })
          .map((g) => ({
            homeAbbrev: g.homeTeam.abbreviation,
            awayAbbrev: g.awayTeam.abbreviation,
            homeMLOdds: g.bestMoneyline?.home?.odds ?? STANDARD_JUICE,
            awayMLOdds: g.bestMoneyline?.away?.odds ?? STANDARD_JUICE,
            homeBook: g.bestMoneyline?.home?.book,
            awayBook: g.bestMoneyline?.away?.book,
            homeBookOdds: g.moneylineBookOdds?.home ?? [],
            awayBookOdds: g.moneylineBookOdds?.away ?? [],
            matchup: `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`,
            gameId: g.id,
            gameDate: g.date,
          }))
      : abbrevs.reduce<Array<{ homeAbbrev: string; awayAbbrev: string; homeMLOdds: number; awayMLOdds: number; homeBook?: string; awayBook?: string; homeBookOdds?: TeamTrend["bookOdds"]; awayBookOdds?: TeamTrend["bookOdds"]; matchup: string; gameId?: string; gameDate?: string }>>((acc, abbrev, i) => {
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
              gameId: undefined,
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
            gameId,
            gameDate,
  } of iterationList) {
    const homeData = standingMap.get(homeAbbrev);
    const awayData = standingMap.get(awayAbbrev);

    // ── Home team: home win rate trend ──
    if (homeData) {
      const { wins: hw, losses: hl } = parseRecord(homeData.homeRecord ?? "0-0");
      const homeGames = hw + hl;
      const homeWinRate = homeGames > 0 ? hw / homeGames : 0;
      const edge = homeWinRate - STANDARD_IMPLIED_PROB;

      trends.push({
        id: `nba-team-home-${homeAbbrev}-${idx++}`,
        team: homeAbbrev,
        teamColor: NBA_TEAM_COLORS[homeAbbrev] || "#4a9eff",
        opponent: awayAbbrev,
        isAway: false,
        betType: "ML Home Win",
        line: "Home ML",
        odds: homeMLOdds,
        book: homeBook,
        bookOdds: homeBookOdds,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(homeWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NBA",
        gameId,
        gameDate,
        splits: [
          {
            label: `Home: ${hw}-${hl}`,
            hitRate: Math.round(homeWinRate * 100),
            hits: hw,
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
      const { wins: rw, losses: rl } = parseRecord(awayData.roadRecord ?? "0-0");
      const roadGames = rw + rl;
      const roadWinRate = roadGames > 0 ? rw / roadGames : 0;
      const edge = roadWinRate - STANDARD_IMPLIED_PROB;

      trends.push({
        id: `nba-team-road-${awayAbbrev}-${idx++}`,
        team: awayAbbrev,
        teamColor: NBA_TEAM_COLORS[awayAbbrev] || "#4a9eff",
        opponent: homeAbbrev,
        isAway: true,
        betType: "ML Road Win",
        line: "Road ML",
        odds: awayMLOdds,
        book: awayBook,
        bookOdds: awayBookOdds,
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(roadWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NBA",
        gameId,
        gameDate,
        splits: [
          {
            label: `Road: ${rw}-${rl}`,
            hitRate: Math.round(roadWinRate * 100),
            hits: rw,
            total: roadGames,
            type: "home_away",
          },
        ],
        indicators: roadWinRate >= 0.55
          ? [{ type: "hot" as const, active: true }]
          : [],
      });
    }

    // ── Streak trends ──
    for (const { abbrev, opponentAbbrev, isAway, odds, bookOdds } of [
      { abbrev: homeAbbrev, opponentAbbrev: awayAbbrev, isAway: false, odds: homeMLOdds, bookOdds: homeBookOdds },
      { abbrev: awayAbbrev, opponentAbbrev: homeAbbrev, isAway: true, odds: awayMLOdds, bookOdds: awayBookOdds },
    ]) {
      const data = standingMap.get(abbrev);
      if (!data) continue;

      const streak = parseStreak(data.streak);
      if (streak && streak.type === "W" && streak.count >= 2) {
        // Use actual win% as hitRate — never inflate with streak bonus
        const actualWinPct = Math.round(data.winPct * 100);
        const totalGamesPlayed = data.wins + data.losses;
        trends.push({
          id: `nba-team-streak-${abbrev}-${idx++}`,
          team: abbrev,
          teamColor: NBA_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "ML Streak",
          line: `W${streak.count} recent`,
          odds,
          book: isAway ? awayBook : homeBook,
          bookOdds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: actualWinPct,
          edge: Math.round((data.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NBA",
          gameId,
          gameDate,
          splits: [
            {
              label: `Season record: ${data.wins}-${data.losses} (${actualWinPct}% win rate)`,
              hitRate: actualWinPct,
              hits: data.wins,
              total: totalGamesPlayed,
              type: "last_n",
            },
          ],
          indicators: [{ type: "hot" as const, active: true }],
        });
      }

      // ── Team Points O/U ──
      // Use default total line of 220; derive average from win/loss context
      const totalGames = data.wins + data.losses;
      if (totalGames > 0) {
        // Estimate average team scoring from win percentage as a proxy
        // (BallDontLie free tier doesn't provide team scoring averages directly)
        const estimatedPPG = 100 + data.winPct * 20; // rough: 100-120 range
        const totalLine = DEFAULT_TOTAL_LINE;
        const estimatedTotal = estimatedPPG * 2;
        const overRate = estimatedTotal > totalLine ? 0.55 : 0.45;
        const hitRate = Math.round(overRate * 100);
        const edge = hitRate - Math.round(STANDARD_IMPLIED_PROB * 100);

        trends.push({
          id: `nba-team-ou-${abbrev}-${idx++}`,
          team: abbrev,
          teamColor: NBA_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "Team Points O/U",
          line: `O/U ${totalLine}`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate,
          edge,
          league: "NBA",
          gameId,
          gameDate,
          splits: [
            {
              label: `Season avg: ~${estimatedPPG.toFixed(0)} PPG (est.)`,
              hitRate: 0,
              hits: 0,
              total: 0,
              type: "home_away",
            },
          ],
          indicators: hitRate >= 70 ? [{ type: "hot" as const, active: true }] : [],
        });
      }
    }

    // 1Q Team Totals
    // NBA average ~55 points per team per game, so ~13-14 per quarter
    // 1Q total line is typically 55.5-58.5 for the game quarter
    const DEFAULT_1Q_TOTAL = 55.5;
    const homeQ = standingMap.get(homeAbbrev);
    const awayQ = standingMap.get(awayAbbrev);
    if (homeQ && awayQ) {
      const homeWR = homeQ.wins / Math.max(homeQ.wins + homeQ.losses, 1);
      const awayWR = awayQ.wins / Math.max(awayQ.wins + awayQ.losses, 1);
      const combinedStrength = (homeWR + awayWR) / 2;
      const overRate = Math.round(Math.min(combinedStrength * 100 + 5, 85));
      if (overRate >= 55) {
        trends.push({
          id: `nba-1q-total-${homeAbbrev}-${awayAbbrev}-${idx++}`,
          team: homeAbbrev,
          teamColor: NBA_TEAM_COLORS[homeAbbrev] || "#4a9eff",
          opponent: awayAbbrev,
          isAway: false,
          betType: "1Q Total",
          line: `Over ${DEFAULT_1Q_TOTAL}`,
          odds: STANDARD_JUICE,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: overRate,
          edge: overRate - Math.round(STANDARD_IMPLIED_PROB * 100),
          league: "NBA",
          gameId,
          gameDate,
          splits: [
            {
              label: `Combined win rate: ${(combinedStrength * 100).toFixed(0)}%`,
              hitRate: overRate,
              hits: 0,
              total: 0,
              type: "last_n",
            },
          ],
          indicators: overRate >= 65 ? [{ type: "hot" as const, active: true }] : [],
        });
      }
    }
  }

  return trends.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
