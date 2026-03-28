import Link from "next/link";
import { getSystemDerivedMetrics, type TrackedSystem, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

const ML_GRADEABLE_IDS = new Set(["swaggy-stretch-drive", "falcons-fight-pummeled-pitchers"]);

type Props = {
  systems: TrackedSystem[];
  updatedAt: string;
  activeLeague?: string;
  dbPerformance?: DbSystemPerformanceSummary[];
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

function sortSystemsForDisplay(systems: TrackedSystem[]) {
  const priorityMap: Record<string, number> = {
    "nba-goose": 0,
    "blowout-alert": 1,
    "hot-teams": 2,
    "swaggy-stretch-drive": 3,
    "tonys-hot-bats": 4,
    "falcons-f5": 5,
  };

  return [...systems].sort((a, b) => {
    const aTrackable = a.trackabilityBucket === "trackable_now" ? 0 : 1;
    const bTrackable = b.trackabilityBucket === "trackable_now" ? 0 : 1;
    if (aTrackable !== bTrackable) return aTrackable - bTrackable;

    const aPriority = priorityMap[a.slug] ?? 999;
    const bPriority = priorityMap[b.slug] ?? 999;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return a.name.localeCompare(b.name);
  });
}

export default function SystemsOverviewBoard({ systems, updatedAt, activeLeague = "All", dbPerformance = [] }: Props) {
  const filteredSystems = activeLeague === "All"
    ? systems
    : systems.filter((system) => system.league === activeLeague);

  const orderedSystems = sortSystemsForDisplay(filteredSystems);
  const dbPerfMap = new Map(dbPerformance.map((p) => [p.system_id, p]));

  return (
    <div className="space-y-4 px-4 py-3 lg:px-0 lg:py-4">
      <section className="rounded-[24px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-blue/80">Systems</p>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">Systems</h1>
              <p className="text-xs text-gray-400">Updated {formatUpdatedAt(updatedAt)}</p>
            </div>
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

      </section>

      <section className="space-y-2.5">
        {orderedSystems.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-dark-border bg-dark-surface/40 p-5 text-sm text-gray-400">
            No systems are seeded for {activeLeague} yet.
          </div>
        ) : (
          orderedSystems.map((system) => {
            const metrics = getSystemDerivedMetrics(system);
            const dbPerf = dbPerfMap.get(system.id);
            const isMLGradeable = ML_GRADEABLE_IDS.has(system.id);
            const isGoose = system.id === "nba-goose-system";
            const hasDbRecord = dbPerf && (dbPerf.graded_qualifiers > 0 || dbPerf.qualifiers_logged > 0);

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
                      {/* DB W/L badge for ML-gradeable systems */}
                      {isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0 && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <span className="text-emerald-400">{dbPerf.wins}</span>
                          <span className="text-gray-500">-</span>
                          <span className="text-rose-400">{dbPerf.losses}</span>
                          {dbPerf.pushes > 0 && <span className="text-yellow-400">-{dbPerf.pushes}</span>}
                          {dbPerf.win_pct != null && (
                            <span className="ml-1 text-gray-400">({Number(dbPerf.win_pct).toFixed(0)}%)</span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="text-lg font-semibold text-white sm:text-xl">{system.name}</h2>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-gray-300">{system.summary}</p>
                  </div>

                  <div className="shrink-0 rounded-full border border-dark-border/80 bg-dark-bg/60 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                    Details →
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Tracked record</p>
                    <p className="mt-1.5 text-base font-semibold text-white">
                      {/* Prefer DB graded data for ML systems */}
                      {isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0
                        ? `${dbPerf.wins}-${dbPerf.losses}${dbPerf.pushes > 0 ? `-${dbPerf.pushes}` : ""} ML`
                        : isMLGradeable && hasDbRecord
                        ? `${dbPerf.qualifiers_logged} qualifiers (${dbPerf.pending} pending grade)`
                        : metrics.performance.actionable
                        ? metrics.performance.record
                        : `${metrics.qualifiedGames} qualifiers logged`}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {isMLGradeable
                        ? (hasDbRecord && dbPerf.graded_qualifiers > 0
                          ? `${dbPerf.graded_qualifiers} graded ML qualifier${dbPerf.graded_qualifiers === 1 ? "" : "s"} (Supabase).`
                          : "ML grading path live — awaiting graded outcomes.")
                        : metrics.performance.actionable
                        ? `${metrics.performance.gradedQualifiers} graded rows${metrics.performance.ungradeable ? ` • ${metrics.performance.ungradeable} ungradeable excluded` : ""}`
                        : "Qualifier-only until a real action rule is mature."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Net units</p>
                    <p className={`mt-1.5 text-base font-semibold ${
                      isMLGradeable && dbPerf?.flat_net_units != null
                        ? Number(dbPerf.flat_net_units) > 0 ? "text-emerald-400" : Number(dbPerf.flat_net_units) < 0 ? "text-rose-400" : "text-yellow-400"
                        : "text-white"
                    }`}>
                      {isMLGradeable && dbPerf?.flat_net_units != null
                        ? `${Number(dbPerf.flat_net_units) > 0 ? "+" : ""}${Number(dbPerf.flat_net_units).toFixed(2)}u`
                        : metrics.performance.actionable && metrics.performance.flatNetUnits != null
                        ? `${metrics.performance.flatNetUnits > 0 ? "+" : ""}${metrics.performance.flatNetUnits.toFixed(2)}u`
                        : "N/A"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {isMLGradeable
                        ? "Flat 1u ML payout from graded qualifiers."
                        : metrics.performance.actionable
                        ? "Flat 1u tracking from settled rows only."
                        : "Hidden until the system has honest settlement rules."}
                    </p>
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
