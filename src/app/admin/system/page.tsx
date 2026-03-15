import { getEnvironmentStatus, getSystemHealth } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const [healthChecks, envStatus] = await Promise.all([
    getSystemHealth(),
    Promise.resolve(getEnvironmentStatus()),
  ]);

  return (
    <div className="space-y-5">
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
