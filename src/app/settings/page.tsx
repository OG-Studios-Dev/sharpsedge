import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import PageHeader from "@/components/PageHeader";
import { requireUser } from "@/lib/auth";
import { getEffectiveTier, TIER_LABELS } from "@/lib/tier-access";

function formatDate(value?: string | null) {
  if (!value) return "Not yet";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SettingsPage() {
  const viewer = await requireUser();
  const profile = viewer.profile;
  const initial = (profile?.name || viewer.user.email || "G").charAt(0).toUpperCase();
  const effectiveTier = getEffectiveTier(profile);

  const fields = [
    ["Name", profile?.name ?? "Unknown"],
    ["Username", profile?.username ? `@${profile.username}` : "Not set"],
    ["Email", viewer.user.email ?? "Unknown"],
    ["Role", profile?.role === "admin" ? "Admin" : "User"],
    ["Tier", TIER_LABELS[effectiveTier]],
    ["Subscription", profile?.subscription_status ?? "none"],
    ["Joined", formatDate(profile?.created_at)],
    ["Last login", formatDate(profile?.last_login_at)],
  ];

  return (
    <main className="min-h-screen bg-dark-bg pb-24">
      <PageHeader
        title="Settings"
        subtitle="Account, subscription, and app preferences."
      />
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="mx-4 mt-4 flex items-center gap-4 rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)] lg:mx-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-blue/20 text-xl font-bold text-accent-blue">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Account</p>
            <h1 className="truncate text-2xl font-bold text-white">{profile?.name ?? "Goosalytics User"}</h1>
            <p className="truncate text-sm text-gray-400">{viewer.user.email}</p>
          </div>
        </header>

        <section className="mx-4 overflow-hidden rounded-2xl border border-dark-border bg-dark-surface lg:mx-0">
          {fields.map(([label, value], index) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-4 px-4 py-3.5 ${index > 0 ? "border-t border-dark-border/50" : ""}`}
            >
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="text-right text-sm text-gray-400">{value}</span>
            </div>
          ))}
        </section>

        <section className="mx-4 rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-3 lg:mx-0">
          <h2 className="page-heading">Billing</h2>
          <p className="text-sm text-gray-400">
            Stripe is not connected yet. Upgrade buttons stay in coming-soon mode until keys and products are wired.
          </p>
          <div className="rounded-2xl border border-dark-border bg-dark-bg/60 p-4">
            <p className="section-heading">Restore Purchase</p>
            <p className="mt-2 text-sm text-gray-400">Restore and discount code redemption will appear here once billing is enabled.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href="/upgrade"
                className="tap-button inline-flex min-h-[44px] items-center justify-center rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue"
              >
                View Plans
              </Link>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Discount code placeholder: <span className="font-semibold">GOOSEFAM</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-4 rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-3 lg:mx-0">
          <h2 className="text-sm font-semibold text-white">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <LogoutButton />
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue"
              >
                Open admin
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
