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
        <StatCard
          label="Pick record"
          value={`${overview.pickSummary.wins}-${overview.pickSummary.losses}-${overview.pickSummary.pushes}`}
          tone="text-accent-blue"
        />
        <StatCard
          label="API health"
          value={`${overview.healthyApis}/${overview.healthChecks.length}`}
          tone={overview.healthyApis === overview.healthChecks.length ? "text-accent-green" : "text-accent-yellow"}
        />
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
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
      </section>
    </div>
  );
}
