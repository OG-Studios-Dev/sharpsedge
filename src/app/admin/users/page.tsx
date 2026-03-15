import AdminUsersTable from "@/components/AdminUsersTable";
import { requireAdmin } from "@/lib/auth";
import { getAdminUsers } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const viewer = await requireAdmin();
  const users = await getAdminUsers();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Users</h2>
        <p className="text-sm text-gray-400">Profiles are read from Supabase and deletes remove the matching auth user.</p>
      </div>
      <AdminUsersTable currentUserId={viewer.user.id} users={users} />
    </section>
  );
}
