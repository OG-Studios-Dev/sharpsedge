"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import LockedFeature from "@/components/LockedFeature";
import MyPicksRecord from "@/components/MyPicksRecord";
import ParlayBuilder from "@/components/ParlayBuilder";
import { useAppChrome } from "@/components/AppChromeProvider";
import { usePickHistory } from "@/hooks/usePickHistory";
import type { MyPickEntry, MyPickResult } from "@/lib/my-picks";
import { formatAmericanOdds } from "@/lib/my-picks";
import { computePickHistorySummary } from "@/lib/pick-history";
import type { PickHistoryRecord } from "@/lib/supabase-types";

type SportFilter = "all" | "NHL" | "NBA" | "MLB" | "PGA" | "Mixed";
type DateFilter = "all" | "today" | "7d" | "30d";
type ResultFilter = "all" | "win" | "loss" | "push" | "pending";

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

function resultPill(result: MyPickResult | PickHistoryRecord["result"]) {
  if (result === "win") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (result === "loss") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (result === "push") return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  return "border-dark-border bg-dark-bg/60 text-gray-400";
}

function ResolveButtons({ onResolve }: { onResolve: (result: MyPickResult) => void }) {
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

function ProductRecordCard({ picks }: { picks: PickHistoryRecord[] }) {
  const summary = computePickHistorySummary(picks);
  const settled = summary.wins + summary.losses;
  const winPct = settled > 0 ? (summary.wins / settled) * 100 : 0;

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="section-heading">My Picks</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Product pick history and results</h2>
          <p className="mt-1 text-sm text-gray-400">Track how the app’s picks have actually performed in wins, losses, and units.</p>
        </div>
        <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-center">
          <p className="meta-label text-accent-blue">Win %</p>
          <p className="mt-1 text-xl font-bold text-white">{winPct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Wins</p>
          <p className="mt-1 text-sm font-bold text-emerald-400">{summary.wins}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Losses</p>
          <p className="mt-1 text-sm font-bold text-red-400">{summary.losses}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Pushes</p>
          <p className="mt-1 text-sm font-bold text-yellow-300">{summary.pushes}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Pending</p>
          <p className="mt-1 text-sm font-bold text-gray-300">{summary.pending}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3 text-center">
          <p className="meta-label">Units</p>
          <p className={`mt-1 text-sm font-bold ${summary.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {summary.profitUnits >= 0 ? "+" : ""}{summary.profitUnits.toFixed(2)}u
          </p>
        </div>
      </div>
    </section>
  );
}

function ProductPickCard({ pick }: { pick: PickHistoryRecord }) {
  return (
    <article className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="card-title truncate">{pick.pick_label}</p>
            <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {pick.league}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-400">
            {pick.team}{pick.opponent ? ` vs ${pick.opponent}` : ""}{pick.player_name ? ` · ${pick.player_name}` : ""}
          </p>
        </div>
        <div className="text-right">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${resultPill(pick.result)}`}>
            {pick.result}
          </span>
          <p className="mt-2 text-sm font-bold text-white">{typeof pick.odds === "number" ? formatAmericanOdds(pick.odds) : "—"}</p>
          <p className="text-[11px] text-gray-500">{pick.units}u</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Date</p>
          <p className="mt-1 text-sm font-semibold text-white">{pick.date}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Logged</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatDate(pick.created_at)}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Book</p>
          <p className="mt-1 text-sm font-semibold text-white">{pick.book || pick.sportsbook || "Tracked"}</p>
        </div>
        <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="meta-label">Hit Rate</p>
          <p className="mt-1 text-sm font-semibold text-white">{typeof pick.hit_rate === "number" ? `${Math.round((Math.abs(pick.hit_rate) <= 1 ? pick.hit_rate * 100 : pick.hit_rate))}%` : "—"}</p>
        </div>
      </div>

      {pick.reasoning ? (
        <div className="mt-3 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
          <p className="section-heading">Why the app liked it</p>
          <p className="mt-2 text-sm text-gray-300">{pick.reasoning}</p>
        </div>
      ) : null}
    </article>
  );
}

function PersonalPickCard({ pick, onResolve, onRemove }: { pick: MyPickEntry; onResolve?: (result: MyPickResult) => void; onRemove: () => void }) {
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
  const { myPicks, buildParlay, setMyPickResult, removeMyPick } = useAppChrome();
  const { loading, picks: historyPicks, error } = usePickHistory();

  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("30d");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const filteredHistory = useMemo(() => {
    return historyPicks
      .filter((pick) => {
        if (sportFilter !== "all" && pick.league !== sportFilter) return false;
        if (resultFilter !== "all" && pick.result !== resultFilter) return false;
        return withinRange(pick.created_at || pick.date, dateFilter);
      })
      .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
  }, [dateFilter, historyPicks, resultFilter, sportFilter]);

  const activePicks = useMemo(() => myPicks.filter((pick) => pick.result === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [myPicks]);
  const availableParlayLegs = activePicks.filter((pick) => pick.kind === "single");

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader title="My Picks" subtitle="Track app results, settled units, and your own saved card." />

      <LockedFeature feature="my_picks">
        <div className="space-y-4 px-4 py-4 lg:px-0">
          <ProductRecordCard picks={filteredHistory} />

          <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="section-heading">Product History</p>
                <h2 className="mt-2 text-lg font-semibold text-white">All tracked picks and results</h2>
                <p className="mt-1 text-sm text-gray-400">This is the app’s settled pick history with units, not just local saves.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "NHL", "NBA", "MLB", "PGA", "Mixed"] as SportFilter[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSportFilter(value)}
                    className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${sportFilter === value ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue" : "border-dark-border bg-dark-bg/60 text-gray-400"}`}
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
                  className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${dateFilter === value ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue" : "border-dark-border bg-dark-bg/60 text-gray-400"}`}
                >
                  {value}
                </button>
              ))}
              {(["all", "win", "loss", "push", "pending"] as ResultFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResultFilter(value)}
                  className={`tap-button rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase ${resultFilter === value ? "border-accent-blue/40 bg-accent-blue/10 text-accent-blue" : "border-dark-border bg-dark-bg/60 text-gray-400"}`}
                >
                  {value}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="mt-4 text-sm text-gray-500">Loading pick history…</p>
            ) : error ? (
              <p className="mt-4 text-sm text-red-300">{error}</p>
            ) : filteredHistory.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
                No picks match this filter yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredHistory.map((pick) => (
                  <ProductPickCard key={pick.id} pick={pick} />
                ))}
              </div>
            )}
          </section>

          <MyPicksRecord picks={myPicks} />

          <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-heading">Personal Tracker</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Your saved card</h2>
                <p className="mt-1 text-sm text-gray-400">Keep local picks, parlays, and manual settles here.</p>
              </div>
              <div className="rounded-2xl border border-dark-border bg-dark-bg/60 px-4 py-3 text-center">
                <p className="meta-label">Open</p>
                <p className="mt-1 text-xl font-bold text-white">{activePicks.length}</p>
              </div>
            </div>

            {activePicks.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
                Add picks from Props, Trends, or AI Picks using the + button.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {activePicks.map((pick) => (
                  <PersonalPickCard
                    key={pick.id}
                    pick={pick}
                    onResolve={pick.kind === "single" ? (result) => setMyPickResult(pick.id, result) : undefined}
                    onRemove={() => removeMyPick(pick.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <ParlayBuilder availablePicks={availableParlayLegs} onCreate={buildParlay} />
        </div>
      </LockedFeature>
    </main>
  );
}
