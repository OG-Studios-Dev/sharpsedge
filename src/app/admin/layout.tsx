import Link from "next/link";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/ops", label: "IT Review" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/picks", label: "Picks" },
  { href: "/admin/sandbox", label: "📋 Daily Board" },
  { href: "/admin/goose-model", label: "🔬 Signal Lab" },
  { href: "/admin/systems", label: "📊 Systems" },
  { href: "/admin/system", label: "System" },
];

export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Beta mode: no auth check — admin is open during beta
  return (
    <main className="min-h-screen bg-dark-bg px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl border border-dark-border bg-[linear-gradient(180deg,#151821_0%,#10131b_100%)] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.24)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <img src="/logo.jpg" alt="Goosalytics" className="h-10 w-auto rounded-xl" />
              <h1 className="text-2xl font-bold text-white mt-2">Admin Dashboard</h1>
            </div>
            <Link href="/" className="text-sm font-semibold text-accent-blue">
              Back home
            </Link>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-dark-border bg-dark-surface px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:border-accent-blue/30 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </main>
  );
}
