import { getSystemDerivedMetrics, type DataRequirementStatus, type TrackedSystem } from "@/lib/systems-tracking-store";

type Props = {
  systems: TrackedSystem[];
  updatedAt: string;
};

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
  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

function requirementPill(status: DataRequirementStatus) {
  if (status === "ready") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "partial") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-300";
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

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
      <p className="meta-label">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-gray-500">{note}</p>
    </div>
  );
}

function TrackingRecordTable({ system }: { system: TrackedSystem }) {
  if (system.records.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-400">
        No tracked rows yet. This first pass ships the system definition and store shape, but quarter spread line ingestion still needs to be wired before results can be trusted.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/70">
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-dark-border bg-dark-bg/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        <span>Matchup</span>
        <span>Date</span>
        <span>FG Spread</span>
        <span>1Q</span>
        <span>3Q</span>
      </div>
      {system.records.map((record) => (
        <div key={record.id} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 px-4 py-3 text-sm text-gray-300 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-dark-border/70">
          <div>
            <p className="font-medium text-white">{record.matchup}</p>
            <p className="mt-1 text-xs text-gray-500">{record.notes || "Manual row"}</p>
          </div>
          <span>{record.gameDate || "—"}</span>
          <span>{record.closingSpread ?? "—"}</span>
          <span>{record.firstQuarterSpread ?? "—"}</span>
          <span>{record.thirdQuarterSpread ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

export default function SystemsOverviewBoard({ systems, updatedAt }: Props) {
  return (
    <div className="space-y-5 px-4 py-4 lg:px-0">
      <section className="rounded-[28px] border border-dark-border bg-[linear-gradient(135deg,rgba(17,23,32,0.98)_0%,rgba(12,17,24,0.98)_54%,rgba(16,38,67,0.94)_100%)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-blue/80">Systems Tracking</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">Public lab for repeatable betting systems.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-300 lg:text-base">
              This board is where Goosalytics can publish system definitions, qualifier logic, and honest tracking status. It is intentionally conservative right now: no fake precision, no backfilled win rates pretending quarter-line data already exists.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Systems live</p>
              <p className="mt-2 text-2xl font-semibold text-white">{systems.length}</p>
              <p className="mt-2 text-xs text-gray-400">Seeded first pass, ready for more systems later.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="meta-label">Store updated</p>
              <p className="mt-2 text-base font-semibold text-white">{formatUpdatedAt(updatedAt)}</p>
              <p className="mt-2 text-xs text-gray-400">File-backed from <code className="text-gray-300">data/systems-tracking.json</code>.</p>
            </div>
          </div>
        </div>
      </section>

      {systems.map((system) => {
        const metrics = getSystemDerivedMetrics(system);
        const metricsAwaitingLines = !metrics.trackableGames;

        return (
          <section key={system.id} className="space-y-5 rounded-[28px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.24)] lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{system.sport}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusPill(system.status)}`}>
                    {system.status === "awaiting_data" ? "Awaiting data" : system.status}
                  </span>
                  <span className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Owner {system.owner}</span>
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-white">{system.name}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-300">{system.summary}</p>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 lg:max-w-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">First-pass honesty check</p>
                <p className="mt-2 text-sm leading-6 text-amber-100/90">
                  Quarter spread line ingestion is not wired yet. Until 1Q and 3Q lines are stored per qualifying game, tracked performance cards stay placeholder or partial on purpose.
                </p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
                  <p className="section-heading">System Definition</p>
                  <p className="mt-3 text-sm leading-7 text-gray-300">{system.definition}</p>
                </div>

                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
                  <p className="section-heading">Qualification Rules</p>
                  <div className="mt-3 space-y-2">
                    {system.qualifierRules.map((rule) => (
                      <div key={rule} className="flex items-start gap-3 rounded-2xl border border-dark-border/70 bg-dark-bg/60 px-3 py-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-blue/10 text-xs font-semibold text-accent-blue">✓</div>
                        <p className="text-sm leading-6 text-gray-300">{rule}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
                  <p className="section-heading">Progression Logic</p>
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
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
                  <p className="section-heading">Thesis</p>
                  <p className="mt-3 text-sm leading-7 text-gray-300">{system.thesis}</p>
                </div>

                <div className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="section-heading">Tracking Status</p>
                      <h3 className="mt-2 text-lg font-semibold text-white">Data readiness and operating notes</h3>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${metrics.ingestionReady ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                      {metrics.ingestionReady ? "ready" : "partial setup"}
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

                  <div className="mt-4 rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
                    <p className="meta-label">Implementation notes</p>
                    <div className="mt-3 space-y-2">
                      {system.trackingNotes.map((note) => (
                        <p key={note} className="text-sm leading-6 text-gray-400">• {note}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="section-heading">Placeholder Metrics</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">Performance board</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    {metricsAwaitingLines
                      ? "Awaiting consistent 1Q and 3Q line capture before publishing real performance stats."
                      : "Derived only from stored rows that include both quarter lines and settled sequence results."}
                  </p>
                </div>
                <div className="rounded-full border border-dark-border bg-dark-bg/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                  Qualified rows: {metrics.qualifiedGames}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Sequence win rate"
                  value={formatPercent(metrics.sequenceWinRate)}
                  note={metricsAwaitingLines ? "Placeholder until quarter lines are ingested and settled." : `${metrics.completedSequences} completed sequence${metrics.completedSequences === 1 ? "" : "s"} in store.`}
                />
                <MetricCard
                  label="Bet 1 win rate"
                  value={formatPercent(metrics.stepOneWinRate)}
                  note={metricsAwaitingLines ? "Needs 1Q ATS lines and outcomes for each qualifier." : `${metrics.stepOneWins} direct first-leg wins logged.`}
                />
                <MetricCard
                  label="Bet 2 rescue rate"
                  value={formatPercent(metrics.rescueRate)}
                  note={metricsAwaitingLines ? "Needs both first-leg losses and 3Q ATS outcomes." : `${metrics.rescueWins} rescue win${metrics.rescueWins === 1 ? "" : "s"} after a Bet 1 loss.`}
                />
                <MetricCard
                  label="Estimated net units"
                  value={formatUnits(metrics.estimatedNetUnits)}
                  note={metricsAwaitingLines ? "No honest unit curve yet without quarter-line coverage." : "Assumes 1u on Bet 1 and 2u on Bet 2."}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="section-heading">Tracked Rows</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Stored system records</h3>
                <p className="mt-1 text-sm text-gray-400">The table is ready for manual backfills or future automated ingestion.</p>
              </div>
              <TrackingRecordTable system={system} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
