import Link from "next/link";
import { getSystemDerivedMetrics, getSystemSnapshot, type TrackedSystem } from "@/lib/systems-tracking-store";

type Props = {
  systems: TrackedSystem[];
  updatedAt: string;
  activeLeague?: string;
};

const SYSTEM_LEAGUES = ["All", "NBA", "NHL", "MLB", "NFL"] as const;

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusPill(status: TrackedSystem["status"]) {
  if (status === "tracking") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "paused") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "source_based") return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  if (status === "awaiting_verification") return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  if (status === "definition_only") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

function trackabilityPill(trackability: TrackedSystem["trackabilityBucket"]) {
  if (trackability === "trackable_now") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (trackability === "blocked_missing_data") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function formatStatus(status: TrackedSystem["status"]) {
  return status.replaceAll("_", " ");
}

function formatTrackability(trackability: TrackedSystem["trackabilityBucket"]) {
  if (trackability === "trackable_now") return "Trackable now";
  if (trackability === "blocked_missing_data") return "Blocked by missing data";
  return "Parked / definition only";
}

export default function SystemsOverviewBoard({ systems, updatedAt, activeLeague = "All" }: Props) {
  const filteredSystems = activeLeague === "All"
    ? systems
    : systems.filter((system) => system.league === activeLeague);

  const trackableCount = filteredSystems.filter((system) => system.trackabilityBucket === "trackable_now").length;
  const parkedCount = filteredSystems.filter((system) => system.trackabilityBucket === "parked_definition_only").length;
  const blockedCount = filteredSystems.filter((system) => system.trackabilityBucket === "blocked_missing_data").length;

  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-blue/80">Systems Tracking</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Compact system catalog, honest tracking.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 lg:text-base">
              Browse the Goosalytics system library by league, see which ideas are live versus parked versus blocked, and drill into the exact unlock notes before we claim anything is trackable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:min-w-[620px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Catalog total</p>
              <p className="mt-2 text-2xl font-semibold text-white">{filteredSystems.length}</p>
              <p className="mt-2 text-xs text-gray-400">{activeLeague === "All" ? "Across NBA, NHL, MLB, and NFL." : `${activeLeague} systems only.`}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Trackable now</p>
              <p className="mt-2 text-2xl font-semibold text-white">{trackableCount}</p>
              <p className="mt-2 text-xs text-emerald-200/75">Live/tracked systems only.</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Parked</p>
              <p className="mt-2 text-2xl font-semibold text-white">{parkedCount}</p>
              <p className="mt-2 text-xs text-amber-200/75">Definition exists, rules still need work.</p>
            </div>
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Blocked</p>
              <p className="mt-2 text-2xl font-semibold text-white">{blockedCount}</p>
              <p className="mt-2 text-xs text-red-200/75">Missing feed, source, or pricing inputs.</p>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-gray-400">
          Store updated {formatUpdatedAt(updatedAt)} • File-backed from data/systems-tracking.json.
        </div>
      </section>

      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-heading">League filter</p>
            <p className="mt-1 text-sm text-gray-400">Keep it scannable here. Full rules and unlock notes live on each detail page.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SYSTEM_LEAGUES.map((league) => {
              const active = league === activeLeague;
              return (
                <Link
                  key={league}
                  href={league === "All" ? "/systems" : `/systems?league=${league}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    active
                      ? "border-accent-blue/60 bg-accent-blue/15 text-accent-blue"
                      : "border-dark-border bg-dark-bg/60 text-gray-400 hover:border-white/15 hover:text-white"
                  }`}
                >
                  {league}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {filteredSystems.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-dark-border bg-dark-surface/40 p-5 text-sm text-gray-400">
            No systems are seeded for {activeLeague} yet.
          </div>
        ) : (
          filteredSystems.map((system) => {
            const metrics = getSystemDerivedMetrics(system);
            const snapshot = getSystemSnapshot(system);
            const compactUnlock = system.trackabilityBucket === "trackable_now"
              ? "Live rows are tracked honestly; missing fields stay unresolved instead of guessed."
              : (system.unlockNotes[0] || system.automationStatusDetail);

            return (
              <Link
                key={system.id}
                href={`/systems/${system.slug}`}
                className="block rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.24)] transition hover:border-white/15 hover:bg-dark-surface/90 lg:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{system.league}</span>
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{system.category}</span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${trackabilityPill(system.trackabilityBucket)}`}>
                        {formatTrackability(system.trackabilityBucket)}
                      </span>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusPill(system.status)}`}>
                        {formatStatus(system.status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-xl font-semibold text-white">{system.name}</h2>
                      <span className="w-fit rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
                        {system.automationStatusLabel}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-gray-300">{system.summary}</p>
                  </div>

                  <div className="shrink-0 rounded-2xl border border-dark-border/70 bg-dark-bg/60 px-3 py-2 text-xs font-semibold text-gray-300">
                    View details →
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                    <p className="meta-label">Rule / Snapshot</p>
                    <p className="mt-2 text-sm leading-6 text-gray-300">{snapshot}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                      <p className="meta-label">Tracked rows</p>
                      <p className="mt-2 text-lg font-semibold text-white">{metrics.qualifiedGames}</p>
                      <p className="mt-1 text-xs text-gray-500">Stored qualifiers or record rows.</p>
                    </div>
                    <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                      <p className="meta-label">What blocks or unlocks it</p>
                      <p className="mt-2 text-sm font-semibold text-white">{formatTrackability(system.trackabilityBucket)}</p>
                      <p className="mt-1 text-xs text-gray-500">{compactUnlock}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
