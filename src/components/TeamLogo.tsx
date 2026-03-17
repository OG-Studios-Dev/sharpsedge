type Props = {
  team: string;
  logo?: string;
  size?: number;
  className?: string;
  color?: string;
  sport?: string;
};

export default function TeamLogo({ team, logo, size = 40, className = "", color }: Props) {
  if (logo) {
    return (
      <img
        src={logo}
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
