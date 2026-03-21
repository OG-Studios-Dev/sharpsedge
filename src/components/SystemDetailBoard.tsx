import Link from "next/link";
import type { NHLContextBoardResponse } from "@/lib/nhl-context";
import { getSystemDerivedMetrics, type DataRequirementStatus, type TrackedSystem } from "@/lib/systems-tracking-store";
import SystemNhlContextBoard from "@/components/SystemNhlContextBoard";

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

function requirementPill(status: DataRequirementStatus) {
  if (status === "ready") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
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
        <div className="grid min-w-[1080px] grid-cols-[1.05fr_0.7fr_0.85fr_0.7fr_0.8fr_1fr_1.9fr] gap-3 border-b border-dark-border bg-dark-bg/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
          <span>Matchup</span>
          <span>Date</span>
          <span>Starter</span>
          <span>ERA</span>
          <span>ML</span>
          <span>Prior start</span>
          <span>Context</span>
        </div>
        {system.records.map((record) => (
          <div key={record.id} className="grid min-w-[1080px] grid-cols-[1.05fr_0.7fr_0.85fr_0.7fr_0.8fr_1fr_1.9fr] gap-3 px-4 py-3 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/70">
            <div>
              <p className="font-medium text-white">{record.matchup}</p>
              <p className="mt-1 text-xs text-gray-500">{record.alertLabel || record.marketType || record.source || "Tracked qualifier"}</p>
            </div>
            <span>{record.gameDate || "—"}</span>
            <span>{record.starterName || "—"}</span>
            <span>{record.starterEra != null ? record.starterEra.toFixed(2) : "—"}</span>
            <span>{formatMoneyline(record.currentMoneyline)}</span>
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

export default function SystemDetailBoard({ system, updatedAt, nhlContextBoard }: { system: TrackedSystem; updatedAt: string; nhlContextBoard?: NHLContextBoardResponse | null }) {
  const metrics = getSystemDerivedMetrics(system);
  const metricsAwaitingLines = !metrics.trackableGames;
  const isTrackableNow = system.trackabilityBucket === "trackable_now";
  const isQualifierBoard = system.progressionLogic.length === 0;
  const qualifierRowsWithEra = system.records.filter((record) => record.starterEra != null).length;
  const qualifierRowsWithMoneyline = system.records.filter((record) => record.currentMoneyline != null).length;
  const qualifierRowsMissingEra = system.records.filter((record) => record.starterEra == null).length;

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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <p className="section-heading">System Definition</p>
            <p className="mt-3 text-sm leading-7 text-gray-300">{system.definition}</p>
          </section>

          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <p className="section-heading">Qualification Rules</p>
            <div className="mt-3 space-y-2">
              {system.qualifierRules.length ? system.qualifierRules.map((rule) => (
                <div key={rule} className="flex items-start gap-3 rounded-2xl border border-dark-border/70 bg-dark-bg/60 px-3 py-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-blue/10 text-xs font-semibold text-accent-blue">✓</div>
                  <p className="text-sm leading-6 text-gray-300">{rule}</p>
                </div>
              )) : <p className="text-sm text-gray-400">No qualifier rules have been documented yet.</p>}
            </div>
          </section>

          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <p className="section-heading">Progression Logic</p>
            {system.progressionLogic.length ? (
              <div className="mt-4 space-y-3">
                {system.progressionLogic.map((step, index) => (
                  <div key={`${system.id}-${step.step}`} className="flex gap-3 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-accent-blue/10 text-sm font-semibold text-accent-blue">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{step.step}</p>
                        <span className="rounded-full border border-dark-border bg-dark-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{step.stake}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-300">{step.label}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {step.trigger && <span className="rounded-full bg-dark-surface px-2.5 py-1 text-gray-300">Trigger: {step.trigger}</span>}
                        <span className="rounded-full bg-dark-surface px-2.5 py-1 text-gray-300">Stop: {step.stopIf}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-gray-400">No progression ladder is documented for this system.</p>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <p className="section-heading">Rationale / Thesis</p>
            <p className="mt-3 text-sm leading-7 text-gray-300">{system.thesis}</p>
          </section>

          {system.slug === "swaggy-stretch-drive" && (
            <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="section-heading">Live context rails</p>
                  <h2 className="mt-2 text-lg font-semibold text-white">What Swaggy can use right now</h2>
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-heading">Trackability</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Readiness and unlock path</h2>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${trackabilityPill(system.trackabilityBucket)}`}>
                {formatTrackability(system.trackabilityBucket)}
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
              <p className="meta-label">Current state</p>
              <p className="mt-2 text-base font-semibold text-white">{system.automationStatusLabel}</p>
              <p className="mt-2 text-sm leading-6 text-gray-400">{system.automationStatusDetail}</p>
            </div>

            <div className="mt-4 space-y-3">
              {isTrackableNow ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="text-sm font-semibold text-white">Live now</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/80">
                    This system is actively trackable in the product today. Missing fields stay unresolved rather than guessed, so honest tracking wins over fake completeness.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
                  <p className="meta-label">What we need to unlock this</p>
                  <div className="mt-3 space-y-2">
                    {system.unlockNotes.map((note) => (
                      <p key={note} className="text-sm leading-6 text-gray-300">• {note}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-heading">Source Notes</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Attribution and model context</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {system.sourceNotes.length ? system.sourceNotes.map((note) => (
                <div key={`${note.label}-${note.detail}`} className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                  <p className="text-sm font-semibold text-white">{note.label}</p>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{note.detail}</p>
                </div>
              )) : <p className="text-sm text-gray-400">No source notes yet.</p>}
            </div>
          </section>

          <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-heading">Data Requirements</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Inputs feeding honest automation</h2>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${metrics.ingestionReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                {metrics.ingestionReady ? "ready" : system.automationStatusLabel}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {system.dataRequirements.map((item) => (
                <div key={item.label} className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${requirementPill(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-400">{item.detail}</p>
                </div>
              ))}
            </div>

            {system.trackingNotes.length > 0 && (
              <div className="mt-4 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
                <p className="meta-label">Implementation notes</p>
                <div className="mt-3 space-y-2">
                  {system.trackingNotes.map((note) => (
                    <p key={note} className="text-sm leading-6 text-gray-400">• {note}</p>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-heading">Tracked history / results</p>
            <h2 className="mt-2 text-lg font-semibold text-white">{isQualifierBoard ? "Qualifier alert board" : "Performance board"}</h2>
            <p className="mt-1 text-sm text-gray-400">
              {isQualifierBoard
                ? "Stored rows show live qualifiers and alert context only. This board is intentionally not an official picks engine."
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
                value={String(metrics.qualifiedGames)}
                note="Rows currently matching the mechanical v1 screen."
              />
              <MetricCard
                label="Listed ERA present"
                value={String(qualifierRowsWithEra)}
                note={qualifierRowsMissingEra > 0 ? `${qualifierRowsMissingEra} qualifier${qualifierRowsMissingEra === 1 ? " is" : "s are"} missing listed ERA and kept unresolved.` : "Every stored qualifier has a listed ERA."}
              />
              <MetricCard
                label="Moneyline captured"
                value={String(qualifierRowsWithMoneyline)}
                note="Only qualifiers with a live moneyline inside the system band are stored." 
              />
              <MetricCard
                label="System posture"
                value={system.status.replaceAll("_", " ")}
                note="Alerts and evidence only — no auto-published picks or claimed win rate yet."
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
    </div>
  );
}
