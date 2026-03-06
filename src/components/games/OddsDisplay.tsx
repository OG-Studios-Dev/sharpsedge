export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export default function OddsDisplay({
  label,
  odds,
  sub,
  onClick,
  selected,
}: {
  label: string;
  odds: number;
  sub?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center px-3 py-2 rounded-lg border transition-all duration-150 min-w-[80px] ${
        selected
          ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
          : "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:border-slate-600 hover:text-white"
      }`}
    >
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold mt-0.5">{formatOdds(odds)}</span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </button>
  );
}
