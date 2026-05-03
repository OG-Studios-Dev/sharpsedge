"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, CheckCircle2, Clock, FlaskConical, Lock, ShieldCheck } from "lucide-react";

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
  blockers?: string[];
  ready_to_record?: boolean;
  ready_to_compare?: boolean;
  diagnostics?: {
    sanity_rejected_share?: number;
    production_write_protection?: string;
  };
};

type RecordSummary = {
  total: number;
  settled: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  winRate: number | null;
  roi: number | null;
};

type RecordPick = {
  id: string;
  source: "learning" | "production";
  date: string;
  league: string;
  pickLabel: string;
  market?: string | null;
  side?: string | null;
  team?: string | null;
  opponent?: string | null;
  odds?: number | null;
  sportsbook?: string | null;
  result: string;
  units: number;
  profitUnits: number;
  status?: string | null;
  modelScore?: number | null;
  confidenceScore?: number | null;
  signalCount?: number;
  comparisonBucket?: string | null;
  productionPickLabel?: string | null;
};

type RecordBucket = {
  key: string;
  label: string;
  record: RecordSummary;
  picks: RecordPick[];
};

type ComparisonBucket = {
  key: string;
  date: string;
  league: string;
  learning: RecordSummary;
  production: RecordSummary;
  deltaWinRate: number | null;
};

type RecordsPayload = {
  ok: boolean;
  leagues: string[];
  learning: { overall: RecordSummary; byLeague: RecordBucket[]; byDay: RecordBucket[]; picks: RecordPick[] };
  production: { overall: RecordSummary; byLeague: RecordBucket[]; byDay: RecordBucket[]; picks: RecordPick[] };
  comparison: { byDayLeague: ComparisonBucket[] };
  error?: string;
};

type StatusPayload = { ok: boolean; status: LabStatus; error?: string };

function fmtNumber(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : "—";
}

function fmtPct(value: number | null | undefined) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function fmtUnits(value: number | null | undefined) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}u`;
}

function fmtOdds(odds?: number | null) {
  if (odds == null || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function resultClass(result: string) {
  if (result === "win") return "bg-emerald-500/10 text-emerald-400";
  if (result === "loss") return "bg-red-500/10 text-red-400";
  if (result === "push" || result === "void") return "bg-yellow-500/10 text-yellow-400";
  return "bg-dark-bg/60 text-gray-400";
}

function resultShort(result: string) {
  if (result === "win") return "W";
  if (result === "loss") return "L";
  if (result === "push" || result === "void") return "P";
  return "PD";
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

function RecordStrip({ title, record, tone = "learning" }: { title: string; record: RecordSummary; tone?: "learning" | "production" }) {
  const pctTone = (record.winRate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400";
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-bg/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone === "learning" ? "bg-accent-blue/10 text-accent-blue" : "bg-purple-500/10 text-purple-300"}`}>{tone}</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <div><p className="text-lg font-bold text-emerald-400">{record.wins}</p><p className="text-[10px] uppercase text-gray-500">W</p></div>
        <div><p className="text-lg font-bold text-red-400">{record.losses}</p><p className="text-[10px] uppercase text-gray-500">L</p></div>
        <div><p className="text-lg font-bold text-yellow-400">{record.pushes}</p><p className="text-[10px] uppercase text-gray-500">Push</p></div>
        <div><p className="text-lg font-bold text-gray-400">{record.pending}</p><p className="text-[10px] uppercase text-gray-500">Pending</p></div>
        <div className="ml-auto text-right"><p className={`text-lg font-bold ${pctTone}`}>{fmtPct(record.winRate)}</p><p className="text-[10px] uppercase text-gray-500">Win % · {record.settled} graded</p></div>
        <div className="text-right"><p className={`text-lg font-bold ${record.units >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUnits(record.units)}</p><p className="text-[10px] uppercase text-gray-500">Units</p></div>
      </div>
    </div>
  );
}

function PickRow({ pick }: { pick: RecordPick }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 text-left ${pick.result === "win" ? "border-l-2 border-l-emerald-500" : pick.result === "loss" ? "border-l-2 border-l-red-500" : pick.result === "push" || pick.result === "void" ? "border-l-2 border-l-yellow-500" : "border-l-2 border-l-gray-600"}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{pick.pickLabel}</p>
        <p className="mt-0.5 truncate text-[10px] text-gray-500">
          {pick.league} · {pick.market || "market"}{pick.side ? ` · ${pick.side}` : ""}{pick.team ? ` · ${pick.team}` : ""}{pick.opponent ? ` vs ${pick.opponent}` : ""}
        </p>
        {pick.productionPickLabel && <p className="mt-0.5 truncate text-[10px] text-purple-300">Prod match: {pick.productionPickLabel}</p>}
      </div>
      {pick.signalCount != null && <span className="shrink-0 text-[10px] text-gray-500">{pick.signalCount} sig</span>}
      {fmtOdds(pick.odds) && <span className="shrink-0 text-[10px] text-gray-500">{fmtOdds(pick.odds)}</span>}
      <span className={`shrink-0 text-[10px] font-bold ${pick.profitUnits >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUnits(pick.profitUnits)}</span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${resultClass(pick.result)}`}>{resultShort(pick.result)}</span>
    </div>
  );
}

function DailyBucket({ bucket }: { bucket: RecordBucket }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-dark-border/70 bg-dark-surface/40">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5 bg-dark-bg/40">
        <div className="text-left">
          <p className="text-gray-300 text-xs font-semibold">{bucket.label}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{bucket.record.settled} graded · {bucket.record.total} total · ROI {fmtPct(bucket.record.roi)}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase flex-wrap justify-end">
          <span className="text-emerald-400">{bucket.record.wins}W</span>
          <span className="text-red-400">{bucket.record.losses}L</span>
          {bucket.record.pushes > 0 && <span className="text-yellow-400">{bucket.record.pushes}P</span>}
          {bucket.record.pending > 0 && <span className="text-gray-500 inline-flex items-center gap-0.5">{bucket.record.pending}<Clock size={10} /></span>}
          <span className={bucket.record.units >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtUnits(bucket.record.units)}</span>
          <span className={(bucket.record.winRate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400"}>{fmtPct(bucket.record.winRate)}</span>
          <ChevronDown size={12} className={`text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="divide-y divide-dark-border/30 border-t border-dark-border/40">{bucket.picks.map((pick) => <PickRow key={pick.id} pick={pick} />)}</div>}
    </div>
  );
}

