import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SystemDetailBoard from "@/components/SystemDetailBoard";
import { getTrackedSystemBySlug, readSystemsTrackingData, refreshTrackableSystems } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    slug: string;
  };
};

export default async function SystemDetailPage({ params }: Props) {
  await refreshTrackableSystems().catch(() => null);
  const [data, system] = await Promise.all([
    readSystemsTrackingData(),
    getTrackedSystemBySlug(params.slug),
  ]);

  if (!system) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title={system.name}
        subtitle={`${system.league} • ${system.category} • ${system.status.replaceAll("_", " ")}`}
      />

      <SystemDetailBoard system={system} updatedAt={data.updatedAt} />
    </main>
  );
}
