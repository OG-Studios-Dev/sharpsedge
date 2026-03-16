"use client";

import { useState } from "react";
import GolfLeaderboardCard from "@/components/GolfLeaderboardCard";
import {
  formatGolfHitRate,
  formatGolfOdds,
  formatGolfPercent,
  formatGolfSignedPercent,
  getGolfPredictionProbability,
} from "@/lib/golf-ui";
import type {
  GolfLeaderboard,
  GolfPrediction,
  GolfPredictionBoard,
  GolfPredictionMarket,
  GolfTournament,
  GolfValuePlay,
} from "@/lib/types";

type TabKey = "leaderboard" | "picks" | "players" | "course";

type WinnerCard = {
  label: string;
  player: GolfPrediction | null;
};

type LockCard = {
  label: string;
  market: GolfPredictionMarket;
  player: GolfPrediction | null;
};

type ValueCard = {
  label: string;
  market: GolfPredictionMarket;
  modelProb: number;
  bookProb: number | null;
  edge: number | null;
  player: GolfPrediction;
};

const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "picks", label: "Picks" },
  { key: "players", label: "Players" },
  { key: "course", label: "Course" },
];

function tabClasses(active: boolean) {
  return active
    ? "border-white/20 bg-white text-dark-bg"
    : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10";
}

function topBoardPlayers(leaderboard: GolfLeaderboard | null) {
  return (leaderboard?.players ?? []).filter((player) => player.position !== "CUT" && player.position !== "MC");
}

function findUniquePlayer(
  players: GolfPrediction[],
  usedPlayers: Set<string>,
  predicate?: (player: GolfPrediction) => boolean,
) {
  const match = players.find((player) => !usedPlayers.has(player.id) && (!predicate || predicate(player)));
  if (!match) return null;
  usedPlayers.add(match.id);
  return match;
}

function buildWinnerCards(players: GolfPrediction[]): WinnerCard[] {
  const ordered = [...players].sort((left, right) => (
    (right.edge ?? Number.NEGATIVE_INFINITY) - (left.edge ?? Number.NEGATIVE_INFINITY)
  ) || (
    right.modelProb - left.modelProb
  ) || (
    right.combinedScore - left.combinedScore
  ));

  const usedPlayers = new Set<string>();
  const favorite = findUniquePlayer(
    ordered,
    usedPlayers,
    (player) => typeof player.bookOdds === "number" ? player.bookOdds <= 1800 : player.modelProb >= 0.08,
  );
  const midRange = findUniquePlayer(
    ordered,
    usedPlayers,
    (player) => typeof player.bookOdds === "number" ? player.bookOdds > 1800 && player.bookOdds <= 4500 : player.modelProb >= 0.04,
  );
  const longShot = findUniquePlayer(
    ordered,
    usedPlayers,
    (player) => typeof player.bookOdds === "number" ? player.bookOdds > 4500 : player.combinedScore >= 60,
  );

  return [
    { label: "Favorite", player: favorite ?? findUniquePlayer(ordered, usedPlayers) },
    { label: "Mid-tier", player: midRange ?? findUniquePlayer(ordered, usedPlayers) },
    { label: "Long shot", player: longShot ?? findUniquePlayer(ordered, usedPlayers) },
  ];
}

function buildLockCards(players: GolfPrediction[]): LockCard[] {
  const markets: Array<{ label: string; market: GolfPredictionMarket }> = [
    { label: "Top 5 lock", market: "Top 5 Finish" },
    { label: "Top 10 lock", market: "Top 10 Finish" },
    { label: "Top 20 lock", market: "Top 20 Finish" },
  ];
  const usedPlayers = new Set<string>();

  return markets.map(({ label, market }) => {
    const ordered = [...players].sort((left, right) => (
      getGolfPredictionProbability(right, market) - getGolfPredictionProbability(left, market)
    ) || (
      right.combinedScore - left.combinedScore
    ));
    return {
      label,
      market,
      player: findUniquePlayer(ordered, usedPlayers),
    };
  });
}

