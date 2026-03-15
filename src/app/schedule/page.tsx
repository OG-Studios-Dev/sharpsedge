import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 px-4 py-4 backdrop-blur-sm lg:px-0">
        <img src="/logo.jpg" alt="Goosalytics" className="mx-auto h-10 w-auto rounded-lg" />
      </header>
      <ScheduleStandingsContent />
    </div>
  );
}
