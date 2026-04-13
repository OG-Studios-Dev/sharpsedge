"use client";

import { useMemo, useState } from "react";
import type { AdminTeamBoardData, SprintStatus, TeamMember, TeamStatus, TeamScorecardEntry } from "@/lib/admin-team-store";

const TEAM_STATUSES: TeamStatus[] = ["green", "yellow", "red"];
const WORKSTREAM_STATUSES: SprintStatus[] = ["done", "partial", "blocked", "unverified"];

function niceLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: TeamStatus) {
  if (status === "green") return "bg-accent-green/10 text-accent-green border-accent-green/20";
  if (status === "yellow") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
}

function workstreamTone(status: SprintStatus) {
  if (status === "done") return "bg-accent-green/10 text-accent-green";
  if (status === "partial") return "bg-accent-blue/10 text-accent-blue";
  if (status === "blocked") return "bg-red-500/10 text-red-300";
  return "bg-yellow-500/10 text-yellow-300";
}

function MetricCard({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function TrendDots({ entries }: { entries: TeamScorecardEntry[] }) {
  const recent = entries.slice(0, 4).reverse();
  return (
    <div className="flex items-center gap-2">
      {recent.length === 0 ? <span className="text-xs text-gray-500">No history yet</span> : recent.map((entry) => (
        <span
          key={entry.id}
          title={`${entry.weekLabel}: ${niceLabel(entry.status)} | Done ${entry.completions} | Blocked ${entry.blocked}`}
          className={`h-3 w-3 rounded-full ${entry.status === "green" ? "bg-accent-green" : entry.status === "yellow" ? "bg-yellow-300" : "bg-red-400"}`}
        />
      ))}
    </div>
  );
}

function TeamCard({ member, scorecards, onSave, saving }: { member: TeamMember; scorecards: TeamScorecardEntry[]; onSave: (id: string, updates: Partial<TeamMember>) => void; saving: boolean }) {
  const [draft, setDraft] = useState(member);

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-bg/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{member.name}</h3>
          <p className="text-sm text-gray-400">{member.role}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">{member.lane}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(draft.status)}`}>{niceLabel(draft.status)}</span>
          <TrendDots entries={scorecards} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <input value={draft.manager} onChange={(e) => setDraft((prev) => ({ ...prev, manager: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Manager" />
        <select value={draft.status} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as TeamStatus }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
          {TEAM_STATUSES.map((status) => <option key={status} value={status}>{niceLabel(status)}</option>)}
        </select>
        <textarea value={draft.focus} onChange={(e) => setDraft((prev) => ({ ...prev, focus: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Core focus" />
        <textarea value={draft.kpi} onChange={(e) => setDraft((prev) => ({ ...prev, kpi: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="KPI / accountability measure" />
        <textarea value={draft.outputSummary} onChange={(e) => setDraft((prev) => ({ ...prev, outputSummary: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Output summary" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input type="number" value={draft.sprintCompletions} onChange={(e) => setDraft((prev) => ({ ...prev, sprintCompletions: Number(e.target.value || 0) }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Done" />
        <input type="number" value={draft.sprintPartials} onChange={(e) => setDraft((prev) => ({ ...prev, sprintPartials: Number(e.target.value || 0) }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Partial" />
        <input type="number" value={draft.sprintBlocked} onChange={(e) => setDraft((prev) => ({ ...prev, sprintBlocked: Number(e.target.value || 0) }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Blocked" />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <textarea value={draft.wins.join("\n")} onChange={(e) => setDraft((prev) => ({ ...prev, wins: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) }))} className="min-h-[96px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Wins, one per line" />
        <textarea value={draft.risks.join("\n")} onChange={(e) => setDraft((prev) => ({ ...prev, risks: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) }))} className="min-h-[96px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Risks, one per line" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>Last updated {new Date(member.updatedAt).toLocaleString()}</span>
        <button
          type="button"
          onClick={() => onSave(member.id, draft)}
          disabled={saving}
          className="rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save member
        </button>
      </div>
    </div>
  );
}

export default function AdminTeamBoard({ initialData }: { initialData: AdminTeamBoardData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", lane: "", ownerId: "", goal: "", proofRequired: "", status: "partial" as SprintStatus, dueDate: "", notes: "" });
  const [weekLabel, setWeekLabel] = useState("");

  const summary = useMemo(() => {
    const green = data.members.filter((m) => m.status === "green").length;
    const yellow = data.members.filter((m) => m.status === "yellow").length;
    const red = data.members.filter((m) => m.status === "red").length;
    const done = data.workstreams.filter((w) => w.status === "done").length;
    const blocked = data.workstreams.filter((w) => w.status === "blocked").length;
    const snapshots = new Set(data.scorecards.map((entry) => entry.weekLabel)).size;
    return { green, yellow, red, done, blocked, snapshots };
  }, [data]);

  const memberMap = new Map(data.members.map((member) => [member.id, member]));
  const scorecardMap = new Map<string, TeamScorecardEntry[]>();
  for (const entry of data.scorecards) {
    const current = scorecardMap.get(entry.memberId) ?? [];
    current.push(entry);
    scorecardMap.set(entry.memberId, current);
  }

  async function patch(action: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/team", {
        method: action === "capture_scorecard" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Update failed");
      if (result?.data) setData(result.data as AdminTeamBoardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function addWorkstream() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_workstream", ...draft, dueDate: draft.dueDate || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Create failed");
      const refreshed = await fetch("/api/admin/team", { cache: "no-store" });
      const refreshedData = await refreshed.json();
      setData(refreshedData as AdminTeamBoardData);
      setDraft({ title: "", lane: "", ownerId: "", goal: "", proofRequired: "", status: "partial", dueDate: "", notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-6">
        <MetricCard label="Green performers" value={String(summary.green)} tone="text-accent-green" />
        <MetricCard label="Yellow watch" value={String(summary.yellow)} tone="text-yellow-300" />
        <MetricCard label="Red risk" value={String(summary.red)} tone="text-red-300" />
        <MetricCard label="Done workstreams" value={String(summary.done)} tone="text-accent-blue" />
        <MetricCard label="Blocked workstreams" value={String(summary.blocked)} tone="text-red-300" />
        <MetricCard label="Weekly snapshots" value={String(summary.snapshots)} tone="text-gray-200" />
      </section>

      {error ? <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">CEO reporting view</h2>
            <p className="mt-1 text-sm text-gray-500">Who owns what, what they shipped, whether performance is improving, and where the sprint is stalling.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={weekLabel} onChange={(e) => setWeekLabel(e.target.value)} placeholder="Week label (optional)" className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" />
            <button type="button" onClick={() => patch("capture_scorecard", { weekLabel })} disabled={saving} className="rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              Capture weekly scorecard
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-gray-500">Last reviewed {data.lastReviewedAt ? new Date(data.lastReviewedAt).toLocaleString() : "—"}</div>
      </section>

      <section className="space-y-4">
        {data.members.map((member) => (
          <TeamCard key={member.id} member={member} scorecards={scorecardMap.get(member.id) ?? []} saving={saving} onSave={(id, updates) => patch("update_member", { id, updates })} />
        ))}
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-lg font-semibold text-white">Sprint workstreams</h2>
        <p className="mt-1 text-sm text-gray-500">Every meaningful stream needs owner, goal, proof, and terminal state. This is the launch truth board.</p>
        <div className="mt-4 space-y-3">
          {data.workstreams.map((item) => (
            <div key={item.id} className="rounded-2xl border border-dark-border/70 bg-dark-bg/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.lane} • Owner: {memberMap.get(item.ownerId)?.name ?? item.ownerId}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${workstreamTone(item.status)}`}>{niceLabel(item.status)}</span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <textarea defaultValue={item.goal} onBlur={(e) => patch("update_workstream", { id: item.id, updates: { goal: e.target.value } })} className="min-h-[80px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" />
                <textarea defaultValue={item.proofRequired} onBlur={(e) => patch("update_workstream", { id: item.id, updates: { proofRequired: e.target.value } })} className="min-h-[80px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" />
                <select defaultValue={item.status} onChange={(e) => patch("update_workstream", { id: item.id, updates: { status: e.target.value as SprintStatus } })} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
                  {WORKSTREAM_STATUSES.map((status) => <option key={status} value={status}>{niceLabel(status)}</option>)}
                </select>
                <input type="date" defaultValue={item.dueDate ?? ""} onBlur={(e) => patch("update_workstream", { id: item.id, updates: { dueDate: e.target.value || null } })} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" />
                <textarea defaultValue={item.notes} onBlur={(e) => patch("update_workstream", { id: item.id, updates: { notes: e.target.value } })} className="min-h-[80px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-lg font-semibold text-white">Add workstream</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Workstream title" />
          <input value={draft.lane} onChange={(e) => setDraft((prev) => ({ ...prev, lane: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" placeholder="Lane" />
          <select value={draft.ownerId} onChange={(e) => setDraft((prev) => ({ ...prev, ownerId: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
            <option value="">Select owner</option>
            {data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <select value={draft.status} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as SprintStatus }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white">
            {WORKSTREAM_STATUSES.map((status) => <option key={status} value={status}>{niceLabel(status)}</option>)}
          </select>
          <textarea value={draft.goal} onChange={(e) => setDraft((prev) => ({ ...prev, goal: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Goal" />
          <textarea value={draft.proofRequired} onChange={(e) => setDraft((prev) => ({ ...prev, proofRequired: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Proof required" />
          <input type="date" value={draft.dueDate} onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))} className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white" />
          <div className="hidden md:block" />
          <textarea value={draft.notes} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} className="min-h-[88px] rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white md:col-span-2" placeholder="Notes / blockers / context" />
        </div>
        <button type="button" onClick={addWorkstream} disabled={saving || !draft.title.trim() || !draft.ownerId.trim()} className="mt-4 rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Add workstream
        </button>
      </section>
    </div>
  );
}
