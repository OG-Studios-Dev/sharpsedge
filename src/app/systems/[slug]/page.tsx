import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SystemDetailBoard from "@/components/SystemDetailBoard";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import { getTrackedSystemBySlug, readSystemsTrackingData, refreshTrackableSystems, refreshTrackedSystem } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    slug: string;
  };
};

export default async function SystemDetailPage({ params }: Props) {
  await refreshTrackableSystems().catch(() => null);
  if (params.slug === "tonys-hot-bats") {
    await refreshTrackedSystem("tonys-hot-bats").catch(() => null);
  }
  const [data, system, nhlContextBoard] = await Promise.all([
    readSystemsTrackingData(),
    getTrackedSystemBySlug(params.slug),
    params.slug === "swaggy-stretch-drive" ? getTodayNHLContextBoard().catch(() => null) : Promise.resolve(null),
  ]);

  if (!system) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title={system.name}
        subtitle={`${system.league} • ${system.category} • ${system.status.replaceAll("_", " ")}`}
      />

      <SystemDetailBoard system={system} updatedAt={data.updatedAt} nhlContextBoard={nhlContextBoard} />
    </main>
  );
}