function fallbackValueCards(players: GolfPrediction[], seedKeys: Iterable<string> = []): ValueCard[] {
  const usedCards = new Set<string>(seedKeys);
  const cards: ValueCard[] = [];
  const markets: GolfPredictionMarket[] = ["Top 5 Finish", "Top 10 Finish", "Top 20 Finish"];

  for (const market of markets) {
    const ordered = [...players].sort((left, right) => (
      getGolfPredictionProbability(right, market) - getGolfPredictionProbability(left, market)
    ) || (
      right.combinedScore - left.combinedScore
    ));

    for (const player of ordered) {
      const key = `${player.id}-${market}`;
      if (usedCards.has(key)) continue;
      usedCards.add(key);
      cards.push({
        label: cards.length < 3 ? "Model value" : "Proxy value",
        market,
        modelProb: getGolfPredictionProbability(player, market),
        bookProb: null,
        edge: null,
        player,
      });
      if (cards.length >= 6) return cards;
    }
  }

  return cards;
}

function buildValueCards(
  players: GolfPrediction[],
  valuePlays: GolfValuePlay[],
): ValueCard[] {
  const cards = valuePlays.slice(0, 6).map((play, index) => ({
    label: index < 2 ? "Top edge" : index < 4 ? "Value angle" : "Deep value",
    market: play.market,
    modelProb: play.modelProb,
    bookProb: play.bookProb,
    edge: play.edge,
    player: play.player,
  }));

  if (cards.length >= 6) return cards;
  return [
    ...cards,
    ...fallbackValueCards(
      players,
      cards.map((card) => `${card.player.id}-${card.market}`),
    ),
  ].slice(0, 6);
}

function buildOutrightProxyProbabilities(bookProb: number | null) {
  if (bookProb === null) {
    return {
      "Tournament Winner": null,
      "Top 5 Finish": null,
      "Top 10 Finish": null,
      "Top 20 Finish": null,
    } satisfies Record<GolfPredictionMarket, number | null>;
  }

  const top5Prob = Math.min(Math.max((bookProb * 5.1) + 0.015, bookProb), 0.67);
  const top10Prob = Math.min(Math.max((bookProb * 8.3) + 0.03, top5Prob + 0.03), 0.83);
  const top20Prob = Math.min(Math.max((bookProb * 12.4) + 0.06, top10Prob + 0.04), 0.92);

  return {
    "Tournament Winner": bookProb,
    "Top 5 Finish": top5Prob,
    "Top 10 Finish": top10Prob,
    "Top 20 Finish": top20Prob,
  } satisfies Record<GolfPredictionMarket, number | null>;
}

function marketEdge(player: GolfPrediction, market: GolfPredictionMarket) {
  const bookProbabilities = buildOutrightProxyProbabilities(player.bookProb);
  const bookProb = bookProbabilities[market];
  if (bookProb === null) return null;
  return getGolfPredictionProbability(player, market) - bookProb;
}

function finishChipTone(finish: string) {
  const normalized = finish.toUpperCase();
  if (normalized === "CUT" || normalized === "MC") return "border-rose-500/20 bg-rose-500/10 text-rose-200";
  const rank = Number(normalized.replace(/[^0-9]/g, ""));
  if (Number.isFinite(rank) && rank <= 10) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
  return "border-white/10 bg-white/[0.05] text-gray-300";
}

function scoreTone(score: string) {
  if (score === "CUT") return "text-rose-300";
  if (score === "E") return "text-white";
  if (score.startsWith("-")) return "text-emerald-300";
  if (score.startsWith("+")) return "text-amber-100";
  return "text-white";
}

function PickCard({
  eyebrow,
  market,
  player,
  probability,
  edge,
}: {
  eyebrow: string;
  market: string;
  player: GolfPrediction | null;
  probability?: number | null;
  edge?: number | null;
}) {
  if (!player) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-gray-400">
        Field data is not posted for this bucket yet.
      </div>
    );
  }

  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 px-4 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">{eyebrow}</p>
          <h3 className="mt-2 truncate text-lg font-semibold text-white">{player.name}</h3>
          <p className="mt-1 text-sm text-gray-400">{market}</p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
          {formatGolfOdds(player.bookOdds)}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
        <p>Form {player.formScore}</p>
        <p>Course fit {player.courseFitScore}</p>
        <p>Course history {player.courseHistoryScore}</p>
        <p>Model {formatGolfPercent(typeof probability === "number" ? probability : player.modelProb)}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
          Edge {formatGolfSignedPercent(typeof edge === "number" ? edge : player.edge)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
          {player.position || "—"} · {player.score}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
          {player.thru || player.teeTime || "Board pending"}
        </span>
      </div>
    </article>
  );
}

