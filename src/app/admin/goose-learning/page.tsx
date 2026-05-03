"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FlaskConical, Lock, ShieldCheck } from "lucide-react";

type LabStatus = {
  lab_slug: string;
  name?: string;
  lab_status?: string;
  model_version?: string;
  train_examples?: number;
  test_examples?: number;
  candidate_signals?: number;
  eligible_signals?: number;
  sanity_rejected_signals?: number;
  shadow_picks?: number;
  settled_shadow_picks?: number;
  readiness_rules?: Record<string, number>;
  blockers?: string[];
  ready_to_record?: boolean;
  ready_to_compare?: boolean;
  diagnostics?: {
    guarded_ready_to_record?: boolean;
    sanity_rejected_share?: number;
    max_sanity_rejected_share?: number;
    diagnostic_blockers?: string[];
    production_write_protection?: string;
  };
};

type ApiPayload = {
  ok: boolean;
  lab: string;
  status: LabStatus;
  message?: string;
  error?: string;
};

function fmtNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

function pct(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function StatCard({ label, value, tone = "text-white", hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function GooseLearningPage() {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/goose-learning-lab/status", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `Request failed ${res.status}`);
        if (!cancelled) {
          setPayload(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load Goose Learning");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const status = payload?.status;
  const blockers = status?.blockers || [];
  const readyToRecord = Boolean(status?.ready_to_record);
  const readyToCompare = Boolean(status?.ready_to_compare);
  const realEnoughForShadow = readyToRecord && readyToCompare && blockers.length === 0;

  const verdict = useMemo(() => {
    if (loading) return { label: "Checking", tone: "text-gray-300", icon: FlaskConical };
    if (error || !status) return { label: "Needs attention", tone: "text-rose-300", icon: AlertTriangle };
    if (realEnoughForShadow) return { label: "Safe for shadow learning", tone: "text-emerald-300", icon: ShieldCheck };
    return { label: "Learning only", tone: "text-yellow-300", icon: AlertTriangle };
  }, [loading, error, status, realEnoughForShadow]);
  const VerdictIcon = verdict.icon;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue">
              <FlaskConical size={14} /> Goose Learning
            </div>
            <h1 className="mt-3 text-3xl font-bold text-white">Shadow learning readiness</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              This is the safe place to watch the learning model. It can record and compare shadow picks, but it does not publish production picks or auto-promote betting signals.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-surface px-4 py-2 text-sm font-semibold ${verdict.tone}`}>
            <VerdictIcon size={16} /> {verdict.label}
          </div>
        </div>
      </section>

      {loading && <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 text-sm text-gray-400">Loading Goose Learning status…</div>}
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {status && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <StatCard label="Train examples" value={fmtNumber(status.train_examples)} tone="text-accent-blue" />
            <StatCard label="Test examples" value={fmtNumber(status.test_examples)} tone="text-accent-blue" />
            <StatCard label="Shadow picks" value={fmtNumber(status.shadow_picks)} tone="text-emerald-300" hint={`${fmtNumber(status.settled_shadow_picks)} settled`} />
            <StatCard label="Eligible signals" value={fmtNumber(status.eligible_signals)} tone="text-yellow-300" hint={`${fmtNumber(status.candidate_signals)} candidates tested`} />
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><CheckCircle2 size={18} /> Readiness checks</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3">
                  <span className="text-gray-400">Ready to record shadow picks</span>
                  <span className={readyToRecord ? "text-emerald-300" : "text-rose-300"}>{readyToRecord ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3">
                  <span className="text-gray-400">Ready for production comparison</span>
                  <span className={readyToCompare ? "text-emerald-300" : "text-rose-300"}>{readyToCompare ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3">
                  <span className="text-gray-400">Sanity rejected share</span>
                  <span className="text-gray-200">{pct(status.diagnostics?.sanity_rejected_share)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Lock size={18} /> Safety rails</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">Shadow-only recording/comparison is safe to watch here.</p>
                <p className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-yellow-200">Production promotion remains manual. Approved signals are not auto-published to users.</p>
                <p className="rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3">{status.diagnostics?.production_write_protection || "Status endpoint is read-only."}</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Current model</h2>
                <p className="mt-1 text-sm text-gray-500">{status.name || status.lab_slug}</p>
              </div>
              <Link href="/admin/goose-model" className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue">
                Open Signal Lab
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <StatCard label="Model version" value={status.model_version || "unknown"} tone="text-white" />
              <StatCard label="Lab status" value={status.lab_status || "unknown"} tone={realEnoughForShadow ? "text-emerald-300" : "text-yellow-300"} />
              <StatCard label="Blockers" value={String(blockers.length)} tone={blockers.length ? "text-rose-300" : "text-emerald-300"} />
            </div>
            {blockers.length > 0 && (
              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                <p className="font-semibold">Blockers</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
