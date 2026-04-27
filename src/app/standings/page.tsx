import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";
import PageHeader from "@/components/PageHeader";

export default function StandingsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Standings"
        subtitle="League tables across NHL, NBA, MLB, NFL, EPL, and Serie A."
      />
      <ScheduleStandingsContent initialView="Standings" />
    </div>
  );
}
