"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import SavePickButton from "./SavePickButton";
import TrendBadge, { computeBadgeLevel } from "./TrendBadge";
import { formatOdds } from "@/lib/edge-engine";
import { getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import TrendIndicators from "./TrendIndicators";

function EdgeBadge({ edgePct }: { edgePct: number | null | undefined }) {
  if (!edgePct) return null;
  if (edgePct > 0.10)
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-semibold">STRONG</span>;
  if (edgePct > 0.05)
    return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-semibold">EDGE</span>;
  return null;
}

function displayHitRate(val?: number | null): string {
  if (val == null) return "-";
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(0)}%`;
}

export default function PropCard({ prop }: { prop: PlayerProp }) {
  const [expanded, setExpanded] = useState(false);
  const hitRate = displayHitRate(prop.hitRate ?? prop.fairProbability);

  return (
    <div className="mx-3 my-1.5 rounded-2xl border border-dark-border bg-dark-surface/70 overflow-hidden">
      {/* Compact view — always visible */}
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <TeamLogo team={prop.team} color={prop.teamColor} size={28} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-semibold text-sm truncate">{prop.playerName}</span>
              <span className="text-[9px] text-gray-600 uppercase">{prop.league}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-gray-400 text-xs">
                {prop.overUnder} {prop.line} {prop.propType}
              </span>
              <span className="text-gray-500 text-xs">{formatOdds(prop.odds)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <EdgeBadge edgePct={prop.edgePct} />
            <span className={`text-sm font-bold ${
              (prop.hitRate ?? 0) >= 70 ? "text-emerald-400" : (prop.hitRate ?? 0) >= 50 ? "text-white" : "text-gray-400"
            }`}>
              {hitRate}
            </span>
            <span className={`text-[10px] text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
          </div>
        </div>

        {/* Mini info row */}
        <div className="flex items-center gap-2 mt-1.5 ml-10">
          <span className="text-[10px] text-gray-500">
            {prop.team} {prop.isAway ? "@" : "vs"} {prop.opponent}
          </span>
          {prop.recentGames && prop.recentGames.length > 0 && (
            <div className="flex gap-0.5">
              {prop.recentGames.slice(0, 5).map((v, i) => (
                <div key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold ${
                  v > prop.line ? "bg-emerald-500/20 text-emerald-400" : "bg-dark-bg text-gray-600"
                }`}>
                  {v}
                </div>
              ))}
            </div>
          )}
          <TrendIndicators indicators={prop.indicators} />
        </div>
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-dark-border/40 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-bg/60 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase text-gray-500">L5 avg</div>
              <div className="text-white text-xs font-semibold">{prop.rollingAverages?.last5?.toFixed(1) ?? "-"}</div>
            </div>
            <div className="bg-dark-bg/60 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase text-gray-500">L10 avg</div>
              <div className="text-white text-xs font-semibold">{prop.rollingAverages?.last10?.toFixed(1) ?? "-"}</div>
            </div>
            <div className="bg-dark-bg/60 rounded-lg px-2 py-1.5 text-center">
              <div className="text-[9px] uppercase text-gray-500">Hit rate</div>
              <div className="text-emerald-400 text-xs font-semibold">{hitRate}</div>
            </div>
          </div>

          {/* Splits */}
          {prop.splits.length > 0 && (
            <div className="space-y-0.5">
              {prop.splits.map((split, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="text-[11px] text-gray-400 truncate">{split.label}</span>
                  <span className={`text-[11px] font-semibold shrink-0 ${
                    split.total === 0 ? "text-gray-500" : split.hitRate >= 70 ? "text-emerald-400" : "text-white"
                  }`}>
                    {split.total > 0 ? `${Math.round(split.hitRate)}%` : "Soon"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Reasoning */}
          {prop.reasoning && (
            <p className="text-[11px] leading-relaxed text-gray-400">{prop.reasoning}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Link href={getPlayerTrendHrefFromProp(prop)} className="text-[11px] text-accent-blue font-medium">
              Full analysis →
            </Link>
            <SavePickButton prop={prop} />
          </div>
        </div>
      )}
    </div>
  );
}
