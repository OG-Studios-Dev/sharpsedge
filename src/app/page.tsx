import HomeContent from "@/components/HomeContent";
import HomeSystemsSection from "@/components/HomeSystemsSection";
import { readSystemsTrackingData, refreshTrackableSystems } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await refreshTrackableSystems().catch(() => null);
  const data = await readSystemsTrackingData();

  return <HomeContent systemsSection={<HomeSystemsSection systems={data.systems} />} />;
}
