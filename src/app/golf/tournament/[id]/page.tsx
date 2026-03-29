import Link from "next/link";
import GolfMarketEdgesSection from "@/components/GolfMarketEdgesSection";
import GolfTopFinishOddsRail from "@/components/GolfTopFinishOddsRail";
import GolfTournamentTabs from "@/components/GolfTournamentTabs";
import { getPGALeaderboard, getPGATournamentById, getPGATournamentLeaderboard } from "@/lib/golf-api";
import { getGolfPredictionData } from "@/lib/golf-live-data";
import { getGolfOdds } from "@/lib/golf-odds";
import { getGolfBadgeTone, getGolfTournamentBadgeLabel, isGolfMajor } from "@/lib/golf-ui";

export const dynamic = "force-dynamic";

export default async function GolfTournamentDetailPage({ params }: { params: { id: string } }) {
  const eventId = params.id;
  const [scheduleTournament, leaderboard, activeLeaderboard, odds] = await Promise.all([
    getPGATournamentById(eventId),
    getPGATournamentLeaderboard(eventId),
    getPGALeaderboard(),
    getGolfOdds(),
  ]);

  const tournament = leaderboard?.tournament ?? scheduleTournament;
  const isActiveEvent = Boolean(activeLeaderboard?.tournament.id === eventId);
  const predictions = await getGolfPredictionData(leaderboard ?? null, isActiveEvent ? odds : null);
  const latestWinner = tournament?.status === "completed" && leaderboard
    ? (() => {
        const winner = leaderboard.players.find((player) => player.position === "1" || player.position === "T1") ?? leaderboard.players[0];
        return winner ? { name: winner.name, score: winner.score } : null;
      })()
    : null;

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
            Back to Golf
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_34%),rgba(255,255,255,0.04)] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.34)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                href="/golf"
                className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-gray-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Back to Golf
              </Link>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{tournament.name}</h1>
                {isGolfMajor(tournament.name) ? (
                  <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                    {"\u2B50"} Major
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm text-gray-300">
                {tournament.course}
                {tournament.location ? ` · ${tournament.location}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <span>{tournament.dates}</span>
                {typeof tournament.coursePar === "number" ? <span>Par {tournament.coursePar}</span> : null}
                {typeof tournament.courseYardage === "number" ? <span>{tournament.courseYardage.toLocaleString()} yards</span> : null}
                {tournament.purse !== "TBD" ? <span>{tournament.purse}</span> : null}
              </div>

              {tournament.statusDetail ? <p className="mt-3 text-sm text-gray-500">{tournament.statusDetail}</p> : null}
            </div>

            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getGolfBadgeTone(tournament)}`}>
              {getGolfTournamentBadgeLabel(tournament, leaderboard)}
            </span>
          </div>
        </section>

        <GolfMarketEdgesSection predictions={predictions} />

        {/* Top-finish odds rail: real Bovada lines or "no odds available" — never fabricated */}
        <GolfTopFinishOddsRail predictions={predictions} />

        <GolfTournamentTabs
          tournament={tournament}
          leaderboard={leaderboard}
          predictions={predictions}
          latestWinner={latestWinner}
        />
      </div>
    </main>
  );
}
