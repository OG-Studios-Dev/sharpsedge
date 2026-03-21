import { getDateKeyWithOffset, MLB_TIME_ZONE } from "@/lib/date-utils";
import { getMLBBoxscore, getMLBScheduleRange, type MLBBoxscorePlayer, type MLBGame } from "@/lib/mlb-api";

export type MLBBullpenPitcherUsage = {
  playerId: string;
  name: string;
  gameId: string;
  gameDate: string;
  inningsPitched: number;
  pitchCount: number;
  earnedRuns: number;
  backToBack: boolean;
  threeInFour: boolean;
};

export type MLBBullpenFatigueTeamContext = {
  teamAbbrev: string;
  gamesReviewed: number;
  relieversUsedLast3: number;
  inningsLast3: number;
  pitchesLast3: number;
  highStressAppearancesLast3: number;
  backToBackRelievers: number;
  threeInFourRelievers: number;
  mostUsedRelievers: MLBBullpenPitcherUsage[];
  score: number;
  level: "low" | "moderate" | "high";
  summary: string;
  source: {
    type: "mlb-stats-api-boxscores";
    reviewedWindowDays: number;
    reviewedGameIds: string[];
    reviewedDates: string[];
    fetchedAt: string;
    staleAfter: string;
  };
};

type TeamUsageRow = {
  gameId: string;
  gameDate: string;
  pitcher: MLBBoxscorePlayer;
};

function addHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function asReliever(player: MLBBoxscorePlayer) {
  return player.isPitcher && !player.isStarter && player.inningsPitched > 0;
}

function stressPoints(row: TeamUsageRow) {
  let score = 0;
  if (row.pitcher.pitchCount >= 30) score += 2;
  else if (row.pitcher.pitchCount >= 20) score += 1;
  if (row.pitcher.inningsPitched >= 2) score += 2;
  else if (row.pitcher.inningsPitched >= 1) score += 1;
  return score;
}

function summarizeLevel(score: number): "low" | "moderate" | "high" {
  if (score >= 8) return "high";
  if (score >= 4) return "moderate";
  return "low";
}

function buildSummary(level: "low" | "moderate" | "high", ctx: Omit<MLBBullpenFatigueTeamContext, "summary">) {
  const lead = level === "high"
    ? "Bullpen usage looks elevated lately"
    : level === "moderate"
      ? "Bullpen workload is notable but not extreme"
      : "Bullpen usage looks manageable";
  return `${lead}: ${ctx.pitchesLast3} pitches and ${ctx.inningsLast3.toFixed(1)} innings from relievers across the last ${ctx.gamesReviewed} reviewed game${ctx.gamesReviewed === 1 ? "" : "s"}, with ${ctx.backToBackRelievers} reliever${ctx.backToBackRelievers === 1 ? "" : "s"} on back-to-back usage.`;
}

