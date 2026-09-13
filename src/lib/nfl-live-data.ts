import { getNFLStandings, getNFLSchedule, type NFLGame, type NFLTeamStanding } from "@/lib/nfl-api";
import { resolveNFLSeasonStart } from "@/lib/nfl-season-context";
import { nflWeekSummary, type NFLWeekSummary } from "@/lib/nfl-week";

export type NFLDashboardData = {
  schedule: NFLGame[];
  standings: NFLTeamStanding[];
  meta: {
    league: "NFL";
    inOffseason: boolean;
    seasonStartsLabel: string;
    seasonStartDate: string;
    countdownDays: number;
    week: NFLWeekSummary;
    upcomingEvents: Array<{ label: string; dateLabel: string }>;
  };
};

function daysUntil(date: Date) {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export async function getNFLDashboardData(week?: number | null): Promise<NFLDashboardData> {
  const [schedule, standings] = await Promise.all([
    getNFLSchedule(week),
    getNFLStandings(),
  ]);

  const activeSchedule = schedule.filter((game) => game.status !== "Final");
  const inOffseason = activeSchedule.length === 0;
  const seasonStart = resolveNFLSeasonStart(new Date(), activeSchedule.length > 0);
  const seasonLabel = seasonStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Toronto" });

  return {
    schedule,
    standings,
    meta: {
      league: "NFL",
      inOffseason,
      seasonStartsLabel: seasonLabel,
      seasonStartDate: seasonStart.toISOString(),
      countdownDays: daysUntil(seasonStart),
      week: nflWeekSummary(schedule),
      upcomingEvents: [
        { label: "NFL Draft", dateLabel: seasonStart.getFullYear() === new Date().getFullYear() ? `April ${seasonStart.getFullYear()}` : `April ${seasonStart.getFullYear()}` },
        { label: "Preseason", dateLabel: `August ${seasonStart.getFullYear()}` },
        { label: "Week 1", dateLabel: `September ${seasonStart.getFullYear()}` },
      ],
    },
  };
}
