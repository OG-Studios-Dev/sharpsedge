import AdminOpsBoard from "@/components/AdminOpsBoard";
import AdminSourceHealthPanel from "@/components/AdminSourceHealthPanel";
import { readAdminOpsData } from "@/lib/admin-ops-store";

export const dynamic = "force-dynamic";

export default async function AdminOpsPage() {
  const data = await readAdminOpsData();

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h1 className="text-xl font-bold text-white">IT Leader Review</h1>
        <p className="mt-2 text-sm text-gray-400">
          Central place to review bugs, keep the unfixed queue honest, and track cron schedules that need edits or additions.
        </p>
      </section>

      <AdminSourceHealthPanel />
      <AdminOpsBoard initialData={data} />
    </div>
  );
}
