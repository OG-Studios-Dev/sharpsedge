import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";

export default function SchedulePage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-lg mx-auto" />
      </header>
      <ScheduleStandingsContent />
    </div>
  );
}
