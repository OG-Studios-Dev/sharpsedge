import HomeContent from "@/components/HomeContent";
import HomeOddsToolsSection from "@/components/HomeOddsToolsSection";
import HomeSystemsSection from "@/components/HomeSystemsSection";
import { readSystemsTrackingData, refreshTrackableSystems } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await refreshTrackableSystems().catch(() => null);
  const data = await readSystemsTrackingData();

  return (
    <HomeContent
      systemsSection={<HomeSystemsSection systems={data.systems} />}
      bottomSection={<HomeOddsToolsSection />}
    />
  );
}
