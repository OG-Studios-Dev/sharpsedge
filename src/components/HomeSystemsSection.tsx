import Link from "next/link";
import { getSystemDerivedMetrics, type TrackedSystem, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

const ML_GRADEABLE_IDS = new Set(["swaggy-stretch-drive", "falcons-fight-pummeled-pitchers", "robbies-ripper-fast-5", "nba-goose-system"]);
const MIN_SAMPLE_FOR_TIER = 8; // minimum graded qualifiers before we display a tier
const OFFLINE_SYSTEM_IDS = new Set(["the-blowout", "hot-teams-matchup", "tonys-hot-bats"]);

type WinPctTier = "gold" | "neutral" | "weak" | "small_sample";

function getWinPctTier(winPct: number | null, gradedQualifiers: number): WinPctTier {
  if (gradedQualifiers < MIN_SAMPLE_FOR_TIER || winPct === null) return "small_sample";
  if (winPct > 0.6) return "gold";
  if (winPct < 0.5) return "weak";
  return "neutral";
}

function WinPctBadge({ tier, winPct }: { tier: WinPctTier; winPct: number | null }) {
  if (tier === "small_sample" || winPct === null) {
    return <span className="shrink-0 text-[9px] text-gray-600 tabular-nums">—%</span>;
  }
  const pct = `${Math.round(winPct * 100)}%`;
  if (tier === "gold") {
    return (
      <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-300 tabular-nums">
        🏆 {pct}
      </span>
    );
  }
  if (tier === "weak") {
    return (
      <span className="shrink-0 rounded border border-rose-500/20 bg-rose-500/5 px-1 py-0.5 text-[9px] font-semibold text-rose-500/70 tabular-nums">
        {pct}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[9px] text-gray-400 tabular-nums">{pct}</span>
  );
}

function sortSystemsForHome(systems: TrackedSystem[], dbPerfMap: Map<string, DbSystemPerformanceSummary>) {
  const priorityMap: Record<string, number> = {
    "nba-goose-system": 0,
    "robbies-ripper-fast-5": 1,
    "swaggy-stretch-drive": 2,
    "falcons-fight-pummeled-pitchers": 3,
    "tonys-hot-bats": 4,
    "the-blowout": 5,
    "hot-teams-matchup": 6,
  };

  return [...systems].sort((a, b) => {
    const aTrackable = a.trackabilityBucket === "trackable_now" ? 0 : 1;
    const bTrackable = b.trackabilityBucket === "trackable_now" ? 0 : 1;
    if (aTrackable !== bTrackable) return aTrackable - bTrackable;

    const aPerf = dbPerfMap.get(a.id);
    const bPerf = dbPerfMap.get(b.id);
    const aLive = (aPerf?.qualifiers_logged ?? 0) > 0 || a.records.some((r) => Boolean(r.qualifiedTeam)) ? 0 : 1;
    const bLive = (bPerf?.qualifiers_logged ?? 0) > 0 || b.records.some((r) => Boolean(r.qualifiedTeam)) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;

    const aWatch = OFFLINE_SYSTEM_IDS.has(a.id) ? 1 : 0;
    const bWatch = OFFLINE_SYSTEM_IDS.has(b.id) ? 1 : 0;
    if (aWatch !== bWatch) return aWatch - bWatch;

    const aActionable = getSystemDerivedMetrics(a).performance.actionable ? 0 : 1;
    const bActionable = getSystemDerivedMetrics(b).performance.actionable ? 0 : 1;
    if (aActionable !== bActionable) return aActionable - bActionable;

    const aPriority = priorityMap[a.slug] ?? 999;
    const bPriority = priorityMap[b.slug] ?? 999;
    if (aPriority !== bPriority) return aPriority - bPriority;

    return a.name.localeCompare(b.name);
  });
}


function getSystemInsightLine(
  tier: WinPctTier,
  recordCopy: string,
  unitsCopy: string,
  qualifiedGames: number,
): string {
  if (tier === "gold") return `Firing · ${recordCopy} · ${unitsCopy}`;
  if (tier === "neutral") return `Steady · ${recordCopy} · ${unitsCopy}`;
  if (tier === "weak") return `Slipping · ${recordCopy}`;
  if (qualifiedGames > 0) return `${qualifiedGames} qualifiers tracked`;
  return "Watching for setups";
}

type Props = {
  systems: TrackedSystem[];
  dbPerformance?: DbSystemPerformanceSummary[];
};

export default function HomeSystemsSection({ systems, dbPerformance = [] }: Props) {
  const dbPerfMap = new Map(dbPerformance.map((p) => [p.system_id, p]));
  // Show top 3 only — compact homepage real estate
  const featuredSystems = sortSystemsForHome(systems, dbPerfMap).slice(0, 3);

  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Systems</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">What&apos;s working, what&apos;s not</p>
        </div>
        <Link
          href="/systems"
          className="shrink-0 text-xs font-medium text-accent-blue hover:text-accent-blue/80 transition"
        >
          See all →
        </Link>
      </div>

      <div className="mt-3 space-y-1">
        {featuredSystems.map((system) => {
          const metrics = getSystemDerivedMetrics(system);
          const perf = metrics.performance;
          const dbPerf = dbPerfMap.get(system.id);
          const isMLGradeable = ML_GRADEABLE_IDS.has(system.id);
          const hasDbRecord = dbPerf && (dbPerf.graded_qualifiers > 0 || dbPerf.qualifiers_logged > 0);

          // Resolve record display — DB truth first for ML-gradeable systems
          let recordCopy: string;
          let unitsCopy: string;
          let unitsClass: string;
          let winPctForTier: number | null;
          let gradedForTier: number;

          if (isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0) {
            recordCopy = `${dbPerf.wins}-${dbPerf.losses}${dbPerf.pushes > 0 ? `-${dbPerf.pushes}` : ""}`;
            const netU = dbPerf.flat_net_units != null ? Number(dbPerf.flat_net_units) : null;
            unitsCopy = netU != null ? `${netU > 0 ? "+" : ""}${netU.toFixed(1)}u` : "—";
            unitsClass = netU != null
              ? netU > 0 ? "text-emerald-400" : netU < 0 ? "text-rose-400" : "text-gray-400"
              : "text-gray-500";
            const total = dbPerf.wins + dbPerf.losses;
            winPctForTier = total > 0 ? dbPerf.wins / total : null;
            gradedForTier = dbPerf.graded_qualifiers;
          } else if (perf.actionable) {
            recordCopy = perf.record;
            unitsCopy = perf.flatNetUnits != null
              ? `${perf.flatNetUnits > 0 ? "+" : ""}${perf.flatNetUnits.toFixed(1)}u`
              : "—";
            unitsClass = perf.flatNetUnits != null
              ? perf.flatNetUnits > 0 ? "text-emerald-400" : perf.flatNetUnits < 0 ? "text-rose-400" : "text-gray-400"
              : "text-gray-500";
            winPctForTier = perf.winPct;
            gradedForTier = perf.gradedQualifiers;
          } else if (metrics.qualifiedGames > 0) {
            recordCopy = `${metrics.qualifiedGames}q`;
            unitsCopy = "—";
            unitsClass = "text-gray-500";
            winPctForTier = null;
            gradedForTier = 0;
          } else {
            recordCopy = "—";
            unitsCopy = "—";
            unitsClass = "text-gray-500";
            winPctForTier = null;
            gradedForTier = 0;
          }

          const tier = getWinPctTier(winPctForTier, gradedForTier);
          const isOfflineSystem = OFFLINE_SYSTEM_IDS.has(system.id);
          const liveQualifierCount = dbPerf?.qualifiers_logged ?? system.records.filter((record) => Boolean(record.qualifiedTeam)).length;

          // Row opacity/muting based on tier
          const rowOpacity = tier === "weak" ? "opacity-60" : "";

          // Compact status dot
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
              className={`flex items-center gap-2 rounded-lg border border-dark-border/60 bg-dark-bg/40 px-2.5 py-2 transition hover:border-white/15 hover:bg-dark-surface/60 ${rowOpacity}`}
            >
              <span className="text-[10px] leading-none">{statusDot}</span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white leading-tight">{system.name}</span>
                <span className="block truncate text-[10px] text-gray-500 mt-0.5">
                  {isOfflineSystem
                    ? "Off — waiting on rules/data to make this a real live system"
                    : liveQualifierCount > 0
                    ? `${liveQualifierCount} live qualifier${liveQualifierCount === 1 ? "" : "s"} • ${getSystemInsightLine(tier, recordCopy, unitsCopy, metrics.qualifiedGames)}`
                    : getSystemInsightLine(tier, recordCopy, unitsCopy, metrics.qualifiedGames)}
                </span>
              </div>
              <WinPctBadge tier={tier} winPct={winPctForTier} />
              <span className="shrink-0 text-[11px] font-semibold text-white tabular-nums">{recordCopy}</span>
              <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${unitsClass}`}>{unitsCopy}</span>
            </Link>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">
        🏆 = win rate above 60% · muted = below 50% · shown after {MIN_SAMPLE_FOR_TIER}+ games
      </p>
    </section>
  );
}
