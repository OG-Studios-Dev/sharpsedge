"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

// ─── helpers ──────────────────────────────────────────────────────────────────

function outcomeColor(outcome: string) {
  if (outcome === "win") return "text-emerald-400";
  if (outcome === "loss") return "text-rose-400";
  if (outcome === "push") return "text-yellow-400";
  return "text-gray-400";
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

function formatUnits(n: number | null | undefined): string {
  if (n == null) return "—";
  const val = Number(n);
  return `${val > 0 ? "+" : ""}${val.toFixed(2)}u`;
}

function unitsColor(n: number | null | undefined) {
  if (n == null) return "text-gray-400";
  const val = Number(n);
  if (val > 0) return "text-emerald-400";
  if (val < 0) return "text-rose-400";
  return "text-yellow-400";
}

function winPctColor(pct: number | null | undefined) {
  if (pct == null) return "text-gray-400";
  const val = Number(pct);
  if (val >= 55) return "text-emerald-400";
  if (val >= 50) return "text-yellow-400";
  return "text-rose-400";
}

type GradeReport = {
  systemId: string;
  pendingChecked: number;
  graded: number;
  outcomes: { outcome: string; count: number }[];
  errors: string[];
};

type GradeResult = {
  ok: boolean;
  totalPendingChecked: number;
  totalGraded: number;
  reports: GradeReport[];
  gradedAt: string;
  performanceStats?: DbSystemPerformanceSummary[];
};

type GradeStatus = {
  gradeabilityMap: Record<string, { gradeable: boolean; gradingType: string; notes: string }>;
  pendingQualifiers: Record<string, number>;
  totalPending: number;
  performanceStats: DbSystemPerformanceSummary[];
};

const GRADEABLE_LABELS: Record<string, string> = {
  moneyline: "ML",
  quarter_ats: "1Q/3Q ATS",
  watchlist_only: "Watchlist",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSystemsPage() {
  const [status, setStatus] = useState<GradeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [lastResult, setLastResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/systems/grade");
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
      } else {
        setError(data.error || "Failed to load grading status");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const runGrading = useCallback(async (systemId?: string) => {
    try {
      setGrading(true);
      setError(null);
      const body = systemId ? { systemId } : {};
      const res = await fetch("/api/admin/systems/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: GradeResult = await res.json();
      setLastResult(data);
      if (data.performanceStats) {
        setStatus((prev) => prev ? { ...prev, performanceStats: data.performanceStats! } : null);
      }
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed");
    } finally {
      setGrading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const perfStats = status?.performanceStats ?? [];
  const gradeabilityMap = status?.gradeabilityMap ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Systems Performance</h1>
          <p className="mt-1 text-sm text-gray-400">
            Durable qualifier persistence + grading for tradeable systems.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => loadStatus()}
            disabled={loading}
            className="rounded-xl border border-dark-border bg-dark-surface px-4 py-2 text-sm font-medium text-gray-300 hover:bg-dark-bg disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            onClick={() => runGrading()}
            disabled={grading || loading}
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {grading ? "Grading…" : "Grade All Pending"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Pending queue */}
      {status && (
        <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <h2 className="text-base font-semibold text-white">Pending Grading Queue</h2>
          <p className="mt-1 text-xs text-gray-500">
            {status.totalPending} total pending qualifier{status.totalPending !== 1 ? "s" : ""} across all systems.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {Object.entries(status.pendingQualifiers).map(([sysId, count]) => {
              const g = gradeabilityMap[sysId];
              return (
                <div key={sysId} className="flex items-center gap-2 rounded-xl border border-dark-border bg-dark-bg px-3 py-2">
                  <span className="text-xs font-medium text-white">{sysId}</span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">{count} pending</span>
                  {g?.gradeable && (
                    <button
                      onClick={() => runGrading(sysId)}
                      disabled={grading}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      Grade
                    </button>
                  )}
                </div>
              );
            })}
            {status.totalPending === 0 && (
              <p className="text-sm text-gray-500">No pending qualifiers found in Supabase.</p>
            )}
          </div>
        </section>
      )}

      {/* Last grading result */}
      {lastResult && (
        <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <h2 className="text-base font-semibold text-white">Last Grading Run</h2>
          <p className="mt-1 text-xs text-gray-500">
            {lastResult.gradedAt} — {lastResult.totalGraded} graded from {lastResult.totalPendingChecked} pending
          </p>
          <div className="mt-3 space-y-2">
            {lastResult.reports.map((r) => (
              <div key={r.systemId} className="flex items-start justify-between rounded-xl border border-dark-border/50 bg-dark-bg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-white">{r.systemId}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Checked {r.pendingChecked} → graded {r.graded}
                    {r.outcomes.map((o) => (
                      <span key={o.outcome} className={`ml-2 ${outcomeColor(o.outcome)}`}>
                        {o.count}×{o.outcome}
                      </span>
                    ))}
                  </p>
                  {r.errors.map((e, i) => (
                    <p key={i} className="mt-1 text-xs text-rose-400">{e}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-system performance */}
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-base font-semibold text-white">Per-System W/L Performance</h2>
        <p className="mt-1 text-xs text-gray-500">
          From Supabase <code className="rounded bg-dark-bg px-1 font-mono text-xs">system_performance_summary</code> view.
          Only ML/ATS-gradeable systems show W/L records; watchlist systems show qualifier counts.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-gray-500">Loading…</p>
        ) : perfStats.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dark-border/50 bg-dark-bg p-4 text-sm text-gray-500">
            No performance data yet — qualifiers need to be persisted and graded.
            Run &quot;Grade All Pending&quot; after systems refresh.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-left">
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">System</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">League</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Type</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Qualifiers</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Record</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Win%</th>
                  <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Net Units</th>
                  <th className="pb-2 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/50">
                {perfStats.map((s) => {
                  const g = gradeabilityMap[s.system_id];
                  const isGradeable = g?.gradeable ?? false;
                  return (
                    <tr key={s.system_id} className="text-gray-300">
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-white">{s.system_name}</p>
                        <p className="text-xs text-gray-500">{s.system_slug}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-gray-400">{s.league ?? "—"}</td>
                      <td className="py-2.5 pr-4">
                        {g && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            g.gradingType === "moneyline" ? "bg-blue-500/15 text-blue-300" :
                            g.gradingType === "quarter_ats" ? "bg-violet-500/15 text-violet-300" :
                            "bg-gray-500/15 text-gray-400"
                          }`}>
                            {GRADEABLE_LABELS[g.gradingType] ?? g.gradingType}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-white">{s.qualifiers_logged}</span>
                        {s.pending > 0 && (
                          <span className="ml-2 text-xs text-amber-400">({s.pending} pending)</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {isGradeable && s.graded_qualifiers > 0 ? (
                          <span className="font-mono text-white">
                            <span className="text-emerald-400">{s.wins}</span>
                            <span className="text-gray-500">-</span>
                            <span className="text-rose-400">{s.losses}</span>
                            {s.pushes > 0 && <span className="text-yellow-400">-{s.pushes}</span>}
                          </span>
                        ) : isGradeable ? (
                          <span className="text-gray-500">—</span>
                        ) : (
                          <span className="rounded-full bg-gray-500/15 px-2 py-0.5 text-xs text-gray-400">Watchlist</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={winPctColor(s.win_pct)}>
                          {isGradeable ? pct(s.win_pct) : "—"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={unitsColor(s.flat_net_units)}>
                          {isGradeable ? formatUnits(s.flat_net_units) : "—"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">
                        {s.first_qualifier_date ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Gradeability reference */}
      {status && (
        <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <h2 className="text-base font-semibold text-white">Gradeability Map</h2>
          <p className="mt-1 text-xs text-gray-500">
            Which systems are gradeable and what data source grades them.
          </p>
          <div className="mt-3 space-y-2">
            {Object.entries(gradeabilityMap).map(([sysId, info]) => (
              <div key={sysId} className="flex items-start gap-3 rounded-xl border border-dark-border/50 bg-dark-bg px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{sysId}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      info.gradeable
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-gray-500/15 text-gray-400"
                    }`}>
                      {info.gradeable ? "Gradeable" : "Not gradeable"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      info.gradingType === "moneyline" ? "bg-blue-500/10 text-blue-400" :
                      info.gradingType === "quarter_ats" ? "bg-violet-500/10 text-violet-400" :
                      "bg-gray-500/10 text-gray-500"
                    }`}>
                      {GRADEABLE_LABELS[info.gradingType] ?? info.gradingType}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{info.notes}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
