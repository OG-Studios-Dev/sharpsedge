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
  playerName: string;
  probability?: number | null;
  edge?: number | null;
  odds?: number | null;
  note: string;
};

function marketEdge(player: GolfPrediction, market: GolfPredictionMarket) {
  const bookProb = player.bookProb;
  if (typeof bookProb !== "number" || !Number.isFinite(bookProb)) return null;
  return getGolfPredictionProbability(player, market) - bookProb;
}

function sortByMarketEdge(players: GolfPrediction[], market: GolfPredictionMarket) {
  return [...players].sort((left, right) => (
    (marketEdge(right, market) ?? Number.NEGATIVE_INFINITY) - (marketEdge(left, market) ?? Number.NEGATIVE_INFINITY)
  ) || (
    getGolfPredictionProbability(right, market) - getGolfPredictionProbability(left, market)
  ) || (
    (right.combinedScore ?? 0) - (left.combinedScore ?? 0)
  ));
}

function sortByProbability(players: GolfPrediction[], market: GolfPredictionMarket) {
  return [...players].sort((left, right) => (
    getGolfPredictionProbability(right, market) - getGolfPredictionProbability(left, market)
  ) || (
    (right.combinedScore ?? 0) - (left.combinedScore ?? 0)
  ) || (
    (right.edge ?? Number.NEGATIVE_INFINITY) - (left.edge ?? Number.NEGATIVE_INFINITY)
  ));
}

function bestMarketBackedPlayer(players: GolfPrediction[], market: GolfPredictionMarket) {
  return sortByMarketEdge(players, market).find((player) => typeof marketEdge(player, market) === "number") ?? null;
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

function buildFadeNote(player: GolfPrediction) {
  return `Market is pricing ${formatGolfOdds(player.bookOdds)}, but the model only gives ${formatGolfPercent(player.modelProb)} win equity.`;
}

function buildEdgeCards(predictions: GolfPredictionBoard | null): EdgeCard[] {
  const players = predictions?.players ?? [];
  if (players.length === 0) return [];

  const outright = bestMarketBackedPlayer(players, "Tournament Winner") ?? bestModelPlayer(players, "Tournament Winner");
  const top10 = bestMarketBackedPlayer(players, "Top 10 Finish") ?? bestModelPlayer(players, "Top 10 Finish");
  const top20 = bestMarketBackedPlayer(players, "Top 20 Finish") ?? bestModelPlayer(players, "Top 20 Finish");
  const courseFit = [...players].sort((left, right) => (
    (right.courseFitScore ?? 0) - (left.courseFitScore ?? 0)
  ) || (
    (right.edge ?? Number.NEGATIVE_INFINITY) - (left.edge ?? Number.NEGATIVE_INFINITY)
  ) || (
    (right.modelProb ?? 0) - (left.modelProb ?? 0)
  ))[0];
  const fade = [...players].sort((left, right) => (
    (left.edge ?? Number.POSITIVE_INFINITY) - (right.edge ?? Number.POSITIVE_INFINITY)
  ) || (
    (left.modelProb ?? 0) - (right.modelProb ?? 0)
  ) || (
    (right.bookOdds ?? Number.NEGATIVE_INFINITY) - (left.bookOdds ?? Number.NEGATIVE_INFINITY)
  )).find((player) => typeof player.edge === "number") ?? null;

  return [
    outright ? {
      key: `outright-${outright.id}`,
      label: "Best outright value",
      market: "Tournament Winner",
      playerName: outright.name,
      probability: outright.modelProb,
      edge: marketEdge(outright, "Tournament Winner") ?? outright.edge,
      odds: outright.bookOdds,
      note: buildOutrightNote(outright),
    } : null,
    top10 ? {
      key: `top10-${top10.id}`,
      label: "Best Top 10 target",
      market: "Top 10 Finish",
      playerName: top10.name,
      probability: top10.top10Prob,
      edge: marketEdge(top10, "Top 10 Finish"),
      odds: top10.bookOdds,
      note: buildPlacementNote(top10, "Top 10 Finish"),
    } : null,
    top20 ? {
      key: `top20-${top20.id}`,
      label: "Best Top 20 target",
      market: "Top 20 Finish",
      playerName: top20.name,
      probability: top20.top20Prob,
      edge: marketEdge(top20, "Top 20 Finish"),
      odds: top20.bookOdds,
      note: buildPlacementNote(top20, "Top 20 Finish"),
    } : null,
    courseFit ? {
      key: `fit-${courseFit.id}`,
      label: "Best course-fit sleeper",
      market: "Course Fit",
      playerName: courseFit.name,
      probability: courseFit.modelProb,
      edge: courseFit.edge,
      odds: courseFit.bookOdds,
      note: buildCourseFitNote(courseFit),
    } : null,
    fade ? {
      key: `fade-${fade.id}`,
      label: "Biggest fade",
      market: "Fade",
      playerName: fade.name,
      probability: fade.modelProb,
      edge: fade.edge,
      odds: fade.bookOdds,
      note: buildFadeNote(fade),
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
  const cards = buildEdgeCards(predictions);

  return (
    <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">PGA Market Edges</p>
          <h3 className="mt-2 text-lg font-semibold text-white">The only golf insight block worth showing right now</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
            Clean DataGolf/model takeaways: outright value, placement targets, best course-fit sleeper, and the most overpriced contender.
          </p>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-2 rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-xs font-semibold text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15"
          >
            View tournament board →
          </Link>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-dark-border px-4 py-6 text-sm text-gray-400">
          Market edges unlock once the tournament field and prediction board are available.
        </div>
      ) : (
        <div className={`mt-5 grid gap-3 ${compact ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-5"}`}>
          {cards.map((card) => (
            <article key={card.key} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{card.label}</p>
              <h4 className="mt-2 text-base font-semibold text-white">{card.playerName}</h4>
              <p className="mt-1 text-xs text-gray-400">{card.market}</p>

              <div className="mt-4 space-y-2 text-sm text-gray-300">
                <p>Model {formatGolfPercent(card.probability)}</p>
                <p>Price {formatGolfOdds(card.odds)}</p>
                <p className="font-medium text-white">Edge {formatGolfSignedPercent(card.edge)}</p>
              </div>

              <p className="mt-4 text-xs leading-5 text-gray-500">{card.note}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
