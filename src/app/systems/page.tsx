import SystemsOverviewBoard from "@/components/SystemsOverviewBoard";
import { loadSystemPerformanceStats, readSystemsTrackingData, refreshTrackableSystems, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: {
    league?: string;
  };
};

export default async function SystemsPage({ searchParams }: Props) {
  await refreshTrackableSystems().catch(() => null);
  const [data, dbPerformance] = await Promise.all([
    readSystemsTrackingData(),
    loadSystemPerformanceStats().catch(() => [] as DbSystemPerformanceSummary[]),
  ]);
  const activeLeague = searchParams?.league || "All";

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <SystemsOverviewBoard
        systems={data.systems}
        updatedAt={data.updatedAt}
        activeLeague={activeLeague}
        dbPerformance={dbPerformance}
      />
    </main>
  );
}
