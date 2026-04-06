import { getLeagueLabel, getLeagueLogo } from "@/lib/visual-identity";

type Props = {
  league?: string | null;
  size?: number;
  className?: string;
};

export default function LeagueLogo({ league, size = 20, className = "" }: Props) {
  const src = getLeagueLogo(league);
  const label = getLeagueLabel(league);

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-contain bg-white/95 p-0.5 ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dark-border bg-dark-bg text-gray-300 ${className}`}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}
