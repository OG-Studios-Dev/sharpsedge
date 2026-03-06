"use client";

import { Bet } from "@/lib/data/types";
import Badge from "@/components/ui/Badge";
import { formatOdds } from "@/components/games/OddsDisplay";

export default function BetHistory({
  bets,
  limit,
}: {
  bets: Bet[];
  limit?: number;
}) {
  const sorted = [...bets].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
  );
  const displayed = limit ? sorted.slice(0, limit) : sorted;

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">No bets yet</div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((bet) => (
        <div
          key={bet.id}
          className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white truncate">{bet.pick}</p>
              <Badge
                variant={
                  bet.status === "won" ? "green" : bet.status === "lost" ? "red" : "amber"
                }
              >
                {bet.status}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {bet.awayTeam} @ {bet.homeTeam}
            </p>
          </div>
          <div className="text-right ml-3 flex-shrink-0">
            <p className="text-sm font-semibold text-white">${bet.amount}</p>
            <p className="text-[11px] text-slate-500">
              {formatOdds(bet.odds)} &middot;{" "}
              {bet.status === "won" ? (
                <span className="text-emerald-400">+${(bet.potentialPayout - bet.amount).toFixed(2)}</span>
              ) : bet.status === "lost" ? (
                <span className="text-red-400">-${bet.amount.toFixed(2)}</span>
              ) : (
                <span className="text-amber-400">pending</span>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
