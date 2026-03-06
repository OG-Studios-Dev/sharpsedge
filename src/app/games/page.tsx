import { todayGames } from "@/lib/data/games";
import GameCard from "@/components/games/GameCard";

export default function GamesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Today&apos;s Games</h1>
        <p className="text-sm text-slate-400 mt-1">NHL matchups for March 6, 2026 &middot; {todayGames.length} games</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {todayGames.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}
