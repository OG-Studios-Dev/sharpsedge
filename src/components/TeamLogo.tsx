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
  // Heuristic: 3-letter NHL/NBA/MLB abbrevs are all uppercase
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
  if (logo) {
    return (
      <img
        src={logo}
        alt={team}
        width={size}
        height={size}
        className={"object-contain " + className}
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          const parent = img.parentElement;
          if (parent) {
            img.style.display = "none";
            const fallback = document.createElement("div");
            fallback.style.cssText = `width:${size}px;height:${size}px;font-size:${size * 0.55}px;`;
            fallback.className = "rounded-full flex items-center justify-center shrink-0 bg-dark-surface border border-dark-border " + className;
            fallback.textContent = sportEmojiForTeam(team, sport);
            parent.appendChild(fallback);
          }
        }}
      />
    );
  }
  // No logo provided — render sport emoji, never raw abbreviation text
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
