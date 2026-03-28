import Link from "next/link";
import type { NHLContextBoardResponse } from "@/lib/nhl-context";
import { getSystemDerivedMetrics, type TrackedSystem, type DbSystemPerformanceSummary, type DbSystemQualifier } from "@/lib/systems-tracking-store";
import SystemNhlContextBoard from "@/components/SystemNhlContextBoard";

const ML_GRADEABLE_IDS = new Set(["swaggy-stretch-drive", "falcons-fight-pummeled-pitchers"]);
const WATCHLIST_ONLY_IDS = new Set(["the-blowout", "hot-teams-matchup", "tonys-hot-bats"]);

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

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Awaiting data";
  return `${(value * 100).toFixed(1)}%`;
}

function formatUnits(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Awaiting data";
  if (value > 0) return `+${value.toFixed(1)}u`;
  return `${value.toFixed(1)}u`;
}

function formatFlatRecord(metrics: ReturnType<typeof getSystemDerivedMetrics>) {
  if (!metrics.performance.actionable) return "Qualifier only";
  return metrics.performance.record;
}

function formatMoneyline(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatResult(value?: string | null) {
  if (!value || value === "pending") return "Pending";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <p className="meta-label">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">{note}</p>
    </div>
  );
}

function renderContextPill(label: string, value?: string | null) {
  if (!value) return null;
  return (
    <span className="rounded-full border border-dark-border bg-dark-bg/70 px-2.5 py-1 text-[10px] font-semibold text-gray-300">
      <span className="text-gray-500">{label}:</span> {value}
    </span>
  );
}

