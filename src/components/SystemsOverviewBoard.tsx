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
  if (trackability === "blocked_missing_data") return "Blocked";
  return "Parked";
}

function CompactMetaCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "emerald" | "amber" | "red" }) {
  const toneClass = tone === "emerald"
    ? "border-emerald-500/20 bg-emerald-500/5"
    : tone === "amber"
      ? "border-amber-500/20 bg-amber-500/5"
      : tone === "red"
        ? "border-red-500/20 bg-red-500/5"
        : "border-white/10 bg-white/5";

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

export default function SystemsOverviewBoard({ systems, updatedAt, activeLeague = "All" }: Props) {
  const filteredSystems = activeLeague === "All"
    ? systems
    : systems.filter((system) => system.league === activeLeague);

  const trackableCount = filteredSystems.filter((system) => system.trackabilityBucket === "trackable_now").length;
  const parkedCount = filteredSystems.filter((system) => system.trackabilityBucket === "parked_definition_only").length;
  const blockedCount = filteredSystems.filter((system) => system.trackabilityBucket === "blocked_missing_data").length;

  return (
    <div className="space-y-4 px-4 py-3 lg:px-0 lg:py-4">
      <section className="rounded-[24px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-blue/80">Systems</p>
              <details className="group relative">
                <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-gray-300 transition hover:border-white/20 hover:text-white">
                  i
                </summary>
                <div className="absolute left-0 top-8 z-10 w-[min(18rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-[#0f131b] p-3 text-xs leading-5 text-gray-300 shadow-2xl">
                  Browse the catalog by league, see what is live vs parked vs blocked, and drill into the detail page for qualifier rules plus unlock notes.
                </div>
              </details>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">Systems</h1>
              <p className="text-xs text-gray-400">Updated {formatUpdatedAt(updatedAt)}</p>
            </div>
          </div>

          <div className="hidden sm:grid sm:grid-cols-4 sm:gap-2">
            <CompactMetaCard label="Total" value={filteredSystems.length} />
            <CompactMetaCard label="Trackable" value={trackableCount} tone="emerald" />
            <CompactMetaCard label="Parked" value={parkedCount} tone="amber" />
            <CompactMetaCard label="Blocked" value={blockedCount} tone="red" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SYSTEM_LEAGUES.map((league) => {
            const active = league === activeLeague;
            return (
              <Link
                key={league}
                href={league === "All" ? "/systems" : `/systems?league=${league}`}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
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

        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <CompactMetaCard label="Total" value={filteredSystems.length} />
          <CompactMetaCard label="Trackable" value={trackableCount} tone="emerald" />
          <CompactMetaCard label="Parked" value={parkedCount} tone="amber" />
          <CompactMetaCard label="Blocked" value={blockedCount} tone="red" />
        </div>
      </section>

      <section className="space-y-2.5">
        {filteredSystems.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-dark-border bg-dark-surface/40 p-5 text-sm text-gray-400">
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
                className="block rounded-[24px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-3.5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] transition hover:border-white/15 hover:bg-dark-surface/90 lg:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{system.league}</span>
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">{system.category}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${trackabilityPill(system.trackabilityBucket)}`}>
                        {formatTrackability(system.trackabilityBucket)}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusPill(system.status)}`}>
                        {formatStatus(system.status)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="text-lg font-semibold text-white sm:text-xl">{system.name}</h2>
                      <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300">
                        {system.automationStatusLabel}
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-gray-300">{system.summary}</p>
                  </div>

                  <div className="shrink-0 rounded-full border border-dark-border/80 bg-dark-bg/60 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                    Details →
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_repeat(2,minmax(0,0.7fr))]">
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Quick scan</p>
                    <p className="mt-1.5 text-sm leading-5 text-gray-300">{snapshot}</p>
                  </div>
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Tracked rows</p>
                    <p className="mt-1.5 text-base font-semibold text-white">{metrics.qualifiedGames}</p>
                    <p className="mt-1 text-xs text-gray-500">Stored qualifiers or record rows.</p>
                  </div>
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3 sm:col-span-1 col-span-full">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Unlock note</p>
                    <p className="mt-1.5 text-sm font-semibold text-white">{formatTrackability(system.trackabilityBucket)}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{compactUnlock}</p>
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
