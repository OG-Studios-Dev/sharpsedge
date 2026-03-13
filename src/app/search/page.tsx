import EmptyStateCard from "@/components/EmptyStateCard";

const destinations = [
  {
    href: "/props",
    title: "Props & analytics",
    description: "Browse live player props and team trends by league.",
  },
  {
    href: "/picks",
    title: "Top picks",
    description: "See the highest-confidence picks available right now.",
  },
  {
    href: "/schedule",
    title: "Schedule",
    description: "Open today’s slate and jump into active matchups.",
  },
];

export default function SearchPage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border px-4 py-4">
        <h1 className="text-xl font-bold text-white text-center">Search</h1>
      </header>

      <EmptyStateCard
        eyebrow="Not enabled"
        title="Search is offline for now"
        body="Search isn’t wired to live player, game, or market data yet, so it’s hidden as a real feature for now. Use one of the working views below instead."
      />

      <div className="px-4 pb-6 space-y-3">
        {destinations.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="block rounded-2xl border border-dark-border bg-dark-surface px-4 py-4 transition-colors hover:border-gray-600"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-white font-semibold">{item.title}</p>
                <p className="text-sm text-gray-400 mt-1">{item.description}</p>
              </div>
              <span className="text-gray-500 text-sm">Open</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
