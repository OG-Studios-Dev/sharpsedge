import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/auth/LogoutButton";
import { auth } from "@/lib/auth";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const profileItems = [
    ["Display name", session.user.name || "Unnamed user"],
    ["Email", session.user.email || "No email found"],
    ["Username", session.user.username || "Not set"],
    ["Role", session.user.role === "admin" ? "Admin" : "User"],
    ["Account created", formatDateTime(session.user.createdAt)],
    ["Last login", formatDateTime(session.user.lastLoginAt)],
  ];

  return (
    <div>
      <header className="sticky top-0 z-40 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-white">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Account access and profile details for your current session.</p>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Profile</h2>
          <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
            {profileItems.map(([label, value], index) => (
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Session</h2>
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <p className="text-sm leading-6 text-gray-400">
              Your session is stored as a JWT, so it stays active across refreshes until you log out.
            </p>
            <LogoutButton className="mt-4 w-full rounded-2xl border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-accent-red/15 disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </section>

        {session.user.role === "admin" && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</h2>
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
              <p className="text-sm leading-6 text-gray-400">
                Review account activity, picks, and upstream API health from the admin dashboard.
              </p>
              <Link
                href="/admin"
                className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-accent-blue/40 bg-accent-blue/10 px-4 py-3 text-sm font-semibold text-accent-blue transition hover:bg-accent-blue/15"
              >
                Open Admin Dashboard
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
