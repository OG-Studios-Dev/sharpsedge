import EmptyStateCard from "@/components/EmptyStateCard";

const statusItems = [
  ["Version", "0.1.0"],
  ["Player data", "Live league feeds"],
  ["Saved picks", "Local device + server fallback"],
];

const notes = [
  "User preferences are not editable yet, so this page only shows current app status.",
  "Parlay builder and global search stay hidden until they are backed by live data and real actions.",
  "Goosalytics is a research tool, not a sportsbook.",
];

export default function SettingsPage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
      </header>

      <EmptyStateCard
        eyebrow="Read only"
        title="No adjustable settings yet"
        body="This build doesn’t persist preferences, alerts, or account-level controls yet. Rather than show dead toggles, this page just reports the current app state."
      />

      <div className="px-4 py-4 space-y-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Current app status</h2>
          <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
            {statusItems.map(([label, value], index) => (
              <div
                key={label}
                className={`flex items-center justify-between px-4 py-3.5 ${index > 0 ? "border-t border-dark-border/50" : ""}`}
              >
                <span className="text-white text-[15px]">{label}</span>
                <span className="text-gray-400 text-[14px] text-right">{value}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Notes</h2>
          <div className="rounded-2xl border border-dark-border bg-dark-surface px-4 py-1">
            {notes.map((note, index) => (
              <p key={index} className={`text-sm text-gray-400 py-3 ${index > 0 ? "border-t border-dark-border/50" : ""}`}>
                {note}
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
