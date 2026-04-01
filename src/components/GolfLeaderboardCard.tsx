"use client";

import { useState } from "react";
import { GolfLeaderboard } from "@/lib/types";
import { LeaderboardSkeleton } from "@/components/LoadingSkeleton";

function scoreTone(score: string) {
  if (score === "CUT") return "text-red-400";
  if (score === "E") return "text-white";
  // In golf, negative = under par = good (green), positive = over par = bad (red)
  if (score.startsWith("-")) return "text-emerald-400";
  if (score.startsWith("+")) return "text-red-400";
  return "text-white";
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
      <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
        <LeaderboardSkeleton rows={10} />
      </section>
    );
  }

  if (!leaderboard) {
    return (
      <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
        <p className="text-sm text-gray-400">No tournament leaderboard available.</p>
      </section>
    );
  }

  const [showAll, setShowAll] = useState(false);
  const players = leaderboard.players;
  const tournament = leaderboard.tournament;
  const allActive = players.filter((p) => p.position !== "CUT");
  const cutPlayers = players.filter((p) => p.position === "CUT");
  const activePlayers = showAll ? allActive : allActive.slice(0, 20);

  return (
    <section className="space-y-3">
      {/* Tournament Header */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{tournament.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tournament.course !== "TBD" ? tournament.course : ""}
              {tournament.location ? ` · ${tournament.location}` : ""}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {tournament.dates}
              {typeof tournament.coursePar === "number" ? ` · Par ${tournament.coursePar}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${
            leaderboard.statusBadge === "LIVE" || leaderboard.statusBadge?.startsWith("R")
              ? "bg-emerald-600"
              : leaderboard.statusBadge === "Final"
                ? "bg-gray-600"
                : "bg-blue-700"
          }`}>
            {leaderboard.statusBadge ?? "Live"}
          </span>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface/70 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[36px_minmax(0,1fr)_50px_70px] gap-1 px-4 py-2 border-b border-dark-border/50 text-[10px] uppercase tracking-wider text-gray-500">
          <div>Pos</div>
          <div>Player</div>
          <div className="text-right">Tot</div>
          <div className="text-right">Thru</div>
        </div>

        {/* Active players */}
        {activePlayers.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            Field not posted yet.
          </div>
        ) : (
          activePlayers.map((player, i) => (
            <div
              key={`${player.id}-${i}`}
              className={`grid grid-cols-[36px_minmax(0,1fr)_50px_70px] gap-1 px-4 py-2.5 border-b border-dark-border/20 ${
                i === 0 ? "bg-accent-blue/5" : ""
              }`}
            >
              <div className="text-sm font-semibold text-white">{player.position || "—"}</div>
              <div className="text-sm text-white truncate">{player.name}</div>
              <div className={`text-sm text-right font-bold ${scoreTone(player.score)}`}>{player.score}</div>
              <div className="text-sm text-right text-gray-400">{player.thru || player.teeTime || "—"}</div>
            </div>
          ))
        )}

        {/* See All button */}
        {!showAll && allActive.length > 20 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full py-2.5 text-center text-xs font-semibold text-accent-blue hover:text-blue-300 transition-colors border-b border-dark-border/20"
          >
            See all {allActive.length} players ↓
          </button>
        )}

        {/* Cut line separator */}
        {showAll && cutPlayers.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/5 border-y border-red-500/20">
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Missed Cut</span>
              <div className="flex-1 h-px bg-red-500/20" />
              {leaderboard.cutLine && (
                <span className="text-[10px] text-red-400">Cut: {leaderboard.cutLine}</span>
              )}
            </div>
            {cutPlayers.slice(0, 5).map((player, i) => (
              <div
                key={`cut-${player.id}-${i}`}
                className="grid grid-cols-[36px_minmax(0,1fr)_50px_70px] gap-1 px-4 py-2 border-b border-dark-border/20 opacity-50"
              >
                <div className="text-xs text-red-400">CUT</div>
                <div className="text-xs text-gray-400 truncate">{player.name}</div>
                <div className="text-xs text-right text-red-400">{player.score}</div>
                <div className="text-xs text-right text-gray-500">—</div>
              </div>
            ))}
            {cutPlayers.length > 5 && (
              <div className="px-4 py-2 text-[10px] text-gray-500 text-center">
                +{cutPlayers.length - 5} more missed cut
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
