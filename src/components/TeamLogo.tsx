"use client";
import { useState } from "react";
import { getTeamLogoUrl } from "@/lib/visual-identity";

// Sport emoji fallback map — used when no logo URL is available
const SPORT_EMOJI: Record<string, string> = {
  NHL: "🏒",
  NBA: "🏀",
  MLB: "⚾",
  NFL: "🏈",
  PGA: "⛳",
  GOLF: "⛳",
  UFC: "🥊",
  EPL: "⚽",
  SERIE_A: "⚽",
  SOCCER: "⚽",
};

function sportEmojiForTeam(team: string, sport?: string): string {
  if (sport) {
    const key = sport.toUpperCase().replace(/[^A-Z]/g, "_");
    if (SPORT_EMOJI[key]) return SPORT_EMOJI[key];
  }
  return "🏟️";
}

type Props = {
  team: string;
  logo?: string;
  size?: number;
  className?: string;
  color?: string;
  sport?: string;
};

export default function TeamLogo({ team, logo, size = 40, className = "", color, sport }: Props) {
  // Build the best logo URL: explicit prop > ESPN CDN by sport+abbrev > null
  const cdnUrl = logo || getTeamLogoUrl(sport, team) || null;
  const [imgError, setImgError] = useState(false);

  if (cdnUrl && !imgError) {
    return (
      <img
        src={cdnUrl}
        alt={team}
        width={size}
        height={size}
        className={"object-contain rounded-full " + className}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: sport emoji in a circle
  const emoji = sportEmojiForTeam(team, sport);
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color || undefined, fontSize: size * 0.55 }}
      className={"rounded-full flex items-center justify-center shrink-0 " + (color ? "" : "bg-dark-surface border border-dark-border ") + className}
      title={team}
    >
      {emoji}
    </div>
  );
}
