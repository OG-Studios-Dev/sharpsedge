"use client";

import { useMemo, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { getPlayerHeadshot } from "@/lib/visual-identity";

type Props = {
  name: string;
  team: string;
  league?: string | null;
  playerId?: string | number | null;
  headshot?: string | null;
  teamLogo?: string | null;
  teamColor?: string;
  size?: number;
  className?: string;
};

export default function PlayerAvatar({
  name,
  team,
  league,
  playerId,
  headshot,
  teamLogo,
  teamColor,
  size = 40,
  className = "",
}: Props) {
  const [imageError, setImageError] = useState(false);

  const src = useMemo(() => {
    if (!league) {
      return getPlayerHeadshot({ league, playerId, playerName: name, headshot }) || null;
    }

    const params = new URLSearchParams({
      league: String(league),
      proxy: "1",
    });
    if (playerId != null && String(playerId).trim()) params.set("playerId", String(playerId));
    if (name) params.set("playerName", name);
    if (headshot) params.set("headshot", headshot);
    return `/api/assets/player-headshot?${params.toString()}`;
  }, [league, playerId, name, headshot]);

  const displaySrc = imageError ? null : src;

  return (
    <>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={name}
          width={size}
          height={size}
          className={`shrink-0 rounded-full object-cover bg-dark-surface ${className}`}
          onError={() => setImageError(true)}
        />
      ) : null}
      <TeamLogo
        team={team}
        logo={teamLogo ?? undefined}
        size={size}
        color={teamColor}
        sport={league ?? undefined}
        className={`${displaySrc ? "hidden" : "flex"} ${className}`}
      />
    </>
  );
}
