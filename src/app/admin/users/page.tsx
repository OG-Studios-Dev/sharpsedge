import AdminSectionCard from "@/components/admin/AdminSectionCard";
import AdminStatCard from "@/components/admin/AdminStatCard";
import { deleteUserAction } from "@/app/admin/users/actions";
import { listUsers } from "@/lib/users";

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

export default async function AdminUsersPage() {
  const users = await listUsers();
  const activeUsers = users.filter((user) => {
    if (!user.lastLoginAt) {
      return false;
    }

    return Date.now() - new Date(user.lastLoginAt).getTime() <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <AdminStatCard label="Total Users" value={users.length} meta="All registered accounts" tone="blue" />
        <AdminStatCard label="Admins" value={users.filter((user) => user.role === "admin").length} meta="Protected from deletion" tone="yellow" />
        <AdminStatCard label="Active 7d" value={activeUsers} meta="Recently authenticated users" tone="green" />
      </section>

      <AdminSectionCard
        title="Registered Users"
        description="Delete non-admin accounts directly from the file-backed auth store."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.2em] text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user, index) => (
                <tr
                  key={user.id}
                  className={index % 2 === 0 ? "bg-dark-bg/40" : "bg-dark-surface/70"}
                >
                  <td className="px-4 py-3 font-medium text-white">{user.name}</td>
                  <td className="px-4 py-3 text-gray-300">{user.email}</td>
                  <td className="px-4 py-3 text-gray-300">{user.username ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-300">{user.role}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDateTime(user.createdAt)}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDateTime(user.lastLoginAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {user.role === "admin" ? (
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Protected</span>
                    ) : (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-200 transition hover:bg-accent-red/15"
                        >
                          Delete
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </div>
  );
}
