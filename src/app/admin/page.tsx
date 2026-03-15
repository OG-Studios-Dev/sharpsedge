import { getAdminOverviewData } from "@/lib/admin";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone = "text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-5 group hover:border-dark-border transition-colors">
      <p className="text-[10px] uppercase font-mono tracking-widest text-text-platinum/40 font-bold mb-3">{label}</p>
      <p className={`text-4xl font-mono font-black tracking-tighter ${tone}`}>{value}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const overview = await getAdminOverviewData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={String(overview.totalUsers)} />
        <StatCard label="7d Signups" value={`+${overview.recentSignups}`} tone="text-accent-green drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]" />
        <StatCard
          label="AI Pick Record"
          value={`${overview.pickSummary.wins}-${overview.pickSummary.losses}-${overview.pickSummary.pushes}`}
          tone="text-accent-blue drop-shadow-[0_0_15px_rgba(74,158,255,0.3)]"
        />
        <StatCard
          label="API Health"
          value={`${overview.healthyApis}/${overview.healthChecks.length}`}
          tone={overview.healthyApis === overview.healthChecks.length ? "text-accent-green drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]" : "text-accent-red drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]"}
        />
      </section>

      <section className="rounded-[24px] border border-dark-border/80 bg-dark-surface/40 p-6">
        <h2 className="text-[11px] uppercase font-mono tracking-widest text-text-platinum/50 font-bold mb-5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
            System Diagnostics
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {overview.healthChecks.map((check) => (
            <div key={check.name} className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between rounded-[16px] border border-dark-border/50 bg-dark-bg/60 px-5 py-4">
              <div>
                <p className="text-[13px] font-mono font-bold text-text-platinum mb-1">{check.name}</p>
                <p className="text-[11px] font-mono text-text-platinum/40 uppercase tracking-widest">{check.detail}</p>
              </div>
              <span className={`shrink-0 self-start sm:self-auto rounded px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-widest border ${
                  check.ok 
                  ? "bg-accent-green/10 text-accent-green border-accent-green/20" 
                  : "bg-accent-red/10 text-accent-red border-accent-red/20"
              }`}>
                {check.ok ? "Nominal" : "Degraded"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
