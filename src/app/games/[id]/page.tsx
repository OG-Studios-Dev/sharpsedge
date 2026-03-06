"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { getGame } from "@/lib/data/games";
import { getTrendsForGame } from "@/lib/data/trends";
import { Team } from "@/lib/data/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import TrendCard from "@/components/trends/TrendCard";
import BetSlip from "@/components/bets/BetSlip";

function TeamStats({ team, label }: { team: Team; label: string }) {
  const gpf = (team.goalsFor / team.gamesPlayed).toFixed(2);
  const gpa = (team.goalsAgainst / team.gamesPlayed).toFixed(2);
  const pts = team.record.wins * 2 + team.record.otl;

  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{team.logo}</span>
        <div>
          <p className="text-sm font-bold text-white">{team.city} {team.name}</p>
          <p className="text-[11px] text-slate-500">{label}</p>
        </div>
      </div>
      <div className="space-y-2">
        <StatRow label="Record" value={`${team.record.wins}-${team.record.losses}-${team.record.otl} (${pts} pts)`} />
        <StatRow label="Home" value={`${team.homeRecord.wins}-${team.homeRecord.losses}-${team.homeRecord.otl}`} />
        <StatRow label="Away" value={`${team.awayRecord.wins}-${team.awayRecord.losses}-${team.awayRecord.otl}`} />
        <StatRow label="Last 10" value={`${team.last10.wins}-${team.last10.losses}-${team.last10.otl}`} />
        <StatRow label="GF/GP" value={gpf} />
        <StatRow label="GA/GP" value={gpa} />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-700/30">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-medium text-white">{value}</span>
    </div>
  );
}

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const game = getGame(id);
  const [, setRefresh] = useState(0);
  const handleBetPlaced = useCallback(() => setRefresh((n) => n + 1), []);

  if (!game) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Game not found</p>
        <Link href="/games" className="text-amber-400 text-sm mt-2 inline-block">← Back to Games</Link>
      </div>
    );
  }

  const gameTrends = getTrendsForGame(game.id);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/games" className="text-slate-400 hover:text-white transition-colors">Games</Link>
        <span className="text-slate-600">/</span>
        <span className="text-white">{game.awayTeam.abbrev} @ {game.homeTeam.abbrev}</span>
      </div>

      {/* Game header */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-1">
          <Badge variant="amber">{game.time}</Badge>
          <span className="text-xs text-slate-500">{game.venue}</span>
        </div>
        <div className="flex items-center justify-center gap-8 py-6">
          <div className="text-center">
            <span className="text-4xl block">{game.awayTeam.logo}</span>
            <p className="text-lg font-bold text-white mt-2">{game.awayTeam.city}</p>
            <p className="text-sm text-slate-400">{game.awayTeam.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              {game.awayTeam.record.wins}-{game.awayTeam.record.losses}-{game.awayTeam.record.otl}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-600">@</p>
          </div>
          <div className="text-center">
            <span className="text-4xl block">{game.homeTeam.logo}</span>
            <p className="text-lg font-bold text-white mt-2">{game.homeTeam.city}</p>
            <p className="text-sm text-slate-400">{game.homeTeam.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              {game.homeTeam.record.wins}-{game.homeTeam.record.losses}-{game.homeTeam.record.otl}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Stats comparison */}
        <div className="lg:col-span-2 space-y-6">
          {/* Team stats */}
          <Card className="p-5">
            <h2 className="text-sm font-bold text-white mb-4">Team Comparison</h2>
            <div className="grid grid-cols-2 gap-6">
              <TeamStats team={game.awayTeam} label="Away" />
              <TeamStats team={game.homeTeam} label="Home" />
            </div>
          </Card>

          {/* Trend signals */}
          <div>
            <h2 className="text-sm font-bold text-white mb-3">
              Trend Signals
              {gameTrends.length > 0 && (
                <span className="text-slate-500 font-normal ml-2">{gameTrends.length} active</span>
              )}
            </h2>
            {gameTrends.length > 0 ? (
              <div className="space-y-2">
                {gameTrends.map((t) => (
                  <TrendCard key={t.id} trend={t} />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center text-slate-500 text-sm">No active trends for this matchup</Card>
            )}
          </div>
        </div>

        {/* Right: Bet slip */}
        <div>
          <BetSlip game={game} onBetPlaced={handleBetPlaced} />
        </div>
      </div>
    </div>
  );
}
