import HomeContent from "@/components/HomeContent";
import HomeSystemsSection from "@/components/HomeSystemsSection";
// MastersAnalysisSection moved to golf page only — home shows banner link
import { getLocalMastersOddsSnapshot } from "@/lib/golf-api";
import { loadSystemPerformanceStats, readSystemsTrackingData, refreshTrackableSystems, type DbSystemPerformanceSummary } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await refreshTrackableSystems().catch(() => null);
  const [data, dbPerformance, mastersLocalOdds] = await Promise.all([
    readSystemsTrackingData(),
    loadSystemPerformanceStats().catch(() => [] as DbSystemPerformanceSummary[]),
    getLocalMastersOddsSnapshot().catch(() => null),
  ]);

  // Promote systems above 100% Club once ≥3 systems have qualifier records
  const systemsWithData = data.systems.filter((s) => s.records.length > 0).length;
  const systemsFirst = systemsWithData >= 3;

  return (
    <HomeContent
      systemsSection={<HomeSystemsSection systems={data.systems} dbPerformance={dbPerformance} />}
      systemsFirst={systemsFirst}
      mastersAnalysis={mastersLocalOdds && Date.now() < new Date("2026-04-14T12:00:00Z").getTime() ? true : false}
    />
  );
}
