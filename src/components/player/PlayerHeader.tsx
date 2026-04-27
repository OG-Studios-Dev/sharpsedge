"use client";

import { useMemo, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { getPlayerHeadshot } from "@/lib/visual-identity";
import { PlayerIdentity, PlayerNextGame } from "@/lib/player-research";

type PlayerHeaderProps = {
  headshot?: string | null;
  league: string;
  name: string;
  team: string;
  teamColor?: string;
  player: PlayerIdentity;
  nextGame?: PlayerNextGame | null;
};

function getInjuryTone(status?: string | null) {
  const value = (status || "").toLowerCase();
  if (!value) return "";
  if (value.includes("out") || value.includes("injured reserve")) {
    return "border-red-500/40 bg-red-500/15 text-red-200";
  }
  return "border-amber-500/40 bg-amber-500/15 text-amber-100";
}

export default function PlayerHeader({
  headshot,
  league,
  name,
  team,
  teamColor,
  player,
  nextGame,
}: PlayerHeaderProps) {
  const [imageError, setImageError] = useState(false);
  const displayHeadshot = useMemo(() => {
    if (!league || !player.playerId) {
      return imageError ? null : getPlayerHeadshot({
        league,
        playerId: player.playerId,
        playerName: name,
        headshot,
      }) || null;
    }

    const params = new URLSearchParams({
      league: String(league),
      playerId: String(player.playerId),
      proxy: "1",
    });
    if (name) params.set("playerName", name);
    if (headshot) params.set("headshot", headshot);
    return imageError ? null : `/api/assets/player-headshot?${params.toString()}`;
  }, [headshot, imageError, league, name, player.playerId]);
  const handedness = [player.bats ? `Bats ${player.bats}` : null, player.throws ? `Throws ${player.throws}` : null]
    .filter(Boolean)
    .join(" • ");
  const infoLine = [player.positionLabel || player.position, team, player.jerseyNumber ? `#${player.jerseyNumber}` : null]
    .filter(Boolean)
    .join(" • ");

  return (
    <section className="overflow-hidden rounded-[32px] border border-dark-border bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_38%),linear-gradient(180deg,rgba(21,24,33,0.98),rgba(12,16,24,0.98))] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="h-1.5 w-full" style={{ backgroundColor: teamColor || "#4a9eff" }} />
      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            {displayHeadshot ? (
              <img
                src={displayHeadshot}
                alt={name}
                className="h-20 w-20 rounded-[24px] border border-white/10 object-cover shadow-[0_12px_24px_rgba(0,0,0,0.28)]"
                onError={() => setImageError(true)}
              />
            ) : (
              <TeamLogo team={team || name.slice(0, 3)} color={teamColor} size={80} className="rounded-[24px]" sport={league} />
            )}
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">{league} Player Analysis</p>
              <h1 className="mt-2 truncate text-2xl font-semibold text-white md:text-3xl">{name}</h1>
              <p className="mt-1 text-sm text-gray-300">{infoLine || league}</p>
              {handedness ? <p className="mt-1 text-xs text-gray-400">{handedness}</p> : null}
            </div>
          </div>

          {player.injuryStatus ? (
            <div className="sm:ml-auto">
              <span className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold ${getInjuryTone(player.injuryStatus)}`}>
                {player.injuryStatus}
              </span>
            </div>
          ) : null}
        </div>

        {nextGame ? (
          <div className="mt-5 rounded-[24px] border border-emerald-500/30 bg-emerald-500/12 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80">Next Game</p>
                <p className="mt-1 text-sm font-semibold text-emerald-50 md:text-base">{nextGame.display}</p>
                {(nextGame.opponentFullName || nextGame.statusDetail || nextGame.opponentRecord) ? (
                  <p className="mt-1 text-xs text-emerald-100/80">
                    {[nextGame.opponentFullName, nextGame.opponentRecord ? `Opp ${nextGame.opponentRecord}` : null, nextGame.statusDetail].filter(Boolean).join(" • ")}
                  </p>
                ) : null}
              </div>
              {(nextGame.teamRecord || nextGame.status) ? (
                <div className="flex flex-wrap gap-2">
                  {nextGame.teamRecord ? (
                    <span className="inline-flex min-h-[36px] items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-emerald-50">
                      {team} {nextGame.teamRecord}
                    </span>
                  ) : null}
                  {nextGame.status && nextGame.status !== nextGame.display ? (
                    <span className="inline-flex min-h-[36px] items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs font-semibold text-emerald-50">
                      {nextGame.status}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
