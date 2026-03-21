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

function readinessTone(isReady: boolean) {
  return isReady
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function formatStatus(status: TrackedSystem["status"]) {
  return status.replaceAll("_", " ");
}

export default function SystemsOverviewBoard({ systems, updatedAt, activeLeague = "All" }: Props) {
  const filteredSystems = activeLeague === "All"
    ? systems
    : systems.filter((system) => system.league === activeLeague);

  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-blue/80">Systems Tracking</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Compact system catalog, honest tracking.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 lg:text-base">
              Browse the current Goosalytics system library by league, see what is actually live versus definition-only, and drill into the full rules and notes on each system page.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Systems live</p>
              <p className="mt-2 text-2xl font-semibold text-white">{systems.length}</p>
              <p className="mt-2 text-xs text-gray-400">Catalog is seeded across NBA, NHL, MLB, and NFL.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Store updated</p>
              <p className="mt-2 text-base font-semibold text-white">{formatUpdatedAt(updatedAt)}</p>
              <p className="mt-2 text-xs text-gray-400">File-backed from data/systems-tracking.json.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-heading">League filter</p>
            <p className="mt-1 text-sm text-gray-400">Tight overview first. Full rules live on each detail page.</p>
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
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusPill(system.status)}`}>
                        {formatStatus(system.status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-xl font-semibold text-white">{system.name}</h2>
                      <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${readinessTone(metrics.ingestionReady)}`}>
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
                      <p className="meta-label">Data readiness</p>
                      <p className="mt-2 text-sm font-semibold text-white">{system.automationStatusLabel}</p>
                      <p className="mt-1 text-xs text-gray-500">{system.automationStatusDetail}</p>
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
