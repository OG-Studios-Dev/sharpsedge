import type { TrendIndicator } from "@/lib/types";
import type { SoccerLeague, SoccerMatch, SoccerTeamStanding } from "@/lib/soccer-api";

export type SoccerPropType =
  | "Match Result"
  | "Both Teams to Score"
  | "Total Goals 1.5"
  | "Total Goals 2.5"
  | "Total Goals 3.5"
  | "Clean Sheet"
  | "Team to Score First";

export type SoccerTeamForm = {
  last5: Array<"W" | "D" | "L">;
  homeRecord: { wins: number; draws: number; losses: number };
  awayRecord: { wins: number; draws: number; losses: number };
  goalsForAvg: number;
  goalsAgainstAvg: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
  over35Rate: number;
  cleanSheetRate: number;
  winStreak: number;
};

export type SoccerMatchInsight = {
  matchId: string;
  league: SoccerLeague;
  homeTeam: string;
  awayTeam: string;
  homeForm: SoccerTeamForm;
  awayForm: SoccerTeamForm;
  h2h: {
    sample: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    bttsHits: number;
    over25Hits: number;
  };
  props: Array<{
    type: SoccerPropType;
    lean: string;
    confidence: number;
    rationale: string[];
    indicators: TrendIndicator[];
  }>;
};

