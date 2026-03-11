import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";

export default function SchedulePage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Schedule & Standings</h1>
      </header>
      <ScheduleStandingsContent />
    </div>
  );
}
