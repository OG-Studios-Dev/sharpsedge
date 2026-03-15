import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";
import PageHeader from "@/components/PageHeader";

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Schedule"
        subtitle="Schedules, standings, and tournament boards."
      />
      <ScheduleStandingsContent />
    </div>
  );
}
