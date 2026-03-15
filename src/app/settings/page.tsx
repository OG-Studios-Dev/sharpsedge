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
    <main className="min-h-screen bg-dark-bg pb-32">
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border/60 px-4 lg:px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-black text-text-platinum tracking-tight">Account & Settings</h1>
            <p className="text-[11px] font-mono font-bold tracking-widest text-text-platinum/50 uppercase mt-1">Manage your terminal profile</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 lg:px-6 py-8 space-y-8">
        <div className="rounded-[32px] border border-dark-border/80 bg-gradient-to-br from-dark-surface/60 to-dark-bg p-6 shadow-[0_8px_30px_-15px_rgba(0,0,0,0.5)] flex items-center gap-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ filter: "url(#noiseFilter)" }} />
          <div className="absolute -right-24 -top-24 w-64 h-64 bg-accent-blue/10 blur-[80px] rounded-full pointer-events-none" />

          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-dark-bg border-[3px] border-dark-border/80 text-3xl font-heading font-black text-white shadow-xl relative z-10">
            {initial}
          </div>
          <div className="min-w-0 flex-1 relative z-10">
            {profile?.role === "admin" && (
                <span className="inline-block bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-widest mb-2">Admin</span>
            )}
            <h2 className="truncate text-2xl font-heading font-black text-text-platinum tracking-tight">{profile?.name ?? "Terminal User"}</h2>
            <p className="truncate text-[13px] font-mono font-bold text-text-platinum/50 mt-1">{viewer.user.email}</p>
          </div>
        </div>

        <section className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 overflow-hidden">
          {fields.map(([label, value], index) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-dark-surface/30 ${index > 0 ? "border-t border-dark-border/40" : ""}`}
            >
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-text-platinum/40">{label}</span>
              <span className="text-right text-[13px] font-mono font-bold text-text-platinum">{value}</span>
            </div>
          ))}
        </section>

        <section className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-6 space-y-4">
          <h2 className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-4">Terminal Actions</h2>
          <div className="flex flex-wrap gap-4">
            <LogoutButton />
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-accent-blue/40 bg-accent-blue/10 px-6 text-sm font-bold text-accent-blue hover:bg-accent-blue/20 hover:text-white transition-colors drop-shadow-[0_0_8px_rgba(74,158,255,0.2)]"
              >
                Access Admin Terminal &rarr;
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
