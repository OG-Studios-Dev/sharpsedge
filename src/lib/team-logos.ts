// src/lib/team-logos.ts
export function getTeamId(sport: string, abbrev: string): number {
  const maps: Record<string, Record<string, number>> = {
    NHL: { BOS: 6, TOR: 7 /* etc */ },
    NBA: { MIL: 66, CLE: 5 /* etc */ },
    // Full maps...
  };
  return maps[sport]?.[abbrev] || 0;
}