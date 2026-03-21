import PageHeader from "@/components/PageHeader";
import SystemsOverviewBoard from "@/components/SystemsOverviewBoard";
import { readSystemsTrackingData, refreshTodayGooseSystem } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export default async function SystemsPage() {
  await refreshTodayGooseSystem().catch(() => null);
  const data = await readSystemsTrackingData();

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title="Systems"
        subtitle="Repeatable angles, tracked honestly."
      />

      <SystemsOverviewBoard systems={data.systems} updatedAt={data.updatedAt} />
    </main>
  );
}
