import HomeContent from "@/components/HomeContent";
import HomeSystemsSection from "@/components/HomeSystemsSection";
import { loadSystemPerformanceStats, readSystemsTrackingData, refreshTrackableSystems, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await refreshTrackableSystems().catch(() => null);
  const [data, dbPerformance] = await Promise.all([
    readSystemsTrackingData(),
    loadSystemPerformanceStats().catch(() => [] as DbSystemPerformanceSummary[]),
  ]);

  return <HomeContent systemsSection={<HomeSystemsSection systems={data.systems} dbPerformance={dbPerformance} />} />;
}
