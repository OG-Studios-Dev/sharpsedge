import SystemsOverviewBoard from "@/components/SystemsOverviewBoard";
import { readSystemsTrackingData, refreshTodayGooseSystem } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: {
    league?: string;
  };
};

export default async function SystemsPage({ searchParams }: Props) {
  await refreshTodayGooseSystem().catch(() => null);
  const data = await readSystemsTrackingData();
  const activeLeague = searchParams?.league || "All";

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <SystemsOverviewBoard systems={data.systems} updatedAt={data.updatedAt} activeLeague={activeLeague} />
    </main>
  );
}
