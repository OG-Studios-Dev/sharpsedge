import Link from "next/link";
import { getSystemDerivedMetrics, type TrackedSystem } from "@/lib/systems-tracking-store";

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

export default function HomeSystemsSection({ systems }: { systems: TrackedSystem[] }) {
  const featuredSystems = sortSystemsForHome(systems).slice(0, 5);

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Systems</p>
          <h2 className="mt-0.5 text-base font-semibold text-white">Live record</h2>
        </div>
        <Link
          href="/systems"
          className="text-xs font-medium text-accent-blue hover:text-accent-blue/80 transition"
        >
          All systems →
        </Link>
      </div>

      <div className="mt-3 space-y-1.5">
        {featuredSystems.map((system) => {
          const metrics = getSystemDerivedMetrics(system);
          const perf = metrics.performance;

          const recordCopy = perf.actionable
            ? perf.record
            : metrics.qualifiedGames > 0
              ? `${metrics.qualifiedGames} qual.`
              : "—";

          const unitsCopy = perf.actionable && perf.flatNetUnits != null
            ? `${perf.flatNetUnits > 0 ? "+" : ""}${perf.flatNetUnits.toFixed(1)}u`
            : "—";

          const unitsClass = perf.actionable && perf.flatNetUnits != null
            ? perf.flatNetUnits > 0
              ? "text-emerald-400"
              : perf.flatNetUnits < 0
                ? "text-rose-400"
                : "text-gray-400"
            : "text-gray-500";

          return (
            <Link
              key={system.id}
              href={`/systems/${system.slug}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-dark-border/60 bg-dark-bg/40 px-3 py-2.5 transition hover:border-white/15 hover:bg-dark-surface/60"
            >
              <span className="min-w-0 truncate text-sm font-medium text-white">{system.name}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-semibold text-white">{recordCopy}</span>
                <span className={`text-xs font-semibold ${unitsClass}`}>{unitsCopy}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