export default function GolfTournamentTabs({
  tournament,
  leaderboard,
  predictions,
  latestWinner,
}: {
  tournament: GolfTournament;
  leaderboard: GolfLeaderboard | null;
  predictions: GolfPredictionBoard | null;
  latestWinner: { name: string; score: string } | null;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("leaderboard");
  const contenderBoard = (predictions?.players ?? []).slice(0, 12);
  const winnerCards = buildWinnerCards(predictions?.players ?? []);
  const lockCards = buildLockCards(predictions?.players ?? []);
  const valueCards = buildValueCards(predictions?.players ?? [], predictions?.bestValuePicks ?? []);
  const leaderboardPlayers = topBoardPlayers(leaderboard);

  return (
    <section className="space-y-5">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {TAB_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${tabClasses(activeTab === item.key)}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "leaderboard" && (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Leaderboard</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Top 20 with full field on demand</h2>
            </div>
            <span className="text-xs text-gray-500">
              {leaderboard?.lastUpdated ? `Updated ${leaderboard.lastUpdated}` : `${leaderboardPlayers.length} active players`}
            </span>
          </div>

          <div className="mt-5">
            <GolfLeaderboardCard leaderboard={leaderboard} />
          </div>
        </section>
      )}

      {activeTab === "picks" && (
        <section className="space-y-6">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Winner Picks</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Favorite, mid-tier, and long shot</h2>
              </div>
              <span className="text-xs text-gray-500">
                {predictions?.players.length ? `${predictions.players.length} modelled players` : "Waiting on field data"}
              </span>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {winnerCards.map((card) => (
                <PickCard
                  key={card.label}
                  eyebrow={card.label}
                  market="Tournament Winner"
                  player={card.player}
                  probability={card.player?.modelProb}
                  edge={card.player?.edge}
                />
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Lock Picks</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Top 5, Top 10, and Top 20 anchors</h2>
              </div>
              <span className="text-xs text-gray-500">Probability-led buckets</span>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {lockCards.map((card) => (
                <PickCard
                  key={card.label}
                  eyebrow={card.label}
                  market={card.market}
                  player={card.player}
                  probability={card.player ? getGolfPredictionProbability(card.player, card.market) : null}
                  edge={card.player ? marketEdge(card.player, card.market) : null}
                />
              ))}
            </div>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Value Picks</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Six placement plays worth tracking</h2>
              </div>
              <span className="text-xs text-gray-500">Model edge vs available prices</span>
            </div>

            {valueCards.length === 0 ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                Value cards appear when the field or odds board is posted.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {valueCards.map((card, index) => (
                  <article
                    key={`${card.player.id}-${card.market}-${index}`}
                    className="rounded-[28px] border border-white/10 bg-black/20 px-4 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">{card.label}</p>
                        <h3 className="mt-2 truncate text-base font-semibold text-white">{card.player.name}</h3>
                        <p className="mt-1 text-sm text-gray-400">{card.market}</p>
                      </div>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                        {formatGolfSignedPercent(card.edge)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-gray-300">
                      <p>Form {card.player.formScore} · Course fit {card.player.courseFitScore}</p>
                      <p>Odds {formatGolfOdds(card.player.bookOdds)} · Model {formatGolfPercent(card.modelProb)}</p>
                      <p>Book {formatGolfPercent(card.bookProb)} · Position {card.player.position || "—"}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === "players" && (
        <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Players</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Contender board with form and fit</h2>
            </div>
            <span className="text-xs text-gray-500">{contenderBoard.length} contenders</span>
          </div>

          {contenderBoard.length === 0 ? (
            <div className="mt-5 rounded-[28px] border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
              Player cards unlock once the tournament field is available from ESPN.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {contenderBoard.map((player) => (
                <article
                  key={player.id}
                  className="rounded-[28px] border border-white/10 bg-black/20 px-4 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]"
                >
                  <div className="flex items-start gap-3">
                    {player.image ? (
                      <img
                        src={player.image}
                        alt={player.name}
                        className="h-12 w-12 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-dark-bg text-base">
                        ⛳
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-white">{player.name}</h3>
                          <p className="mt-1 text-sm text-gray-400">
                            {player.position || "—"} · <span className={scoreTone(player.score)}>{player.score}</span>
                            {" · "}
                            {player.thru || player.teeTime || "Board pending"}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200">
                          {formatGolfOdds(player.outrightOdds)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Recent Form</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(player.recentForm ?? []).slice(0, 5).map((result) => (
                        <span
                          key={`${player.id}-${result.tournamentId}`}
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${finishChipTone(result.finish)}`}
                          title={`${result.tournamentName}: ${result.finish}`}
                        >
                          {result.finish}
                        </span>
                      ))}
                      {(player.recentForm ?? []).length === 0 && (
                        <span className="text-sm text-gray-500">No recent finishes captured yet.</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Course History</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(player.courseHistory ?? []).slice(0, 4).map((result) => (
                        <span
                          key={`${player.id}-course-${result.tournamentId}`}
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${finishChipTone(result.finish)}`}
                          title={`${result.tournamentName}: ${result.finish}`}
                        >
                          {result.finish}
                        </span>
                      ))}
                      {(player.courseHistory ?? []).length === 0 && (
                        <span className="text-sm text-gray-500">No tracked starts at this course in the current scan.</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-gray-300">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      T5 <span className="font-semibold text-white">{formatGolfHitRate(player.hitRates?.top5)}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      T10 <span className="font-semibold text-white">{formatGolfHitRate(player.hitRates?.top10)}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      T20 <span className="font-semibold text-white">{formatGolfHitRate(player.hitRates?.top20)}</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                      Cut <span className="font-semibold text-white">{formatGolfHitRate(player.hitRates?.madeCut)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
                      Form {player.formScore}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
                      Course fit {player.courseFitScore}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-gray-300">
                      Win {formatGolfPercent(player.modelProb)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "course" && (
        <section className="space-y-6">
          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Course Snapshot</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Venue details and model fit</h2>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Course</p>
                <p className="mt-2 text-sm font-medium text-white">{tournament.course}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Location</p>
                <p className="mt-2 text-sm font-medium text-white">{tournament.location || "TBD"}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Par</p>
                <p className="mt-2 text-sm font-medium text-white">{typeof tournament.coursePar === "number" ? tournament.coursePar : "TBD"}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Yardage</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {typeof tournament.courseYardage === "number" ? `${tournament.courseYardage.toLocaleString()} yds` : "TBD"}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Course Fit</p>
              <h2 className="mt-1 text-xl font-semibold text-white">How the model weights this stop</h2>
              <p className="mt-4 text-sm leading-6 text-gray-300">
                Goosalytics leans on recent finishes, scoring average, and any prior rounds tracked at {tournament.course}. Live events
                also blend current board position into the ranking so the contender list stays grounded in the actual tournament state.
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-400">
                {typeof tournament.coursePar === "number"
                  ? `Par ${tournament.coursePar}`
                  : "Course par"}
                {typeof tournament.courseYardage === "number"
                  ? ` and ${tournament.courseYardage.toLocaleString()} yards`
                  : ""}
                {" "}
                are shown when ESPN exposes them, but the model’s strongest free-data signals remain finish quality, made-cut stability,
                and round-by-round scoring history.
              </p>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Historical Winners</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Latest result at this stop</h2>

              {latestWinner ? (
                <div className="mt-5 rounded-[28px] border border-white/10 bg-black/20 px-4 py-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                    {tournament.startDate ? new Date(tournament.startDate).getFullYear() : "Current season"}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{latestWinner.name}</h3>
                  <p className="mt-2 text-sm text-gray-300">Winning score {latestWinner.score}</p>
                </div>
              ) : (
                <div className="mt-5 rounded-[28px] border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
                  Historical winner data is limited to events the current PGA season feed has already completed.
                </div>
              )}
            </section>
          </section>

          <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Course Map</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Strategy layer reserved for the next pass</h2>
            <p className="mt-4 text-sm leading-6 text-gray-400">
              Hole map, scoring zones, and hole-by-hole strategy overlays will land here once the course mapping layer is wired into the
              golf stack.
            </p>
          </section>
        </section>
      )}
    </section>
  );
}
