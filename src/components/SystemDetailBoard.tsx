import Link from "next/link";
import type { NHLContextBoardResponse } from "@/lib/nhl-context";
import {
  getSystemDerivedMetrics,
  type TrackedSystem,
  type DbSystemPerformanceSummary,
  type DbSystemQualifier,
} from "@/lib/systems-tracking-store";
import SystemNhlContextBoard from "@/components/SystemNhlContextBoard";
import SystemQualifierHistoryToggle from "@/components/SystemQualifierHistoryToggle";

// Systems that have a real ML bet direction and can be W/L graded
const ML_GRADEABLE_IDS = new Set([
  "swaggy-stretch-drive",
  "falcons-fight-pummeled-pitchers",
  "robbies-ripper-fast-5",
  "nba-goose-system",
]);

// ─── Status helpers ──────────────────────────────────────────────────────────

function snapshotBadgeStyle(snapshot: string | null | undefined) {
  if (!snapshot) return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  if (snapshot.startsWith("🟢") || snapshot.includes("FIRING"))
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (snapshot.startsWith("🔴") || snapshot.includes("BLOCKED") || snapshot.includes("Blocked"))
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  if (snapshot.startsWith("🟡") || snapshot.includes("WATCHLIST"))
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (snapshot.startsWith("🟠") || snapshot.includes("DORMANT") || snapshot.includes("Parked"))
    return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

function leaguePill(league: string) {
  return "rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400";
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatUnits(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value.toFixed(1)}u`;
  return `${value.toFixed(1)}u`;
}

// ─── Currently qualified games ───────────────────────────────────────────────

/** Separate qualifier-firing records from monitoring/context-only records */
function classifyRecords(system: TrackedSystem) {
  const qualified = system.records.filter(
    (r) => r.qualifiedTeam && !r.alertLabel?.toLowerCase().includes("no trigger"),
  );
  const monitoring = system.records.filter(
    (r) => !r.qualifiedTeam || r.alertLabel?.toLowerCase().includes("no trigger"),
  );
  return { qualified, monitoring };
}

function formatSpread(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function QualifiedGameCard({ record }: { record: TrackedSystem["records"][0] }) {
  const hasQuarterLines = record.firstQuarterSpread != null || record.thirdQuarterSpread != null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white leading-snug">{record.matchup}</p>
          <p className="mt-0.5 text-xs text-gray-400">{record.gameDate}</p>
        </div>
        {record.qualifiedTeam && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 whitespace-nowrap">
            ✓ {record.qualifiedTeam}
          </span>
        )}
      </div>

      {hasQuarterLines && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-dark-border/60 pt-3">
          <div className="rounded-xl border border-dark-border bg-dark-bg/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">1Q spread</p>
            <p className="mt-1 text-base font-semibold text-white">{formatSpread(record.firstQuarterSpread)}</p>
          </div>
          <div className="rounded-xl border border-dark-border bg-dark-bg/50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">3Q spread</p>
            <p className="mt-1 text-base font-semibold text-white">{formatSpread(record.thirdQuarterSpread)}</p>
          </div>
        </div>
      )}

      {record.notes && (
        <p className="mt-3 text-sm leading-relaxed text-gray-300 border-t border-dark-border/60 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 block mb-1">
            Why qualified
          </span>
          {record.notes}
        </p>
      )}
      {record.alertLabel && !record.alertLabel.toLowerCase().includes("no trigger") && (
        <p className="mt-2 text-xs text-gray-500">{record.alertLabel}</p>
      )}
    </div>
  );
}

function CurrentQualifiersSection({ system }: { system: TrackedSystem }) {
  const { qualified, monitoring } = classifyRecords(system);
  const isBlocked =
    system.snapshot?.includes("BLOCKED") ||
    system.snapshot?.startsWith("🔴") ||
    system.snapshot?.toLowerCase().startsWith("blocked");
  const isParked =
    system.snapshot?.includes("Parked") ||
    system.snapshot?.includes("DORMANT") ||
    system.snapshot?.startsWith("🟠");

  if (qualified.length > 0) {
    return (
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <p className="section-heading">Today&apos;s qualifiers</p>
        <h2 className="mt-2 text-lg font-semibold text-white">
          {qualified.length} game{qualified.length === 1 ? "" : "s"} fired
        </h2>
        <div className="mt-4 space-y-3">
          {qualified.map((r) => (
            <QualifiedGameCard key={r.id} record={r} />
          ))}
        </div>
      </section>
    );
  }

  if (isBlocked || isParked) {
    return (
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <p className="section-heading">Today&apos;s qualifiers</p>
        <div className="mt-3 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4">
          <p className="text-sm text-gray-400">{system.snapshot ?? "System is not qualifying right now."}</p>
        </div>
      </section>
    );
  }

  if (monitoring.length > 0) {
    return (
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <p className="section-heading">Today&apos;s qualifiers</p>
        <h2 className="mt-2 text-lg font-semibold text-white">No triggers today</h2>
        <p className="mt-1 text-sm text-gray-400">
          Monitoring {monitoring.length} game{monitoring.length === 1 ? "" : "s"} — no qualifiers fired yet.
        </p>
        {system.snapshot && (
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">{system.snapshot}</p>
        )}
      </section>
    );
  }

  // No records at all
  return (
    <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
      <p className="section-heading">Today&apos;s qualifiers</p>
      <div className="mt-3 rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4">
        <p className="text-sm text-gray-400">
          {system.snapshot ?? "No qualifier data available yet for today."}
        </p>
      </div>
    </section>
  );
}

// ─── Performance summary strip ───────────────────────────────────────────────

function PerformanceStrip({
  systemId,
  dbPerformance,
}: {
  systemId: string;
  dbPerformance: DbSystemPerformanceSummary[];
}) {
  const perf = dbPerformance.find((p) => p.system_id === systemId);
  const isMLGradeable = ML_GRADEABLE_IDS.has(systemId);
  if (!perf) return null;

  const winPct = perf.win_pct != null ? `${Number(perf.win_pct).toFixed(1)}%` : "—";
  const netUnits =
    perf.flat_net_units != null
      ? `${Number(perf.flat_net_units) > 0 ? "+" : ""}${Number(perf.flat_net_units).toFixed(2)}u`
      : "—";
  const netUnitsColor =
    perf.flat_net_units == null
      ? "text-gray-400"
      : Number(perf.flat_net_units) > 0
        ? "text-emerald-400"
        : Number(perf.flat_net_units) < 0
          ? "text-rose-400"
          : "text-yellow-400";
  const winPctColor =
    perf.win_pct == null
      ? "text-gray-400"
      : Number(perf.win_pct) >= 55
        ? "text-emerald-400"
        : Number(perf.win_pct) >= 50
          ? "text-yellow-400"
          : "text-rose-400";

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
        <p className="meta-label">Qualifiers logged</p>
        <p className="mt-2 text-2xl font-bold text-white">{perf.qualifiers_logged}</p>
        <p className="mt-1 text-xs text-gray-500">
          {perf.first_qualifier_date ? `Since ${perf.first_qualifier_date}` : "All time"}
        </p>
      </div>
      {isMLGradeable ? (
        <>
          <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <p className="meta-label">Record</p>
            <p className="mt-2 text-xl font-bold">
              {perf.graded_qualifiers > 0 ? (
                <>
                  <span className="text-emerald-400">{perf.wins}</span>
                  <span className="text-gray-500">-</span>
                  <span className="text-rose-400">{perf.losses}</span>
                  {perf.pushes > 0 && (
                    <span className="text-yellow-400">-{perf.pushes}</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Awaiting grades</span>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {perf.pending > 0 ? `${perf.pending} pending` : "All settled"}
            </p>
          </div>
          <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
            <p className="meta-label">Net units (flat 1u)</p>
            <p className={`mt-2 text-2xl font-bold ${netUnitsColor}`}>{netUnits}</p>
            <p className={`mt-1 text-xs font-medium ${winPctColor}`}>
              {winPct !== "—" ? `${winPct} win rate` : ""}
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4 sm:col-span-2">
          <p className="meta-label">Grading status</p>
          <p className="mt-2 text-base font-semibold text-gray-300">Off — not a live firing system yet</p>
          <p className="mt-1 text-xs text-gray-500">
            This system stays off until the bet direction and grading rule are defined honestly.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── History section ─────────────────────────────────────────────────────────

function RecentHistorySection({
  systemId,
  dbPerformance,
  dbHistory,
}: {
  systemId: string;
  dbPerformance: DbSystemPerformanceSummary[];
  dbHistory: DbSystemQualifier[];
}) {
  const isMLGradeable = ML_GRADEABLE_IDS.has(systemId);
  const hasPerf = dbPerformance.some((p) => p.system_id === systemId);
  if (!hasPerf && dbHistory.length === 0) return null;

  return (
    <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
      <p className="section-heading">Performance history</p>
      <h2 className="mt-2 text-lg font-semibold text-white">Qualifier log</h2>
      <p className="mt-1 text-sm text-gray-400">
        {isMLGradeable
          ? "Graded from live final scores. Flat 1u per qualified play."
          : "Qualifier entries tracked but not yet graded — bet direction not finalized."}
      </p>
      <div className="mt-4">
        <PerformanceStrip systemId={systemId} dbPerformance={dbPerformance} />
      </div>
      {dbHistory.length > 0 && (
        <div className="mt-4">
          <SystemQualifierHistoryToggle rows={dbHistory} isMLGradeable={isMLGradeable} />
        </div>
      )}
    </section>
  );
}

// ─── Qualifier rules ─────────────────────────────────────────────────────────

function QualifierRulesSection({ system }: { system: TrackedSystem }) {
  if (!system.qualifierRules || system.qualifierRules.length === 0) return null;
  return (
    <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
      <p className="section-heading">Qualifier rules</p>
      <h2 className="mt-2 text-lg font-semibold text-white">How a game qualifies</h2>
      <ul className="mt-3 space-y-2">
        {system.qualifierRules.map((rule, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
            <span className="mt-0.5 flex-shrink-0 text-gray-500">→</span>
            <span className="leading-relaxed">{rule}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function SystemDetailBoard({
  system,
  updatedAt,
  nhlContextBoard,
  dbPerformance = [],
  dbHistory = [],
}: {
  system: TrackedSystem;
  updatedAt: string;
  nhlContextBoard?: NHLContextBoardResponse | null;
  dbPerformance?: DbSystemPerformanceSummary[];
  dbHistory?: DbSystemQualifier[];
}) {
  const isFireing =
    system.snapshot?.startsWith("🟢") || system.snapshot?.includes("FIRING");

  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-6">
        <Link
          href="/systems"
          className="inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/15 hover:text-white"
        >
          <span aria-hidden>←</span>
          All systems
        </Link>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className={leaguePill(system.league)}>{system.league}</span>
          <span className={leaguePill(system.category)}>{system.category}</span>
          {system.snapshot && (
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${snapshotBadgeStyle(system.snapshot)}`}
            >
              {system.snapshot.replace(/^[🟢🔴🟡🟠]\s*/, "").split("|")[0].trim()}
            </span>
          )}
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
          {system.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 lg:text-base">
          {system.summary}
        </p>
      </section>

      {/* ── Core action above the fold: record + tonight's picks ───────── */}
      <div className="space-y-5">
        <RecentHistorySection
          systemId={system.id}
          dbPerformance={dbPerformance}
          dbHistory={dbHistory}
        />
        <CurrentQualifiersSection system={system} />
      </div>

      {/* ── NHL context rails (Swaggy only) ─────────────────────────────── */}
      {system.slug === "swaggy-stretch-drive" && (
        <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-heading">Live NHL context</p>
              <h2 className="mt-2 text-lg font-semibold text-white">
                What Swaggy&apos;s sees right now
              </h2>
            </div>
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-300">
              sourced + derived
            </span>
          </div>
          <div className="mt-4">
            <SystemNhlContextBoard board={nhlContextBoard ?? null} />
          </div>
        </section>
      )}

      {/* ── System description ───────────────────────────────────────────── */}
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <p className="section-heading">About this system</p>
        <p className="mt-3 text-sm leading-7 text-gray-300">{system.definition}</p>
        {system.thesis && (
          <p className="mt-4 text-sm leading-7 text-gray-400">{system.thesis}</p>
        )}
      </section>

      {/* ── Qualifier rules ──────────────────────────────────────────────── */}
      <QualifierRulesSection system={system} />
    </div>
  );
}
