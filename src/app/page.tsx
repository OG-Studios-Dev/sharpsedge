import Link from "next/link";
import ScheduleBoard from "@/components/ScheduleBoard";
import EmptyStateCard from "@/components/EmptyStateCard";
import HomePicksSection from "@/components/HomePicksSection";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

function PickRow({ prop }: { prop: any }) {
  const edgeColor = prop.edgePct > 0.10 ? "text-emerald-400" : prop.edgePct > 0.05 ? "text-accent-blue" : "text-yellow-400";
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-dark-border last:border-0">
      <div>
        <span className="text-white text-sm font-medium">{prop.playerName}</span>
        <span className="text-gray-500 text-xs ml-2">{prop.team} vs {prop.opponent}</span>
      </div>
      <div className="text-right">
        <div className="text-white text-sm">{prop.direction} {prop.line} {prop.propType}</div>
        <div className={`text-xs font-semibold ${edgeColor}`}>+{Math.round((prop.edgePct || 0) * 100)}% edge</div>
      </div>
    </div>
  );
}

function MarketRow({ event, homeOdds, awayOdds }: { event: any; homeOdds: string; awayOdds: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-dark-border last:border-0">
      <div className="text-sm text-white">{event.away_team} <span className="text-gray-500">@</span> {event.home_team}</div>
      <div className="flex gap-3 text-xs">
        <span className="text-gray-400">{event.away_team.split(" ").pop()} <span className="text-white font-medium">{awayOdds}</span></span>
        <span className="text-gray-400">{event.home_team.split(" ").pop()} <span className="text-white font-medium">{homeOdds}</span></span>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  let props: any[] = [];
  let dashboardData: any = { schedule: { games: [] }, props: [], meta: {} };

  try {
    const [propsRes, dashRes] = await Promise.all([
      fetch(`${BASE_URL}/api/props`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`${BASE_URL}/api/dashboard`, { cache: "no-store" }).then((r) => r.json()),
    ]);
    props = Array.isArray(propsRes) ? propsRes : [];
    dashboardData = dashRes;
  } catch {
    // fail silently — sections will show empty states
  }

  const topPicks = props.slice(0, 3);

  // Extract h2h moneylines from schedule games
  const gamesWithOdds = (dashboardData.schedule?.games || [])
    .filter((g: any) => g.bestMoneyline?.home || g.bestMoneyline?.away)
    .slice(0, 2)
    .map((g: any) => ({
      event: { home_team: g.homeTeam?.name || g.homeTeam?.abbrev, away_team: g.awayTeam?.name || g.awayTeam?.abbrev },
      homeOdds: g.bestMoneyline?.home?.odds ?? "—",
      awayOdds: g.bestMoneyline?.away?.odds ?? "—",
    }));

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">🪿MONEYTEAM🪿</h1>
      </header>

      <div className="px-4 py-6 space-y-5">
        {/* Today header */}
        <div>
          <h2 className="text-white text-lg font-semibold">Today</h2>
          <p className="text-xs text-gray-500 mt-0.5">{today}</p>
        </div>

        {/* Goose AI Picks */}
        <HomePicksSection />

        {/* Schedule */}
        <ScheduleBoard compact />

        {/* Market Pulse */}
        {gamesWithOdds.length > 0 && (
          <section className="rounded-2xl bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] border border-dark-border p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Market Pulse</h3>
            <div>
              {gamesWithOdds.map((item: any, i: number) => (
                <MarketRow key={i} event={item.event} homeOdds={item.homeOdds} awayOdds={item.awayOdds} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
