import type { League } from "@/lib/types";

/**
 * Build a drill-down href for a team page.
 * NBA teams go to /nba/team/[abbrev], NHL to /team/[abbrev], etc.
 */
export function getTeamHref(team: string, league?: League | string): string {
  const abbrev = team.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  const lg = (league ?? "").toUpperCase();

  if (lg === "NBA" || lg === "WNBA" || lg === "NCAAB") return `/nba/team/${abbrev}`;
  if (lg === "EPL" || lg === "SERIE A") return `/teams`; // soccer teams page
  // Default (NHL, MLB, NFL, etc.)
  return `/team/${abbrev}`;
}

/**
 * Build a drill-down href for a player page.
 * If playerId is available, use /player/[id]. Otherwise fallback to /props.
 */
export function getPlayerHref(playerId?: number | string | null): string {
  if (playerId) return `/player/${playerId}`;
  return "/props";
}
