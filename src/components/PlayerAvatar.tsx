"use client";

import { useState } from "react";
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
  const src = imageError ? null : getPlayerHeadshot({ league, playerId, playerName: name, headshot });

  return (
    <>
      {src ? (
        <img
          src={src}
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
        className={`${src ? "hidden" : "flex"} ${className}`}
      />
    </>
  );
}
