import AdminTeamBoard from "@/components/AdminTeamBoard";
import { readAdminTeamBoard } from "@/lib/admin-team-store";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const data = await readAdminTeamBoard();

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <h1 className="text-xl font-bold text-white">Sprint Progress + Employee Daily Work</h1>
        <p className="mt-2 text-sm text-gray-400">
          Live admin page for current sprint progress, employee daily work done, workload assignment, and launch accountability.
        </p>
      </section>

      <AdminTeamBoard initialData={data} />
    </div>
  );
}
