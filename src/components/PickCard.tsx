"use client";

import { useState } from "react";
import { AIPick } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import { formatOdds } from "@/lib/edge-engine";
import { ChevronDown, Sparkles } from "lucide-react";

export function ResultPill({ result }: { result: string }) {
  if (result === "win") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green border border-accent-green/30 font-bold font-mono tracking-widest leading-none drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">WIN</span>;
  if (result === "loss") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-red/20 text-accent-red border border-accent-red/30 font-bold font-mono tracking-widest leading-none drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">LOSS</span>;
  if (result === "push") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30 font-bold font-mono tracking-widest leading-none">PUSH</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-dark-surface text-text-platinum/50 border border-dark-border font-bold font-mono tracking-widest leading-none relative overflow-hidden group">
    <span className="relative z-10">PENDING</span>
  </span>;
}

export default function PickCard({ pick }: { pick: AIPick }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = pick.result === "pending" || !pick.result;

  return (
    <div className={`rounded-2xl border ${isPending ? 'border-accent-champagne/30 shadow-[0_0_15px_-5px_rgba(201,168,76,0.15)] bg-gradient-to-b from-dark-card to-dark-bg' : 'border-dark-border/80 bg-dark-card'} overflow-hidden transition-all duration-300 hover:-translate-y-1 group relative mb-3 last:mb-0 mx-3`}>
      <div 
        className="px-4 py-4 cursor-pointer relative"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <TeamLogo team={pick.team} color={pick.teamColor} size={36} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ResultPill result={pick.result || "pending"} />
              {pick.league && (
                <span className="text-[9px] text-text-platinum/40 uppercase font-mono tracking-widest shrink-0">{pick.league}</span>
              )}
            </div>
            <div className="text-text-platinum font-heading font-bold text-base truncate group-hover:text-white transition-colors">
              {pick.type === "player" ? pick.playerName : pick.team}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-accent-blue text-[12px] font-mono font-bold tracking-tight">
                {pick.pickLabel}
              </span>
              <span className="text-[10px] text-text-platinum/40 border-l border-dark-border/80 pl-2">
                {typeof pick.odds === 'number' ? formatOdds(pick.odds) : pick.odds}
              </span>
            </div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[8px] uppercase font-mono tracking-widest text-text-platinum/40">Edge</div>
              <div className="text-sm font-mono font-bold text-accent-green leading-none drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">
                {typeof pick.edge === 'number' ? `+${Math.round(pick.edge * 100)}%` : '-'}
              </div>
            </div>
            <ChevronDown size={14} className={`text-text-platinum/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex-1 h-1 bg-dark-bg rounded-full overflow-hidden">
            <div className="h-full bg-accent-champagne/80" style={{ width: `${pick.confidence ?? 75}%` }}></div>
          </div>
          <span className="text-[10px] font-mono text-accent-champagne font-bold">{pick.confidence ?? 75}/100</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-dark-border/40 animate-slide-down" style={{ animationDuration: "0.2s" }}>
           <div className="bg-dark-bg/50 rounded-xl p-3 border border-dark-border/50 mt-2">
            <div className="flex items-start gap-2 mb-2">
              <Sparkles size={14} className="text-accent-blue shrink-0 mt-0.5" />
              <div className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/60 font-semibold mb-1">AI Reasoning</div>
            </div>
            <p className="text-[12px] leading-relaxed text-text-platinum/70 font-sans pl-6">
              {pick.reasoning || `Model projects a strong edge for ${pick.pickLabel} based on historical performance in this exact matchup profile.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
