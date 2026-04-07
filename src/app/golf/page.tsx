import Link from "next/link";
import { getPGALeaderboard, getPGASchedule, getPGATournamentLeaderboard, getLocalMastersOddsSnapshot } from "@/lib/golf-api";
import MastersAnalysisSection from "@/components/MastersAnalysisSection";
import { getGolfPredictionData } from "@/lib/golf-live-data";
import { getGolfOdds } from "@/lib/golf-odds";
import {
  formatGolfUpdatedAt,
  formatGolfPercent,
  getGolfBadgeTone,
  getGolfPredictionSourceLabel,
  getGolfRowTone,
  getGolfTournamentBadgeLabel,
  isGolfMajor,
} from "@/lib/golf-ui";
import type { GolfLeaderboard, GolfTournament } from "@/lib/types";

export const dynamic = "force-dynamic";

type WinnerInfo = {
  name: string;
  score: string;
};

async function loadWinnerMap(schedule: GolfTournament[]) {
  const completed = schedule.filter((tournament) => tournament.status === "completed");
  const settled = await Promise.allSettled(
    completed.map(async (tournament) => {
      const leaderboard = await getPGATournamentLeaderboard(tournament.id);
      const winner = leaderboard?.players.find((player) => player.position === "1" || player.position === "T1") ?? leaderboard?.players[0];
      return [
        tournament.id,
        winner ? { name: winner.name, score: winner.score } satisfies WinnerInfo : null,
      ] as const;
    }),
  );

  const winners = settled
    .filter((result): result is PromiseFulfilledResult<readonly [string, WinnerInfo | null]> => result.status === "fulfilled")
    .map((result) => result.value);

  return new Map<string, WinnerInfo | null>(winners);
}

function seasonYear(schedule: GolfTournament[]) {
  const firstDate = schedule.find((tournament) => tournament.startDate)?.startDate;
  if (!firstDate) return new Date().getFullYear();
  const parsed = new Date(firstDate);
  return Number.isNaN(parsed.getTime()) ? new Date().getFullYear() : parsed.getFullYear();
}

function heroPreviewPlayers(leaderboard: GolfLeaderboard | null) {
  return (leaderboard?.players ?? [])
    .filter((player) => player.position !== "CUT" && player.position !== "MC")
    .slice(0, 3);
}

