import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";
import { requireUser } from "@/lib/auth";

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

  const fields = [
    ["Name", profile?.name ?? "Unknown"],
    ["Username", profile?.username ? `@${profile.username}` : "Not set"],
    ["Email", viewer.user.email ?? "Unknown"],
    ["Role", profile?.role === "admin" ? "Admin" : "User"],
    ["Joined", formatDate(profile?.created_at)],
    ["Last login", formatDate(profile?.last_login_at)],
  ];

  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-4 rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-blue/20 text-xl font-bold text-accent-blue">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Account</p>
            <h1 className="truncate text-2xl font-bold text-white">{profile?.name ?? "Goosalytics User"}</h1>
            <p className="truncate text-sm text-gray-400">{viewer.user.email}</p>
          </div>
        </header>

        <section className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
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

        <section className="rounded-2xl border border-dark-border bg-dark-surface p-4 space-y-3">
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
