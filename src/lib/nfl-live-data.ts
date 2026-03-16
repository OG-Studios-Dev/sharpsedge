import { getNFLStandings, getNFLSchedule, type NFLGame, type NFLTeamStanding } from "@/lib/nfl-api";

export type NFLDashboardData = {
  schedule: NFLGame[];
  standings: NFLTeamStanding[];
  meta: {
    league: "NFL";
    inOffseason: boolean;
    seasonStartsLabel: string;
    seasonStartDate: string;
    countdownDays: number;
    upcomingEvents: Array<{ label: string; dateLabel: string }>;
  };
};

function getSeasonStartDate() {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 8, 1);
  if (now.getTime() <= start.getTime()) return start;
  return new Date(year + 1, 8, 1);
}

function daysUntil(date: Date) {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export async function getNFLDashboardData(): Promise<NFLDashboardData> {
  const [schedule, standings] = await Promise.all([
    getNFLSchedule(),
    getNFLStandings(),
  ]);

  const seasonStart = getSeasonStartDate();
  const seasonLabel = seasonStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const activeSchedule = schedule.filter((game) => game.status !== "Final");
  const inOffseason = activeSchedule.length === 0;

  return {
    schedule,
    standings,
    meta: {
      league: "NFL",
      inOffseason,
      seasonStartsLabel: seasonLabel,
      seasonStartDate: seasonStart.toISOString(),
      countdownDays: daysUntil(seasonStart),
      upcomingEvents: [
        { label: "NFL Draft", dateLabel: seasonStart.getFullYear() === new Date().getFullYear() ? `April ${seasonStart.getFullYear()}` : `April ${seasonStart.getFullYear()}` },
        { label: "Preseason", dateLabel: `August ${seasonStart.getFullYear()}` },
        { label: "Week 1", dateLabel: `September ${seasonStart.getFullYear()}` },
      ],
    },
  };
}
