import Link from "next/link";

const TOOLS = [
  {
    title: "Best Lines",
    description: "Find the best available price across books before you place anything.",
    href: "/odds?tab=Best+Lines",
    label: "Price shop",
  },
  {
    title: "Sharp",
    description: "See where sharper books are hanging numbers and compare market posture.",
    href: "/odds?tab=Sharp",
    label: "Sharp view",
  },
  {
    title: "Movement",
    description: "Track where the market is moving and catch meaningful number shifts early.",
    href: "/odds?tab=Movement",
    label: "Line moves",
  },
] as const;

export default function HomeOddsToolsSection() {
  return (
    <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Odds tools</p>
        <h2 className="mt-1 text-lg font-semibold text-white">Best lines, sharp, movement</h2>
        <p className="mt-1 text-sm text-gray-400">Jump straight into the market pages when you want price, steam, or book-by-book context.</p>
      </div>

      <div className="mt-4 grid gap-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.title}
            href={tool.href}
            className="block rounded-2xl border border-dark-border/70 bg-dark-bg/50 p-3 transition hover:border-white/15 hover:bg-dark-surface/80"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="inline-flex rounded-full border border-dark-border bg-dark-bg/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                  {tool.label}
                </div>
                <h3 className="mt-2 text-base font-semibold text-white">{tool.title}</h3>
                <p className="mt-1 text-sm text-gray-400">{tool.description}</p>
              </div>
              <div className="shrink-0 text-xs font-semibold text-accent-blue">Open →</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
