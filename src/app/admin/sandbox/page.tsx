import Link from "next/link";
import { listSandboxSlateBundles } from "@/lib/sandbox/store";
import type { SandboxPickRecord, SandboxReviewStatus, SandboxSlateBundle } from "@/lib/sandbox/types";

export const dynamic = "force-dynamic";

function StatusPill({ label, tone }: { label: string; tone: "blue" | "yellow" | "green" | "red" | "gray" }) {
  const className = tone === "green"
    ? "bg-accent-green/10 text-accent-green"
    : tone === "red"
      ? "bg-accent-red/10 text-accent-red"
      : tone === "blue"
        ? "bg-accent-blue/10 text-accent-blue"
        : tone === "gray"
          ? "bg-white/5 text-gray-300"
          : "bg-accent-yellow/10 text-accent-yellow";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function reviewTone(status: SandboxReviewStatus): "yellow" | "blue" | "green" | "red" {
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  if (status === "reviewed") return "blue";
  return "yellow";
}

function outcomeTone(result: SandboxPickRecord["result"] | "void"): "gray" | "green" | "red" | "yellow" {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "push") return "yellow";
  return "gray";
}

function leagueSummary(bundles: SandboxSlateBundle[], league: "NHL" | "NBA") {
  const scoped = bundles.filter((bundle) => bundle.slate?.league === league);
  const latest = scoped[0]?.slate ?? null;
  const reviewed = scoped.filter((bundle) => bundle.slate?.review_status !== "pending").length;
  return {
    count: scoped.length,
    latestCount: latest?.pick_count ?? 0,
    latestDate: latest?.date ?? "—",
    reviewed,
  };
}

