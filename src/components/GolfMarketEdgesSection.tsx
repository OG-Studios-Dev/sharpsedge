"use client";

import { useState } from "react";
import Link from "next/link";
import {
  formatGolfOdds,
  formatGolfPercent,
  formatGolfSignedPercent,
  getGolfPredictionProbability,
} from "@/lib/golf-ui";
import type { GolfPrediction, GolfPredictionBoard, GolfPredictionMarket } from "@/lib/types";

type EdgeCard = {
  key: string;
  label: string;
  market: GolfPredictionMarket | "Course Fit" | "Fade";
  tier: "winner" | "top10" | "top20" | "sleeper";
  playerName: string;
  probability?: number | null;
  edge?: number | null;
  odds?: number | null;
  note: string;
};

type TierFilter = "winner" | "top10" | "top20" | "h2h";

const TIER_PILLS: { id: TierFilter; label: string }[] = [
  { id: "winner",  label: "Winner"  },
  { id: "top10",   label: "Top 10"  },
  { id: "top20",   label: "Top 20"  },
  { id: "h2h",     label: "H2H"     },
];

function marketEdge(player: GolfPrediction, market: GolfPredictionMarket) {
  const bookProb = player.bookProb;
  if (typeof bookProb !== "number" || !Number.isFinite(bookProb)) return null;
  return getGolfPredictionProbability(player, market) - bookProb;
}

function sortByMarketEdge(players: GolfPrediction[], market: GolfPredictionMarket) {
  return [...players].sort((l, r) => (
    (marketEdge(r, market) ?? Number.NEGATIVE_INFINITY) - (marketEdge(l, market) ?? Number.NEGATIVE_INFINITY)
  ) || (
    getGolfPredictionProbability(r, market) - getGolfPredictionProbability(l, market)
  ) || (
    (r.combinedScore ?? 0) - (l.combinedScore ?? 0)
  ));
}

function sortByProbability(players: GolfPrediction[], market: GolfPredictionMarket) {
  return [...players].sort((l, r) => (
    getGolfPredictionProbability(r, market) - getGolfPredictionProbability(l, market)
  ) || (
    (r.combinedScore ?? 0) - (l.combinedScore ?? 0)
  ) || (
    (r.edge ?? Number.NEGATIVE_INFINITY) - (l.edge ?? Number.NEGATIVE_INFINITY)
  ));
}

function bestMarketBackedPlayer(players: GolfPrediction[], market: GolfPredictionMarket) {
  return sortByMarketEdge(players, market).find((p) => typeof marketEdge(p, market) === "number") ?? null;
}

function bestModelPlayer(players: GolfPrediction[], market: GolfPredictionMarket) {
  return sortByProbability(players, market)[0] ?? null;
}

function buildOutrightNote(player: GolfPrediction) {
  return `Win ${formatGolfPercent(player.modelProb)} with ${formatGolfSignedPercent(marketEdge(player, "Tournament Winner") ?? player.edge)} vs the current outright price.`;
}

function buildPlacementNote(player: GolfPrediction, market: "Top 10 Finish" | "Top 20 Finish") {
  const probability = getGolfPredictionProbability(player, market);
  const edge = marketEdge(player, market);
  const edgeCopy = typeof edge === "number"
    ? `${formatGolfSignedPercent(edge)} versus the implied line`
    : `backed by a ${formatGolfPercent(probability)} model probability`;
  return `${market.replace(" Finish", "")} case led by ${edgeCopy} and a ${Math.round(player.courseFitScore ?? 0)}/100 course-fit score.`;
}

function buildCourseFitNote(player: GolfPrediction) {
  return `${Math.round(player.courseFitScore ?? 0)}/100 course-fit with ${formatGolfPercent(player.modelProb)} win equity at ${formatGolfOdds(player.bookOdds)}.`;
}

