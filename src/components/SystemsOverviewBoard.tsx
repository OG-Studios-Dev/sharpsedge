import Link from "next/link";
import { getSystemDerivedMetrics, type TrackedSystem, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

const ML_GRADEABLE_IDS = new Set(["swaggy-stretch-drive", "falcons-fight-pummeled-pitchers"]);
const MIN_SAMPLE_FOR_TIER = 8;

type WinPctTier = "gold" | "neutral" | "weak" | "small_sample";

function getWinPctTier(winPct: number | null, gradedQualifiers: number): WinPctTier {
  if (gradedQualifiers < MIN_SAMPLE_FOR_TIER || winPct === null) return "small_sample";
  if (winPct > 0.6) return "gold";
  if (winPct < 0.5) return "weak";
  return "neutral";
}

function WinPctBadge({ tier, winPct }: { tier: WinPctTier; winPct: number | null }) {
  if (tier === "small_sample" || winPct === null) {
    return <span className="rounded border border-dark-border/50 bg-dark-bg/40 px-1.5 py-0.5 text-[9px] text-gray-600">—%</span>;
  }
  const pct = `${Math.round(winPct * 100)}%`;
  if (tier === "gold") {
    return (
      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
        🏆 {pct}
      </span>
    );
  }
  if (tier === "weak") {
    return (
      <span className="rounded border border-rose-500/20 bg-rose-500/5 px-1.5 py-0.5 text-[9px] font-semibold text-rose-500/60">
        {pct} ↓
      </span>
    );
  }
  return (
    <span className="rounded border border-dark-border/50 bg-dark-bg/40 px-1.5 py-0.5 text-[9px] text-gray-400">
      {pct}
    </span>
  );
}

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
              <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">AI Systems Tracking</h1>
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

      <section className="space-y-1.5">
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

            // Resolved record/units — DB truth first for ML systems
            let recordLabel: string;
            let unitsLabel: string;
            let unitsColor: string;
            let winPctForTier: number | null;
            let gradedForTier: number;

            if (isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0) {
              recordLabel = `${dbPerf.wins}-${dbPerf.losses}${dbPerf.pushes > 0 ? `-${dbPerf.pushes}` : ""}`;
              const nu = dbPerf.flat_net_units != null ? Number(dbPerf.flat_net_units) : null;
              unitsLabel = nu != null ? `${nu > 0 ? "+" : ""}${nu.toFixed(1)}u` : "—";
              unitsColor = nu != null ? (nu > 0 ? "text-emerald-400" : nu < 0 ? "text-rose-400" : "text-gray-400") : "text-gray-500";
              const total = dbPerf.wins + dbPerf.losses;
              winPctForTier = total > 0 ? dbPerf.wins / total : null;
              gradedForTier = dbPerf.graded_qualifiers;
            } else if (metrics.performance.actionable) {
              recordLabel = metrics.performance.record;
              const nu = metrics.performance.flatNetUnits;
              unitsLabel = nu != null ? `${nu > 0 ? "+" : ""}${nu.toFixed(1)}u` : "—";
              unitsColor = nu != null ? (nu > 0 ? "text-emerald-400" : nu < 0 ? "text-rose-400" : "text-gray-400") : "text-gray-500";
              winPctForTier = metrics.performance.winPct;
              gradedForTier = metrics.performance.gradedQualifiers;
            } else if (metrics.qualifiedGames > 0) {
              recordLabel = `${metrics.qualifiedGames}q`;
              unitsLabel = "—";
              unitsColor = "text-gray-500";
              winPctForTier = null;
              gradedForTier = 0;
            } else {
              recordLabel = "—";
              unitsLabel = "—";
              unitsColor = "text-gray-500";
              winPctForTier = null;
              gradedForTier = 0;
            }

            const tier = getWinPctTier(winPctForTier, gradedForTier);
            const rowOpacity = tier === "weak" ? "opacity-70" : "";

            const trackDot =
              system.trackabilityBucket === "trackable_now" ? "🟢"
              : system.trackabilityBucket === "blocked_missing_data" ? "🔴"
              : "🟡";

            return (
              <Link
                key={system.id}
                href={`/systems/${system.slug}`}
                className={`block rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] transition hover:border-white/15 hover:bg-dark-surface/90 ${rowOpacity}`}
              >
                {/* Compact scan row — always visible, tappable */}
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="text-[11px] leading-none shrink-0">{trackDot}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded border border-dark-border/70 bg-dark-bg/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">{system.league}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${trackabilityPill(system.trackabilityBucket)}`}>
                        {formatTrackability(system.trackabilityBucket)}
                      </span>
                      <WinPctBadge tier={tier} winPct={winPctForTier} />
                    </div>
                    <h2 className="mt-0.5 text-[13px] font-semibold leading-tight text-white">{system.name}</h2>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-xs font-bold text-white tabular-nums">{recordLabel}</span>
                    <span className={`text-[11px] font-semibold tabular-nums ${unitsColor}`}>{unitsLabel}</span>
                  </div>
                </div>

                {/* Detail row — hidden on mobile, visible on sm+ */}
                <div className="hidden sm:block border-t border-dark-border/40 px-3 pb-3 pt-2">
                  <p className="text-xs leading-5 text-gray-400">{system.summary}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Tracked record</p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {isMLGradeable && hasDbRecord && dbPerf.graded_qualifiers > 0
                          ? `${dbPerf.wins}-${dbPerf.losses}${dbPerf.pushes > 0 ? `-${dbPerf.pushes}` : ""} ML`
                          : isMLGradeable && hasDbRecord
                          ? `${dbPerf.qualifiers_logged} qualifiers (${dbPerf.pending} pending grade)`
                          : metrics.performance.actionable
                          ? metrics.performance.record
                          : `${metrics.qualifiedGames} qualifiers logged`}
                      </p>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {isMLGradeable
                          ? (hasDbRecord && dbPerf.graded_qualifiers > 0
                            ? `${dbPerf.graded_qualifiers} graded ML qualifiers (Supabase).`
                            : "ML grading path live — awaiting graded outcomes.")
                          : metrics.performance.actionable
                          ? `${metrics.performance.gradedQualifiers} graded rows`
                          : "Qualifier-only until action rule is mature."}
                      </p>
                    </div>
                    <div className="rounded-xl border border-dark-border/70 bg-dark-bg/60 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Net units</p>
                      <p className={`mt-1 text-sm font-semibold ${
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
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        {isMLGradeable
                          ? "Flat 1u ML payout from graded qualifiers."
                          : metrics.performance.actionable
                          ? "Flat 1u tracking from settled rows."
                          : "Hidden until settlement rules are live."}
                      </p>
                    </div>
                  </div>
                  {/* Win% honesty note */}
                  {gradedForTier > 0 && gradedForTier < MIN_SAMPLE_FOR_TIER && (
                    <p className="mt-2 text-[10px] text-amber-500/70">
                      Small sample ({gradedForTier} graded) — win% not yet meaningful.
                    </p>
                  )}
                  {tier === "gold" && (
                    <p className="mt-2 text-[10px] text-amber-300/70">
                      🏆 Gold system — {Math.round((winPctForTier ?? 0) * 100)}% win rate over {gradedForTier} graded qualifiers.
                    </p>
                  )}
                  {tier === "weak" && (
                    <p className="mt-2 text-[10px] text-rose-500/60">
                      Below 50% win rate over {gradedForTier} graded qualifiers — not profitable at current sample.
                    </p>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
