import Link from "next/link";
import { Game } from "@/lib/data/types";
import Card from "@/components/ui/Card";
import { formatOdds } from "./OddsDisplay";

export default function GameCard({ game }: { game: Game }) {
  return (
    <Link href={`/games/${game.id}`}>
      <Card hover className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-slate-500 font-medium">{game.time}</span>
          <span className="text-[11px] text-slate-500">{game.venue}</span>
        </div>

        <div className="space-y-3">
          {/* Away team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{game.awayTeam.logo}</span>
              <div>
                <p className="text-sm font-semibold text-white">{game.awayTeam.city} {game.awayTeam.name}</p>
                <p className="text-[11px] text-slate-500">
                  {game.awayTeam.record.wins}-{game.awayTeam.record.losses}-{game.awayTeam.record.otl}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold ${game.odds.awayML > 0 ? "text-emerald-400" : "text-white"}`}>
              {formatOdds(game.odds.awayML)}
            </span>
          </div>

          {/* Home team */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{game.homeTeam.logo}</span>
              <div>
                <p className="text-sm font-semibold text-white">{game.homeTeam.city} {game.homeTeam.name}</p>
                <p className="text-[11px] text-slate-500">
                  {game.homeTeam.record.wins}-{game.homeTeam.record.losses}-{game.homeTeam.record.otl}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold ${game.odds.homeML > 0 ? "text-emerald-400" : "text-white"}`}>
              {formatOdds(game.odds.homeML)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/50">
          <div className="flex gap-4 text-[11px] text-slate-500">
            <span>PL: {formatOdds(game.odds.puckLineHome)} / {formatOdds(game.odds.puckLineAway)}</span>
            <span>O/U: {game.odds.overUnder}</span>
          </div>
          <span className="text-[11px] text-amber-400 font-medium">View Analysis →</span>
        </div>
      </Card>
    </Link>
  );
}
