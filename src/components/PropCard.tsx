"use client";

import { useState } from "react";
import Link from "next/link";
import { PlayerProp } from "@/lib/types";
import TeamLogo from "./TeamLogo";
import SavePickButton from "./SavePickButton";
import { formatOdds } from "@/lib/edge-engine";
import { getPlayerTrendHrefFromProp } from "@/lib/player-trend";
import TrendIndicators from "./TrendIndicators";
import TrendIndicatorDots from "./TrendIndicatorDots";
import BookBadge from "./BookBadge";
import { describeBookSavings, hasAlternateBookLines, resolveSelectedBookOdds, sortBookOddsForDisplay } from "@/lib/book-odds";
import { ChevronDown, Activity, Sparkles } from "lucide-react";

function EdgeBadge({ edgePct }: { edgePct: number | null | undefined }) {
  if (!edgePct) return null;
  if (edgePct > 0.10)
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-green/15 text-accent-green border border-accent-green/25 font-bold uppercase tracking-wider font-sans drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]">Strong</span>;
  if (edgePct > 0.05)
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue border border-accent-blue/25 font-bold uppercase tracking-wider font-sans drop-shadow-[0_0_8px_rgba(74,158,255,0.3)]">Edge</span>;
  return null;
}

function displayHitRate(val?: number | null): string {
  if (val == null) return "-";
  const pct = Math.abs(val) <= 1 ? val * 100 : val;
  return `${pct.toFixed(0)}%`;
}

function getHitRateColor(hitRate: number): string {
  if (hitRate >= 80) return "bg-accent-green text-dark-bg";
  if (hitRate >= 60) return "bg-accent-yellow text-dark-bg";
  return "bg-accent-red text-dark-bg";
}

function SplitBarRow({ label, pct, colorClass }: { label: string, pct: number, colorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] font-sans text-text-platinum/50 uppercase tracking-widest font-semibold">
        <span>{label}</span>
        <span className="font-mono text-text-platinum/80">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full bg-dark-bg rounded-full overflow-hidden shadow-inner">
        <div className={`h-full ${colorClass} transition-all duration-1000 ease-out`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

export default function PropCard({ prop }: { prop: PlayerProp }) {
  const [expanded, setExpanded] = useState(false);
  const hitRate = displayHitRate(prop.hitRate ?? prop.fairProbability);
  const hrNumber = (prop.hitRate ?? prop.fairProbability ?? 0) * (Math.abs(prop.hitRate ?? 0) <= 1 ? 100 : 1);
  const bookOdds = sortBookOddsForDisplay(prop.bookOdds || [], prop.line);
  const selectedBookOdds = resolveSelectedBookOdds(bookOdds, {
    book: prop.book,
    odds: prop.odds,
    line: prop.line,
  });
  const savings = describeBookSavings(bookOdds, {
    book: selectedBookOdds?.book ?? prop.book,
    odds: selectedBookOdds?.odds ?? prop.odds,
    line: selectedBookOdds?.line ?? prop.line,
  });
  const showOddsLine = hasAlternateBookLines(bookOdds);

  return (
    <div className="mx-3 my-2 rounded-2xl bg-dark-card border border-dark-border/80 overflow-hidden shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_8px_30px_-12px_rgba(74,158,255,0.15)] group">
      <div 
        className="px-5 py-4 cursor-pointer relative"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex gap-3">
            <TeamLogo team={prop.team} color={prop.teamColor} size={36} />
            <div>
              <h3 className="text-text-platinum font-heading font-bold text-lg leading-tight transition-colors group-hover:text-white">
                {prop.playerName}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-text-platinum/50 font-sans font-semibold border border-dark-border/50 px-1.5 rounded bg-dark-bg/50">
                  {prop.team} {prop.isAway ? "@" : "vs"} {prop.opponent}
                </span>
                <span className="text-[10px] text-text-platinum/40 uppercase tracking-widest font-mono">
                  {prop.league}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col items-end">
            <div className="font-mono text-[11px] text-text-platinum/50 uppercase tracking-widest mb-1">{prop.propType}</div>
            <div className="bg-accent-blue/10 text-accent-blue border border-accent-blue/20 px-2.5 py-0.5 rounded cursor-default font-bold font-mono text-sm shadow-[inset_0_0_10px_rgba(74,158,255,0.1)]">
              {prop.overUnder} {prop.line}
            </div>
          </div>
        </div>

        {/* SplitBars Row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <SplitBarRow label="L10 Games" pct={prop.rollingAverages?.last10 ? (prop.rollingAverages.last10 >= prop.line ? 90 : 30) : 50} colorClass="bg-gradient-to-r from-accent-blue to-accent-blue/80" />
          <SplitBarRow label="Home/Away" pct={prop.splits[0]?.hitRate ?? 50} colorClass="bg-gradient-to-r from-accent-champagne to-accent-champagne/80" />
          <SplitBarRow label="Matchup" pct={prop.splits.find(s => s.label.includes('vs'))?.hitRate ?? 50} colorClass="bg-gradient-to-r from-accent-blue/80 to-accent-blue/60" />
        </div>

        {/* Bottom Bar */}
        <div className="flex justify-between items-end border-t border-dark-border/40 pt-3">
          <div className="flex items-center gap-3">
            <div className="font-mono text-xl font-black text-text-platinum leading-none tracking-tight">
              <span className={`text-[22px] ${hrNumber >= 80 ? "text-accent-green drop-shadow-[0_0_8px_rgba(34,197,94,0.4)]" : hrNumber >= 60 ? "text-accent-yellow" : "text-text-platinum"}`}>{hitRate}</span>
            </div>
            {prop.edgePct != null && prop.edgePct > 0 && (
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-widest text-text-platinum/40 font-mono">Edge</span>
                <span className="font-mono text-sm font-bold text-accent-green leading-none">+{Math.round(prop.edgePct * 100)}%</span>
              </div>
            )}
            <div className="flex flex-col ml-1 border-l border-dark-border/50 pl-3">
              <span className="text-[8px] uppercase tracking-widest text-text-platinum/40 font-mono">Odds</span>
              <span className="font-mono text-sm text-text-platinum/80 leading-none">{formatOdds(prop.odds)}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <TrendIndicatorDots indicators={prop.indicators} />
            <ChevronDown size={14} className={`text-text-platinum/40 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 pt-0 animate-slide-down" style={{ animationDuration: "0.2s" }}>
          <div className="bg-dark-bg/60 rounded-xl p-4 border border-dark-border/50 mb-3">
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-accent-champagne shrink-0 mt-0.5" />
              <p className="text-[13px] leading-relaxed text-text-platinum/70 font-sans">
                {prop.reasoning || `AI analysis indicates a solid mathematical edge for ${prop.playerName} ${prop.overUnder} ${prop.line}. High historical hit rate in this specific matchup split.`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Link href={getPlayerTrendHrefFromProp(prop)} className="text-[12px] text-accent-blue font-semibold hover:text-white transition-colors flex items-center gap-1">
              View Full Trend Analysis <Activity size={12} />
            </Link>
            <div className="scale-110 origin-right">
              <SavePickButton prop={prop} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
