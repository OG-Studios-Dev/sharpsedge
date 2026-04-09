"use client";

import { useState } from "react";
import type { DbSystemQualifier } from "@/lib/systems-tracking-store";

const INITIAL_ROWS = 5;

function formatMoneyline(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function outcomeClass(outcome?: string | null) {
  if (outcome === "win") return "font-semibold text-emerald-400";
  if (outcome === "loss") return "font-semibold text-rose-400";
  if (outcome === "push") return "text-yellow-400";
  if (outcome === "pending") return "text-sky-400";
  return "text-gray-500";
}

function netUnitsClass(v?: number | null) {
  if (v == null) return "text-gray-500";
  if (v > 0) return "text-emerald-400";
  if (v < 0) return "text-rose-400";
  return "text-yellow-400";
}

function outcomeLabel(row: DbSystemQualifier) {
  if (row.outcome === "win") return "Win";
  if (row.outcome === "loss") return "Loss";
  if (row.outcome === "push") return "Push";
  if (row.outcome === "pending") return "Pending";
  if (row.outcome === "ungradeable") return "—";
  return row.outcome ?? "—";
}

export default function SystemQualifierHistoryToggle({
  rows,
  isMLGradeable,
}: {
  rows: DbSystemQualifier[];
  isMLGradeable: boolean;
}) {
  const actionableRows = rows.filter((row) => row.qualified_team || row.action_side || row.market_type !== "context-board");
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? actionableRows : actionableRows.slice(0, INITIAL_ROWS);
  const hasMore = actionableRows.length > INITIAL_ROWS;

  if (actionableRows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-dark-border bg-dark-surface/70">
        <div className="min-w-[580px]">
          <div className="grid grid-cols-[1fr_0.65fr_0.7fr_0.55fr_0.55fr] gap-3 border-b border-dark-border bg-dark-bg/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            <span>Matchup</span>
            <span>Date</span>
            {isMLGradeable ? <span>Pick</span> : <span>Side</span>}
            <span>Odds</span>
            <span>Result</span>
          </div>
          {displayed.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_0.65fr_0.7fr_0.55fr_0.55fr] gap-3 px-4 py-2.5 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/50"
            >
              <div>
                <p className="font-medium text-white leading-snug">{row.matchup}</p>
                {row.notes && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 line-clamp-2">
                    {row.notes}
                  </p>
                )}
              </div>
              <span className="text-gray-400">{row.game_date}</span>
              <span className="text-gray-300">{row.qualified_team ?? row.action_side ?? "—"}</span>
              <span className="text-gray-400">{formatMoneyline(row.qualifier_odds)}</span>
              <span className={outcomeClass(row.outcome)}>
                {outcomeLabel(row)}
                {row.net_units != null && (
                  <span className={`ml-1 text-[10px] ${netUnitsClass(Number(row.net_units))}`}>
                    ({Number(row.net_units) > 0 ? "+" : ""}{Number(row.net_units).toFixed(2)}u)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 py-2.5 text-xs font-semibold text-gray-400 transition hover:border-white/20 hover:text-gray-200"
        >
          {showAll ? `Show fewer` : `Show all ${actionableRows.length} pick entries`}
        </button>
      )}
    </div>
  );
}
