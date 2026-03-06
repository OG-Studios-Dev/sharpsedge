"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/ui/StatCard";
import Card from "@/components/ui/Card";
import BetHistory from "@/components/bets/BetHistory";
import TrendCard from "@/components/trends/TrendCard";
import { BankrollState } from "@/lib/data/types";
import { loadState } from "@/lib/store";
import { trends } from "@/lib/data/trends";

export default function Dashboard() {
  const [state, setState] = useState<BankrollState | null>(null);

  useEffect(() => {
    setState(loadState());
  }, []);

  if (!state) return null;

  const { balance, bets } = state;
  const resolved = bets.filter((b) => b.status !== "pending");
  const won = resolved.filter((b) => b.status === "won");
  const totalWagered = resolved.reduce((s, b) => s + b.amount, 0);
  const totalReturned = won.reduce((s, b) => s + b.potentialPayout, 0);
  const netPL = totalReturned - totalWagered;
  const roi = totalWagered > 0 ? (netPL / totalWagered) * 100 : 0;
  const winRate = resolved.length > 0 ? (won.length / resolved.length) * 100 : 0;

  // Best streak
  let bestStreak = 0;
  let currentStreak = 0;
  const sortedResolved = [...resolved].sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());
  for (const bet of sortedResolved) {
    if (bet.status === "won") { currentStreak++; bestStreak = Math.max(bestStreak, currentStreak); }
    else currentStreak = 0;
  }

  // Avg odds of won bets
  const avgOdds = won.length > 0 ? Math.round(won.reduce((s, b) => s + b.odds, 0) / won.length) : 0;

  // Top trends by ROI
  const hotTrends = [...trends].sort((a, b) => b.theoreticalROI - a.theoreticalROI).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Your paper trading overview</p>
      </div>

      {/* Bankroll hero */}
      <Card className="p-6 bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-amber-500/20">
        <p className="text-xs text-slate-400 uppercase tracking-wider font-medium">Current Bankroll</p>
        <p className="text-4xl font-bold text-white mt-1">
          ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-sm font-medium ${netPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {netPL >= 0 ? "+" : ""}${netPL.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500">from $10,000</span>
        </div>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="All-Time ROI" value={`${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`} trend={roi >= 0 ? "up" : "down"} sub={`on $${totalWagered.toLocaleString()} wagered`} />
        <StatCard label="Win Rate" value={`${winRate.toFixed(0)}%`} trend={winRate >= 50 ? "up" : "down"} sub={`${won.length}W - ${resolved.length - won.length}L`} />
        <StatCard label="Avg Odds (Wins)" value={`${avgOdds >= 0 ? "+" : ""}${avgOdds}`} trend="neutral" sub={`${won.length} winning bets`} />
        <StatCard label="Best Streak" value={`${bestStreak}W`} trend="up" sub="consecutive wins" />
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Bets */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Recent Bets</h2>
            <Link href="/bets" className="text-xs text-amber-400 hover:text-amber-300 font-medium">
              View All →
            </Link>
          </div>
          <BetHistory bets={bets} limit={5} />
        </Card>

        {/* Hot Trends */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Hot Trends</h2>
            <Link href="/trends" className="text-xs text-amber-400 hover:text-amber-300 font-medium">
              View All →
            </Link>
          </div>
          <div className="space-y-2">
            {hotTrends.map((t) => (
              <TrendCard key={t.id} trend={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
