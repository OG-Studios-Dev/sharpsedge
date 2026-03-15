"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import MyPicksRecord from "@/components/MyPicksRecord";
import ParlayBuilder from "@/components/ParlayBuilder";
import { useAppChrome } from "@/components/AppChromeProvider";
import type { MyPickEntry, MyPickResult } from "@/lib/my-picks";
import { formatAmericanOdds } from "@/lib/my-picks";

type SportFilter = "all" | "NHL" | "NBA" | "MLB" | "PGA" | "Mixed";
type DateFilter = "all" | "today" | "7d" | "30d";
type ResultFilter = "all" | "win" | "loss" | "push";

function formatDate(value?: string | null) {
  if (!value) return "TBD";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function withinRange(value: string, range: DateFilter) {
  if (range === "all") return true;

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (range === "today") return now - timestamp <= dayMs;
  if (range === "7d") return now - timestamp <= dayMs * 7;
  return now - timestamp <= dayMs * 30;
}

function resultPill(result: MyPickResult) {
  if (result === "win") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (result === "loss") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (result === "push") return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  return "border-dark-border bg-dark-bg/60 text-gray-400";
}

function ResolveButtons({
  onResolve,
}: {
  onResolve: (result: MyPickResult) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {(["win", "loss", "push"] as const).map((result) => (
        <button
          key={result}
          type="button"
          onClick={() => onResolve(result)}
          className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${resultPill(result)}`}
        >
          {result}
        </button>
      ))}
    </div>
  );
}

function PickCard({
  pick,
  onResolve,
  onRemove,
}: {
  pick: MyPickEntry;
  onResolve?: (result: MyPickResult) => void;
  onRemove: () => void;
}) {
  return (
    <article className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="card-title truncate">{pick.summary}</p>
            <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {pick.kind}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">{pick.detail}</p>
        </div>
        <div className="text-right">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${resultPill(pick.result)}`}>
            {pick.result}
          </span>
          <p className="mt-2 text-sm font-bold text-white">{formatAmericanOdds(pick.odds)}</p>
          <p className="text-[11px] text-gray-500">{pick.units}u</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">League</p>
          <p className="mt-1 text-sm font-semibold text-white">{pick.league}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Added</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatDate(pick.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Book</p>
          <p className="mt-1 text-sm font-semibold text-white">{pick.book || "Tracked"}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Legs</p>
          <p className="mt-1 text-sm font-semibold text-white">{pick.legs.length}</p>
        </div>
      </div>

      {pick.kind === "parlay" && (
        <div className="mt-3 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="section-heading">Parlay Legs</p>
          <div className="mt-2 space-y-2">
            {pick.legs.map((leg, index) => (
              <div key={leg.id} className="flex items-center justify-between gap-3 rounded-xl border border-dark-border/70 bg-dark-surface/70 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">{index + 1}. {leg.summary}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{leg.detail}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${resultPill(leg.result)}`}>
                  {leg.result}
                </span>
              </div>
            ))}
          </div>
          {pick.result === "pending" && (
            <p className="mt-2 text-[11px] text-gray-500">Parlays auto-resolve when all linked legs settle.</p>
          )}
        </div>
      )}

      {onResolve ? <ResolveButtons onResolve={onResolve} /> : null}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          className="tap-button rounded-full border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-[11px] font-semibold uppercase text-gray-400"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

export default function MyPicksPage() {
  const {
    myPicks,
    buildParlay,
    setMyPickResult,
    removeMyPick,
  } = useAppChrome();
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const activePicks = useMemo(
    () => myPicks.filter((pick) => pick.result === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [myPicks],
  );
  const availableParlayLegs = activePicks.filter((pick) => pick.kind === "single");
  const historyPicks = useMemo(
    () => myPicks.filter((pick) => pick.result !== "pending").sort((a, b) => (b.settledAt || b.updatedAt).localeCompare(a.settledAt || a.updatedAt)),
    [myPicks],
  );
  const filteredHistory = useMemo(() => (
    historyPicks.filter((pick) => {
      if (sportFilter !== "all" && pick.league !== sportFilter) return false;
      if (resultFilter !== "all" && pick.result !== resultFilter) return false;
      return withinRange(pick.settledAt || pick.updatedAt, dateFilter);
    })
  ), [dateFilter, historyPicks, resultFilter, sportFilter]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title="My Picks"
        subtitle="Track your own card, units, and parlays."
      />

      <LockedFeature feature="my_picks">
        <div className="space-y-4 px-4 py-4 lg:px-0">
          <MyPicksRecord picks={myPicks} />

          <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-heading">Active Picks</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Today’s open card</h2>
                <p className="mt-1 text-sm text-gray-400">Singles can be resolved manually. Parlays update automatically.</p>
              </div>
              <div className="rounded-2xl border border-dark-border bg-dark-bg/60 px-4 py-3 text-center">
                <p className="meta-label">Open</p>
                <p className="mt-1 text-xl font-bold text-white">{activePicks.length}</p>
              </div>
            </div>

            {activePicks.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
                Add picks from Props, Trends, or AI Picks using the `+` button.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {activePicks.map((pick) => (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    onResolve={pick.kind === "single" ? (result) => setMyPickResult(pick.id, result) : undefined}
                    onRemove={() => removeMyPick(pick.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <ParlayBuilder
            availablePicks={availableParlayLegs}
            onCreate={buildParlay}
          />

          <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="section-heading">Pick History</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Settled picks</h2>
                <p className="mt-1 text-sm text-gray-400">Filter by sport, date range, or result.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "NHL", "NBA", "MLB", "PGA", "Mixed"] as SportFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSportFilter(value)}
                    className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${
                      sportFilter === value
                        ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                        : "border-dark-border bg-dark-bg/60 text-gray-400"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "today", "7d", "30d"] as DateFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateFilter(value)}
                  className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${
                    dateFilter === value
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-dark-border bg-dark-bg/60 text-gray-400"
                  }`}
                >
                  {value}
                </button>
              ))}
              {(["all", "win", "loss", "push"] as ResultFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResultFilter(value)}
                  className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${
                    resultFilter === value
                      ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                      : "border-dark-border bg-dark-bg/60 text-gray-400"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
                No settled picks match the current filters yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredHistory.map((pick) => (
                  <PickCard
                    key={pick.id}
                    pick={pick}
                    onRemove={() => removeMyPick(pick.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </LockedFeature>
    </main>
  );
}
