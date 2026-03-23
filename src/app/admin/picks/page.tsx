import { getAdminPicks } from "@/lib/admin";

export const dynamic = "force-dynamic";

function resultTone(result: string) {
  if (result === "win") return "text-accent-green";
  if (result === "loss") return "text-accent-red";
  if (result === "push") return "text-accent-yellow";
  return "text-gray-400";
}

function provenanceTone(provenance: string) {
  if (provenance === "manual_repair") return "border-blue-400/30 bg-blue-500/10 text-blue-200";
  if (provenance === "reconstructed") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
}

function reviewTone(provenance: string) {
  if (provenance === "manual_repair") return "bg-blue-500/10 text-blue-200 border-blue-400/30";
  if (provenance === "reconstructed") return "bg-amber-500/10 text-amber-200 border-amber-400/30";
  return "bg-emerald-500/10 text-emerald-200 border-emerald-400/20";
}

function reviewLabel(provenance: string) {
  if (provenance === "manual_repair") return "needs admin review";
  if (provenance === "reconstructed") return "needs admin review";
  return "approved";
}

export default async function AdminPicksPage() {
  const picks = await getAdminPicks();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Pick History Review</h2>
        <p className="text-sm text-gray-400">Public history stays clean. Admin is where provenance, review state, and approval decisions live.</p>
      </div>

      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Admin review policy</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-100">Approved = safe for public clean history</div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-amber-100">Needs admin review = provenance or import path should be checked privately</div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-blue-100">Next step: wire explicit approve / reject actions here</div>
        </div>
      </div>

      {picks.length === 0 ? (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-6 text-center text-sm text-gray-400">
          No pick history found yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface">
          <div className="grid grid-cols-[0.9fr_0.7fr_1.4fr_0.7fr_0.7fr] gap-3 border-b border-dark-border/50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            <span>Date</span>
            <span>League</span>
            <span>Pick</span>
            <span>Odds</span>
            <span>Result</span>
          </div>

          {picks.map((pick) => (
            <div
              key={pick.id}
              className="grid grid-cols-[0.9fr_0.7fr_1.4fr_0.7fr_0.7fr] gap-3 border-b border-dark-border/30 px-4 py-3 last:border-b-0"
            >
              <span className="text-sm text-gray-300">{pick.date}</span>
              <span className="text-sm text-gray-300">{pick.league}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">{pick.pick_label}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${provenanceTone(pick.provenance)}`}>
                    {pick.provenance === "manual_repair" ? "manual repair" : pick.provenance === "reconstructed" ? "reconstructed" : "original"}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${reviewTone(pick.provenance)}`}>
                    {reviewLabel(pick.provenance)}
                  </span>
                </div>
                <p className="truncate text-xs text-gray-500">{pick.team}{pick.opponent ? ` vs ${pick.opponent}` : ""}</p>
              </div>
              <span className="text-sm text-gray-300">{typeof pick.odds === "number" ? pick.odds : "—"}</span>
              <span className={`text-sm font-semibold uppercase ${resultTone(pick.result)}`}>{pick.result}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