export default async function GolfPage() {
  // Phase 1: parallel fetch of all independent data sources
  const [activeLeaderboard, schedule, odds, mastersLocalOdds] = await Promise.all([
    getPGALeaderboard(),
    getPGASchedule(),
    getGolfOdds(),
    getLocalMastersOddsSnapshot().catch(() => null),
  ]);

  const upcomingMajor = schedule.find((tournament) => tournament.status === "upcoming" && isGolfMajor(tournament.name));

  const heroTournament = activeLeaderboard?.tournament
    ?? schedule.find((tournament) => tournament.current)
    ?? upcomingMajor
    ?? schedule.find((tournament) => tournament.status === "upcoming")
    ?? schedule[0]
    ?? null;

  // Phase 2: parallelize heroLeaderboard, predictions, and winnerMap
  // Previously these were 3 serial awaits; parallelizing saves ~2-4s on cold start.
  const needsSeparateHeroFetch = heroTournament
    && activeLeaderboard?.tournament.id !== heroTournament.id;

  const [heroLeaderboard, predictions, winnerMap] = await Promise.all([
    needsSeparateHeroFetch
      ? getPGATournamentLeaderboard(heroTournament!.id)
      : Promise.resolve(activeLeaderboard ?? null),
    getGolfPredictionData(activeLeaderboard ?? null, odds),
    loadWinnerMap(schedule),
  ]);

  const heroPlayers = heroPreviewPlayers(heroLeaderboard);
  const upcoming = schedule
    .filter((tournament) => tournament.status === "upcoming" && tournament.id !== heroTournament?.id)
    .slice(0, 5);
  const rankingBoard = predictions?.players.slice(0, 10) ?? [];
  const datagolf = predictions?.dataSources?.datagolf;
  const predictionSourceLabel = getGolfPredictionSourceLabel(predictions);
  const rankingSourceCopy = datagolf?.ready
    ? `${predictionSourceLabel}${datagolf.fresh ? "" : " (stale cache)"} · ${datagolf.matchedPlayers}/${datagolf.totalPlayers} field matches`
    : datagolf?.populated
      ? datagolf.reason
      : "No usable DataGolf cache yet";
  const fullSeasonLabel = `Full ${seasonYear(schedule)} Season`;

  // Detect upcoming major within 14 days to surface a spotlight section
  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const upcomingMajorSpotlight = schedule.find((t) => {
    if (t.status !== "upcoming") return false;
    if (!isGolfMajor(t.name)) return false;
    const start = t.startDate ? new Date(t.startDate).getTime() : NaN;
    return Number.isFinite(start) && start > now && start - now <= FOURTEEN_DAYS_MS;
  }) ?? null;

  // Show Masters spotlight if we have a local odds snapshot and a major within 14 days
  const showMajorSpotlight = Boolean(upcomingMajorSpotlight || mastersLocalOdds);
  const spotlightTournament = upcomingMajorSpotlight ?? (
    mastersLocalOdds ? schedule.find((t) => isGolfMajor(t.name) && t.status === "upcoming") ?? null : null
  );
  // Show top 15 favorites from local Bovada snapshot
  const mastersOddsFavorites = mastersLocalOdds?.winner.slice(0, 15) ?? [];

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">PGA Tour</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Tournament home</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Current event first, upcoming stops next, and the full season board underneath when you want the entire calendar.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
            {schedule.length > 0 ? `${schedule.length} tournaments loaded` : "Schedule pending"}
          </div>
        </section>

        {/* Masters Analysis — top of page until tournament begins Thu Apr 10 */}
        {mastersLocalOdds && now < new Date("2026-04-10T04:00:00Z").getTime() ? (
          <MastersAnalysisSection mastersLocalOdds={mastersLocalOdds} />
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Current Tournament</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-white md:text-3xl">
                    {heroTournament?.name ?? "Tournament board unavailable"}
                  </h2>
                  {heroTournament && isGolfMajor(heroTournament.name) ? (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                      {"\u2B50"} Major
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-gray-300">
                  {heroTournament ? `${heroTournament.course}${heroTournament.location ? ` · ${heroTournament.location}` : ""}` : "The PGA schedule feed did not return a current stop."}
                </p>
                {heroTournament ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span>{heroTournament.dates}</span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getGolfBadgeTone(heroTournament)}`}>
                      {getGolfTournamentBadgeLabel(heroTournament, heroLeaderboard)}
                    </span>
                    {typeof heroTournament.coursePar === "number" ? <span>Par {heroTournament.coursePar}</span> : null}
                  </div>
                ) : null}
              </div>
            </div>

            {heroTournament ? (
              <div className="mt-4">
                <Link
                  href={`/golf/tournament/${heroTournament.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                >
                  View Full Leaderboard →
                </Link>
              </div>
            ) : null}
          </section>

          <div className="space-y-6">

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Player Rankings</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">Field power rankings</h2>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-5">{rankingSourceCopy}</p>
              </div>

              {datagolf?.lastScrape ? (
                <p className="mt-3 text-xs text-gray-500">
                  DataGolf cache {datagolf.fresh ? "updated" : "last updated"} {formatGolfUpdatedAt(datagolf.lastScrape)}
                </p>
              ) : null}

              {rankingBoard.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {rankingBoard.map((player, index) => (
                    <div key={`${player.id}-${index}`} className={`grid grid-cols-[28px_minmax(0,1fr)_68px] items-center gap-3 rounded-2xl border border-white/8 px-4 py-3 ${index % 2 === 0 ? "bg-black/20" : "bg-white/[0.03]"}`}>
                      <p className="text-sm font-semibold text-gray-400">{index + 1}</p>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{player.name}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {player.dgRank ? `DG #${player.dgRank} · ` : ""}
                          Form {player.formScore} · Course fit {player.courseFitScore} · Win {formatGolfPercent(player.modelProb)}
                        </p>
                      </div>
                      <p className="text-right text-xs font-semibold text-emerald-200">{player.combinedScore}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                  {heroLeaderboard?.players.length
                    ? rankingSourceCopy
                    : "ESPN has not posted the current field or live board yet, so the contender model is waiting on player data."}
                </div>
              )}
            </section>
          </div>
        </section>

        {/* Masters Analysis — bottom position after tournament begins (Thu Apr 10+) */}
        {mastersLocalOdds && now >= new Date("2026-04-10T04:00:00Z").getTime() ? (
          <MastersAnalysisSection mastersLocalOdds={mastersLocalOdds} />
        ) : null}

        {/* Upcoming Major Spotlight fallback — only when no local odds snapshot */}
        {!mastersLocalOdds && showMajorSpotlight && (
          <section className="rounded-[32px] border border-amber-500/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.10),transparent_40%),rgba(255,255,255,0.03)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-400">⭐ Major Preview</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">
                  {spotlightTournament?.name ?? "Masters Tournament"}
                </h2>
                {spotlightTournament ? (
                  <p className="mt-1 text-sm text-gray-300">
                    {spotlightTournament.course}{spotlightTournament.location ? ` · ${spotlightTournament.location}` : ""}
                    {typeof spotlightTournament.coursePar === "number" ? ` · Par ${spotlightTournament.coursePar}` : ""}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                  {spotlightTournament?.dates ? <span>{spotlightTournament.dates}</span> : null}
                  {spotlightTournament?.purse && spotlightTournament.purse !== "TBD" ? <span>{spotlightTournament.purse}</span> : null}
                  {(() => {
                    const start = spotlightTournament?.startDate;
                    if (!start) return null;
                    const daysOut = Math.ceil((new Date(start).getTime() - now) / (24 * 60 * 60 * 1000));
                    if (daysOut < 0) return null;
                    return (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">
                        {daysOut === 0 ? "Today" : daysOut === 1 ? "Tomorrow" : `${daysOut} days out`}
                      </span>
                    );
                  })()}
                </div>
              </div>
              {spotlightTournament ? (
                <Link
                  href={`/golf/tournament/${spotlightTournament.id}`}
                  className="rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20"
                >
                  Full preview →
                </Link>
              ) : null}
            </div>

            {mastersOddsFavorites.length > 0 ? (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Winner Odds (Bovada)</p>
                  {null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {mastersOddsFavorites.map((entry, index) => (
                    <div
                      key={entry.player}
                      className="grid grid-cols-[28px_minmax(0,1fr)_56px] items-center gap-2 rounded-2xl border border-white/8 bg-black/20 px-3 py-2.5"
                    >
                      <p className="text-xs font-semibold text-gray-500">{index + 1}</p>
                      <p className="truncate text-sm font-medium text-white">{entry.player}</p>
                      <p className="text-right text-sm font-semibold text-emerald-300">{entry.odds > 0 ? `+${entry.odds}` : entry.odds}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-600">Winner market · via Bovada snapshot.</p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-gray-400">
                Winner odds and field will appear here once available from the odds API.
              </div>
            )}
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Upcoming Tournaments</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Next five stops</h2>
              </div>
              <span className="text-xs text-gray-500">{upcoming.length} loaded</span>
            </div>
            <div className="mt-4 space-y-2">
              {upcoming.map((tournament) => (
                <Link
                  key={tournament.id}
                  href={`/golf/tournament/${tournament.id}`}
                  className={`grid min-h-[52px] gap-2 rounded-2xl border px-3 py-3 transition hover:border-white/20 hover:bg-white/[0.06] md:grid-cols-[108px_minmax(0,1fr)_minmax(0,0.9fr)] ${getGolfRowTone(tournament)}`}
                >
                  <p className="text-xs font-medium text-gray-300">{tournament.dates}</p>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {isGolfMajor(tournament.name) ? "\u2B50 " : ""}
                      {tournament.name}
                    </p>
                  </div>
                  <p className="truncate text-xs text-gray-400">{tournament.course}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <details className="group rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{fullSeasonLabel}</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Full schedule and winners</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">
              {schedule.length} tournaments
            </span>
          </summary>

          <div className="mt-5 space-y-2">
            {schedule.map((tournament) => {
              const winner = winnerMap.get(tournament.id) ?? null;
              const seasonBadge = getGolfTournamentBadgeLabel(tournament, activeLeaderboard, "season");

              return (
                <Link
                  key={tournament.id}
                  href={`/golf/tournament/${tournament.id}`}
                  className={`grid gap-3 rounded-2xl border px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.06] md:grid-cols-[130px_minmax(0,1.25fr)_minmax(0,1fr)_auto] ${getGolfRowTone(tournament)}`}
                >
                  <p className="text-xs text-gray-400">{tournament.dates}</p>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {isGolfMajor(tournament.name) ? "\u2B50 " : ""}
                      {tournament.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-gray-500">{tournament.course}</p>
                  </div>
                  <p className="truncate text-xs text-gray-300">
                    {tournament.status === "completed"
                      ? winner
                        ? `${winner.name} ${winner.score}`
                        : "Winner pending"
                      : tournament.location || tournament.purse}
                  </p>
                  <span className={`justify-self-start rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getGolfBadgeTone(tournament)}`}>
                    {seasonBadge}
                  </span>
                </Link>
              );
            })}
          </div>
        </details>


      </div>
    </main>
  );
}
