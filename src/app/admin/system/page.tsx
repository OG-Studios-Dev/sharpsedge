import { getAdminSystemData } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const { healthChecks, envStatus, gitSnapshot, vercelCrons, trackedCrons, activeIncidents } = await getAdminSystemData();

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-xl font-bold text-white">System snapshot</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Latest git commit</p>
            <p className="mt-2 text-sm font-semibold text-white">{gitSnapshot?.sha ?? "Unavailable"}</p>
            <p className="mt-1 text-xs text-gray-400">{gitSnapshot?.subject ?? "No commit metadata"}</p>
            <p className="mt-1 text-xs text-gray-500">{gitSnapshot?.committedAt ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Vercel cron definitions</p>
            <p className="mt-2 text-3xl font-bold text-accent-blue">{vercelCrons.length}</p>
            <p className="mt-1 text-xs text-gray-500">Pulled from vercel.json</p>
          </div>
          <div className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Active incidents</p>
            <p className="mt-2 text-3xl font-bold text-orange-300">{activeIncidents.length}</p>
            <p className="mt-1 text-xs text-gray-500">Open operational issues being monitored</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-xl font-bold text-white">API Health</h2>
        <div className="mt-4 space-y-3">
          {healthChecks.map((check) => (
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

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-xl font-bold text-white">Tracked cron health</h2>
        <div className="mt-4 space-y-3">
          {trackedCrons.map((cron) => {
            const hasIssue = (cron.consecutiveFailures ?? 0) > 0 || (!cron.lastSuccessAt && Boolean(cron.lastFailureAt));
            return (
              <div key={cron.id} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{cron.name}</p>
                    <p className="text-xs text-gray-500">{cron.path || cron.target || cron.schedule}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasIssue ? "bg-accent-red/10 text-accent-red" : "bg-accent-green/10 text-accent-green"}`}>
                    {hasIssue ? "Needs review" : "Healthy"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400 md:grid-cols-4">
                  <p>Schedule: {cron.schedule}</p>
                  <p>Last run: {cron.lastRunAt ? new Date(cron.lastRunAt).toLocaleString() : "—"}</p>
                  <p>Last success: {cron.lastSuccessAt ? new Date(cron.lastSuccessAt).toLocaleString() : "—"}</p>
                  <p>Failures: {cron.consecutiveFailures ?? 0}</p>
                </div>
                {cron.notes ? <p className="mt-2 text-xs text-gray-500">{cron.notes}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-xl font-bold text-white">Vercel cron config</h2>
        <div className="mt-4 space-y-3">
          {vercelCrons.length === 0 ? (
            <div className="rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3 text-sm text-gray-400">No cron definitions found in vercel.json.</div>
          ) : vercelCrons.map((cron: { path: string; schedule: string }) => (
            <div key={`${cron.path}-${cron.schedule}`} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
              <p className="text-sm font-medium text-white">{cron.path}</p>
              <p className="text-xs text-gray-500">{cron.schedule}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h2 className="text-xl font-bold text-white">Environment</h2>
        <div className="mt-4 space-y-3">
          {envStatus.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
              <p className="text-sm font-medium text-white">{item.name}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.present ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"}`}>
                {item.present ? "Configured" : "Missing"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
