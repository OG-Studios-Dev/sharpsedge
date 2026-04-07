import Link from "next/link";
import { TrendRow as TrendRowData } from "@/lib/insights";
import { formatOdds } from "@/lib/edge-engine";
import { getTeamHref, getPlayerHref } from "@/lib/drill-down";
import TeamLogo from "@/components/TeamLogo";

function renderOdds(row: TrendRowData) {
  if (typeof row.odds !== "number") return null;
  if (!row.book && row.odds === -110) return null;
  return formatOdds(row.odds);
}

function getRowHref(row: TrendRowData): string {
  if (row.kind === "player") return getPlayerHref(row.playerId);
  if (row.kind === "team") return getTeamHref(row.team, row.league);
  return "/props";
}

export default function TrendRow({ row }: { row: TrendRowData }) {
  const oddsLabel = renderOdds(row);
  const hitRateClass = row.hitRate >= 100
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
    : row.hitRate >= 90
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
      : "bg-yellow-500/15 text-yellow-300 border-yellow-500/25";

  const href = getRowHref(row);

  return (
    <Link href={href} className="block group">
      <div className="rounded-2xl border border-dark-border bg-dark-surface/70 px-4 py-3 transition-colors group-hover:border-emerald-500/40 group-hover:bg-dark-surface">
        <div className="flex items-start gap-3">
          <TeamLogo team={row.team} size={34} color={row.teamColor} sport={row.league} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white text-sm font-semibold truncate group-hover:text-emerald-300 transition-colors">{row.title}</p>
              <span className="text-[9px] uppercase tracking-[0.18em] text-gray-600">{row.league}</span>
              {row.lineType === "alt" && (
                <span className="text-[9px] uppercase tracking-[0.18em] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2 py-0.5">
                  Alt
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">{row.subtitle}</p>
            <p className="text-sm text-gray-200 mt-2">{row.marketLabel}</p>
          </div>
          <div className="text-right shrink-0 space-y-1">
            {oddsLabel && (
              <div className="text-[11px] font-semibold text-white bg-dark-bg border border-dark-border rounded-full px-2.5 py-1">
                {oddsLabel}
              </div>
            )}
            <div className={`text-[11px] font-semibold rounded-full border px-2.5 py-1 ${hitRateClass}`}>
              {row.recordLabel}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
