"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import BetHistory from "@/components/bets/BetHistory";
import BankrollChart from "@/components/bets/BankrollChart";
import { BankrollState, Bet } from "@/lib/data/types";
import { loadState, resolveBet } from "@/lib/store";

export default function BetsPage() {
  const [state, setState] = useState<BankrollState | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "won" | "lost">("all");

  useEffect(() => {
    setState(loadState());
  }, []);

  if (!state) return null;

  const { balance, bets } = state;
  const pending = bets.filter((b) => b.status === "pending");
  const resolved = bets.filter((b) => b.status !== "pending");
  const won = resolved.filter((b) => b.status === "won");
  const totalWagered = resolved.reduce((s, b) => s + b.amount, 0);
  const totalReturned = won.reduce((s, b) => s + b.potentialPayout, 0);
  const netPL = totalReturned - totalWagered;
  const pendingRisk = pending.reduce((s, b) => s + b.amount, 0);

  const filtered = filter === "all" ? bets : bets.filter((b) => b.status === filter);

  function handleResolve(betId: string, won: boolean) {
    const newState = resolveBet(betId, won);
    setState({ ...newState });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">My Bets</h1>
        <p className="text-sm text-slate-400 mt-1">Track your paper trading performance</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Balance" value={`$${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`} trend={balance >= 10000 ? "up" : "down"} />
        <StatCard label="Net P&L" value={`${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}`} trend={netPL >= 0 ? "up" : "down"} />
        <StatCard label="Pending Bets" value={`${pending.length}`} sub={`$${pendingRisk} at risk`} trend="neutral" />
        <StatCard label="Total Bets" value={`${bets.length}`} sub={`${won.length}W - ${resolved.length - won.length}L`} trend="neutral" />
      </div>

      {/* Chart */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-white mb-4">Bankroll Over Time</h2>
        <BankrollChart bets={bets} />
      </Card>

      {/* Pending bets that can be resolved */}
      {pending.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-white mb-3">Resolve Pending Bets</h2>
          <p className="text-xs text-slate-500 mb-3">Simulate outcomes for your pending bets</p>
          <div className="space-y-2">
            {pending.map((bet) => (
              <PendingBetRow key={bet.id} bet={bet} onResolve={handleResolve} />
            ))}
          </div>
        </Card>
      )}

      {/* Bet history */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white">Bet History</h2>
          <div className="flex gap-1 p-0.5 bg-slate-800/80 rounded-lg">
            {(["all", "pending", "won", "lost"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  filter === f ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <BetHistory bets={filtered} />
      </Card>
    </div>
  );
}

function PendingBetRow({
  bet,
  onResolve,
}: {
  bet: Bet;
  onResolve: (id: string, won: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
      <div>
        <p className="text-sm font-medium text-white">{bet.pick}</p>
        <p className="text-[11px] text-slate-500">{bet.awayTeam} @ {bet.homeTeam} &middot; ${bet.amount}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onResolve(bet.id, true)}
          className="px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors"
        >
          Won
        </button>
        <button
          onClick={() => onResolve(bet.id, false)}
          className="px-3 py-1.5 rounded-md bg-red-500/15 border border-red-500/30 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
        >
          Lost
        </button>
      </div>
    </div>
  );
}
