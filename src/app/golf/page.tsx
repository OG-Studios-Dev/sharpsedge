import Link from "next/link";
import { getPGALeaderboard, getPGASchedule, getPGATournamentLeaderboard } from "@/lib/golf-api";
import { getGolfPredictionData } from "@/lib/golf-live-data";
import { getGolfOdds } from "@/lib/golf-odds";
import type { GolfLeaderboard, GolfTournament } from "@/lib/types";

export const dynamic = "force-dynamic";

function badgeLabel(tournament: GolfTournament, leaderboard?: GolfLeaderboard | null) {
  if (leaderboard?.tournament.id === tournament.id) {
    return leaderboard.statusBadge ?? (tournament.status === "completed" ? "Final" : "Live");
  }
  if (tournament.status === "completed") return "Final";
  if (typeof tournament.round === "number" && tournament.round > 0) return `Round ${tournament.round}`;
  if (tournament.status === "upcoming") return "Upcoming";
  return "In Progress";
}

function badgeTone(tournament: GolfTournament) {
  if (tournament.status === "completed") return "border-white/10 bg-white/5 text-gray-200";
  if (tournament.status === "in-progress") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
  return "border-amber-400/30 bg-amber-400/15 text-amber-100";
}

function rowTone(tournament: GolfTournament) {
  if (tournament.status === "completed") return "border-white/8 bg-white/[0.03]";
  if (tournament.current || tournament.status === "in-progress") return "border-emerald-500/25 bg-emerald-500/10";
  return "border-white/8 bg-black/20";
}

async function loadWinnerMap(schedule: GolfTournament[]) {
  const completed = schedule.filter((tournament) => tournament.status === "completed");
  const winners = await Promise.all(
    completed.map(async (tournament) => {
      const leaderboard = await getPGATournamentLeaderboard(tournament.id);
      const winner = leaderboard?.players.find((player) => player.position === "1" || player.position === "T1") ?? leaderboard?.players[0];
      return [tournament.id, winner?.name ?? null] as const;
    }),
  );

  return new Map(winners);
}

export default async function GolfPage() {
  const [leaderboard, schedule, odds] = await Promise.all([
    getPGALeaderboard(),
    getPGASchedule(),
    getGolfOdds(),
  ]);

  const heroTournament = leaderboard?.tournament ?? schedule.find((tournament) => tournament.current) ?? schedule[0] ?? null;
  const predictions = leaderboard ? await getGolfPredictionData(leaderboard, odds) : null;
  const upcoming = schedule.filter((tournament) => tournament.status === "upcoming" && tournament.id !== heroTournament?.id).slice(0, 5);
  const winnerMap = await loadWinnerMap(schedule);
  const heroPlayers = leaderboard?.tournament.id === heroTournament?.id
    ? leaderboard.players.filter((player) => player.position !== "CUT").slice(0, 3)
    : [];
  const rankingBoard = predictions?.players.slice(0, 5) ?? [];

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">PGA Hub</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Tournament board</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Current tournament, next stops on the schedule, and a season board that stays compact until you need the full slate.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
            {schedule.length > 0 ? `${schedule.length} events loaded` : "Schedule loading"}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),rgba(255,255,255,0.04)] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Current Tournament</p>
                <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                  {heroTournament?.name ?? "Tournament board unavailable"}
                </h2>
                <p className="mt-2 text-sm text-gray-300">
                  {heroTournament ? `${heroTournament.course}${heroTournament.location ? ` · ${heroTournament.location}` : ""}` : "ESPN schedule feed did not return a current event."}
                </p>
                {heroTournament && (
                  <p className="mt-1 text-sm text-gray-400">
                    {heroTournament.dates}
                    {typeof heroTournament.coursePar === "number" ? ` · Par ${heroTournament.coursePar}` : ""}
                  </p>
                )}
              </div>
              {heroTournament && (
                <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeTone(heroTournament)}`}>
                  {badgeLabel(heroTournament, leaderboard)}
                </span>
              )}
            </div>

            {heroTournament ? (
              <Link
                href={`/golf/tournament/${heroTournament.id}`}
                className="mt-5 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
              >
                Open tournament page
              </Link>
            ) : null}

            <div className="mt-6 rounded-[28px] border border-white/10 bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Leaderboard Preview</p>
                  <p className="mt-1 text-sm text-gray-400">Top 3 from the active board.</p>
                </div>
                {leaderboard?.lastUpdated ? (
                  <span className="text-xs text-gray-500">Updated {leaderboard.lastUpdated}</span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {heroPlayers.length > 0 ? heroPlayers.map((player) => (
                  <div
                    key={`${player.id}-${player.position}`}
                    className="grid grid-cols-[48px_minmax(0,1fr)_56px_68px] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3"
                  >
                    <div className="text-lg font-semibold text-white">{player.position || "-"}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{player.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{player.todayScore !== "E" ? `Today ${player.todayScore}` : "Even today"}</p>
                    </div>
                    <div className="text-right text-sm font-semibold text-white">{player.score}</div>
                    <div className="text-right text-xs text-gray-400">{player.thru || player.teeTime || "-"}</div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                    Field and leaderboard will appear here once ESPN posts the board for this event.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Upcoming Tournaments</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Next five stops</h2>
                </div>
                <span className="text-xs text-gray-500">{upcoming.length} loaded</span>
              </div>

              <div className="mt-4 space-y-3">
                {upcoming.length > 0 ? upcoming.map((tournament) => (
                  <Link
                    key={tournament.id}
                    href={`/golf/tournament/${tournament.id}`}
                    className={`flex min-h-[60px] items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.06] ${rowTone(tournament)}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{tournament.name}</p>
                      <p className="mt-1 truncate text-xs text-gray-400">{tournament.dates} · {tournament.course}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeTone(tournament)}`}>
                      {badgeLabel(tournament)}
                    </span>
                  </Link>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                    No upcoming tournaments are posted yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Rankings</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">Contender board for now</h2>
                </div>
                <span className="text-xs text-gray-500">OWGR and LIV boards later</span>
              </div>

              <div className="mt-4 space-y-3">
                {rankingBoard.length > 0 ? rankingBoard.map((player, index) => (
                  <div key={`${player.id}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{index + 1}. {player.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Form {player.formScore} · Course fit {player.courseFitScore} · Model {(player.modelProb * 100).toFixed(1)}%
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                        Score {player.combinedScore}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                    Rankings coming soon.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        <details className="group rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Full Season Schedule</p>
              <h2 className="mt-1 text-xl font-semibold text-white">See full schedule</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">
              {schedule.length} tournaments
            </span>
          </summary>

          <div className="mt-5 grid gap-3">
            {schedule.map((tournament) => (
              <Link
                key={tournament.id}
                href={`/golf/tournament/${tournament.id}`}
                className={`rounded-2xl border px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.06] ${rowTone(tournament)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{tournament.dates}</p>
                    <p className="mt-1 truncate text-sm font-medium text-white">{tournament.name}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">
                      {tournament.course}
                      {tournament.status === "completed" && winnerMap.get(tournament.id)
                        ? ` · Winner ${winnerMap.get(tournament.id)}`
                        : tournament.location
                          ? ` · ${tournament.location}`
                          : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeTone(tournament)}`}>
                    {badgeLabel(tournament)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
