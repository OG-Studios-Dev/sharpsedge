import Link from "next/link";
import type { ReactNode } from "react";
import AdminNav from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <div className="space-y-6 pb-8">
      <header className="overflow-hidden rounded-[32px] border border-dark-border bg-[radial-gradient(circle_at_top_left,rgba(74,158,255,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.14),transparent_34%),linear-gradient(180deg,#171d2a_0%,#0c1017_100%)] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent-blue">Admin Console</p>
            <h1 className="mt-3 text-3xl font-bold text-white">Goosalytics control center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">
              Review users, generated picks, upstream API health, and deployment metadata from one place.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-bg/40 px-4 py-3 text-sm text-gray-300">
            <p className="font-semibold text-white">{session.user.name}</p>
            <p>{session.user.email}</p>
            <Link href="/settings" className="mt-3 inline-flex text-accent-blue hover:text-white">
              Back to Settings
            </Link>
          </div>
        </div>
      </header>

      <AdminNav />

      {children}
    </div>
  );
}