export default function GooseLearningPage() {
  const [statusPayload, setStatusPayload] = useState<StatusPayload | null>(null);
  const [records, setRecords] = useState<RecordsPayload | null>(null);
  const [league, setLeague] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [statusRes, recordsRes] = await Promise.all([
          fetch("/api/admin/goose-learning-lab/status", { cache: "no-store" }),
          fetch(`/api/admin/goose-learning-lab/records?league=${encodeURIComponent(league)}`, { cache: "no-store" }),
        ]);
        const [statusJson, recordsJson] = await Promise.all([statusRes.json(), recordsRes.json()]);
        if (!statusRes.ok || !statusJson.ok) throw new Error(statusJson.error || `Status failed ${statusRes.status}`);
        if (!recordsRes.ok || !recordsJson.ok) throw new Error(recordsJson.error || `Records failed ${recordsRes.status}`);
        if (!cancelled) {
          setStatusPayload(statusJson);
          setRecords(recordsJson);
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
  }, [league]);

  const status = statusPayload?.status;
  const blockers = status?.blockers || [];
  const readyToRecord = Boolean(status?.ready_to_record);
  const readyToCompare = Boolean(status?.ready_to_compare);
  const realEnoughForShadow = readyToRecord && readyToCompare && blockers.length === 0;
  const leagues = useMemo(() => ["ALL", ...(records?.leagues || [])], [records?.leagues]);
  const learningDays = records?.learning.byDay || [];
  const comparison = records?.comparison.byDayLeague || [];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-blue"><FlaskConical size={14} /> Goose Learning</div>
            <h1 className="mt-3 text-3xl font-bold text-white">Learning picks record</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">Shadow-only learning picks, all-league/per-league records, daily graded history, and manual comparison against production pick_history.</p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border border-dark-border bg-dark-surface px-4 py-2 text-sm font-semibold ${realEnoughForShadow ? "text-emerald-300" : "text-yellow-300"}`}>
            {realEnoughForShadow ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />} {realEnoughForShadow ? "Safe for shadow learning" : "Learning only"}
          </div>
        </div>
      </section>

      {loading && <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 text-sm text-gray-400">Loading Goose Learning records…</div>}
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {status && records && (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <StatCard label="Train examples" value={fmtNumber(status.train_examples)} tone="text-accent-blue" />
            <StatCard label="Test examples" value={fmtNumber(status.test_examples)} tone="text-accent-blue" />
            <StatCard label="Shadow picks" value={fmtNumber(status.shadow_picks)} tone="text-emerald-300" hint={`${fmtNumber(status.settled_shadow_picks)} settled`} />
            <StatCard label="Eligible signals" value={fmtNumber(status.eligible_signals)} tone="text-yellow-300" hint={`${fmtNumber(status.candidate_signals)} candidates tested`} />
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Record filter</h2>
                <p className="mt-1 text-sm text-gray-500">All leagues or one league at a time.</p>
              </div>
              <Link href="/admin/goose-model" className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue">Open Signal Lab</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {leagues.map((item) => (
                <button key={item} type="button" onClick={() => setLeague(item)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${league === item ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue" : "border-dark-border text-gray-400 hover:border-gray-500 hover:text-white"}`}>{item === "ALL" ? "All leagues" : item}</button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <RecordStrip title="Goose Learning record" record={records.learning.overall} tone="learning" />
            <RecordStrip title="Current picks record" record={records.production.overall} tone="production" />
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <h2 className="text-lg font-semibold text-white">League records</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {records.learning.byLeague.map((bucket) => <RecordStrip key={bucket.key} title={`Learning · ${bucket.label}`} record={bucket.record} tone="learning" />)}
              {records.production.byLeague.map((bucket) => <RecordStrip key={`prod-${bucket.key}`} title={`Current · ${bucket.label}`} record={bucket.record} tone="production" />)}
            </div>
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <h2 className="text-lg font-semibold text-white">Daily comparison</h2>
            <p className="mt-1 text-sm text-gray-500">Use this to manually check whether learning picks are beating current daily picks by win rate.</p>
            <div className="mt-4 space-y-2">
              {comparison.slice(0, 30).map((row) => (
                <div key={row.key} className="grid gap-2 rounded-xl border border-dark-border/60 bg-dark-bg/50 p-3 text-xs md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                  <div><p className="font-semibold text-white">{row.date} · {row.league}</p><p className="text-gray-500">graded: L {row.learning.settled} / C {row.production.settled}</p></div>
                  <div className="text-gray-300">Learning: <span className={(row.learning.winRate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400"}>{row.learning.wins}-{row.learning.losses}-{row.learning.pushes} · {fmtPct(row.learning.winRate)}</span></div>
                  <div className="text-gray-300">Current: <span className={(row.production.winRate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400"}>{row.production.wins}-{row.production.losses}-{row.production.pushes} · {fmtPct(row.production.winRate)}</span></div>
                  <div className={`font-bold ${row.deltaWinRate == null ? "text-gray-500" : row.deltaWinRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>{row.deltaWinRate == null ? "—" : `${row.deltaWinRate >= 0 ? "+" : ""}${row.deltaWinRate.toFixed(1)} pts`}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <h2 className="text-lg font-semibold text-white">Goose Learning picks by day</h2>
            <p className="mt-1 text-sm text-gray-500">Each pick, with daily total and graded record.</p>
            <div className="mt-4 space-y-3">{learningDays.map((bucket) => <DailyBucket key={bucket.key} bucket={bucket} />)}</div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><CheckCircle2 size={18} /> Readiness</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3"><span className="text-gray-400">Ready to record shadow picks</span><span className={readyToRecord ? "text-emerald-300" : "text-rose-300"}>{readyToRecord ? "Yes" : "No"}</span></div>
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3"><span className="text-gray-400">Ready for production comparison</span><span className={readyToCompare ? "text-emerald-300" : "text-rose-300"}>{readyToCompare ? "Yes" : "No"}</span></div>
                <div className="flex items-center justify-between rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3"><span className="text-gray-400">Sanity rejected share</span><span className="text-gray-200">{status.diagnostics?.sanity_rejected_share == null ? "—" : `${(status.diagnostics.sanity_rejected_share * 100).toFixed(1)}%`}</span></div>
              </div>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Lock size={18} /> Safety rails</h2>
              <div className="mt-4 space-y-3 text-sm text-gray-400">
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">Shadow-only recording/comparison is safe to watch here.</p>
                <p className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-yellow-200">Production promotion remains manual. Learning picks are not auto-published to users.</p>
                <p className="rounded-xl border border-dark-border/60 bg-dark-bg/50 px-4 py-3">{status.diagnostics?.production_write_protection || "Status endpoint is read-only."}</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
