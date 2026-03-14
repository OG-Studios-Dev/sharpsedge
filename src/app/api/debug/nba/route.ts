import { NextResponse } from "next/server";
import { getNBASchedule, getRecentNBAGames, getNBABoxscore } from "@/lib/nba-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const steps: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    // Step 1: Schedule
    const t1 = Date.now();
    const schedule = await getNBASchedule();
    steps.schedule = { count: schedule.length, ms: Date.now() - t1 };
    const activeGames = schedule.filter((g) => g.status !== "Final");
    steps.activeGames = activeGames.length;
    steps.sampleGame = activeGames[0] ? {
      id: activeGames[0].id,
      status: activeGames[0].status,
      home: activeGames[0].homeTeam.abbreviation,
      away: activeGames[0].awayTeam.abbreviation,
    } : null;

    // Step 2: Recent games
    const t2 = Date.now();
    let recentGames: Awaited<ReturnType<typeof getRecentNBAGames>> = [];
    try {
      recentGames = await getRecentNBAGames(14);
      steps.recentGames = { count: recentGames.length, ms: Date.now() - t2 };
    } catch (err) {
      recentGames = [];
      errors.push("getRecentNBAGames failed: " + String(err));
      steps.recentGames = { count: 0, ms: Date.now() - t2, error: String(err) };
    }

    // Step 3: Check team coverage for first 2 active games
    const targetGames = activeGames.slice(0, 2);
    const teams = new Set<string>();
    targetGames.forEach((g) => {
      teams.add(g.homeTeam.abbreviation);
      teams.add(g.awayTeam.abbreviation);
    });

    const teamCoverage: Record<string, number> = {};
    const teamsArr = Array.from(teams);
    for (const team of teamsArr) {
      const count = recentGames.filter(
        (g) => g.homeTeam.abbreviation === team || g.awayTeam.abbreviation === team
      ).length;
      teamCoverage[team] = count;
    }
    steps.teamCoverage = teamCoverage;

    // Step 4: Try to fetch a boxscore for the first team's recent game
    const firstTeam = teamsArr[0];
    const firstTeamGame = recentGames.find(
      (g) =>
        g.status === "Final" &&
        (g.homeTeam.abbreviation === firstTeam || g.awayTeam.abbreviation === firstTeam)
    );
    if (firstTeamGame) {
      const t4 = Date.now();
      try {
        const box = await getNBABoxscore(firstTeamGame.id);
        const isHome = firstTeamGame.homeTeam.abbreviation === firstTeam;
        const teamPlayers = isHome ? box.home : box.away;
        const qualified = teamPlayers.filter((p) => parseFloat(p.minutes) >= 20);
        steps.boxscoreTest = {
          gameId: firstTeamGame.id,
          team: firstTeam,
          totalPlayers: teamPlayers.length,
          qualifiedPlayers: qualified.length,
          topPlayers: qualified.slice(0, 3).map((p) => ({
            name: p.name,
            pts: p.points,
            reb: p.rebounds,
            ast: p.assists,
            min: p.minutes,
          })),
          ms: Date.now() - t4,
        };
      } catch (err) {
        errors.push("getNBABoxscore failed: " + String(err));
        steps.boxscoreTest = { error: String(err), ms: Date.now() - t4 };
      }
    } else {
      steps.boxscoreTest = { error: "No recent Final game found for " + firstTeam };
    }

    // Step 5: Try full prop generation for one player
    if (firstTeamGame) {
      const t5 = Date.now();
      try {
        const box = await getNBABoxscore(firstTeamGame.id);
        const isHome = firstTeamGame.homeTeam.abbreviation === firstTeam;
        const teamPlayers = isHome ? box.home : box.away;
        const topPlayer = teamPlayers
          .filter((p) => parseFloat(p.minutes) >= 20)
          .sort((a, b) => b.points - a.points)[0];

        if (topPlayer) {
          // Get stats for this player across recent games
          const playerGames = recentGames
            .filter(
              (g) =>
                g.status === "Final" &&
                (g.homeTeam.abbreviation === firstTeam || g.awayTeam.abbreviation === firstTeam)
            )
            .slice(0, 10);

          const stats: { pts: number; reb: number; ast: number }[] = [];
          for (const pg of playerGames) {
            try {
              const pgBox = await getNBABoxscore(pg.id);
              const pgIsHome = pg.homeTeam.abbreviation === firstTeam;
              const pgPlayers = pgIsHome ? pgBox.home : pgBox.away;
              const lastName = topPlayer.name.toLowerCase().split(" ").pop() ?? "";
              const firstName = topPlayer.name.toLowerCase().split(" ")[0] ?? "";
              const found = pgPlayers.find(
                (p) =>
                  p.name.toLowerCase().includes(lastName) &&
                  p.name.toLowerCase().includes(firstName)
              );
              if (found && parseFloat(found.minutes) >= 15) {
                stats.push({ pts: found.points, reb: found.rebounds, ast: found.assists });
              }
            } catch {
              /* skip */
            }
          }

          const avg = stats.length > 0 ? stats.reduce((a, b) => a + b.pts, 0) / stats.length : 0;
          const modelLine = Math.max(Math.floor(avg * 2) / 2, 5);
          const hitRate = stats.filter((g) => g.pts > modelLine).length / Math.max(stats.length, 1);
          const edge = hitRate - 110 / 210;

          steps.propTest = {
            player: topPlayer.name,
            gamesFound: stats.length,
            stats: stats.slice(0, 5),
            avgPts: avg.toFixed(1),
            modelLine,
            hitRate: (hitRate * 100).toFixed(1) + "%",
            edge: (edge * 100).toFixed(1) + "%",
            wouldGenerate: edge > -0.05,
            ms: Date.now() - t5,
          };
        }
      } catch (err) {
        errors.push("propTest failed: " + String(err));
        steps.propTest = { error: String(err), ms: Date.now() - t5 };
      }
    }
  } catch (err) {
    errors.push("Fatal: " + String(err));
  }

  return NextResponse.json({ steps, errors, timestamp: new Date().toISOString() });
}
