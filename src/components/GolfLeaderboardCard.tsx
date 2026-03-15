"use client";

import { GolfLeaderboard } from "@/lib/types";

function scoreTone(score: string) {
  if (score === "CUT") return "text-red-400";
  if (score === "E") return "text-white";
  if (score.startsWith("-")) return "text-emerald-400";
  if (score.startsWith("+")) return "text-red-400";
  return "text-white";
}

function todayTone(score: string) {
  if (score === "E") return "text-gray-200";
  if (score.startsWith("-")) return "text-emerald-300";
  if (score.startsWith("+")) return "text-red-300";
  return "text-gray-300";
}

export default function GolfLeaderboardCard({
  leaderboard,
  loading = false,
}: {
  leaderboard: GolfLeaderboard | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
        <div className="space-y-3">
          <div className="h-6 w-48 animate-pulse rounded-xl bg-dark-border/40" />
          <div className="h-4 w-72 animate-pulse rounded-xl bg-dark-border/40" />
          <div className="grid gap-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-12 animate-pulse rounded-2xl bg-dark-border/40" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!leaderboard) {
    return (
      <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
        <p className="text-sm text-gray-400">No tournament leaderboard is available right now.</p>
      </section>
    );
  }

  const players = leaderboard.players.slice(0, 10);
  const tournament = leaderboard.tournament;

  return (
    <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Leaderboard</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{tournament.name}</h2>
          <p className="mt-1 text-sm text-gray-400">
            {tournament.course}
            {tournament.location ? ` • ${tournament.location}` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {tournament.dates}
            {tournament.purse !== "TBD" ? ` • Purse ${tournament.purse}` : ""}
            {typeof tournament.coursePar === "number" ? ` • Par ${tournament.coursePar}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            {leaderboard.statusBadge ?? "Tournament"}
          </span>
          {leaderboard.cutLine && (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-300">
              Cut line {leaderboard.cutLine}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/70">
        <div className="grid grid-cols-[52px_minmax(0,1fr)_68px_58px_56px] gap-2 border-b border-dark-border/50 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-gray-500">
          <div>Pos</div>
          <div>Player</div>
          <div className="text-right">To Par</div>
          <div className="text-right">Today</div>
          <div className="text-right">Thru</div>
        </div>
        {players.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400">
            Field and scoring data have not posted for this tournament yet.
          </div>
        ) : players.map((player) => (
          <details key={`${player.id}-${player.name}`} className="group border-b border-dark-border/30 last:border-b-0">
            <summary className="grid cursor-pointer list-none grid-cols-[52px_minmax(0,1fr)_68px_58px_56px] gap-2 px-3 py-3 text-sm">
              <div className={`font-semibold ${player.position === "CUT" ? "text-red-400" : "text-white"}`}>{player.position || "—"}</div>
              <div className="truncate text-white">{player.name}</div>
              <div className={`text-right font-semibold ${scoreTone(player.score)}`}>{player.score}</div>
              <div className={`text-right text-xs ${todayTone(player.todayScore)}`}>{player.todayScore}</div>
              <div className="text-right text-xs text-gray-400">{player.thru || player.teeTime || "—"}</div>
            </summary>
            {player.roundScores && player.roundScores.length > 0 && (
              <div className="border-t border-dark-border/30 bg-dark-bg/40 px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {player.roundScores.map((roundScore, index) => (
                    <span
                      key={`${player.id}-round-${index + 1}`}
                      className="rounded-full border border-dark-border/50 bg-dark-surface px-2.5 py-1 text-[11px] text-gray-300"
                    >
                      R{index + 1} {roundScore}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}
