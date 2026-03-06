"use client";

import { useState } from "react";
import { Game } from "@/lib/data/types";
import { placeBet, calculatePayout, loadState } from "@/lib/store";
import OddsDisplay from "@/components/games/OddsDisplay";
import Card from "@/components/ui/Card";

type BetType = "moneyline" | "puck_line" | "over_under";
type Pick = { label: string; odds: number; pick: string };

export default function BetSlip({
  game,
  onBetPlaced,
}: {
  game: Game;
  onBetPlaced?: () => void;
}) {
  const [betType, setBetType] = useState<BetType>("moneyline");
  const [selectedPick, setSelectedPick] = useState<Pick | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const balance = loadState().balance;

  const picks: Record<BetType, Pick[]> = {
    moneyline: [
      { label: `${game.awayTeam.abbrev}`, odds: game.odds.awayML, pick: `${game.awayTeam.abbrev} ML` },
      { label: `${game.homeTeam.abbrev}`, odds: game.odds.homeML, pick: `${game.homeTeam.abbrev} ML` },
    ],
    puck_line: [
      { label: `${game.awayTeam.abbrev} +1.5`, odds: game.odds.puckLineAway, pick: `${game.awayTeam.abbrev} +1.5` },
      { label: `${game.homeTeam.abbrev} -1.5`, odds: game.odds.puckLineHome, pick: `${game.homeTeam.abbrev} -1.5` },
    ],
    over_under: [
      { label: `Over ${game.odds.overUnder}`, odds: game.odds.overOdds, pick: `Over ${game.odds.overUnder}` },
      { label: `Under ${game.odds.overUnder}`, odds: game.odds.underOdds, pick: `Under ${game.odds.overUnder}` },
    ],
  };

  const payout = selectedPick && amount ? calculatePayout(parseFloat(amount) || 0, selectedPick.odds) : 0;

  function handleSubmit() {
    if (!selectedPick || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setMessage({ text: "Enter a valid amount", type: "error" });
      return;
    }
    if (amt > balance) {
      setMessage({ text: "Insufficient balance", type: "error" });
      return;
    }

    try {
      placeBet({
        gameId: game.id,
        homeTeam: `${game.homeTeam.city} ${game.homeTeam.name}`,
        awayTeam: `${game.awayTeam.city} ${game.awayTeam.name}`,
        betType,
        pick: selectedPick.pick,
        odds: selectedPick.odds,
        amount: amt,
        potentialPayout: Math.round(payout * 100) / 100,
      });
      setMessage({ text: `Bet placed! ${selectedPick.pick} for $${amt.toFixed(2)}`, type: "success" });
      setAmount("");
      setSelectedPick(null);
      onBetPlaced?.();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    }
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-white mb-1">Place Paper Bet</h3>
      <p className="text-xs text-slate-500 mb-4">
        Balance: <span className="text-amber-400 font-medium">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </p>

      {/* Bet type tabs */}
      <div className="flex gap-1 p-1 bg-slate-800/80 rounded-lg mb-4">
        {(["moneyline", "puck_line", "over_under"] as BetType[]).map((type) => (
          <button
            key={type}
            onClick={() => { setBetType(type); setSelectedPick(null); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
              betType === type
                ? "bg-slate-700 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {type === "moneyline" ? "Moneyline" : type === "puck_line" ? "Puck Line" : "Over/Under"}
          </button>
        ))}
      </div>

      {/* Pick selection */}
      <div className="flex gap-2 mb-4">
        {picks[betType].map((p) => (
          <OddsDisplay
            key={p.pick}
            label={p.label}
            odds={p.odds}
            selected={selectedPick?.pick === p.pick}
            onClick={() => setSelectedPick(p)}
          />
        ))}
      </div>

      {/* Amount */}
      {selectedPick && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Wager Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                max={balance}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/25"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[25, 50, 100, 250].map((q) => (
                <button
                  key={q}
                  onClick={() => setAmount(String(Math.min(q, balance)))}
                  className="flex-1 py-1 rounded-md bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                >
                  ${q}
                </button>
              ))}
            </div>
          </div>

          {parseFloat(amount) > 0 && (
            <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-slate-800/50">
              <span className="text-xs text-slate-400">Potential Payout</span>
              <span className="text-sm font-bold text-emerald-400">${payout.toFixed(2)}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-sm font-bold text-black transition-all hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Place Bet
          </button>
        </div>
      )}

      {message && (
        <div className={`mt-3 p-2.5 rounded-lg text-xs font-medium ${
          message.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
        }`}>
          {message.text}
        </div>
      )}
    </Card>
  );
}
