import Link from "next/link";
import { listSandboxSlateBundles } from "@/lib/sandbox/store";
import type { SandboxSlateBundle } from "@/lib/sandbox/types";

export const dynamic = "force-dynamic";

function StatusPill({ label, tone }: { label: string; tone: "blue" | "yellow" | "green" | "red" }) {
  const className = tone === "green"
    ? "bg-accent-green/10 text-accent-green"
    : tone === "red"
      ? "bg-accent-red/10 text-accent-red"
      : tone === "blue"
        ? "bg-accent-blue/10 text-accent-blue"
        : "bg-accent-yellow/10 text-accent-yellow";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function leagueSummary(bundles: SandboxSlateBundle[], league: "NHL" | "NBA") {
  const scoped = bundles.filter((bundle) => bundle.slate?.league === league);
  const latest = scoped[0]?.slate ?? null;
  return {
    count: scoped.length,
    latestCount: latest?.pick_count ?? 0,
    latestDate: latest?.date ?? "—",
  };
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

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pilot rail</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Sandbox Picks</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Separate from production pick history by design. This rail now supports isolated daily sandbox generation
              for NBA and NHL at 10 picks per league/day, plus review notes for home/away, travel, hot runs, injuries/news,
              and price discipline.
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
          <p className="mt-1 text-xs text-gray-500">Sandbox data is not wired into public picks/history surfaces.</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">NHL sandbox</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{nhl.latestCount || 0}</p>
          <p className="mt-1 text-xs text-gray-500">Latest slate: {nhl.latestDate} · {nhl.count} stored slate(s)</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">NBA sandbox</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{nba.latestCount || 0}</p>
          <p className="mt-1 text-xs text-gray-500">Latest slate: {nba.latestDate} · {nba.count} stored slate(s)</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Review requirement</p>
          <p className="mt-3 text-lg font-bold text-white">Stats angles required</p>
          <p className="mt-1 text-xs text-gray-500">Home/away, travel, hot runs, injuries/news, and price discipline.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Generator API</h2>
            <p className="mt-1 text-sm text-gray-500">Admin-only POST target to generate the isolated daily slates.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dark-border/70 bg-dark-bg/50 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white">Generate today&apos;s sandbox slate</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-100">{`POST /api/admin/sandbox\nContent-Type: application/json\n\n{ "mode": "generate", "league": "NBA" }\n{ "mode": "generate", "league": "NHL" }`}</pre>
          <p className="mt-3 text-xs text-gray-500">Each request attempts to lock 10 picks for the requested league/date in sandbox tables only. Re-running refreshes the same sandbox key for that league/date.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Current sandbox slates</h2>
            <p className="mt-1 text-sm text-gray-500">Stored bundles only; production pick slates/history remain untouched.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {loadError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              <p className="font-semibold">Sandbox storage is not live yet.</p>
              <p className="mt-1 text-amber-50/90">{loadError}</p>
              <p className="mt-2 text-xs text-amber-50/80">Repo tooling can verify the sandbox schema is missing, but this checkout is not linked to a remote Supabase project for safe CLI apply. Apply <code className="text-amber-50">scripts/setup-sandbox-picks.sql</code> on the org-owned Supabase project, then use <code className="text-amber-50">POST /api/admin/sandbox</code> with generate mode for NBA or NHL.</p>
            </div>
          ) : bundles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-border/70 bg-dark-bg/40 px-4 py-6 text-sm text-gray-500">
              No sandbox slates yet. Generate them via <code className="text-gray-300">POST /api/admin/sandbox</code> with <code className="text-gray-300">mode: "generate"</code> after running <code className="text-gray-300">scripts/setup-sandbox-picks.sql</code>.
            </div>
          ) : bundles.map((bundle) => {
            const slate = bundle.slate;
            if (!slate) return null;
            return (
              <div key={slate.sandbox_key} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{slate.sandbox_key}</p>
                    <p className="text-xs text-gray-500">{slate.date} • {slate.league} • {slate.pick_count}/{slate.expected_pick_count} picks</p>
                    {slate.experiment_tag ? <p className="mt-1 text-xs text-gray-400">Experiment: {slate.experiment_tag}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill label={slate.status} tone={slate.status === "locked" ? "green" : "blue"} />
                    <StatusPill label={slate.review_status} tone={slate.review_status === "approved" ? "green" : slate.review_status === "rejected" ? "red" : "yellow"} />
                  </div>
                </div>
                {slate.review_notes ? <p className="mt-3 text-sm text-gray-300">{slate.review_notes}</p> : null}
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {bundle.picks.map((pick) => (
                    <div key={pick.id} className="rounded-lg border border-dark-border/50 bg-black/20 p-3">
                      <p className="text-sm font-semibold text-white">{pick.pick_label}</p>
                      <p className="mt-1 text-xs text-gray-400">{pick.team}{pick.opponent ? ` vs ${pick.opponent}` : ""} · {pick.book ?? "Model line"}{typeof pick.odds === "number" ? ` · ${pick.odds > 0 ? "+" : ""}${pick.odds}` : ""}</p>
                      <p className="mt-1 text-xs text-gray-500">Hit rate {typeof pick.hit_rate === "number" ? `${pick.hit_rate.toFixed(0)}%` : "—"} · Edge {typeof pick.edge === "number" ? `${pick.edge.toFixed(1)}%` : "—"} · Confidence {typeof pick.confidence === "number" ? `${pick.confidence}` : "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
