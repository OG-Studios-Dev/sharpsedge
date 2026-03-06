import { Trend } from "@/lib/data/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

function Stars({ count }: { count: number }) {
  return (
    <span className="text-amber-400 text-xs tracking-tight">
      {"★".repeat(count)}
      <span className="text-slate-600">{"★".repeat(5 - count)}</span>
    </span>
  );
}

const typeLabels: Record<string, string> = {
  home_away: "Home/Away",
  over_under: "Over/Under",
  h2h: "Head-to-Head",
  recent_form: "Recent Form",
  situational: "Situational",
};

export default function TrendCard({ trend }: { trend: Trend }) {
  return (
    <Card hover className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={trend.hitRate >= 75 ? "green" : trend.hitRate >= 65 ? "amber" : "slate"}>
              {trend.hitRate.toFixed(1)}%
            </Badge>
            <Badge variant="blue">{typeLabels[trend.type]}</Badge>
          </div>
          <p className="text-sm text-white font-medium">{trend.description}</p>
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
            <span>{trend.hits}/{trend.sampleSize} hits</span>
            <span>ROI: <span className={trend.theoreticalROI > 0 ? "text-emerald-400" : "text-red-400"}>
              {trend.theoreticalROI > 0 ? "+" : ""}{trend.theoreticalROI.toFixed(1)}%
            </span></span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <Stars count={trend.confidence} />
        </div>
      </div>
    </Card>
  );
}
