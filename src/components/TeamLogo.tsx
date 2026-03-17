type Props = {
  team: string;
  logo?: string;
  size?: number;
  className?: string;
  color?: string;
};

export default function TeamLogo({ team, logo, size = 40, className = "", color, sport }: Props) {
  let resolvedLogo = logo;
  
  // Universal logo fallback by sport
  if (!resolvedLogo && sport) {
    const abbrev = team.slice(0, 3).toUpperCase();
    const sportMap: Record<string, string> = {
      NHL: `https://a.espncdn.com/i/teamlogos/nhl/500/\${getTeamId('NHL', abbrev)}.png`,
      NBA: `https://a.espncdn.com/i/teamlogos/nba/500/\${getTeamId('NBA', abbrev)}.png`,
      MLB: `https://a.espncdn.com/i/teamlogos/mlb/500/\${getTeamId('MLB', abbrev)}.png`,
      EPL: `https://a.espncdn.com/i/teamlogos/soccer/500/\${getTeamId('EPL', abbrev)}.png`,
      SERIE_A: `https://a.espncdn.com/i/teamlogos/soccer/500/\${getTeamId('SERIE_A', abbrev)}.png`,
    };
    resolvedLogo = sportMap[sport];
  }
  
  if (resolvedLogo) {
    return (
      <img
        src={resolvedLogo}
        alt={team}
        width={size}
        height={size}
        className={"object-contain " + className}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, backgroundColor: color || undefined, fontSize: color ? size * 0.35 : undefined }}
      className={"rounded-full flex items-center justify-center shrink-0 font-bold " + (color ? "text-white " : "bg-dark-surface border border-dark-border text-[10px] text-gray-300 ") + className}
    >
      {team.slice(0, 3)}
    </div>
  );
}
