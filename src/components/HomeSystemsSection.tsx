import Link from "next/link";
import { getSystemDerivedMetrics, type TrackedSystem, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

function sortSystemsForHome(systems: TrackedSystem[]) {
  const priorityMap: Record<string, number> = {
    "nba-goose-system": 0,
    "swaggy-stretch-drive": 1,
    "falcons-fight-pummeled-pitchers": 2,
    "tonys-hot-bats": 3,
    "robbies-ripper-fast-5": 4,
    "the-blowout": 5,
    "hot-teams-matchup": 6,
  };

  return [...systems].sort((a, b) => {
    const aTrackable = a.trackabilityBucket === "trackable_now" ? 0 : 1;
    const bTrackable = b.trackabilityBucket === "trackable_now" ? 0 : 1;
    if (aTrackable !== bTrackable) return aTrackable - bTrackable;

    const aActionable = getSystemDerivedMetrics(a).performance.actionable ? 0 : 1;
    const bActionable = getSystemDerivedMetrics(b).performance.actionable ? 0 : 1;
    if (aActionable !== bActionable) return aActionable - bActionable;

    const aPriority = priorityMap[a.slug] ?? 999;
    const bPriority = priorityMap[b.slug] ?? 999;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return a.name.localeCompare(b.name);
  });
}

type Props = {
  systems: TrackedSystem[];
  dbPerformance?: DbSystemPerformanceSummary[];
};

const ML_GRADEABLE_IDS = new Set(["swaggy-stretch-drive", "falcons-fight-pummeled-pitchers"]);

export default function HomeSystemsSection({ systems, dbPerformance = [] }: Props) {
  const featuredSystems = sortSystemsForHome(systems).slice(0, 6);
  const dbPerfMap = new Map(dbPerformance.map((p) => [p.system_id, p]));

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-white">AI Systems Tracking</h2>
        <Link
          href="/systems"
          className="shrink-0 text-xs font-medium text-accent-blue hover:text-accent-blue/80 transition"
        >
          All →
        </Link>
      </div>

      <div className="mt-3 space-y-1">
        {featuredSystems.map((system) => {
          const metrics = getSystemDerivedMetrics(system);
          const perf = metrics.performance;
          const dbPerf = dbPerfMap.get(system.id);
          const isMLGradeable = ML_GRADEABLE_IDS.has(system.id);
          const hasDbRecord = dbPerf && (dbPerf.graded_qualifiers > 0 || dbPerf.qualifiers_logged > 0);

          // Prefer DB truth for ML-gradeable systems
          let recordCopy: string;
          let unitsCopy: string;
          let unitsClass: string;

          if (isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0) {
            recordCopy = `${dbPerf.wins}-${dbPerf.losses}${dbPerf.pushes > 0 ? `-${dbPerf.pushes}` : ""}`;
            const netU = dbPerf.flat_net_units != null ? Number(dbPerf.flat_net_units) : null;
            unitsCopy = netU != null ? `${netU > 0 ? "+" : ""}${netU.toFixed(1)}u` : "—";
            unitsClass = netU != null
              ? netU > 0 ? "text-emerald-400" : netU < 0 ? "text-rose-400" : "text-gray-400"
              : "text-gray-500";
          } else if (perf.actionable) {
            recordCopy = perf.record;
            unitsCopy = perf.flatNetUnits != null
              ? `${perf.flatNetUnits > 0 ? "+" : ""}${perf.flatNetUnits.toFixed(1)}u`
              : "—";
            unitsClass = perf.flatNetUnits != null
              ? perf.flatNetUnits > 0 ? "text-emerald-400" : perf.flatNetUnits < 0 ? "text-rose-400" : "text-gray-400"
              : "text-gray-500";
          } else if (metrics.qualifiedGames > 0) {
            recordCopy = `${metrics.qualifiedGames}q`;
            unitsCopy = "—";
            unitsClass = "text-gray-500";
          } else {
            recordCopy = "—";
            unitsCopy = "—";
            unitsClass = "text-gray-500";
          }

          // Compact status badge
          const statusDot =
            system.trackabilityBucket === "trackable_now"
              ? "🟢"
              : system.trackabilityBucket === "blocked_missing_data"
              ? "🔴"
              : "🟡";

          return (
            <Link
              key={system.id}
              href={`/systems/${system.slug}`}
              className="flex items-center gap-2 rounded-lg border border-dark-border/60 bg-dark-bg/40 px-2.5 py-2 transition hover:border-white/15 hover:bg-dark-surface/60"
            >
              <span className="text-[10px] leading-none">{statusDot}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white leading-tight">{system.name}</span>
              <span className="shrink-0 text-[11px] font-semibold text-white tabular-nums">{recordCopy}</span>
              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${unitsClass}`}>{unitsCopy}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
