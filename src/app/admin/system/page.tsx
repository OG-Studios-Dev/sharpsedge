import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusPill from "@/components/admin/AdminStatusPill";
import { getSystemSummary } from "@/lib/admin";

function KeyValueList({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="divide-y divide-dark-border overflow-hidden rounded-2xl border border-dark-border bg-dark-bg/60">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-gray-400">{item.label}</dt>
          <dd className="text-sm font-medium text-white">{item.value}</dd>
        </div>
      ))}
    </div>
  );
}

function formatCheckTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminSystemPage() {
  const data = await getSystemSummary();
  const connectedCount = data.apiHealth.filter((status) => status.connected).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <AdminStatCard label="Healthy APIs" value={connectedCount} meta={`${data.apiHealth.length - connectedCount} degraded`} tone="green" />
        <AdminStatCard label="App Version" value={data.app.version} meta="Read from package.json" tone="blue" />
        <AdminStatCard label="Deployment" value={data.deployment.provider} meta={data.deployment.environment} tone="yellow" />
      </section>

      <AdminSectionCard
        title="API Status"
        description="Endpoint-level health checks run from the server at page render time."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {data.apiHealth.map((status) => (
            <div key={status.key} className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{status.label}</p>
                <AdminStatusPill connected={status.connected} />
              </div>
              <p className="mt-3 break-all text-sm text-gray-400">{status.endpoint}</p>
              <div className="mt-4 space-y-2 text-sm text-gray-300">
                <p>Status: {status.details}</p>
                <p>Latency: {status.latencyMs !== null ? `${status.latencyMs}ms` : "Unavailable"}</p>
                <p>Remaining quota: {status.remainingQuota ?? "Unavailable"}</p>
                <p>Checked: {formatCheckTime(status.checkedAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </AdminSectionCard>

      <section className="grid gap-6 lg:grid-cols-2">
        <AdminSectionCard title="Vercel Deployment" description="Deployment metadata exposed through the runtime environment.">
          <KeyValueList
            items={[
              { label: "Provider", value: data.deployment.provider },
              { label: "Environment", value: data.deployment.environment },
              { label: "Deployment URL", value: data.deployment.url },
              { label: "Region", value: data.deployment.region },
              { label: "Project URL", value: data.deployment.projectUrl },
            ]}
          />
        </AdminSectionCard>

        <AdminSectionCard title="App Build" description="Version and commit information for the current codebase.">
          <KeyValueList
            items={[
              { label: "Version", value: data.app.version },
              { label: "Last Commit", value: data.app.lastCommit },
              { label: "Commit Date", value: data.app.lastCommitDate },
              { label: "Branch", value: data.app.branch },
            ]}
          />
        </AdminSectionCard>
      </section>

      <AdminSectionCard title="Environment" description="Runtime configuration snapshot without exposing secrets.">
        <KeyValueList items={data.environment} />
      </AdminSectionCard>
    </div>
  );
}