type TeamSnapshot = {
  team: string;
  matches: Array<{
    date: string;
    opponent: string;
    isHome: boolean;
    goalsFor: number;
    goalsAgainst: number;
    result: "W" | "D" | "L";
  }>;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toPct(value: number) {
  return clamp(Math.round(value * 100));
}

function resultFor(match: SoccerMatch, team: "home" | "away"): "W" | "D" | "L" | null {
  const home = match.score.home;
  const away = match.score.away;
  if (home === null || away === null) return null;
  if (home === away) return "D";
  if (team === "home") return home > away ? "W" : "L";
  return away > home ? "W" : "L";
}

function buildSnapshotMap(recentMatches: SoccerMatch[]) {
  const map = new Map<string, TeamSnapshot>();

  for (const match of recentMatches) {
    const homeResult = resultFor(match, "home");
    const awayResult = resultFor(match, "away");
    if (!homeResult || !awayResult) continue;

    const entries = [
      {
        team: match.homeTeam.abbreviation || match.homeTeam.name,
        date: match.date,
        opponent: match.awayTeam.abbreviation || match.awayTeam.name,
        isHome: true,
        goalsFor: match.score.home ?? 0,
        goalsAgainst: match.score.away ?? 0,
        result: homeResult,
      },
      {
        team: match.awayTeam.abbreviation || match.awayTeam.name,
        date: match.date,
        opponent: match.homeTeam.abbreviation || match.homeTeam.name,
        isHome: false,
        goalsFor: match.score.away ?? 0,
        goalsAgainst: match.score.home ?? 0,
        result: awayResult,
      },
    ];

    for (const entry of entries) {
      if (!map.has(entry.team)) {
        map.set(entry.team, { team: entry.team, matches: [] });
      }
      map.get(entry.team)!.matches.push(entry);
    }
  }

  map.forEach((snapshot) => {
    snapshot.matches.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  });

  return map;
}

function buildTeamForm(snapshot?: TeamSnapshot): SoccerTeamForm {
  const matches = snapshot?.matches.slice(0, 10) ?? [];
  const last5 = matches.slice(0, 5).map((match) => match.result);
  const home = matches.filter((match) => match.isHome);
  const away = matches.filter((match) => !match.isHome);
  const wins = matches.filter((match) => match.result === "W").length;

  const homeRecord = {
    wins: home.filter((match) => match.result === "W").length,
    draws: home.filter((match) => match.result === "D").length,
    losses: home.filter((match) => match.result === "L").length,
  };
  const awayRecord = {
    wins: away.filter((match) => match.result === "W").length,
    draws: away.filter((match) => match.result === "D").length,
    losses: away.filter((match) => match.result === "L").length,
  };

  const totalGoals = matches.map((match) => match.goalsFor + match.goalsAgainst);
  const cleanSheets = matches.filter((match) => match.goalsAgainst === 0).length;
  let streak = 0;
  for (const match of matches) {
    if (match.result !== "W") break;
    streak += 1;
  }

  return {
    last5,
    homeRecord,
    awayRecord,
    goalsForAvg: matches.length ? matches.reduce((sum, match) => sum + match.goalsFor, 0) / matches.length : 0,
    goalsAgainstAvg: matches.length ? matches.reduce((sum, match) => sum + match.goalsAgainst, 0) / matches.length : 0,
    bttsRate: matches.length ? matches.filter((match) => match.goalsFor > 0 && match.goalsAgainst > 0).length / matches.length : 0,
    over15Rate: totalGoals.length ? totalGoals.filter((goals) => goals > 1.5).length / totalGoals.length : 0,
    over25Rate: totalGoals.length ? totalGoals.filter((goals) => goals > 2.5).length / totalGoals.length : 0,
    over35Rate: totalGoals.length ? totalGoals.filter((goals) => goals > 3.5).length / totalGoals.length : 0,
    cleanSheetRate: matches.length ? cleanSheets / matches.length : 0,
    winStreak: streak,
  };
}

function buildIndicators(confidence: number, streak = 0): TrendIndicator[] {
  const indicators: TrendIndicator[] = [];
  if (confidence >= 70) indicators.push({ type: "hot", active: true });
  if (confidence >= 80) indicators.push({ type: "money", active: true });
  if (streak >= 3) indicators.push({ type: "streak", active: true });
  return indicators;
}

function describeRecord(record: { wins: number; draws: number; losses: number }) {
  return `${record.wins}-${record.draws}-${record.losses}`;
}

function compareStrength(homeForm: SoccerTeamForm, awayForm: SoccerTeamForm, standings?: {
  home?: SoccerTeamStanding;
  away?: SoccerTeamStanding;
}) {
  const homeSeasonBoost = (standings?.home?.points ?? 0) - (standings?.away?.points ?? 0);
  const homeVenueEdge = (homeForm.homeRecord.wins - homeForm.homeRecord.losses) - (awayForm.awayRecord.wins - awayForm.awayRecord.losses);
  const goalEdge = (homeForm.goalsForAvg - homeForm.goalsAgainstAvg) - (awayForm.goalsForAvg - awayForm.goalsAgainstAvg);
  const formEdge = homeForm.last5.reduce((sum, result) => sum + (result === "W" ? 1 : result === "D" ? 0 : -1), 0)
    - awayForm.last5.reduce((sum, result) => sum + (result === "W" ? 1 : result === "D" ? 0 : -1), 0);
  return homeSeasonBoost * 0.35 + homeVenueEdge * 6 + goalEdge * 12 + formEdge * 5;
}

function buildH2H(match: SoccerMatch, recentMatches: SoccerMatch[]) {
  const homeTeam = match.homeTeam.abbreviation || match.homeTeam.name;
  const awayTeam = match.awayTeam.abbreviation || match.awayTeam.name;
  const sample = recentMatches
    .filter((entry) => {
      const home = entry.homeTeam.abbreviation || entry.homeTeam.name;
      const away = entry.awayTeam.abbreviation || entry.awayTeam.name;
      return (
        (home === homeTeam && away === awayTeam)
        || (home === awayTeam && away === homeTeam)
      );
    })
    .slice(0, 5);

  return sample.reduce((acc, entry) => {
    const homeGoals = entry.score.home ?? 0;
    const awayGoals = entry.score.away ?? 0;
    const entryHome = entry.homeTeam.abbreviation || entry.homeTeam.name;
    const entryAway = entry.awayTeam.abbreviation || entry.awayTeam.name;
    const mappedHomeGoals = entryHome === homeTeam ? homeGoals : awayGoals;
    const mappedAwayGoals = entryAway === awayTeam ? awayGoals : homeGoals;

    if (mappedHomeGoals > mappedAwayGoals) acc.homeWins += 1;
    else if (mappedHomeGoals < mappedAwayGoals) acc.awayWins += 1;
    else acc.draws += 1;

    if (mappedHomeGoals > 0 && mappedAwayGoals > 0) acc.bttsHits += 1;
    if (mappedHomeGoals + mappedAwayGoals > 2.5) acc.over25Hits += 1;
    acc.sample += 1;
    return acc;
  }, {
    sample: 0,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    bttsHits: 0,
    over25Hits: 0,
  });
}

export function buildSoccerMatchInsights(
  matches: SoccerMatch[],
  recentMatches: SoccerMatch[],
  standings: SoccerTeamStanding[] = [],
): SoccerMatchInsight[] {
  const snapshots = buildSnapshotMap(recentMatches);
  const standingMap = new Map<string, SoccerTeamStanding>();

  for (const standing of standings) {
    standingMap.set(standing.team, standing);
    standingMap.set(standing.teamName, standing);
  }

  return matches.map((match) => {
    const homeKey = match.homeTeam.abbreviation || match.homeTeam.name;
    const awayKey = match.awayTeam.abbreviation || match.awayTeam.name;
    const homeForm = buildTeamForm(snapshots.get(homeKey));
    const awayForm = buildTeamForm(snapshots.get(awayKey));
    const h2h = buildH2H(match, recentMatches);

    const strength = compareStrength(homeForm, awayForm, {
      home: standingMap.get(homeKey) || standingMap.get(match.homeTeam.name),
      away: standingMap.get(awayKey) || standingMap.get(match.awayTeam.name),
    });
    const projectedGoals = homeForm.goalsForAvg + awayForm.goalsForAvg;
    const projectedBTTS = (homeForm.bttsRate + awayForm.bttsRate) / 2;
    const homeCleanEdge = homeForm.cleanSheetRate - awayForm.goalsForAvg / 3;
    const awayCleanEdge = awayForm.cleanSheetRate - homeForm.goalsForAvg / 3;
    const scoreFirstEdge = (homeForm.goalsForAvg - awayForm.goalsAgainstAvg) - (awayForm.goalsForAvg - homeForm.goalsAgainstAvg);

    const resultLean = strength > 10 ? "Home"
      : strength < -10 ? "Away"
      : "Draw";
    const resultConfidence = resultLean === "Draw" ? clamp(54 + h2h.draws * 4) : clamp(58 + Math.abs(strength));

    const props: SoccerMatchInsight["props"] = [
      {
        type: "Match Result",
        lean: resultLean,
        confidence: resultConfidence,
        rationale: [
          `${match.homeTeam.shortName} home form: ${describeRecord(homeForm.homeRecord)}`,
          `${match.awayTeam.shortName} away form: ${describeRecord(awayForm.awayRecord)}`,
          `Goal differential edge: ${(homeForm.goalsForAvg - awayForm.goalsForAvg).toFixed(1)}`,
        ],
        indicators: buildIndicators(resultConfidence, resultLean === "Home" ? homeForm.winStreak : awayForm.winStreak),
      },
      {
        type: "Both Teams to Score",
        lean: projectedBTTS >= 0.56 ? "Yes" : "No",
        confidence: clamp(50 + Math.abs(projectedBTTS - 0.5) * 80 + h2h.bttsHits * 3),
        rationale: [
          `${match.homeTeam.shortName} BTTS in ${toPct(homeForm.bttsRate)}% of recent matches`,
          `${match.awayTeam.shortName} BTTS in ${toPct(awayForm.bttsRate)}% of recent matches`,
        ],
        indicators: buildIndicators(clamp(50 + Math.abs(projectedBTTS - 0.5) * 80)),
      },
      {
        type: "Total Goals 1.5",
        lean: projectedGoals >= 1.8 ? "Over" : "Under",
        confidence: clamp(55 + Math.abs(projectedGoals - 1.5) * 18),
        rationale: [`Combined goals projection ${projectedGoals.toFixed(2)}`],
        indicators: buildIndicators(clamp(55 + Math.abs(projectedGoals - 1.5) * 18)),
      },
      {
        type: "Total Goals 2.5",
        lean: projectedGoals >= 2.55 ? "Over" : "Under",
        confidence: clamp(52 + Math.abs(projectedGoals - 2.5) * 22 + h2h.over25Hits * 3),
        rationale: [
          `${match.homeTeam.shortName} over 2.5: ${toPct(homeForm.over25Rate)}%`,
          `${match.awayTeam.shortName} over 2.5: ${toPct(awayForm.over25Rate)}%`,
        ],
        indicators: buildIndicators(clamp(52 + Math.abs(projectedGoals - 2.5) * 22)),
      },
      {
        type: "Total Goals 3.5",
        lean: projectedGoals >= 3.25 ? "Over" : "Under",
        confidence: clamp(50 + Math.abs(projectedGoals - 3.5) * 18),
        rationale: [`High-total rate: ${(homeForm.over35Rate + awayForm.over35Rate > 1 ? "live" : "limited")} sample`],
        indicators: buildIndicators(clamp(50 + Math.abs(projectedGoals - 3.5) * 18)),
      },
      {
        type: "Clean Sheet",
        lean: homeCleanEdge >= awayCleanEdge ? match.homeTeam.shortName : match.awayTeam.shortName,
        confidence: clamp(48 + Math.max(homeCleanEdge, awayCleanEdge) * 40),
        rationale: [
          `${match.homeTeam.shortName} clean sheet rate: ${toPct(homeForm.cleanSheetRate)}%`,
          `${match.awayTeam.shortName} clean sheet rate: ${toPct(awayForm.cleanSheetRate)}%`,
        ],
        indicators: buildIndicators(clamp(48 + Math.max(homeCleanEdge, awayCleanEdge) * 40)),
      },
      {
        type: "Team to Score First",
        lean: scoreFirstEdge >= 0 ? match.homeTeam.shortName : match.awayTeam.shortName,
        confidence: clamp(52 + Math.abs(scoreFirstEdge) * 18),
        rationale: [
          `${match.homeTeam.shortName} attack avg: ${homeForm.goalsForAvg.toFixed(2)}`,
          `${match.awayTeam.shortName} attack avg: ${awayForm.goalsForAvg.toFixed(2)}`,
        ],
        indicators: buildIndicators(clamp(52 + Math.abs(scoreFirstEdge) * 18)),
      },
    ];

    return {
      matchId: match.id,
      league: match.league,
      homeTeam: homeKey,
      awayTeam: awayKey,
      homeForm,
      awayForm,
      h2h,
      props,
    };
  });
}
