"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GolfDashboardData, GolfTournament } from "@/lib/types";
import { CardSkeleton } from "@/components/LoadingSkeleton";
import { getGolfBadgeTone, getGolfTournamentBadgeLabel, isGolfMajor } from "@/lib/golf-ui";

function TournamentCard({ tournament }: { tournament: GolfTournament }) {
  return (
    <Link
      key={tournament.id}
      href={`/golf/tournament/${tournament.id}`}
      className={`rounded-2xl border p-4 ${
        tournament.current
          ? "border-emerald-500/30 bg-emerald-500/5"
          : tournament.status === "completed"
            ? "border-white/6 bg-white/[0.02] opacity-75"
            : "border-dark-border bg-dark-surface/70"
      } transition hover:border-white/20 hover:bg-white/[0.06]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tournament.tour ?? "PGA"}</div>
          <h3 className="mt-1 text-base font-semibold text-white">
            {isGolfMajor(tournament.name) ? "\u2B50 " : ""}
            {tournament.name}
          </h3>
          <p className="mt-1 text-sm text-gray-400">{tournament.course}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getGolfBadgeTone(tournament)}`}>
          {getGolfTournamentBadgeLabel(tournament, undefined, "season")}
        </span>
      </div>
      <div className="mt-4 space-y-1 text-sm text-gray-300">
        <p>{tournament.dates}</p>
        {tournament.location && <p>{tournament.location}</p>}
        <p>{tournament.purse !== "TBD" ? `Purse ${tournament.purse}` : "Purse TBD"}</p>
      </div>
      {tournament.current && (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Current tournament
        </div>
      )}
    </Link>
  );
}

export default function GolfScheduleBoard({
  tournaments,
  loading: controlledLoading,
  showHeader = false,
}: {
  tournaments?: GolfTournament[];
  loading?: boolean;
  showHeader?: boolean;
}) {
  const [schedule, setSchedule] = useState<GolfTournament[]>(tournaments ?? []);
  const [loading, setLoading] = useState(typeof controlledLoading === "boolean" ? controlledLoading : !tournaments);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (tournaments) {
      setSchedule(tournaments);
      setLoading(Boolean(controlledLoading));
      return;
    }

    fetch("/api/golf/dashboard")
      .then((response) => response.json())
      .then((data: GolfDashboardData) => {
        setSchedule(Array.isArray(data.schedule) ? data.schedule : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [controlledLoading, tournaments]);

  const upcoming = schedule.filter((t) => t.status !== "completed" || t.current);
  const past = schedule.filter((t) => t.status === "completed" && !t.current);

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      {showHeader && (
        <div className="mb-4">
          <h2 className="page-heading">PGA Schedule</h2>
          <p className="mt-1 text-xs text-gray-500">Current week plus the next tournaments on the board</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <CardSkeleton key={item} className="h-36" />
          ))}
        </div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">No upcoming golf tournaments were found.</p>
          <p className="mt-1 text-xs text-gray-600">The board repopulates automatically when ESPN posts the next event.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-gray-400">No upcoming tournaments posted yet.</div>
          )}

          {past.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPast((prev) => !prev)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-sm text-gray-400 transition hover:border-white/15 hover:text-white"
              >
                <span>{showPast ? "Hide" : "Past Tournaments"}</span>
                <svg
                  className={`h-4 w-4 transition-transform duration-200 ${showPast ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPast && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {past.map((tournament) => (
                    <TournamentCard key={tournament.id} tournament={tournament} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
