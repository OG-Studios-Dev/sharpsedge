import Link from "next/link";
import GolfLeaderboardCard from "@/components/GolfLeaderboardCard";
import { getPGALeaderboard, getPGATournamentById, getPGATournamentLeaderboard } from "@/lib/golf-api";
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

function percent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "NA";
  return `${(value * 100).toFixed(1)}%`;
}

function edge(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Model only";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default async function GolfTournamentDetailPage({ params }: { params: { id: string } }) {
  const eventId = params.id;
  const [scheduleTournament, leaderboard, activeLeaderboard, odds] = await Promise.all([
    getPGATournamentById(eventId),
    getPGATournamentLeaderboard(eventId),
    getPGALeaderboard(),
    getGolfOdds(),
  ]);

  const tournament = leaderboard?.tournament ?? scheduleTournament;
  const isActiveEvent = Boolean(leaderboard && activeLeaderboard?.tournament.id === eventId);
  const predictions = isActiveEvent && leaderboard ? await getGolfPredictionData(leaderboard, odds) : null;
  const contenderBoard = leaderboard?.players.filter((player) => player.position !== "CUT").slice(0, 10) ?? [];

  if (!tournament) {
    return (
      <main className="min-h-screen bg-dark-bg px-4 py-10 text-white md:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[32px] border border-white/10 bg-white/[0.04] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Golf</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Tournament not found</h1>
          <p className="mt-3 text-sm text-gray-400">This ESPN event id was not present in the current PGA schedule feed.</p>
          <Link
            href="/golf"
            className="mt-6 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Back to golf
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),rgba(255,255,255,0.04)] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.34)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/golf" className="text-xs uppercase tracking-[0.24em] text-gray-500 transition hover:text-gray-300">
                Back to golf
              </Link>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">{tournament.name}</h1>
              <p className="mt-2 text-sm text-gray-300">
                {tournament.course}
                {tournament.location ? ` · ${tournament.location}` : ""}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                {tournament.dates}
                {typeof tournament.coursePar === "number" ? ` · Par ${tournament.coursePar}` : ""}
              </p>
              {tournament.statusDetail ? <p className="mt-2 text-sm text-gray-500">{tournament.statusDetail}</p> : null}
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeTone(tournament)}`}>
              {badgeLabel(tournament, leaderboard)}
            </span>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="mb-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Leaderboard</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Top 20 with full board on demand</h2>
            </div>
            <GolfLeaderboardCard leaderboard={leaderboard ?? null} />
          </div>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Contender Board</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Top 10 active players</h2>
              </div>
              <span className="text-xs text-gray-500">{contenderBoard.length} golfers</span>
            </div>

            <div className="mt-4 space-y-3">
              {contenderBoard.length > 0 ? contenderBoard.map((player, index) => (
                <div key={`${player.id}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {player.position || index + 1}. {player.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {player.thru || player.teeTime || "Waiting"}
                        {player.todayScore && player.todayScore !== "E" ? ` · Today ${player.todayScore}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-white">{player.score}</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                  Contender board appears when the field is posted.
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">AI Predictions</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Form, history, and fit</h2>
              </div>
              <span className="text-xs text-gray-500">{isActiveEvent ? "Active event model" : "Wait for active board"}</span>
            </div>

            <div className="mt-4 space-y-3">
              {predictions?.players.slice(0, 8).map((player, index) => (
                <div key={`${player.id}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{index + 1}. {player.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Form {player.formScore} · Course history {player.courseHistoryScore} · Course fit {player.courseFitScore}
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                      {(player.modelProb * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}

              {!predictions && (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                  Predictions unlock for the active event only, because the odds feed is tied to the live tournament board.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Best Value</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Edge plays from the odds board</h2>
              </div>
              <span className="text-xs text-gray-500">{predictions?.bestValuePicks.length ?? 0} spots</span>
            </div>

            <div className="mt-4 space-y-3">
              {predictions?.bestValuePicks.slice(0, 6).map((play, index) => (
                <div key={`${play.player.id}-${play.market}-${index}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{play.player.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{play.market}</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
                      {edge(play.edge)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-gray-400">
                    Model {percent(play.modelProb)}
                    {play.bookProb !== null ? ` · Book ${percent(play.bookProb)}` : " · Book NA"}
                  </p>
                </div>
              ))}

              {!predictions && (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                  Value plays appear when there is an active odds board attached to this tournament.
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Course Info</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Venue snapshot</h2>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Course</p>
              <p className="mt-2 text-sm font-medium text-white">{tournament.course}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Location</p>
              <p className="mt-2 text-sm font-medium text-white">{tournament.location || "TBD"}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Par</p>
              <p className="mt-2 text-sm font-medium text-white">{typeof tournament.coursePar === "number" ? tournament.coursePar : "TBD"}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Purse</p>
              <p className="mt-2 text-sm font-medium text-white">{tournament.purse || "TBD"}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
