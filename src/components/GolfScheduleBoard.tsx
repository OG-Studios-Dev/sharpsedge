"use client";

import { useEffect, useState } from "react";
import { GolfDashboardData, GolfTournament } from "@/lib/types";

function statusStyles(status: GolfTournament["status"]) {
  if (status === "completed") return "border-gray-500/20 bg-gray-500/10 text-gray-300";
  if (status === "in-progress") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function statusLabel(tournament: GolfTournament) {
  if (tournament.status === "in-progress") {
    return tournament.round ? `Round ${tournament.round}` : "In Progress";
  }
  if (tournament.status === "completed") return "Completed";
  return "Upcoming";
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

  return (
    <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      {showHeader && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">PGA Schedule</h2>
          <p className="mt-1 text-xs text-gray-500">Current week plus the next tournaments on the board</p>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-36 animate-pulse rounded-2xl bg-dark-border/40" />
          ))}
        </div>
      ) : schedule.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-400">No upcoming golf tournaments were found.</p>
          <p className="mt-1 text-xs text-gray-600">The board repopulates automatically when ESPN posts the next event.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {schedule.map((tournament) => (
            <article
              key={tournament.id}
              className={`rounded-2xl border p-4 ${
                tournament.current
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-dark-border bg-dark-surface/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tournament.tour ?? "PGA"}</div>
                  <h3 className="mt-1 text-base font-semibold text-white">{tournament.name}</h3>
                  <p className="mt-1 text-sm text-gray-400">{tournament.course}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusStyles(tournament.status)}`}>
                  {statusLabel(tournament)}
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
