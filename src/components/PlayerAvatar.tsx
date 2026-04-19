"use client";

import { useEffect, useMemo, useState } from "react";
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

const headshotCache = new Map<string, string | null>();

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
  const fallbackSrc = useMemo(
    () => getPlayerHeadshot({ league, playerId, playerName: name, headshot }),
    [league, playerId, name, headshot],
  );
  const cacheKey = league && playerId ? `${String(league).toUpperCase()}:${String(playerId)}` : null;
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (headshot) return headshot;
    if (cacheKey && headshotCache.has(cacheKey)) return headshotCache.get(cacheKey) ?? null;
    if (!cacheKey) return fallbackSrc;
    return null;
  });

  useEffect(() => {
    let cancelled = false;

    if (headshot) {
      setResolvedSrc(headshot);
      return () => {
        cancelled = true;
      };
    }

    if (!league || !playerId) {
      setResolvedSrc(fallbackSrc);
      return () => {
        cancelled = true;
      };
    }

    if (cacheKey && headshotCache.has(cacheKey)) {
      setResolvedSrc(headshotCache.get(cacheKey) ?? null);
      return () => {
        cancelled = true;
      };
    }

    const params = new URLSearchParams({
      league: String(league),
      playerId: String(playerId),
    });
    if (name) params.set("playerName", name);
    if (headshot) params.set("headshot", headshot);

    params.set("proxy", "1");

    fetch(`/api/assets/player-headshot?${params.toString()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.blob().then((blob) => URL.createObjectURL(blob));
      })
      .then((url) => {
        if (cancelled) return;
        const resolvedUrl = url || fallbackSrc || null;
        if (cacheKey) headshotCache.set(cacheKey, resolvedUrl);
        setResolvedSrc(resolvedUrl);
      })
      .catch(() => {
        if (cancelled) return;
        if (cacheKey) headshotCache.set(cacheKey, fallbackSrc || null);
        setResolvedSrc(fallbackSrc || null);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, fallbackSrc, headshot, league, name, playerId]);

  const src = imageError ? null : resolvedSrc;

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
