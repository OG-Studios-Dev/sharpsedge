import Link from "next/link";
import ScheduleStrip from "@/components/ScheduleStrip";

export default function HomePage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Goosalytics</h1>
      </header>
      <div className="px-4 py-6 space-y-4">
        <div className="rounded-2xl bg-dark-surface border border-dark-border p-4">
          <h2 className="text-white font-semibold mb-2">Top Edges Today</h2>
          <p className="text-sm text-gray-400">Goosalytics now ranks NHL-first props through a real edge-selection pipeline with upcoming games, odds linkage, and pick tracking hooks.</p>
          <div className="flex gap-4 items-center mt-3">
            <Link href="/trends" className="inline-block text-accent-blue text-sm font-medium">Open Trends →</Link>
            <Link href="/props" className="inline-block text-gray-300 text-sm font-medium">Open Props →</Link>
          </div>
        </div>
        <ScheduleStrip />
      </div>
    </div>
  );
}
