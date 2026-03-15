import ScheduleStandingsContent from "@/components/ScheduleStandingsContent";

export default function SchedulePage() {
  return (
    <main className="min-h-screen bg-dark-bg pb-32">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60">
        <div className="px-4 lg:px-6 py-5 max-w-3xl mx-auto">
          <h1 className="text-2xl font-black text-text-platinum font-heading tracking-tight text-center">Schedule & Standings</h1>
        </div>
      </header>
      <div className="mt-2">
        <ScheduleStandingsContent />
      </div>
    </main>
  );
}