function buildEdgeCards(predictions: GolfPredictionBoard | null): EdgeCard[] {
  const players = predictions?.players ?? [];
  if (players.length === 0) return [];

  const outright  = bestMarketBackedPlayer(players, "Tournament Winner") ?? bestModelPlayer(players, "Tournament Winner");
  const top10     = bestMarketBackedPlayer(players, "Top 10 Finish")     ?? bestModelPlayer(players, "Top 10 Finish");
  const top20     = bestMarketBackedPlayer(players, "Top 20 Finish")     ?? bestModelPlayer(players, "Top 20 Finish");
  const courseFit = [...players].sort((l, r) => (
    (r.courseFitScore ?? 0) - (l.courseFitScore ?? 0)
  ) || (
    (r.edge ?? Number.NEGATIVE_INFINITY) - (l.edge ?? Number.NEGATIVE_INFINITY)
  ) || (
    (r.modelProb ?? 0) - (l.modelProb ?? 0)
  ))[0];

  return [
    outright ? {
      key: `outright-${outright.id}`,
      label: "Best outright value",
      market: "Tournament Winner" as const,
      tier: "winner" as const,
      playerName: outright.name,
      probability: outright.modelProb,
      edge: marketEdge(outright, "Tournament Winner") ?? outright.edge,
      odds: outright.bookOdds,
      note: buildOutrightNote(outright),
    } : null,
    top10 ? {
      key: `top10-${top10.id}`,
      label: "Best Top 10 target",
      market: "Top 10 Finish" as const,
      tier: "top10" as const,
      playerName: top10.name,
      probability: top10.top10Prob,
      edge: marketEdge(top10, "Top 10 Finish"),
      odds: top10.bookOdds,
      note: buildPlacementNote(top10, "Top 10 Finish"),
    } : null,
    top20 ? {
      key: `top20-${top20.id}`,
      label: "Best Top 20 target",
      market: "Top 20 Finish" as const,
      tier: "top20" as const,
      playerName: top20.name,
      probability: top20.top20Prob,
      edge: marketEdge(top20, "Top 20 Finish"),
      odds: top20.bookOdds,
      note: buildPlacementNote(top20, "Top 20 Finish"),
    } : null,
    courseFit ? {
      key: `fit-${courseFit.id}`,
      label: "Best course-fit sleeper",
      market: "Course Fit" as const,
      tier: "top20" as const,
      playerName: courseFit.name,
      probability: courseFit.modelProb,
      edge: courseFit.edge,
      odds: courseFit.bookOdds,
      note: buildCourseFitNote(courseFit),
    } : null,
  ].filter(Boolean) as EdgeCard[];
}

export default function GolfMarketEdgesSection({
  predictions,
  href,
  compact = false,
}: {
  predictions: GolfPredictionBoard | null;
  href?: string;
  compact?: boolean;
}) {
  const [activeTier, setActiveTier] = useState<TierFilter>("winner");
  const allCards = buildEdgeCards(predictions);

  const visibleCards = activeTier === "h2h"
    ? []
    : allCards.filter((c) => c.tier === activeTier);

  return (
    <section className={`border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] shadow-[0_16px_60px_rgba(0,0,0,0.24)] ${compact ? "rounded-2xl p-4" : "rounded-[28px] p-5"}`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">PGA Market Edges</p>
          <h3 className={`mt-2 font-semibold text-white ${compact ? "text-base" : "text-lg"}`}>Best PGA edges right now</h3>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-xs font-semibold text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15 sm:w-auto"
          >
            View tournament board →
          </Link>
        ) : null}
      </div>

      {/* Tier filter pills — 4 equal-width blocks */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {TIER_PILLS.map((pill) => {
          const isActive = activeTier === pill.id;
          const hasData = pill.id === "h2h" ? false : allCards.some((c) => c.tier === pill.id);
          return (
            <button
              key={pill.id}
              onClick={() => setActiveTier(pill.id)}
              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition ${
                isActive
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : hasData
                    ? "border-white/10 bg-white/[0.04] text-gray-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                    : "border-white/6 bg-transparent text-gray-600 cursor-default"
              }`}
              disabled={!hasData && pill.id !== "h2h"}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div className="mt-4">
        {activeTier === "h2h" ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-gray-400">
            <p className="font-medium text-gray-300">H2H Matchup Picks</p>
            <p className="mt-1 text-xs text-gray-500">Head-to-head matchup analysis coming once the tournament field and lines are posted.</p>
          </div>
        ) : visibleCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
            Analysis for this tier unlocks once the field and prediction board are available.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visibleCards.map((card) => (
              <article key={card.key} className="min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">{card.label}</p>
                <h4 className="mt-2 truncate text-base font-semibold text-white">{card.playerName}</h4>
                <p className="mt-1 text-xs text-gray-400">{card.market}</p>

                <div className="mt-3 space-y-2 text-sm text-gray-300">
                  <p>Model {formatGolfPercent(card.probability)}</p>
                  <p>Price {formatGolfOdds(card.odds)}</p>
                  <p className="font-medium text-white">Edge {formatGolfSignedPercent(card.edge)}</p>
                </div>

                <p className="mt-3 text-xs leading-5 text-gray-500">{card.note}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
