import type { TeamTrend, TrendIndicator, TrendSplit } from "@/lib/types";
import type { SoccerMatch } from "@/lib/soccer-api";
import { buildSoccerMatchInsights } from "@/lib/soccer-stats-engine";

function toLeagueLabel(league: SoccerMatch["league"]): "EPL" | "Serie A" {
  return league === "SERIE_A" ? "Serie A" : "EPL";
}

function toPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function impliedProbFromOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return 52;
  }
  if (odds > 0) return Math.round((100 / (odds + 100)) * 100);
  return Math.round((Math.abs(odds) / (Math.abs(odds) + 100)) * 100);
}

function withHotIndicators(hitRate: number, streak = 0): TrendIndicator[] {
  const indicators: TrendIndicator[] = [];
  if (hitRate >= 60) indicators.push({ type: "hot", active: true });
  if (hitRate >= 70) indicators.push({ type: "money", active: true });
  if (streak >= 2) indicators.push({ type: "streak", active: true });
  return indicators;
}

function splitsFor(label: string, hits: number, total: number, extras: TrendSplit[] = []): TrendSplit[] {
  return [
    {
      label,
      hitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
      hits,
      total,
      type: "last_n",
    },
    ...extras,
  ];
}

export function buildSoccerTeamTrends(
  matches: SoccerMatch[],
  recentMatches: SoccerMatch[],
) {
  const insights = buildSoccerMatchInsights(matches, recentMatches);
  const trends: TeamTrend[] = [];

  for (const match of matches) {
    const insight = insights.find((entry) => entry.matchId === match.id);
    if (!insight) continue;

    const league = toLeagueLabel(match.league);
    const homeWinRate = insight.homeForm.homeRecord.wins + insight.homeForm.homeRecord.draws + insight.homeForm.homeRecord.losses > 0
      ? insight.homeForm.homeRecord.wins / (insight.homeForm.homeRecord.wins + insight.homeForm.homeRecord.draws + insight.homeForm.homeRecord.losses)
      : 0;
    const awayWinRate = insight.awayForm.awayRecord.wins + insight.awayForm.awayRecord.draws + insight.awayForm.awayRecord.losses > 0
      ? insight.awayForm.awayRecord.wins / (insight.awayForm.awayRecord.wins + insight.awayForm.awayRecord.draws + insight.awayForm.awayRecord.losses)
      : 0;
    const homeOdds = match.bestThreeWay?.home?.odds ?? -110;
    const awayOdds = match.bestThreeWay?.away?.odds ?? -110;
    const totalOdds = match.bestTotal?.over?.odds ?? -110;
    const homeImplied = impliedProbFromOdds(homeOdds);
    const awayImplied = impliedProbFromOdds(awayOdds);
    const totalImplied = impliedProbFromOdds(totalOdds);

    trends.push({
      id: `soccer-home-win-${match.id}`,
      team: match.homeTeam.abbreviation || match.homeTeam.shortName,
      teamColor: match.homeTeam.color,
      teamLogo: match.homeTeam.logo,
      opponent: match.awayTeam.abbreviation || match.awayTeam.shortName,
      isAway: false,
      betType: "Home Win Rate",
      line: "1X2 Home",
      odds: homeOdds,
      book: match.bestThreeWay?.home?.book,
      bookOdds: match.threeWayBookOdds?.home ?? [],
      impliedProb: homeImplied,
      hitRate: toPct(homeWinRate),
      edge: toPct(homeWinRate) - homeImplied,
      league,
      gameId: match.id,
      gameDate: match.date,
      splits: splitsFor(
        `Home form: ${insight.homeForm.homeRecord.wins}-${insight.homeForm.homeRecord.draws}-${insight.homeForm.homeRecord.losses}`,
        insight.homeForm.homeRecord.wins,
        insight.homeForm.homeRecord.wins + insight.homeForm.homeRecord.draws + insight.homeForm.homeRecord.losses,
        insight.h2h.sample > 0
          ? [{
              label: `H2H wins: ${insight.h2h.homeWins}/${insight.h2h.sample}`,
              hitRate: Math.round((insight.h2h.homeWins / insight.h2h.sample) * 100),
              hits: insight.h2h.homeWins,
              total: insight.h2h.sample,
              type: "vs_opponent",
            }]
          : [],
      ),
      indicators: withHotIndicators(toPct(homeWinRate), insight.homeForm.winStreak),
    });

    trends.push({
      id: `soccer-away-win-${match.id}`,
      team: match.awayTeam.abbreviation || match.awayTeam.shortName,
      teamColor: match.awayTeam.color,
      teamLogo: match.awayTeam.logo,
      opponent: match.homeTeam.abbreviation || match.homeTeam.shortName,
      isAway: true,
      betType: "Away Win Rate",
      line: "1X2 Away",
      odds: awayOdds,
      book: match.bestThreeWay?.away?.book,
      bookOdds: match.threeWayBookOdds?.away ?? [],
      impliedProb: awayImplied,
      hitRate: toPct(awayWinRate),
      edge: toPct(awayWinRate) - awayImplied,
      league,
      gameId: match.id,
      gameDate: match.date,
      splits: splitsFor(
        `Away form: ${insight.awayForm.awayRecord.wins}-${insight.awayForm.awayRecord.draws}-${insight.awayForm.awayRecord.losses}`,
        insight.awayForm.awayRecord.wins,
        insight.awayForm.awayRecord.wins + insight.awayForm.awayRecord.draws + insight.awayForm.awayRecord.losses,
        insight.h2h.sample > 0
          ? [{
              label: `H2H wins: ${insight.h2h.awayWins}/${insight.h2h.sample}`,
              hitRate: Math.round((insight.h2h.awayWins / insight.h2h.sample) * 100),
              hits: insight.h2h.awayWins,
              total: insight.h2h.sample,
              type: "vs_opponent",
            }]
          : [],
      ),
      indicators: withHotIndicators(toPct(awayWinRate), insight.awayForm.winStreak),
    });

    const bttsHits = Math.round(((insight.homeForm.bttsRate + insight.awayForm.bttsRate) / 2) * 5);
    trends.push({
      id: `soccer-btts-${match.id}`,
      team: match.homeTeam.abbreviation || match.homeTeam.shortName,
      teamColor: match.homeTeam.color,
      teamLogo: match.homeTeam.logo,
      opponent: match.awayTeam.abbreviation || match.awayTeam.shortName,
      isAway: false,
      betType: "BTTS",
      line: "Yes",
      odds: -110,
      book: "Model Line",
      impliedProb: 52,
      hitRate: Math.round(((insight.homeForm.bttsRate + insight.awayForm.bttsRate) / 2) * 100),
      edge: Math.round(((insight.homeForm.bttsRate + insight.awayForm.bttsRate) / 2) * 100) - 52,
      league,
      gameId: match.id,
      gameDate: match.date,
      splits: splitsFor(
        `BTTS trend: ${bttsHits}/5`,
        bttsHits,
        5,
        insight.h2h.sample > 0
          ? [{
              label: `H2H BTTS: ${insight.h2h.bttsHits}/${insight.h2h.sample}`,
              hitRate: Math.round((insight.h2h.bttsHits / insight.h2h.sample) * 100),
              hits: insight.h2h.bttsHits,
              total: insight.h2h.sample,
              type: "vs_opponent",
            }]
          : [],
      ),
      indicators: withHotIndicators(Math.round(((insight.homeForm.bttsRate + insight.awayForm.bttsRate) / 2) * 100)),
    });

    trends.push({
      id: `soccer-over25-${match.id}`,
      team: match.homeTeam.abbreviation || match.homeTeam.shortName,
      teamColor: match.homeTeam.color,
      teamLogo: match.homeTeam.logo,
      opponent: match.awayTeam.abbreviation || match.awayTeam.shortName,
      isAway: false,
      betType: "Over 2.5 Goals",
      line: match.bestTotal?.line ? `O ${match.bestTotal.line}` : "O 2.5",
      odds: totalOdds,
      book: match.bestTotal?.over?.book,
      impliedProb: totalImplied,
      hitRate: Math.round(((insight.homeForm.over25Rate + insight.awayForm.over25Rate) / 2) * 100),
      edge: Math.round(((insight.homeForm.over25Rate + insight.awayForm.over25Rate) / 2) * 100) - totalImplied,
      league,
      gameId: match.id,
      gameDate: match.date,
      splits: splitsFor(
        `Over 2.5: ${Math.round(((insight.homeForm.over25Rate + insight.awayForm.over25Rate) / 2) * 5)}/5`,
        Math.round(((insight.homeForm.over25Rate + insight.awayForm.over25Rate) / 2) * 5),
        5,
        insight.h2h.sample > 0
          ? [{
              label: `H2H over 2.5: ${insight.h2h.over25Hits}/${insight.h2h.sample}`,
              hitRate: Math.round((insight.h2h.over25Hits / insight.h2h.sample) * 100),
              hits: insight.h2h.over25Hits,
              total: insight.h2h.sample,
              type: "vs_opponent",
            }]
          : [],
      ),
      indicators: withHotIndicators(Math.round(((insight.homeForm.over25Rate + insight.awayForm.over25Rate) / 2) * 100)),
    });

    if (insight.homeForm.cleanSheetRate >= 0.4 || insight.awayForm.goalsForAvg <= 1) {
      trends.push({
        id: `soccer-clean-sheet-home-${match.id}`,
        team: match.homeTeam.abbreviation || match.homeTeam.shortName,
        teamColor: match.homeTeam.color,
      teamLogo: match.homeTeam.logo,
        opponent: match.awayTeam.abbreviation || match.awayTeam.shortName,
        isAway: false,
        betType: "Clean Sheet",
        line: "Yes",
        odds: -110,
        book: "Model Line",
        impliedProb: 52,
        hitRate: Math.round(insight.homeForm.cleanSheetRate * 100),
        edge: Math.round(insight.homeForm.cleanSheetRate * 100) - 52,
        league,
        gameId: match.id,
        gameDate: match.date,
        splits: splitsFor(
          `Recent clean sheets: ${Math.round(insight.homeForm.cleanSheetRate * 5)}/5`,
          Math.round(insight.homeForm.cleanSheetRate * 5),
          5,
          [{
            label: `${match.awayTeam.shortName} scored ${insight.awayForm.goalsForAvg.toFixed(1)} gpg`,
            hitRate: 0,
            hits: 0,
            total: 0,
            type: "vs_opponent",
          }],
        ),
        indicators: withHotIndicators(Math.round(insight.homeForm.cleanSheetRate * 100)),
      });
    }

    if (insight.awayForm.cleanSheetRate >= 0.4 || insight.homeForm.goalsForAvg <= 1) {
      trends.push({
        id: `soccer-clean-sheet-away-${match.id}`,
        team: match.awayTeam.abbreviation || match.awayTeam.shortName,
        teamColor: match.awayTeam.color,
      teamLogo: match.awayTeam.logo,
        opponent: match.homeTeam.abbreviation || match.homeTeam.shortName,
        isAway: true,
        betType: "Clean Sheet",
        line: "Yes",
        odds: -110,
        book: "Model Line",
        impliedProb: 52,
        hitRate: Math.round(insight.awayForm.cleanSheetRate * 100),
        edge: Math.round(insight.awayForm.cleanSheetRate * 100) - 52,
        league,
        gameId: match.id,
        gameDate: match.date,
        splits: splitsFor(
          `Recent clean sheets: ${Math.round(insight.awayForm.cleanSheetRate * 5)}/5`,
          Math.round(insight.awayForm.cleanSheetRate * 5),
          5,
          [{
            label: `${match.homeTeam.shortName} scored ${insight.homeForm.goalsForAvg.toFixed(1)} gpg`,
            hitRate: 0,
            hits: 0,
            total: 0,
            type: "vs_opponent",
          }],
        ),
        indicators: withHotIndicators(Math.round(insight.awayForm.cleanSheetRate * 100)),
      });
    }

    if (insight.homeForm.winStreak >= 2) {
      // Use actual win rate — never inflate with streak bonus
      const homeRec = insight.homeForm.homeRecord;
      const homeTotal = homeRec.wins + homeRec.draws + homeRec.losses;
      const homeActualWinPct = homeTotal > 0 ? Math.round((homeRec.wins / homeTotal) * 100) : 50;
      trends.push({
        id: `soccer-home-streak-${match.id}`,
        team: match.homeTeam.abbreviation || match.homeTeam.shortName,
        teamColor: match.homeTeam.color,
      teamLogo: match.homeTeam.logo,
        opponent: match.awayTeam.abbreviation || match.awayTeam.shortName,
        isAway: false,
        betType: "Win Streak",
        line: `W${insight.homeForm.winStreak} recent`,
        odds: homeOdds,
        book: match.bestThreeWay?.home?.book,
        bookOdds: match.threeWayBookOdds?.home ?? [],
        impliedProb: homeImplied,
        hitRate: homeActualWinPct,
        edge: homeActualWinPct - homeImplied,
        league,
        gameId: match.id,
        gameDate: match.date,
        splits: splitsFor(`Home form: ${homeRec.wins}W-${homeRec.draws}D-${homeRec.losses}L (${homeActualWinPct}% win rate)`, homeRec.wins, homeTotal, []),
        indicators: withHotIndicators(homeActualWinPct, insight.homeForm.winStreak),
      });
    }

    if (insight.awayForm.winStreak >= 2) {
      // Use actual win rate — never inflate with streak bonus
      const awayRec = insight.awayForm.awayRecord;
      const awayTotal = awayRec.wins + awayRec.draws + awayRec.losses;
      const awayActualWinPct = awayTotal > 0 ? Math.round((awayRec.wins / awayTotal) * 100) : 50;
      trends.push({
        id: `soccer-away-streak-${match.id}`,
        team: match.awayTeam.abbreviation || match.awayTeam.shortName,
        teamColor: match.awayTeam.color,
      teamLogo: match.awayTeam.logo,
        opponent: match.homeTeam.abbreviation || match.homeTeam.shortName,
        isAway: true,
        betType: "Win Streak",
        line: `W${insight.awayForm.winStreak} recent`,
        odds: awayOdds,
        book: match.bestThreeWay?.away?.book,
        bookOdds: match.threeWayBookOdds?.away ?? [],
        impliedProb: awayImplied,
        hitRate: awayActualWinPct,
        edge: awayActualWinPct - awayImplied,
        league,
        gameId: match.id,
        gameDate: match.date,
        splits: splitsFor(`Away form: ${awayRec.wins}W-${awayRec.draws}D-${awayRec.losses}L (${awayActualWinPct}% win rate)`, awayRec.wins, awayTotal, []),
        indicators: withHotIndicators(awayActualWinPct, insight.awayForm.winStreak),
      });
    }
  }

  return trends;
}