export async function buildMLBBullpenFatigueBoard(schedule: MLBGame[]) {
  const today = getDateKeyWithOffset(0, MLB_TIME_ZONE);
  const start = getDateKeyWithOffset(-3, MLB_TIME_ZONE);
  const recentGames = await getMLBScheduleRange(start, today);
  const finalGames = recentGames.filter((game) => game.status === "Final");
  const relevantTeams = new Set(schedule.flatMap((game) => [game.homeTeam.abbreviation, game.awayTeam.abbreviation]));
  const relevantFinals = finalGames.filter((game) => relevantTeams.has(game.homeTeam.abbreviation) || relevantTeams.has(game.awayTeam.abbreviation));

  const boxscores = await Promise.all(relevantFinals.map(async (game) => ({ game, box: await getMLBBoxscore(game.id) })));
  const usageByTeam = new Map<string, TeamUsageRow[]>();

  for (const { game, box } of boxscores) {
    for (const player of box.home.filter(asReliever)) {
      const rows = usageByTeam.get(player.teamAbbrev) ?? [];
      rows.push({ gameId: game.id, gameDate: game.date, pitcher: player });
      usageByTeam.set(player.teamAbbrev, rows);
    }
    for (const player of box.away.filter(asReliever)) {
      const rows = usageByTeam.get(player.teamAbbrev) ?? [];
      rows.push({ gameId: game.id, gameDate: game.date, pitcher: player });
      usageByTeam.set(player.teamAbbrev, rows);
    }
  }

  const fetchedAt = new Date().toISOString();
  const staleAfter = addHours(fetchedAt, 6);
  const board = new Map<string, MLBBullpenFatigueTeamContext>();

  for (const teamAbbrev of Array.from(relevantTeams)) {
    const rows = (usageByTeam.get(teamAbbrev) ?? []).sort((a, b) => b.gameDate.localeCompare(a.gameDate));
    const reviewedGames = Array.from(new Set(rows.map((row) => row.gameId)));
    const reviewedDates = Array.from(new Set(rows.map((row) => row.gameDate)));
    const byPitcher = new Map<string, TeamUsageRow[]>();
    for (const row of rows) {
      const bucket = byPitcher.get(row.pitcher.id) ?? [];
      bucket.push(row);
      byPitcher.set(row.pitcher.id, bucket);
    }

    const mostUsedRelievers = Array.from(byPitcher.entries())
      .map(([playerId, appearances]) => {
        const sorted = appearances.sort((a, b) => b.gameDate.localeCompare(a.gameDate));
        const lastDate = sorted[0]?.gameDate ?? "";
        const uniqueDates = Array.from(new Set(sorted.map((entry) => entry.gameDate))).sort();
        const backToBack = uniqueDates.length >= 2 && uniqueDates.slice(-2).join(",") === [getDateKeyWithOffset(-1, MLB_TIME_ZONE), today].join(",");
        const threeInFour = uniqueDates.length >= 3;
        const totals = sorted.reduce((acc, row) => ({
          inningsPitched: acc.inningsPitched + row.pitcher.inningsPitched,
          pitchCount: acc.pitchCount + row.pitcher.pitchCount,
          earnedRuns: acc.earnedRuns + row.pitcher.earnedRuns,
        }), { inningsPitched: 0, pitchCount: 0, earnedRuns: 0 });
        return {
          playerId,
          name: sorted[0]?.pitcher.name ?? playerId,
          gameId: sorted[0]?.gameId ?? "",
          gameDate: lastDate,
          inningsPitched: Number(totals.inningsPitched.toFixed(1)),
          pitchCount: totals.pitchCount,
          earnedRuns: totals.earnedRuns,
          backToBack,
          threeInFour,
        };
      })
      .sort((a, b) => b.pitchCount - a.pitchCount || b.inningsPitched - a.inningsPitched)
      .slice(0, 4);

    const inningsLast3 = rows.reduce((sum, row) => sum + row.pitcher.inningsPitched, 0);
    const pitchesLast3 = rows.reduce((sum, row) => sum + row.pitcher.pitchCount, 0);
    const highStressAppearancesLast3 = rows.filter((row) => stressPoints(row) >= 3).length;
    const backToBackRelievers = mostUsedRelievers.filter((reliever) => reliever.backToBack).length;
    const threeInFourRelievers = mostUsedRelievers.filter((reliever) => reliever.threeInFour).length;
    const relieversUsedLast3 = byPitcher.size;
    const score = highStressAppearancesLast3 + backToBackRelievers * 2 + threeInFourRelievers * 2 + (pitchesLast3 >= 110 ? 2 : pitchesLast3 >= 70 ? 1 : 0);
    const level = summarizeLevel(score);

    const contextBase = {
      teamAbbrev,
      gamesReviewed: reviewedGames.length,
      relieversUsedLast3,
      inningsLast3: Number(inningsLast3.toFixed(1)),
      pitchesLast3,
      highStressAppearancesLast3,
      backToBackRelievers,
      threeInFourRelievers,
      mostUsedRelievers,
      score,
      level,
      source: {
        type: "mlb-stats-api-boxscores" as const,
        reviewedWindowDays: 3,
        reviewedGameIds: reviewedGames,
        reviewedDates,
        fetchedAt,
        staleAfter,
      },
    };

    board.set(teamAbbrev, {
      ...contextBase,
      summary: buildSummary(level, contextBase),
    });
  }

  return board;
}
