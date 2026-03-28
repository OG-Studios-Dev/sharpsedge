import { notFound, redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import SystemDetailBoard from "@/components/SystemDetailBoard";
import { getTodayNHLContextBoard } from "@/lib/nhl-context";
import { getTrackedSystemBySlug, loadSystemPerformanceStats, loadSystemQualifierHistory, readSystemsTrackingData, refreshTrackableSystems, refreshTrackedSystem, type DbSystemPerformanceSummary, type DbSystemQualifier } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    slug: string;
  };
};

const SYSTEM_SLUG_ALIASES: Record<string, string> = {
  goose: "nba-goose-system",
  "nba-goose": "nba-goose-system",
  "mattys-1q-chase-nba": "nba-goose-system",
  "mattys-1q-chase": "nba-goose-system",
  falcons: "falcons-fight-pummeled-pitchers",
  "hot-bats": "tonys-hot-bats",
  "tight-bats": "tonys-hot-bats",
  "tonys-tight-bats": "tonys-hot-bats",
  swaggy: "swaggy-stretch-drive",
  // Robbie's Ripper Fast 5 — old slug alias preserved for backward compat
  "quick-rips-f5": "robbies-ripper-fast-5",
  "robbies-ripper": "robbies-ripper-fast-5",
  ripper: "robbies-ripper-fast-5",
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
  if (resolvedSlug === "tonys-hot-bats" || resolvedSlug === "swaggy-stretch-drive" || resolvedSlug === "robbies-ripper-fast-5") {
    await refreshTrackedSystem(resolvedSlug).catch(() => null);
  }
  const [data, system, nhlContextBoard] = await Promise.all([
    readSystemsTrackingData(),
    getTrackedSystemBySlug(resolvedSlug),
    resolvedSlug === "swaggy-stretch-drive" ? getTodayNHLContextBoard().catch(() => null) : Promise.resolve(null),
  ]);

  if (!system) notFound();

  // Load DB performance stats for gradeable systems (graceful fallback)
  const dbPerformance = await loadSystemPerformanceStats(system.id).catch(() => [] as DbSystemPerformanceSummary[]);
  const dbHistory = await loadSystemQualifierHistory(system.id, 60).catch(() => [] as DbSystemQualifier[]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title={system.name}
        subtitle={`${system.league} • ${system.category} • ${system.status.replaceAll("_", " ")}`}
      />

      <SystemDetailBoard
        system={system}
        updatedAt={data.updatedAt}
        nhlContextBoard={nhlContextBoard}
        dbPerformance={dbPerformance}
        dbHistory={dbHistory}
      />
    </main>
  );
}
