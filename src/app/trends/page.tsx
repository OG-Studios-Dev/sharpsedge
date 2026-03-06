import { trends } from "@/lib/data/trends";
import { teams } from "@/lib/data/teams";
import Card from "@/components/ui/Card";
import TrendTable from "@/components/trends/TrendTable";

export default function TrendsPage() {
  const uniqueTeamIds = [...new Set(trends.map((t) => t.teamId).filter(Boolean))];
  const trendTeams = uniqueTeamIds.map((id) => {
    const team = teams.find((t) => t.id === id);
    return { id: id!, name: team ? `${team.city} ${team.name}` : id! };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Trends</h1>
        <p className="text-sm text-slate-400 mt-1">{trends.length} active trends across NHL matchups</p>
      </div>

      <Card className="p-5">
        <TrendTable trends={trends} teams={trendTeams} />
      </Card>
    </div>
  );
}
