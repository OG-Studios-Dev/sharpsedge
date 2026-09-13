type PickMatchupInput = {
  team?: string | null;
  opponent?: string | null;
};

export function formatPickMatchupLabel(pick: PickMatchupInput): string | null {
  const team = String(pick.team ?? "").trim();
  const opponent = String(pick.opponent ?? "").trim();
  if (!team || !opponent) return null;
  const normalizedTeam = team.toLowerCase();
  if (normalizedTeam === "game total" || normalizedTeam === "nfl player prop") return opponent;
  return `${team} vs ${opponent}`;
}

export function isSyntheticGameMarketTeam(team: string | null | undefined): boolean {
  const normalized = String(team ?? "").trim().toLowerCase();
  return normalized === "game total" || normalized === "nfl player prop";
}

export default {
  formatPickMatchupLabel,
  isSyntheticGameMarketTeam,
};
