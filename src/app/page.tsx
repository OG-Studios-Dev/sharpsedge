import Link from "next/link";
import ScheduleStrip from "@/components/ScheduleStrip";
import EmptyStateCard from "@/components/EmptyStateCard";

export default function HomePage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Goosalytics</h1>
      </header>
      <div className="px-4 py-6 space-y-4">
        <div className="rounded-3xl bg-[linear-gradient(180deg,#171b26_0%,#0f1219_100%)] border border-dark-border p-5 shadow-[0_14px_48px_rgba(0,0,0,0.28)]">
          <div className="text-[11px] uppercase tracking-[0.2em] text-accent-blue/80 mb-2">NHL-first edge engine</div>
          <h2 className="text-white text-2xl font-bold leading-tight">Today’s board, only when the data is real.</h2>
          <p className="text-sm text-gray-400 mt-3 max-w-[36rem] leading-relaxed">
            Goosalytics now prioritizes live slate integrity over filler. If there are current NHL edges with real market and player-history support, they surface here. If not, the app stays honest.
          </p>
          <div className="flex gap-3 items-center mt-4 flex-wrap">
            <Link href="/props" className="inline-flex rounded-xl bg-accent-blue px-4 py-2 text-sm font-semibold text-white">Open Live Props</Link>
            <Link href="/trends" className="inline-flex rounded-xl border border-dark-border px-4 py-2 text-sm font-semibold text-gray-200">Open Trends</Link>
          </div>
        </div>

        <ScheduleStrip />

        <EmptyStateCard
          eyebrow="No fake edges"
          title="Thin slates are shown honestly"
          body="When live NHL player prop markets are unavailable or too weak to match cleanly, Goosalytics now shows restraint instead of stale seeded picks. That makes the product feel quieter — but far more trustworthy."
          ctaLabel="Review live props"
          ctaHref="/props"
        />
      </div>
    </div>
  );
}
