import { notFound, redirect } from "next/navigation";
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

const SYSTEM_SLUG_ALIASES: Record<string, string> = {
  goose: "nba-goose-system",
  "nba-goose": "nba-goose-system",
  falcons: "falcons-fight-pummeled-pitchers",
  "hot-bats": "tonys-hot-bats",
  swaggy: "swaggy-stretch-drive",
};

function resolveSystemSlug(slug: string) {
  return SYSTEM_SLUG_ALIASES[slug] || slug;
}

export default async function SystemDetailPage({ params }: Props) {
  const resolvedSlug = resolveSystemSlug(params.slug);
  if (resolvedSlug !== params.slug) {
    redirect(`/systems/${resolvedSlug}`);
  }

  await refreshTrackableSystems().catch(() => null);
  if (resolvedSlug === "tonys-hot-bats" || resolvedSlug === "swaggy-stretch-drive") {
    await refreshTrackedSystem(resolvedSlug).catch(() => null);
  }
  const [data, system, nhlContextBoard] = await Promise.all([
    readSystemsTrackingData(),
    getTrackedSystemBySlug(resolvedSlug),
    resolvedSlug === "swaggy-stretch-drive" ? getTodayNHLContextBoard().catch(() => null) : Promise.resolve(null),
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
