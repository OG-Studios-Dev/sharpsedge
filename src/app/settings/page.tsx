"use client";

export default function SettingsPage() {
  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Preferences</h2>
          <div className="space-y-0">
            <SettingsRow label="Default League" value="NHL" />
            <SettingsRow label="Minimum Hit Rate" value="75%" />
            <SettingsRow label="Show Tier Badges" value="On" />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Notifications</h2>
          <div className="space-y-0">
            <SettingsRow label="Push Notifications" value="Off" />
            <SettingsRow label="Daily Picks Alert" value="Off" />
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">About</h2>
          <div className="space-y-0">
            <SettingsRow label="Version" value="1.0.0" />
            <SettingsRow label="Data Source" value="Mock Data" />
          </div>
        </section>

        <p className="text-center text-gray-600 text-xs pt-4">
          Goosalytics is a research tool, not a sportsbook.
          <br />
          Please gamble responsibly.
        </p>
      </div>
    </div>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-dark-border/50">
      <span className="text-white text-[15px]">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-[14px]">{value}</span>
        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
