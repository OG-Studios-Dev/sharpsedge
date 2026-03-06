"use client";

import { useState } from "react";
import { Trend } from "@/lib/data/types";
import Badge from "@/components/ui/Badge";

const typeLabels: Record<string, string> = {
  home_away: "Home/Away",
  over_under: "Over/Under",
  h2h: "Head-to-Head",
  recent_form: "Recent Form",
  situational: "Situational",
};

type SortKey = "hitRate" | "theoreticalROI" | "confidence" | "sampleSize";

export default function TrendTable({
  trends,
  teams,
}: {
  trends: Trend[];
  teams: { id: string; name: string }[];
}) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("theoreticalROI");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = trends
    .filter((t) => typeFilter === "all" || t.type === typeFilter)
    .filter((t) => teamFilter === "all" || t.teamId === teamFilter)
    .sort((a, b) => {
      const diff = a[sortBy] - b[sortBy];
      return sortDir === "desc" ? -diff : diff;
    });

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(key); setSortDir("desc"); }
  }

  const SortIcon = ({ active, dir }: { active: boolean; dir: "asc" | "desc" }) => (
    <span className={`ml-1 ${active ? "text-amber-400" : "text-slate-600"}`}>
      {active && dir === "asc" ? "↑" : active && dir === "desc" ? "↓" : "↕"}
    </span>
  );

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All Types</option>
          {Object.entries(typeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium pr-4">Trend</th>
              <th className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium">Type</th>
              <th
                className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("sampleSize")}
              >
                Sample<SortIcon active={sortBy === "sampleSize"} dir={sortDir} />
              </th>
              <th
                className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("hitRate")}
              >
                Hit Rate<SortIcon active={sortBy === "hitRate"} dir={sortDir} />
              </th>
              <th
                className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("theoreticalROI")}
              >
                ROI<SortIcon active={sortBy === "theoreticalROI"} dir={sortDir} />
              </th>
              <th
                className="pb-3 text-[11px] text-slate-400 uppercase tracking-wider font-medium cursor-pointer hover:text-white"
                onClick={() => toggleSort("confidence")}
              >
                Confidence<SortIcon active={sortBy === "confidence"} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <td className="py-3 pr-4 text-sm text-white max-w-xs">{t.description}</td>
                <td className="py-3">
                  <Badge variant="blue">{typeLabels[t.type]}</Badge>
                </td>
                <td className="py-3 text-sm text-slate-300">{t.hits}/{t.sampleSize}</td>
                <td className="py-3">
                  <span className={`text-sm font-medium ${t.hitRate >= 75 ? "text-emerald-400" : t.hitRate >= 65 ? "text-amber-400" : "text-slate-300"}`}>
                    {t.hitRate.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3">
                  <span className={`text-sm font-medium ${t.theoreticalROI > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.theoreticalROI > 0 ? "+" : ""}{t.theoreticalROI.toFixed(1)}%
                  </span>
                </td>
                <td className="py-3">
                  <span className="text-amber-400 text-xs tracking-tight">
                    {"★".repeat(t.confidence)}<span className="text-slate-600">{"★".repeat(5 - t.confidence)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-slate-500 text-sm">No trends match your filters</div>
      )}
    </div>
  );
}
