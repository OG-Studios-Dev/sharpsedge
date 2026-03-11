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
    matchup: string;
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
            homeMLOdds: STANDARD_JUICE,
            awayMLOdds: STANDARD_JUICE,
            matchup: `${g.awayTeam.abbreviation} @ ${g.homeTeam.abbreviation}`,
          }))
      : abbrevs.reduce<Array<{ homeAbbrev: string; awayAbbrev: string; homeMLOdds: number; awayMLOdds: number; matchup: string }>>((acc, abbrev, i) => {
          if (i % 2 === 0) {
            const opp = abbrevs[i + 1] || "TBD";
            acc.push({ homeAbbrev: abbrev, awayAbbrev: opp, homeMLOdds: STANDARD_JUICE, awayMLOdds: STANDARD_JUICE, matchup: `${opp} @ ${abbrev}` });
          }
          return acc;
        }, []);

  for (const { homeAbbrev, awayAbbrev, homeMLOdds, awayMLOdds } of iterationList) {
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
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(homeWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NBA",
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
        impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
        hitRate: Math.round(roadWinRate * 100),
        edge: Math.round(edge * 100),
        league: "NBA",
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
    for (const { abbrev, opponentAbbrev, isAway, odds } of [
      { abbrev: homeAbbrev, opponentAbbrev: awayAbbrev, isAway: false, odds: homeMLOdds },
      { abbrev: awayAbbrev, opponentAbbrev: homeAbbrev, isAway: true, odds: awayMLOdds },
    ]) {
      const data = standingMap.get(abbrev);
      if (!data) continue;

      const streak = parseStreak(data.streak);
      if (streak && streak.type === "W" && streak.count >= 2) {
        trends.push({
          id: `nba-team-streak-${abbrev}-${idx++}`,
          team: abbrev,
          teamColor: NBA_TEAM_COLORS[abbrev] || "#4a9eff",
          opponent: opponentAbbrev,
          isAway,
          betType: "ML Streak",
          line: `W${streak.count} streak`,
          odds,
          impliedProb: Math.round(STANDARD_IMPLIED_PROB * 100),
          hitRate: Math.min(100, Math.round((data.winPct * 100) + streak.count * 5)),
          edge: Math.round((data.winPct - STANDARD_IMPLIED_PROB) * 100),
          league: "NBA",
          splits: [
            {
              label: `Active ${streak.count}-game win streak`,
              hitRate: Math.round(data.winPct * 100),
              hits: data.wins,
              total: data.wins + data.losses,
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

    // TODO: ATS Trend — requires spread/ATS data not available in BallDontLie free tier
  }

  return trends.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
}
