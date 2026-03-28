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

function formatTrackability(trackability: TrackedSystem["trackabilityBucket"]) {
  if (trackability === "trackable_now") return "Trackable";
  if (trackability === "blocked_missing_data") return "Blocked";
  return "Parked";
}

export default function HomeSystemsSection({ systems }: { systems: TrackedSystem[] }) {
  const featuredSystems = sortSystemsForHome(systems).slice(0, 4);

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Systems</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Systems record</h2>
          <p className="mt-1 text-sm text-gray-400">Best live systems, honest record first, drill into details when you want the rulebook.</p>
        </div>
        <Link
          href="/systems"
          className="inline-flex items-center justify-center rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-xs font-semibold text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15"
        >
          View all systems →
        </Link>
      </div>

      <div className="mt-4 grid gap-3">
        {featuredSystems.map((system) => {
          const metrics = getSystemDerivedMetrics(system);
          const recordCopy = metrics.performance.actionable
            ? metrics.performance.record
            : `${metrics.qualifiedGames} qualifiers logged`;
          const netCopy = metrics.performance.actionable && metrics.performance.flatNetUnits != null
            ? `${metrics.performance.flatNetUnits > 0 ? "+" : ""}${metrics.performance.flatNetUnits.toFixed(2)}u`
            : "Qualifier-only";
          const winPctCopy = metrics.performance.actionable && metrics.performance.winPct != null
            ? `${metrics.performance.winPct.toFixed(2)}% win`
            : formatTrackability(system.trackabilityBucket);

          return (
            <Link
              key={system.id}
              href={`/systems/${system.slug}`}
              className="block rounded-2xl border border-dark-border/70 bg-dark-bg/50 p-3 transition hover:border-white/15 hover:bg-dark-surface/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{system.league}</span>
                    <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{winPctCopy}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-white">{system.name}</h3>
                  <p className="mt-1 text-sm text-gray-400">{system.summary}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">{recordCopy}</p>
                  <p className="mt-1 text-xs text-gray-500">{netCopy}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
