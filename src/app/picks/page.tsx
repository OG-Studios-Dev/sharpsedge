"use client";

import { useEffect, useState } from "react";
import { PlayerProp } from "@/lib/types";
import EmptyStateCard from "@/components/EmptyStateCard";

const STORAGE_KEY = "goosalytics_picks";

export default function PicksPage() {
  const [picks, setPicks] = useState<PlayerProp[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPicks(JSON.parse(raw));
    } catch {}
  }, []);

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
    setPicks([]);
  }

  return (
    <main className="min-h-screen bg-dark-bg pb-24 pt-6 px-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-white text-xl font-semibold">Saved Picks</h1>
        {picks.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded-xl px-3 py-1.5 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {picks.length === 0 ? (
        <EmptyStateCard
          eyebrow="Saved Picks"
          title="No picks saved yet"
          body="Save picks from the Props page to track your bets here."
        />
      ) : (
        <div className="space-y-3">
          {picks.map((pick, i) => (
            <div
              key={pick.id || i}
              className="rounded-2xl border border-dark-border bg-dark-surface p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-semibold">{pick.playerName}</span>
                <span className="text-[10px] text-gray-500">
                  {pick.savedAt ? new Date(pick.savedAt).toLocaleDateString() : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-accent-blue font-medium">
                  {pick.direction || pick.overUnder} {pick.line}
                </span>
                <span className="text-gray-400">{pick.propType}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {pick.team} vs {pick.opponent}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
