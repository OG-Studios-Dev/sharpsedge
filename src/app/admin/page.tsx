import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusPill from "@/components/admin/AdminStatusPill";
import { getAdminOverviewData } from "@/lib/admin";

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminOverviewPage() {
  const data = await getAdminOverviewData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label="Registered Users"
          value={data.userStats.totalUsers}
          meta={`${data.userStats.adminCount} admin`}
          tone="blue"
        />
        <AdminStatCard
          label="New Today"
          value={data.userStats.signupsToday}
          meta={`${data.userStats.signupsThisWeek} this week`}
          tone="green"
        />
        <AdminStatCard
          label="Active Users"
          value={data.userStats.activeUsers}
          meta="Logged in within 7 days"
          tone="yellow"
        />
        <AdminStatCard
          label="Pick Win Rate"
          value={formatPercent(data.pickSummary.winPct)}
          meta={`${data.pickSummary.wins}-${data.pickSummary.losses}-${data.pickSummary.pushes} record`}
          tone={data.pickSummary.netUnits >= 0 ? "green" : "red"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminSectionCard
          title="Pick Performance"
          description="Overall server-side pick history across NHL and NBA."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Record</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {data.pickSummary.wins}-{data.pickSummary.losses}-{data.pickSummary.pushes}
              </p>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Net Units</p>
              <p className="mt-2 text-2xl font-bold text-white">
                {data.pickSummary.netUnits > 0 ? "+" : ""}
                {data.pickSummary.netUnits}u
              </p>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Resolved</p>
              <p className="mt-2 text-2xl font-bold text-white">{data.pickSummary.resolved}</p>
            </div>
            <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Pending</p>
              <p className="mt-2 text-2xl font-bold text-white">{data.pickSummary.pending}</p>
            </div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard
          title="API Health"
          description="Live connectivity checks against the upstream data providers."
        >
          <div className="space-y-3">
            {data.apiHealth.map((status) => (
              <div
                key={status.key}
                className="flex flex-col gap-3 rounded-2xl border border-dark-border bg-dark-bg/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">{status.label}</p>
                  <p className="mt-1 text-sm text-gray-400">{status.details}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    {status.latencyMs !== null ? `${status.latencyMs}ms` : "n/a"}
                  </span>
                  <AdminStatusPill connected={status.connected} />
                </div>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </section>

      <AdminSectionCard
        title="Latest Accounts"
        description="Newest users in the file-backed auth store."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {data.recentUsers.map((user, index) => (
                <tr
                  key={user.id}
                  className={index % 2 === 0 ? "bg-dark-bg/40" : "bg-dark-surface/70"}
                >
                  <td className="px-4 py-3 font-medium text-white">{user.name}</td>
                  <td className="px-4 py-3 text-gray-300">{user.email}</td>
                  <td className="px-4 py-3 text-gray-300">{user.role}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDateTime(user.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDateTime(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
