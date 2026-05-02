"use client";

import { useEffect, useMemo, useState } from "react";

type SourceStatus = "healthy" | "degraded" | "stale" | "missing" | "unknown" | "blocked" | "ready";

type SourceHealthCheck = {
  name: string;
  status: SourceStatus;
  detail?: string;
  age_minutes?: number | null;
};

type SportHealth = {
  sport: string;
  overall: SourceStatus;
  model_ready: boolean;
  model_ready_note?: string;
  checks?: SourceHealthCheck[];
  degraded_sources?: string[];
  critical_gaps?: string[];
};

type SourceHealthPayload = {
  generated_at: string;
  overall_status: SourceStatus;
  summary: string;
  sports: SportHealth[];
  active_degradations: Array<{ sport: string; source: string; detail: string }>;
  model_ready_sports: string[];
  model_blocked_sports: string[];
};

type SystemDiagnostic = {
  systemLabel?: string;
  system?: string;
  sport: string;
  contextKey?: string;
  qualificationStatus?: "ready" | "degraded" | "blocked" | string;
  canQualify: boolean;
  blockers?: string[];
  enrichmentGaps?: string[];
};

type SystemHealthPayload = {
  generatedAt: string;
  summary?: {
    totalSystems?: number;
    ready?: number;
    degraded?: number;
    blocked?: number;
  };
  diagnostics?: SystemDiagnostic[];
  contextSelections?: Array<{ sport: string; contextKey: string; rationale: string; candidatesScanned: number; score: number }>;
  probe_errors?: Array<{ sport: string; error: string }>;
};

type LifecyclePayload = {
  ok: boolean;
  checked_since: string;
  counts?: Record<string, { total: number; by_result?: Record<string, number>; error?: string }>;
  active_pga_events?: Array<{ id: string; name: string; completed: boolean; final?: boolean; detail: string; date: string }>;
  premature_settlements?: Array<{ table: string; id: string; pick_label: string; result: string; event_status?: unknown }>;
};

type CombinedHealth = {
  source: SourceHealthPayload | null;
  systems: SystemHealthPayload | null;
  lifecycle: LifecyclePayload | null;
  errors: string[];
};

function statusTone(status?: string) {
  if (status === "healthy" || status === "ready") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "degraded" || status === "stale") return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  if (status === "missing" || status === "blocked") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-gray-500/30 bg-gray-500/10 text-gray-300";
}

function labelStatus(status?: string) {
  return String(status ?? "unknown").replace(/_/g, " ");
}