function renderNoteBlock(title: string, body: string | null | undefined) {
  if (!body) return null;
  return (
    <div className="rounded-lg border border-dark-border/50 bg-black/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-gray-200 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function PickReviewCard({ pick }: { pick: SandboxPickRecord }) {
  const snapshot = pick.review_snapshot;
  return (
    <div className="rounded-xl border border-dark-border/50 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{pick.pick_label}</p>
          <p className="mt-1 text-xs text-gray-400">
            {pick.team}{pick.opponent ? ` vs ${pick.opponent}` : ""} · {pick.book ?? "Model line"}
            {typeof pick.odds === "number" ? ` · ${pick.odds > 0 ? "+" : ""}${pick.odds}` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Hit rate {typeof pick.hit_rate === "number" ? `${pick.hit_rate.toFixed(0)}%` : "—"}
            {" · "}
            Edge {typeof pick.edge === "number" ? `${pick.edge.toFixed(1)}%` : "—"}
            {" · "}
            Confidence {typeof pick.confidence === "number" ? `${pick.confidence}` : "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={`review: ${pick.review_status}`} tone={reviewTone(pick.review_status)} />
          <StatusPill label={`outcome: ${snapshot.outcome}`} tone={outcomeTone(snapshot.outcome)} />
          <StatusPill label="sandbox only" tone="gray" />
        </div>
      </div>

      {pick.reasoning ? (
        <div className="mt-4 rounded-lg border border-accent-blue/20 bg-accent-blue/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-blue">Visible reasoning</p>
          <p className="mt-2 text-sm leading-6 text-gray-200 whitespace-pre-wrap">{pick.reasoning}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {renderNoteBlock("Home / away", snapshot.checklist.home_away)}
        {renderNoteBlock("Travel / rest", snapshot.checklist.travel_rest)}
        {renderNoteBlock("Injuries / news", snapshot.checklist.injuries_news)}
        {renderNoteBlock("Matchup context", snapshot.checklist.matchup_context)}
        {renderNoteBlock("Price discipline", snapshot.checklist.price_discipline)}
        {renderNoteBlock("Pregame learning", snapshot.learnings.pregame)}
        {renderNoteBlock("Postmortem", snapshot.learnings.postmortem)}
        {renderNoteBlock("Model adjustment", snapshot.learnings.model_adjustment)}
        {renderNoteBlock("Outcome notes", snapshot.outcome_notes)}
        {renderNoteBlock("Reviewer notes", pick.review_notes)}
      </div>
    </div>
  );
}

function LeagueReviewSection({ title, description, bundles }: { title: string; description: string; bundles: SandboxSlateBundle[] }) {
  return (
    <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {bundles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dark-border/70 bg-dark-bg/40 px-4 py-6 text-sm text-gray-500">
            No stored daily review yet for this league.
          </div>
        ) : bundles.map((bundle) => {
          const slate = bundle.slate;
          if (!slate) return null;
          const snapshot = slate.review_snapshot;
          return (
            <div key={slate.sandbox_key} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{slate.date} · {slate.sandbox_key}</p>
                  <p className="mt-1 text-xs text-gray-500">{slate.pick_count}/{slate.expected_pick_count} sandbox picks · experiment {slate.experiment_tag ?? "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={slate.status} tone={slate.status === "locked" ? "green" : "blue"} />
                  <StatusPill label={`review: ${slate.review_status}`} tone={reviewTone(slate.review_status)} />
                  <StatusPill label="admin only" tone="gray" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {renderNoteBlock("Slate pregame thesis", snapshot.learnings.pregame ?? slate.review_notes)}
                {renderNoteBlock("Slate postmortem", snapshot.learnings.postmortem)}
                {renderNoteBlock("Model adjustment", snapshot.learnings.model_adjustment)}
                {renderNoteBlock("Home / away review", snapshot.checklist.home_away)}
                {renderNoteBlock("Travel / rest review", snapshot.checklist.travel_rest)}
                {renderNoteBlock("Injuries / news review", snapshot.checklist.injuries_news)}
                {renderNoteBlock("Matchup context", snapshot.checklist.matchup_context)}
                {renderNoteBlock("Price discipline", snapshot.checklist.price_discipline)}
                {renderNoteBlock("Outcome notes", snapshot.outcome_notes)}
              </div>

              <div className="mt-5 rounded-xl border border-dark-border/50 bg-black/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Daily picks under review</p>
                    <p className="mt-1 text-xs text-gray-500">Separate from production. Visible reasoning + review rails stay internal only.</p>
                  </div>
                  <p className="text-xs text-gray-500">Expected board: 10 picks</p>
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {bundle.picks.map((pick) => <PickReviewCard key={pick.id} pick={pick} />)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function AdminSandboxPage() {
  let bundles: SandboxSlateBundle[] = [];
  let loadError: string | null = null;

  try {
    bundles = await listSandboxSlateBundles();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Sandbox storage unavailable.";
  }

  const nhl = leagueSummary(bundles, "NHL");
  const nba = leagueSummary(bundles, "NBA");
  const nhlBundles = bundles.filter((bundle) => bundle.slate?.league === "NHL");
  const nbaBundles = bundles.filter((bundle) => bundle.slate?.league === "NBA");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Internal sandbox rail</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Sandbox Daily Review</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Dedicated internal review surface for daily sandbox-only NBA and NHL boards. This is where the team can inspect
              the full 10-pick experimental slate, visible reasoning, review checklist, outcome states, and postmortem learnings
              without polluting production picks, records, or user-facing history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className="rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent-blue/30 hover:text-white">
              Back to admin
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Public exposure</p>
          <p className="mt-3 text-3xl font-bold text-accent-green">0</p>
          <p className="mt-1 text-xs text-gray-500">Sandbox review data is isolated from public picks/history and production records.</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">NHL daily review</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{nhl.latestCount || 0}</p>
          <p className="mt-1 text-xs text-gray-500">Latest slate: {nhl.latestDate} · {nhl.count} stored day(s) · {nhl.reviewed} touched review(s)</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">NBA daily review</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{nba.latestCount || 0}</p>
          <p className="mt-1 text-xs text-gray-500">Latest slate: {nba.latestDate} · {nba.count} stored day(s) · {nba.reviewed} touched review(s)</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Review rails</p>
          <p className="mt-3 text-lg font-bold text-white">Reasoning + postmortem</p>
          <p className="mt-1 text-xs text-gray-500">Each sandbox board carries checklist prompts, visible reasoning, outcomes, and learnings.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Generator API</h2>
            <p className="mt-1 text-sm text-gray-500">Admin-only POST target to generate isolated daily review boards.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dark-border/70 bg-dark-bg/50 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white">Generate today&apos;s sandbox daily review</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-100">{`POST /api/admin/sandbox\nContent-Type: application/json\n\n{ "mode": "generate", "league": "NBA" }\n{ "mode": "generate", "league": "NHL" }`}</pre>
          <p className="mt-3 text-xs text-gray-500">Each request attempts to build an internal 10-pick sandbox board for the requested league/date and refresh the same sandbox key for that day.</p>
        </div>
      </section>

      {loadError ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          <p className="font-semibold">Sandbox tables not yet set up — ask Nick to apply the migration.</p>
          <p className="mt-1 text-amber-50/90">
            Migration file: <code className="rounded bg-black/20 px-1 text-amber-50">supabase/migrations/20260325090000_sandbox_picks.sql</code>
          </p>
          <p className="mt-2 text-xs text-amber-50/70">{loadError}</p>
        </section>
      ) : null}

      <LeagueReviewSection
        title="NHL Sandbox Daily Review"
        description="Daily internal NHL slate with 10 sandbox picks, visible rationale, review checklist, and postmortem rails."
        bundles={nhlBundles}
      />

      <LeagueReviewSection
        title="NBA Sandbox Daily Review"
        description="Daily internal NBA slate with 10 sandbox picks, visible rationale, review checklist, and postmortem rails."
        bundles={nbaBundles}
      />
    </div>
  );
}
