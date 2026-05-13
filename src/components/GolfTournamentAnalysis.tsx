"use client";

import { useEffect, useState } from "react";
import type { TournamentAnalysisData } from "@/lib/supabase-types";

function fmtOdds(odds: number) {
  return odds >= 0 ? `+${odds.toLocaleString()}` : `${odds}`;
}

function tagBadge(tag: "value" | "fade" | null) {
  if (tag === "value") return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">Value</span>;
  if (tag === "fade") return <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300">Fade</span>;
  return null;
}

function strengthBadge(strength: string) {
  const cls = strength === "strong"
    ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
    : "border-white/10 bg-white/[0.04] text-gray-300";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls}`}>
      {strength === "strong" ? "Strong lean" : "Lean"}
    </span>
  );
}

export default function GolfTournamentAnalysis({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<TournamentAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/golf/analysis?tournament_id=${encodeURIComponent(tournamentId)}`)
      .then((r) => r.json())
      .then((res) => setData(res.analysis ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  if (loading || !data) return null;

  const hasTiers = data.tiers?.length > 0;
  const hasTopFinishes = data.topFinishes?.length > 0;
  const hasParlays = data.parlays?.length > 0;
  const hasMatchups = data.matchups?.length > 0;
  const hasLongshots = data.longshots?.length > 0;
  const hasCourse = data.courseProfile?.length > 0;

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="group rounded-[32px] border border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_40%),rgba(255,255,255,0.03)] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400">
            AI Analysis
          </p>
          <h2 className="mt-1 text-xl font-semibold text-white">
            {data.tournamentName || "Tournament"} — Deep Dive
          </h2>
          <p className="mt-1.5 text-xs text-gray-500">
            Outrights, matchups, parlays, longshots, and course profile
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition group-open:rotate-0">
          {open ? "Collapse" : "Expand"}
        </span>
      </summary>

      <div className="space-y-6 px-5 pb-6">

        {/* Course Profile */}
        {hasCourse && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              What Wins Here
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.courseProfile.map((item) => (
                <div key={item.factor} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-emerald-400">#{item.rank}</span>
                    <p className="text-sm font-semibold text-white">{item.factor}</p>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-gray-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tiered Odds Analysis */}
        {hasTiers && (
          <div className="space-y-5">
            {data.tiers.map((tier) => (
              <div key={tier.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
                  {tier.label}
                </p>
                <div className="mt-2 space-y-2">
                  {tier.players.map((player) => (
                    <div key={player.name} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{player.name}</p>
                            {tagBadge(player.tag)}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-gray-400">{player.note}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-emerald-300 tabular-nums">{fmtOdds(player.odds)}</p>
                          <p className="text-[10px] text-gray-500">{player.book}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top Finishes */}
        {hasTopFinishes && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              Top Finish Picks
            </p>
            <div className="mt-2 space-y-2">
              {data.topFinishes.map((pick) => (
                <div key={`${pick.name}-${pick.market}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{pick.name}</p>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-300">
                          {pick.market}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-400">{pick.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-300 tabular-nums">{fmtOdds(pick.odds)}</p>
                      <p className="text-[10px] text-gray-500">{pick.book}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parlays */}
        {hasParlays && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              Parlay Suggestions
            </p>
            <div className="mt-2 space-y-2">
              {data.parlays.map((parlay) => (
                <div key={parlay.label} className="rounded-2xl border border-amber-400/10 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{parlay.label}</p>
                      <p className="mt-1 text-xs leading-5 text-gray-400">{parlay.note}</p>
                    </div>
                    <p className="text-sm font-semibold text-amber-300 tabular-nums">{parlay.odds}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player vs Player Matchups */}
        {hasMatchups && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              Player vs Player Matchups
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              Head-to-head removes field noise. You just need one player to beat one other player over 4 rounds.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.matchups.map((m) => (
                <div key={m.label} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{m.label}</p>
                    {strengthBadge(m.strength)}
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-300">Edge: {m.edge}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-400">{m.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Longshots */}
        {hasLongshots && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">
              Longshots
            </p>
            <div className="mt-2 space-y-2">
              {data.longshots.map((ls) => (
                <div key={ls.name} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{ls.name}</p>
                      <p className="mt-1 text-xs leading-5 text-gray-400">{ls.note}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-300 tabular-nums">{fmtOdds(ls.odds)}</p>
                      <p className="text-[10px] text-gray-500">{ls.book}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Provenance */}
        {data.provenance && (
          <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Data Provenance
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400">
              {data.provenance.sources.map((src) => (
                <span key={src}>Source: <span className="text-white">{src}</span></span>
              ))}
              <span>Captured: <span className="text-white">{data.provenance.capturedAt}</span></span>
              <span>Field: <span className="text-white">{data.fieldSize} players</span></span>
            </div>
            {data.provenance.notes && (
              <p className="mt-2 text-[11px] text-gray-600">{data.provenance.notes}</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