function formatGeneratedAt(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function MetricCard({ label, value, tone = "text-white" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default function AdminSourceHealthPanel() {
  const [data, setData] = useState<CombinedHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const errors: string[] = [];
    const fetchJson = async <T,>(path: string): Promise<T | null> => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || `${path} returned ${response.status}`);
        return payload as T;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        return null;
      }
    };

    const [source, systems, lifecycle] = await Promise.all([
      fetchJson<SourceHealthPayload>("/api/admin/source-health"),
      fetchJson<SystemHealthPayload>("/api/admin/system-health"),
      fetchJson<LifecyclePayload>("/api/admin/pick-lifecycle-health"),
    ]);

    setData({ source, systems, lifecycle, errors });
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const blockedSystems = useMemo(() => (data?.systems?.diagnostics ?? []).filter((diag) => !diag.canQualify), [data]);
  const readySystems = useMemo(() => (data?.systems?.diagnostics ?? []).filter((diag) => diag.canQualify), [data]);
  const lifecycleIssues = data?.lifecycle?.premature_settlements ?? [];
  const degradations = data?.source?.active_degradations ?? [];

  return (
    <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-blue">Source Health Command Center</p>
          <h2 className="mt-1 text-xl font-bold text-white">Data, grading, and system readiness</h2>
          <p className="mt-1 text-sm text-gray-400">One glance for odds feeds, sport models, live systems, and premature grading risk.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh health"}
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4 text-sm text-gray-400">Checking sources…</div>
      ) : null}

      {!loading && data ? (
        <div className="space-y-4">
          {data.errors.length > 0 ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {data.errors.map((error) => <p key={error}>{error}</p>)}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-5">
            <MetricCard label="Overall" value={labelStatus(data.source?.overall_status)} tone={data.source?.overall_status === "healthy" ? "text-emerald-300" : "text-yellow-300"} />
            <MetricCard label="Sports ready" value={`${data.source?.model_ready_sports?.length ?? 0}/${data.source?.sports?.length ?? 0}`} tone="text-emerald-300" />
            <MetricCard label="Live systems ready" value={`${readySystems.length}/${data.systems?.diagnostics?.length ?? 0}`} tone={blockedSystems.length ? "text-yellow-300" : "text-emerald-300"} />
            <MetricCard label="Degradations" value={degradations.length} tone={degradations.length ? "text-yellow-300" : "text-emerald-300"} />
            <MetricCard label="Lifecycle issues" value={lifecycleIssues.length} tone={lifecycleIssues.length ? "text-red-300" : "text-emerald-300"} />
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-bg/50 p-3 text-sm text-gray-300">
            <span className="font-semibold text-white">Summary:</span> {data.source?.summary ?? "Source summary unavailable."}
            <span className="ml-2 text-xs text-gray-500">Updated {formatGeneratedAt(data.source?.generated_at ?? data.systems?.generatedAt)}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-400">Sport source readiness</h3>
              {(data.source?.sports ?? []).map((sport) => (
                <div key={sport.sport} className="rounded-2xl border border-dark-border bg-dark-bg/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{sport.sport}</p>
                      <p className="text-xs text-gray-500">{sport.model_ready_note}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(sport.overall)}`}>{labelStatus(sport.overall)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {(sport.checks ?? []).slice(0, 6).map((check) => (
                      <div key={`${sport.sport}-${check.name}`} className="rounded-xl border border-dark-border/70 bg-black/10 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-gray-200">{check.name}</p>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusTone(check.status)}`}>{labelStatus(check.status)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">{check.detail ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-gray-400">System blockers</h3>
              {blockedSystems.length === 0 ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">No blocked live systems from the current diagnostics run.</div>
              ) : blockedSystems.map((diag) => (
                <div key={`${diag.sport}-${diag.system ?? diag.systemLabel}`} className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{diag.systemLabel ?? diag.system}</p>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${statusTone(diag.qualificationStatus)}`}>{labelStatus(diag.qualificationStatus)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{diag.sport} · {diag.contextKey ?? "No context"}</p>
                  {(diag.blockers ?? []).length > 0 ? <p className="mt-2 text-xs text-yellow-200">Blockers: {diag.blockers?.join(", ")}</p> : null}
                  {(diag.enrichmentGaps ?? []).length > 0 ? <p className="mt-1 text-xs text-gray-400">Gaps: {diag.enrichmentGaps?.join(", ")}</p> : null}
                </div>
              ))}

              <h3 className="pt-2 text-sm font-bold uppercase tracking-[0.16em] text-gray-400">Pick lifecycle</h3>
              <div className={`rounded-2xl border p-3 ${data.lifecycle?.ok ? "border-emerald-500/20 bg-emerald-500/10" : "border-red-500/20 bg-red-500/10"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">Premature grading audit</p>
                  <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${data.lifecycle?.ok ? statusTone("healthy") : statusTone("blocked")}`}>{data.lifecycle?.ok ? "clean" : "issues"}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">Checked since {data.lifecycle?.checked_since ?? "—"}</p>
                {(data.lifecycle?.active_pga_events ?? []).map((event) => (
                  <p key={event.id} className="mt-2 text-xs text-gray-300">PGA: {event.name} · {event.detail} · final={String(event.final ?? event.completed)}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
