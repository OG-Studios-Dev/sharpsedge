import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { getCurrentViewer } from "@/lib/auth";
import { getEffectiveTier, getFeatureCopy, TIER_LABELS } from "@/lib/tier-access";

const FEATURE_ROWS = [
  { feature: "AI picks (30 min delay)", free: true, pro: true, sharp: true },
  { feature: "Real-time picks", free: false, pro: true, sharp: true },
  { feature: "Basic schedule", free: true, pro: true, sharp: true },
  { feature: "All trends", free: false, pro: true, sharp: true },
  { feature: "Line shopping", free: false, pro: true, sharp: true },
  { feature: "Prop analysis", free: false, pro: true, sharp: true },
  { feature: "Quick Hitters", free: false, pro: true, sharp: true },
  { feature: "Sharp alerts", free: false, pro: false, sharp: true },
  { feature: "Line movement", free: false, pro: false, sharp: true },
  { feature: "SGP builder", free: false, pro: false, sharp: true },
  { feature: "My Picks", free: false, pro: false, sharp: true },
  { feature: "100% Club", free: false, pro: false, sharp: true },
];

function Availability({ enabled }: { enabled: boolean }) {
  return <span className={enabled ? "text-emerald-300" : "text-gray-600"}>{enabled ? "✓" : "✕"}</span>;
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: { feature?: string | string[] };
}) {
  const viewer = await getCurrentViewer();
  const featureParam = Array.isArray(searchParams?.feature) ? searchParams?.feature[0] : searchParams?.feature;
  const copy = featureParam ? getFeatureCopy(featureParam as Parameters<typeof getFeatureCopy>[0]) : null;
  const tier = getEffectiveTier(viewer?.profile);

  return (
    <main className="mx-auto min-h-screen max-w-6xl bg-dark-bg pb-24">
      <PageHeader
        title="Upgrade"
        subtitle="Free, Pro, and Sharp tier comparison."
      />

      <div className="space-y-4 px-4 py-4 lg:px-0">
        <section className="rounded-2xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-4">
          <p className="section-heading">Current Access</p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            You are on {TIER_LABELS[tier]}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {tier === "beta"
              ? "Beta accounts keep Sharp access for free. No upgrade required."
              : "Subscribe once Stripe is connected to unlock premium features."}
          </p>
          {copy && (
            <div className="mt-4 rounded-2xl border border-accent-blue/20 bg-accent-blue/10 p-4">
              <p className="section-heading text-accent-blue">Locked Feature</p>
              <h3 className="mt-2 text-base font-semibold text-white">{copy.title}</h3>
              <p className="mt-1 text-sm text-gray-300">{copy.description}</p>
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {[
            {
              name: "Free",
              price: "$0",
              detail: "AI picks (delayed), basic schedule, top 5 trends",
              accent: "border-dark-border bg-dark-surface/70",
            },
            {
              name: "Pro",
              price: "$4.99/mo",
              detail: "Real-time picks, full trends, line shopping, prop analysis",
              accent: "border-accent-blue/30 bg-accent-blue/10",
            },
            {
              name: "Sharp",
              price: "$9.99/mo",
              detail: "Everything plus alerts, line movement, SGP builder, My Picks",
              accent: "border-amber-500/30 bg-amber-500/10",
            },
          ].map((plan) => (
            <article key={plan.name} className={`rounded-2xl border p-4 ${plan.accent}`}>
              <p className="section-heading">{plan.name}</p>
              <h2 className="mt-2 text-2xl font-bold text-white">{plan.price}</h2>
              <p className="mt-2 text-sm text-gray-300">{plan.detail}</p>
              <button
                type="button"
                disabled
                className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-dark-border bg-dark-bg/70 px-4 text-sm font-semibold text-white opacity-70"
              >
                Coming Soon
              </button>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/70">
          <div className="grid grid-cols-[minmax(180px,1fr)_80px_80px_80px] border-b border-dark-border px-4 py-3 text-sm font-semibold text-white">
            <div>Feature</div>
            <div className="text-center">Free</div>
            <div className="text-center">Pro</div>
            <div className="text-center">Sharp</div>
          </div>
          {FEATURE_ROWS.map((row) => (
            <div key={row.feature} className="grid grid-cols-[minmax(180px,1fr)_80px_80px_80px] border-b border-dark-border/50 px-4 py-3 text-sm text-gray-300 last:border-b-0">
              <div>{row.feature}</div>
              <div className="text-center"><Availability enabled={row.free} /></div>
              <div className="text-center"><Availability enabled={row.pro} /></div>
              <div className="text-center"><Availability enabled={row.sharp} /></div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-dark-border bg-dark-surface/70 p-4">
          <p className="section-heading">Restore Purchase</p>
          <p className="mt-2 text-sm text-gray-400">
            Stripe is not connected yet. Restore and discount-code redemption will live in Settings once billing is enabled.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/settings"
              className="tap-button inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-dark-border bg-dark-bg px-4 text-sm font-semibold text-white"
            >
              Open Settings
            </Link>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Discount code placeholder: <span className="font-semibold">GOOSEFAM</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
