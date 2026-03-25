import Link from "next/link";
import { listSandboxSlates } from "@/lib/sandbox/store";
import type { SandboxSlateRecord } from "@/lib/sandbox/types";

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

export default async function AdminSandboxPage() {
  let slates: SandboxSlateRecord[] = [];
  let loadError: string | null = null;

  try {
    slates = await listSandboxSlates();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Sandbox storage unavailable.";
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pilot rail</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Sandbox Picks</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Separate from production pick history by design. Use this rail to stage experimental slates,
              review angles like home/away, travel, and hot runs, and keep public picks untouched.
            </p>
          </div>
          <Link href="/admin" className="rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent-blue/30 hover:text-white">
            Back to admin
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Public exposure</p>
          <p className="mt-3 text-3xl font-bold text-accent-green">0</p>
          <p className="mt-1 text-xs text-gray-500">Sandbox data is not wired into public picks/history surfaces.</p>
        </div>
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Sandbox slates</p>
          <p className="mt-3 text-3xl font-bold text-accent-blue">{slates.length}</p>
          <p className="mt-1 text-xs text-gray-500">Stored in dedicated sandbox tables only.</p>
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
            <h2 className="text-lg font-semibold text-white">Current sandbox slates</h2>
            <p className="mt-1 text-sm text-gray-500">This first slice is read-first UI plus isolated storage/API scaffolding.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {loadError ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              <p className="font-semibold">Sandbox storage is not live yet.</p>
              <p className="mt-1 text-amber-50/90">{loadError}</p>
              <p className="mt-2 text-xs text-amber-50/80">Run <code className="text-amber-50">scripts/setup-sandbox-picks.sql</code> in Supabase, then create slates via <code className="text-amber-50">POST /api/admin/sandbox</code>.</p>
            </div>
          ) : slates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-border/70 bg-dark-bg/40 px-4 py-6 text-sm text-gray-500">
              No sandbox slates yet. Create them via <code className="text-gray-300">POST /api/admin/sandbox</code> after running <code className="text-gray-300">scripts/setup-sandbox-picks.sql</code>.
            </div>
          ) : slates.map((slate) => (
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
