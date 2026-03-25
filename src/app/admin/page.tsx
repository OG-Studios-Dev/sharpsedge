import Link from "next/link";
import { getAdminOverviewData } from "@/lib/admin";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const overview = await getAdminOverviewData();

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total users" value={String(overview.totalUsers)} />
        <StatCard label="7d signups" value={String(overview.recentSignups)} />
        <StatCard label="Pick record" value={`${overview.pickSummary.wins}-${overview.pickSummary.losses}-${overview.pickSummary.pushes}`} tone="text-accent-blue" />
        <StatCard label="API health" value={`${overview.healthyApis}/${overview.healthChecks.length}`} tone={overview.healthyApis === overview.healthChecks.length ? "text-accent-green" : "text-accent-yellow"} />
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">IT leader review</h2>
            <p className="mt-1 text-sm text-gray-500">Bug log, incidents, cron tracking, and sandbox pilot review rail.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/ops" className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue">
              Open IT review
            </Link>
            <Link href="/admin/sandbox" className="rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent-blue/30 hover:text-white">
              Open sandbox pilot
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <StatCard label="Bugs logged" value={String(overview.opsSummary.totalBugs)} />
          <StatCard label="Open bugs" value={String(overview.opsSummary.openBugs)} tone="text-accent-yellow" />
          <StatCard label="Active incidents" value={String(overview.opsSummary.activeIncidents)} tone="text-orange-300" />
          <StatCard label="Cron issues" value={String(overview.opsSummary.cronIssues)} tone="text-accent-blue" />
          <StatCard label="Last review" value={overview.opsSummary.lastReviewedAt ? new Date(overview.opsSummary.lastReviewedAt).toLocaleDateString() : "Not yet"} tone="text-gray-200" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4 md:col-span-2">
          <h2 className="text-lg font-semibold text-white">Health summary</h2>
          <div className="mt-4 space-y-3">
            {overview.healthChecks.map((check) => (
              <div key={check.name} className="flex items-center justify-between rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{check.name}</p>
                  <p className="text-xs text-gray-500">{check.detail}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${check.ok ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}>
                  {check.ok ? "Healthy" : "Issue"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
          <h2 className="text-lg font-semibold text-white">Deploy snapshot</h2>
          <div className="mt-4 rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest commit</p>
            <p className="mt-2 text-lg font-bold text-white">{overview.gitSnapshot?.sha ?? "Unavailable"}</p>
            <p className="mt-1 text-sm text-gray-300">{overview.gitSnapshot?.subject ?? "No git metadata"}</p>
            <p className="mt-1 text-xs text-gray-500">{overview.gitSnapshot?.committedAt ?? "—"}</p>
          </div>
          <div className="mt-3 rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Vercel cron defs</p>
            <p className="mt-2 text-3xl font-bold text-accent-blue">{overview.vercelCronCount}</p>
            <p className="mt-1 text-xs text-gray-500">Read from vercel.json</p>
          </div>
          <Link href="/admin/system" className="mt-4 inline-flex rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200 hover:border-accent-blue/30 hover:text-white">
            Open system view
          </Link>
        </div>
      </section>
    </div>
  );
}