function TrackingRecordTable({ system }: { system: TrackedSystem }) {
  if (system.records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-400">
        No tracked records are stored for this system yet.
      </div>
    );
  }

  const isQualifierBoard = system.progressionLogic.length === 0;

  if (isQualifierBoard) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-dark-border bg-dark-surface/70">
        <div className="grid min-w-[1280px] grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.7fr_0.85fr_1fr_1.7fr] gap-3 border-b border-dark-border bg-dark-bg/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          <span>Matchup</span>
          <span>Date</span>
          <span>Starter</span>
          <span>ERA</span>
          <span>ML</span>
          <span>Score</span>
          <span>Prior start</span>
          <span>Context</span>
        </div>
        {system.records.map((record) => (
          <div key={record.id} className="grid min-w-[1280px] grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.7fr_0.85fr_1fr_1.7fr] gap-3 px-4 py-3 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/70">
            <div>
              <p className="font-medium text-white">{record.matchup}</p>
              <p className="mt-1 text-xs text-gray-500">{record.alertLabel || record.marketType || record.source || "Tracked qualifier"}</p>
            </div>
            <span>{record.gameDate || "—"}</span>
            <span>{record.starterName || "—"}</span>
            <span>{record.starterEra != null ? record.starterEra.toFixed(2) : "—"}</span>
            <span>{formatMoneyline(record.currentMoneyline)}</span>
            <div>
              <p className="font-medium text-white">{record.falconsScore != null ? `${record.falconsScore}/100` : "—"}</p>
              <p className="mt-1 text-xs text-gray-500">{record.falconsScoreLabel || "Unscored"}</p>
            </div>
            <div>
              <p>{record.priorGameDate || "—"}</p>
              <p className="mt-1 text-xs text-gray-500">{record.priorStartSummary || "Prior-start summary unavailable"}</p>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {renderContextPill("Lineup", record.lineupStatus)}
                {renderContextPill("Weather", record.weatherSummary)}
                {renderContextPill("Park", record.parkFactorSummary)}
                {renderContextPill("Bullpen", record.bullpenSummary)}
                {renderContextPill("F5", record.f5Summary)}
                {renderContextPill("Markets", record.marketAvailability)}
                {(record.falconsScoreComponents || []).map((component) => renderContextPill("Score", component))}
              </div>
              <p className="text-xs leading-6 text-gray-400">{record.notes || record.source || "Stored qualifier"}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-dark-border bg-dark-surface/70">
      <div className="grid min-w-[980px] grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-dark-border bg-dark-bg/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        <span>Matchup</span>
        <span>Date</span>
        <span>FG</span>
        <span>1Q</span>
        <span>3Q</span>
        <span>Bet 1</span>
        <span>Sequence</span>
        <span>Units</span>
      </div>
      {system.records.map((record) => (
        <div key={record.id} className="grid min-w-[980px] grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr] gap-3 px-4 py-3 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/70">
          <div>
            <p className="font-medium text-white">{record.matchup}</p>
            <p className="mt-1 text-xs text-gray-500">{record.notes || record.source || "Stored row"}</p>
          </div>
          <span>{record.gameDate || "—"}</span>
          <span>{record.closingSpread ?? "—"}</span>
          <span>{record.firstQuarterSpread ?? "—"}</span>
          <span>{record.thirdQuarterSpread ?? "—"}</span>
          <span>{formatResult(record.bet1Result)}</span>
          <span>{formatResult(record.sequenceResult)}</span>
          <span>{formatUnits(record.estimatedNetUnits ?? null)}</span>
        </div>
      ))}
    </div>
  );
}

function DbPerformancePanel({ systemId, dbPerformance, dbHistory }: {
  systemId: string;
  dbPerformance: DbSystemPerformanceSummary[];
  dbHistory: DbSystemQualifier[];
}) {
  const perf = dbPerformance.find((p) => p.system_id === systemId);
  const isMLGradeable = ML_GRADEABLE_IDS.has(systemId);
  const isWatchlistOnly = WATCHLIST_ONLY_IDS.has(systemId);

  if (!perf && dbHistory.length === 0) {
    if (isWatchlistOnly) return null; // don't show empty panel for watchlist systems
    return (
      <div className="rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-500">
        No graded performance data in Supabase yet.
        {isMLGradeable && " Run /api/admin/systems/grade after games are final to grade ML qualifiers."}
      </div>
    );
  }

  if (!perf) return null;

  const winPct = perf.win_pct != null ? `${Number(perf.win_pct).toFixed(1)}%` : "—";
  const netUnits = perf.flat_net_units != null
    ? `${Number(perf.flat_net_units) > 0 ? "+" : ""}${Number(perf.flat_net_units).toFixed(2)}u`
    : "—";
  const netUnitsColor = perf.flat_net_units == null ? "text-gray-400"
    : Number(perf.flat_net_units) > 0 ? "text-emerald-400"
    : Number(perf.flat_net_units) < 0 ? "text-rose-400"
    : "text-yellow-400";
  const winPctColor = perf.win_pct == null ? "text-gray-400"
    : Number(perf.win_pct) >= 55 ? "text-emerald-400"
    : Number(perf.win_pct) >= 50 ? "text-yellow-400"
    : "text-rose-400";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
          <p className="meta-label">Qualifiers logged</p>
          <p className="mt-2 text-2xl font-bold text-white">{perf.qualifiers_logged}</p>
          <p className="mt-1 text-xs text-gray-500">
            {perf.first_qualifier_date ? `Since ${perf.first_qualifier_date}` : "Durable Supabase count"}
          </p>
        </div>
        {isMLGradeable ? (
          <>
            <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="meta-label">ML Record</p>
              <p className="mt-2 text-xl font-bold">
                {perf.graded_qualifiers > 0 ? (
                  <>
                    <span className="text-emerald-400">{perf.wins}</span>
                    <span className="text-gray-500">-</span>
                    <span className="text-rose-400">{perf.losses}</span>
                    {perf.pushes > 0 && <span className="text-yellow-400">-{perf.pushes}</span>}
                  </>
                ) : (
                  <span className="text-gray-400">Awaiting grades</span>
                )}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {perf.pending > 0 ? `${perf.pending} pending` : "All settled"}
                {perf.ungradeable > 0 ? `, ${perf.ungradeable} ungradeable` : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="meta-label">Win %</p>
              <p className={`mt-2 text-2xl font-bold ${winPctColor}`}>{winPct}</p>
              <p className="mt-1 text-xs text-gray-500">Wins / (wins + losses)</p>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
              <p className="meta-label">Net units (flat 1u)</p>
              <p className={`mt-2 text-2xl font-bold ${netUnitsColor}`}>{netUnits}</p>
              <p className="mt-1 text-xs text-gray-500">ML payout at odds captured at qualification</p>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4 sm:col-span-3">
            <p className="meta-label">Grading status</p>
            <p className="mt-2 text-base font-semibold text-gray-300">Watchlist qualifier only</p>
            <p className="mt-1 text-xs text-gray-500">
              No bet direction defined yet — qualifiers tracked but not graded.
              W/L will appear here once a direction rule is proven.
            </p>
          </div>
        )}
      </div>

      {/* Recent qualifier history from DB */}
      {isMLGradeable && dbHistory.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-dark-border bg-dark-surface/70">
          <div className="border-b border-dark-border bg-dark-bg/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Graded qualifier history (Supabase)
            </p>
          </div>
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.5fr_0.6fr_1.2fr] gap-3 border-b border-dark-border bg-dark-bg/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              <span>Matchup</span>
              <span>Date</span>
              <span>Qualified</span>
              <span>Odds</span>
              <span>Outcome</span>
              <span>Net</span>
              <span>Grading source</span>
            </div>
            {dbHistory.slice(0, 30).map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_0.7fr_0.8fr_0.6fr_0.5fr_0.6fr_1.2fr] gap-3 px-4 py-2.5 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/50"
              >
                <span className="font-medium text-white">{row.matchup}</span>
                <span>{row.game_date}</span>
                <span>{row.qualified_team ?? "—"}</span>
                <span>{row.qualifier_odds != null ? (row.qualifier_odds > 0 ? `+${row.qualifier_odds}` : `${row.qualifier_odds}`) : "—"}</span>
                <span className={
                  row.outcome === "win" ? "font-semibold text-emerald-400" :
                  row.outcome === "loss" ? "font-semibold text-rose-400" :
                  row.outcome === "push" ? "text-yellow-400" :
                  row.outcome === "pending" ? "text-sky-400" :
                  "text-gray-500"
                }>
                  {row.outcome}
                </span>
                <span className={
                  row.net_units == null ? "text-gray-500" :
                  Number(row.net_units) > 0 ? "text-emerald-400" :
                  Number(row.net_units) < 0 ? "text-rose-400" :
                  "text-yellow-400"
                }>
                  {row.net_units != null ? `${Number(row.net_units) > 0 ? "+" : ""}${Number(row.net_units).toFixed(2)}u` : "—"}
                </span>
                <span className="text-xs text-gray-500">{row.grading_source ?? row.settlement_status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const metrics = getSystemDerivedMetrics(system);
  const metricsAwaitingLines = !metrics.trackableGames;
  const isQualifierBoard = system.progressionLogic.length === 0;

  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/systems" className="inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/15 hover:text-white">
              <span aria-hidden>←</span>
              Back to systems
            </Link>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{system.league}</span>
              <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{system.category}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${trackabilityPill(system.trackabilityBucket)}`}>
                {formatTrackability(system.trackabilityBucket)}
              </span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusPill(system.status)}`}>
                {formatStatus(system.status)}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white lg:text-4xl">{system.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 lg:text-base">{system.summary}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[340px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Trackability</p>
              <p className="mt-2 text-base font-semibold text-white">{formatTrackability(system.trackabilityBucket)}</p>
              <p className="mt-2 text-xs text-gray-400">{system.automationStatusDetail}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Store updated</p>
              <p className="mt-2 text-base font-semibold text-white">
                {new Date(updatedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-2 text-xs text-gray-400">File-backed from data/systems-tracking.json.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <p className="section-heading">System description</p>
        <p className="mt-3 text-sm leading-7 text-gray-300">{system.definition}</p>
        {system.thesis ? <p className="mt-4 text-sm leading-7 text-gray-400">{system.thesis}</p> : null}
      </section>

      {system.slug === "swaggy-stretch-drive" && (
        <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-heading">Live context rails</p>
              <h2 className="mt-2 text-lg font-semibold text-white">What Swaggy's can use right now</h2>
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

      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-heading">Tracked history / results</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{isQualifierBoard ? "Qualifier alert board" : "Performance board"}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {isQualifierBoard
                ? "Stored rows show live qualifiers and alert context only."
                : metricsAwaitingLines
                  ? "Metrics stay conservative until lines and settlement data are present."
                  : "Derived only from stored rows with captured lines and settled results."}
            </p>
          </div>
          <div className="rounded-full border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
            Qualified rows: {metrics.qualifiedGames}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isQualifierBoard ? (
            <>
              <MetricCard
                label="Tracked qualifiers"
                value={String(metrics.performance.qualifiersLogged || metrics.qualifiedGames)}
                note="Immutable qualifier log entries captured for this system."
              />
              <MetricCard
                label="Flat 1u record"
                value={formatFlatRecord(metrics)}
                note={metrics.performance.actionable
                  ? `${metrics.performance.gradedQualifiers} graded qualifier${metrics.performance.gradedQualifiers === 1 ? "" : "s"} at flat 1u each.${metrics.performance.ungradeable ? ` ${metrics.performance.ungradeable} final row${metrics.performance.ungradeable === 1 ? " is" : "s are"} explicitly ungradeable and excluded.` : ""}`
                  : "No honest action side is defined yet, so this stays a qualifier log only."}
              />
              <MetricCard
                label="Flat 1u win rate"
                value={metrics.performance.actionable ? formatPercent(metrics.performance.winPct) : "N/A"}
                note={metrics.performance.actionable
                  ? "Wins / losses only. Pushes excluded from win rate."
                  : "Win% is intentionally withheld until the system has a real action rule."}
              />
              <MetricCard
                label="Flat 1u units"
                value={metrics.performance.actionable ? formatUnits(metrics.performance.flatNetUnits) : "N/A"}
                note={metrics.performance.actionable
                  ? "Derived from settled qualifier outcomes at 1u per qualified play."
                  : "Units are intentionally withheld for watchlist-only systems."}
              />
            </>
          ) : (
            <>
              <MetricCard
                label="Sequence win rate"
                value={formatPercent(metrics.sequenceWinRate)}
                note={metricsAwaitingLines ? "Awaiting enough line coverage and settled rows." : `${metrics.completedSequences} settled sequence${metrics.completedSequences === 1 ? "" : "s"}.`}
              />
              <MetricCard
                label="Bet 1 win rate"
                value={formatPercent(metrics.stepOneWinRate)}
                note={metricsAwaitingLines ? "Needs 1Q line and outcome coverage." : `${metrics.stepOneWins} direct first-leg win${metrics.stepOneWins === 1 ? "" : "s"}.`}
              />
              <MetricCard
                label="Bet 2 rescue rate"
                value={formatPercent(metrics.rescueRate)}
                note={metricsAwaitingLines ? "Needs tracked first-leg losses plus 3Q settlement." : `${metrics.rescueWins} rescue win${metrics.rescueWins === 1 ? "" : "s"}.`}
              />
              <MetricCard
                label="Estimated net units"
                value={formatUnits(metrics.estimatedNetUnits)}
                note={metricsAwaitingLines ? "No honest unit curve until rows settle." : "Assumes 1u on Bet 1 and 2u on Bet 2 when applicable."}
              />
            </>
          )}
        </div>

        <div className="mt-5">
          <TrackingRecordTable system={system} />
        </div>
      </section>

      {/* Durable W/L performance from Supabase (ML-gradeable and Goose systems) */}
      {(ML_GRADEABLE_IDS.has(system.id) || system.id === "nba-goose-system") && (
        <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="section-heading">Durable performance (Supabase)</p>
              <h2 className="mt-2 text-lg font-semibold text-white">
                {ML_GRADEABLE_IDS.has(system.id) ? "ML grading history" : "Quarter ATS grading history"}
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                {ML_GRADEABLE_IDS.has(system.id)
                  ? "Graded from live final scores via /api/admin/systems/grade. Persisted to system_qualifiers table."
                  : "Persisted from NBA Goose quarter settlement. Synced to Supabase for durable tracking."}
              </p>
            </div>
            <a
              href="/admin/systems"
              className="rounded-xl border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white"
            >
              Admin →
            </a>
          </div>
          <DbPerformancePanel systemId={system.id} dbPerformance={dbPerformance} dbHistory={dbHistory} />
        </section>
      )}
    </div>
  );
}
