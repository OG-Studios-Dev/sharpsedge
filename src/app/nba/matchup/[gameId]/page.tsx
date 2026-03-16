import Link from "next/link";
import CompactMatchupPageClient from "@/components/matchup/CompactMatchupPageClient";
import { getNBAMatchupData } from "@/lib/nba-matchup";

export const dynamic = "force-dynamic";

export default async function NBAMatchupPage({ params }: { params: { gameId: string } }) {
  const data = await getNBAMatchupData(params.gameId);

  if (!data) {
    return (
      <main className="min-h-screen bg-dark-bg px-4 py-10 text-white md:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-[32px] border border-white/10 bg-white/[0.04] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">NBA</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Matchup unavailable</h1>
          <p className="mt-3 text-sm text-gray-400">The game feed did not return data for this matchup id.</p>
          <Link
            href="/schedule"
            className="mt-6 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/10"
          >
            Back to schedule
          </Link>
        </div>
      </main>
    );
  }

  return <CompactMatchupPageClient data={data} title="NBA Matchup" backHref="/schedule" />;
}
