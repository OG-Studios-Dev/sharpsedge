"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AdminOpsData, AdminBug, BugSeverity, BugStatus, CronScheduleItem } from "@/lib/admin-ops-store";

const BUG_STATUSES: BugStatus[] = ["open", "in_progress", "fixed", "deferred"];
const BUG_SEVERITIES: BugSeverity[] = ["critical", "high", "medium", "low"];

function niceLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function toneForStatus(status: BugStatus) {
  if (status === "fixed") return "bg-accent-green/10 text-accent-green";
  if (status === "in_progress") return "bg-accent-blue/10 text-accent-blue";
  if (status === "deferred") return "bg-accent-yellow/10 text-accent-yellow";
  return "bg-accent-red/10 text-accent-red";
}

function toneForSeverity(severity: BugSeverity) {
  if (severity === "critical") return "text-red-400";
  if (severity === "high") return "text-orange-400";
  if (severity === "medium") return "text-yellow-400";
  return "text-gray-400";
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function AdminOpsBoard({ initialData }: { initialData: AdminOpsData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bugDraft, setBugDraft] = useState({
    title: "",
    summary: "",
    area: "",
    severity: "high" as BugSeverity,
    status: "open" as BugStatus,
    owner: "",
    source: "QA",
  });
  const [cronDraft, setCronDraft] = useState({
    name: "",
    schedule: "",
    purpose: "",
    owner: "",
    target: "",
    enabled: true,
    notes: "",
  });

  const openBugs = useMemo(
    () => data.bugs.filter((bug) => bug.status !== "fixed").sort((a, b) => a.foundAt < b.foundAt ? 1 : -1),
    [data.bugs],
  );

  async function patch(action: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Update failed");
      if (result?.data) setData(result.data as AdminOpsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function add(action: string, payload: Record<string, unknown>, reset: () => void) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Create failed");

      const refreshed = await fetch("/api/admin/ops", { cache: "no-store" });
      const refreshedData = await refreshed.json();
      setData(refreshedData as AdminOpsData);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Total bugs logged</p>
          <p className="mt-3 text-3xl font-bold text-white">{data.bugs.length}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Unfixed queue</p>
          <p className="mt-3 text-3xl font-bold text-accent-yellow">{openBugs.length}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Cron jobs tracked</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{data.cronSchedules.length}</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Last ops review</p>
          <p className="mt-3 text-sm font-semibold text-white">{data.lastReviewedAt ? new Date(data.lastReviewedAt).toLocaleString() : "Not reviewed yet"}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <SectionCard title="Unfixed bugs" subtitle="This is the IT leader review queue — everything not marked fixed stays here.">
        <div className="space-y-3">
          {openBugs.length === 0 ? (
            <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 px-4 py-3 text-sm text-gray-400">No open bugs right now.</div>
          ) : openBugs.map((bug) => (
            <div key={bug.id} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{bug.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneForStatus(bug.status)}`}>{niceLabel(bug.status)}</span>
                    <span className={`text-xs font-semibold uppercase ${toneForSeverity(bug.severity)}`}>{bug.severity}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">{bug.summary}</p>
                  <p className="mt-2 text-xs text-gray-500">{bug.area} · owner: {bug.owner || "Unassigned"} · source: {bug.source}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={bug.status}
                    onChange={(e) => patch("update_bug", { id: bug.id, updates: { status: e.target.value } })}
                    className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-white"
                    disabled={saving}
                  >
                    {BUG_STATUSES.map((status) => <option key={status} value={status}>{niceLabel(status)}</option>)}
                  </select>
                  <input
                    value={bug.owner}
                    onChange={(e) => patch("update_bug", { id: bug.id, updates: { owner: e.target.value } })}
                    className="rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-white"
                    placeholder="Owner"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Add bug" subtitle="Log every issue here as soon as QA, Marco, or a user finds it.">
        <div className="grid gap-3 md:grid-cols-2">
          <input value={bugDraft.title} onChange={(e) => setBugDraft((prev) => ({ ...prev, title: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Bug title" />
          <input value={bugDraft.area} onChange={(e) => setBugDraft((prev) => ({ ...prev, area: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Area / page / API" />
          <textarea value={bugDraft.summary} onChange={(e) => setBugDraft((prev) => ({ ...prev, summary: e.target.value }))} className="min-h-[100px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="What broke? How did it show up?" />
          <input value={bugDraft.owner} onChange={(e) => setBugDraft((prev) => ({ ...prev, owner: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Owner" />
          <input value={bugDraft.source} onChange={(e) => setBugDraft((prev) => ({ ...prev, source: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Source" />
          <select value={bugDraft.severity} onChange={(e) => setBugDraft((prev) => ({ ...prev, severity: e.target.value as BugSeverity }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
            {BUG_SEVERITIES.map((severity) => <option key={severity} value={severity}>{niceLabel(severity)}</option>)}
          </select>
          <select value={bugDraft.status} onChange={(e) => setBugDraft((prev) => ({ ...prev, status: e.target.value as BugStatus }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
            {BUG_STATUSES.map((status) => <option key={status} value={status}>{niceLabel(status)}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => add("add_bug", bugDraft, () => setBugDraft({ title: "", summary: "", area: "", severity: "high", status: "open", owner: "", source: "QA" }))}
          disabled={saving || !bugDraft.title.trim() || !bugDraft.summary.trim()}
          className="mt-4 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add bug to log
        </button>
      </SectionCard>

      <SectionCard title="Cron schedule" subtitle="Track scheduled jobs here so ops can review, edit, and add automations without guessing.">
        <div className="space-y-3">
          {data.cronSchedules.map((cron) => (
            <CronEditor key={cron.id} cron={cron} onChange={(updates) => patch("update_cron", { id: cron.id, updates })} saving={saving} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Add cron job" subtitle="Use this for planned jobs, heartbeat replacements, or Vercel cron entries you want documented.">
        <div className="grid gap-3 md:grid-cols-2">
          <input value={cronDraft.name} onChange={(e) => setCronDraft((prev) => ({ ...prev, name: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Job name" />
          <input value={cronDraft.schedule} onChange={(e) => setCronDraft((prev) => ({ ...prev, schedule: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Schedule (e.g. 0 6 * * *)" />
          <input value={cronDraft.owner} onChange={(e) => setCronDraft((prev) => ({ ...prev, owner: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Owner" />
          <input value={cronDraft.target} onChange={(e) => setCronDraft((prev) => ({ ...prev, target: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Target" />
          <textarea value={cronDraft.purpose} onChange={(e) => setCronDraft((prev) => ({ ...prev, purpose: e.target.value }))} className="min-h-[90px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Purpose / what it does" />
          <textarea value={cronDraft.notes} onChange={(e) => setCronDraft((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[90px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Notes / risks / links" />
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={cronDraft.enabled} onChange={(e) => setCronDraft((prev) => ({ ...prev, enabled: e.target.checked }))} />
            Enabled
          </label>
        </div>
        <button
          type="button"
          onClick={() => add("add_cron", cronDraft, () => setCronDraft({ name: "", schedule: "", purpose: "", owner: "", target: "", enabled: true, notes: "" }))}
          disabled={saving || !cronDraft.name.trim() || !cronDraft.schedule.trim()}
          className="mt-4 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add cron job
        </button>
      </SectionCard>

      <SectionCard title="Full bug log" subtitle="Everything found stays recorded here, even after it is fixed.">
        <div className="space-y-3">
          {data.bugs.map((bug) => (
            <div key={bug.id} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{bug.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${toneForStatus(bug.status)}`}>{niceLabel(bug.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">{bug.summary}</p>
                  <p className="mt-2 text-xs text-gray-500">{new Date(bug.foundAt).toLocaleString()} · {bug.area} · {bug.source}</p>
                </div>
                <span className={`text-xs font-semibold uppercase ${toneForSeverity(bug.severity)}`}>{bug.severity}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function CronEditor({ cron, onChange, saving }: { cron: CronScheduleItem; onChange: (updates: Partial<CronScheduleItem>) => void; saving: boolean }) {
  return (
    <div className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <input defaultValue={cron.name} onBlur={(e) => onChange({ name: e.target.value })} className="rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white" placeholder="Job name" disabled={saving} />
        <input defaultValue={cron.schedule} onBlur={(e) => onChange({ schedule: e.target.value })} className="rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white" placeholder="Schedule" disabled={saving} />
        <input defaultValue={cron.owner} onBlur={(e) => onChange({ owner: e.target.value })} className="rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white" placeholder="Owner" disabled={saving} />
        <input defaultValue={cron.target} onBlur={(e) => onChange({ target: e.target.value })} className="rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white" placeholder="Target" disabled={saving} />
        <textarea defaultValue={cron.purpose} onBlur={(e) => onChange({ purpose: e.target.value })} className="min-h-[80px] rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white md:col-span-2" placeholder="Purpose" disabled={saving} />
        <textarea defaultValue={cron.notes} onBlur={(e) => onChange({ notes: e.target.value })} className="min-h-[80px] rounded-xl border border-dark-border bg-dark-surface px-3 py-2 text-sm text-white md:col-span-2" placeholder="Notes" disabled={saving} />
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" defaultChecked={cron.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} disabled={saving} />
          Enabled
        </label>
        <p className="text-xs text-gray-500">Updated {new Date(cron.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
