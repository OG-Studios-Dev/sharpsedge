"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function statusBadge(s: DbSystemPerformanceSummary, isGradeable: boolean) {
  if (!isGradeable) return { label: "Off", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  if (s.graded_qualifiers === 0) return { label: "No data", cls: "bg-gray-500/15 text-gray-500 border-gray-700/40" };
  const wr = Number(s.win_pct ?? 0);
  if (wr >= 55) return { label: "On track", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (wr >= 50) return { label: "Marginal", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" };
  return { label: "Under water", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
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
  watchlist_only: "Off",
};

// ─── SystemCard ───────────────────────────────────────────────────────────────

function SystemCard({
  s,
  gradeabilityMap,
  onGrade,
  grading,
}: {
  s: DbSystemPerformanceSummary;
  gradeabilityMap: GradeStatus["gradeabilityMap"];
  onGrade: (id?: string) => void;
  grading: boolean;
}) {
  const g = gradeabilityMap[s.system_id];
  const isGradeable = g?.gradeable ?? false;
  const badge = statusBadge(s, isGradeable);
  const hasPending = (s.pending ?? 0) > 0;

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight truncate">{s.system_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.league && (
              <span className="rounded-full border border-dark-border px-2 py-0.5 text-[10px] font-medium text-gray-400">
                {s.league}
              </span>
            )}
            {g && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                g.gradingType === "moneyline" ? "border-blue-500/30 bg-blue-500/10 text-blue-300" :
                g.gradingType === "quarter_ats" ? "border-violet-500/30 bg-violet-500/10 text-violet-300" :
                "border-gray-600/40 bg-gray-500/10 text-gray-400"
              }`}>
                {GRADEABLE_LABELS[g.gradingType] ?? g.gradingType}
              </span>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Key stats row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Record */}
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/60 px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Record</p>
          {isGradeable && s.graded_qualifiers > 0 ? (
            <p className="font-mono text-sm font-bold">
              <span className="text-emerald-400">{s.wins}</span>
              <span className="text-gray-600">-</span>
              <span className="text-rose-400">{s.losses}</span>
              {s.pushes > 0 && <span className="text-yellow-400">-{s.pushes}</span>}
            </p>
          ) : (
            <p className="text-sm text-gray-600">—</p>
          )}
        </div>

        {/* Win% */}
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/60 px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Win %</p>
          <p className={`text-sm font-bold ${winPctColor(s.win_pct)}`}>
            {isGradeable ? pct(s.win_pct) : "—"}
          </p>
        </div>

        {/* Net units */}
        <div className="rounded-xl border border-dark-border/50 bg-dark-bg/60 px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Net</p>
          <p className={`text-sm font-bold ${unitsColor(s.flat_net_units)}`}>
            {isGradeable ? formatUnits(s.flat_net_units) : "—"}
          </p>
        </div>
      </div>

      {/* Footer row: qualifiers + pending + grade */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">
            {s.qualifiers_logged} qualifier{s.qualifiers_logged !== 1 ? "s" : ""}
          </span>
          {hasPending && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
              {s.pending} pending
            </span>
          )}
          {s.first_qualifier_date && (
            <span className="text-[10px] text-gray-600">since {s.first_qualifier_date}</span>
          )}
        </div>
        {isGradeable && hasPending && (
          <button
            onClick={() => onGrade(s.system_id)}
            disabled={grading}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            Grade
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminSystemsPage() {
  const [status, setStatus] = useState<GradeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [lastResult, setLastResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGradeMap, setShowGradeMap] = useState(false);

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
  const totalPending = status?.totalPending ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Systems Performance</h1>
            <p className="mt-1 text-xs text-gray-400">
              Qualifier persistence + grading for tradeable systems.
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0">
            <button
              onClick={() => loadStatus()}
              disabled={loading}
              className="rounded-full border border-dark-border bg-dark-bg px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white disabled:opacity-50 transition-colors"
            >
              {loading ? "Refreshing…" : "↺ Refresh"}
            </button>
            <button
              onClick={() => runGrading()}
              disabled={grading || loading}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
            >
              {grading ? "Grading…" : `Grade All${totalPending > 0 ? ` (${totalPending})` : ""}`}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Last grading result — compact */}
      {lastResult && (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold text-gray-400">
            Last run — {lastResult.gradedAt} · {lastResult.totalGraded} graded from {lastResult.totalPendingChecked} pending
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lastResult.reports.map((r) => (
              <div key={r.systemId} className="rounded-xl border border-dark-border/50 bg-dark-bg px-3 py-2">
                <p className="text-xs font-medium text-white">{r.systemId}</p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {r.graded} graded
                  {r.outcomes.map((o) => {
                    const cls = o.outcome === "win" ? "text-emerald-400" : o.outcome === "loss" ? "text-rose-400" : "text-yellow-400";
                    return <span key={o.outcome} className={`ml-1.5 ${cls}`}>{o.count}×{o.outcome}</span>;
                  })}
                </p>
                {r.errors.map((e, i) => (
                  <p key={i} className="text-[10px] text-rose-400">{e}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-system scorecards */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">
            System Records
            {perfStats.length > 0 && <span className="ml-2 text-gray-500 font-normal">({perfStats.length})</span>}
          </h2>
          {status && (
            <span className="text-xs text-gray-600">
              From <code className="rounded bg-dark-bg px-1">system_performance_summary</code>
            </span>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-8 text-center">
            <p className="text-sm text-gray-500">Loading…</p>
          </div>
        ) : perfStats.length === 0 ? (
          <div className="rounded-2xl border border-dark-border/50 bg-dark-bg p-6 text-center">
            <p className="text-sm text-gray-500">No performance data yet.</p>
            <p className="mt-1 text-xs text-gray-600">Grade pending qualifiers to start building records.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {perfStats.map((s) => (
              <SystemCard
                key={s.system_id}
                s={s}
                gradeabilityMap={gradeabilityMap}
                onGrade={runGrading}
                grading={grading}
              />
            ))}
          </div>
        )}
      </section>

      {/* Gradeability map — collapsed by default */}
      {status && (
        <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <button
            onClick={() => setShowGradeMap((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <h2 className="text-sm font-semibold text-white">Gradeability Map</h2>
            <span className="text-xs text-gray-500">{showGradeMap ? "▲ hide" : "▼ show"}</span>
          </button>

          {showGradeMap && (
            <div className="mt-3 space-y-2">
              {Object.entries(gradeabilityMap).map(([sysId, info]) => (
                <div key={sysId} className="rounded-xl border border-dark-border/50 bg-dark-bg px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-white">{sysId}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      info.gradeable
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-gray-600/40 bg-gray-500/10 text-gray-400"
                    }`}>
                      {info.gradeable ? "Gradeable" : "Not gradeable"}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                      info.gradingType === "moneyline" ? "border-blue-500/20 text-blue-400" :
                      info.gradingType === "quarter_ats" ? "border-violet-500/20 text-violet-400" :
                      "border-gray-700 text-gray-600"
                    }`}>
                      {GRADEABLE_LABELS[info.gradingType] ?? info.gradingType}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">{info.notes}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
