import { getAdminPicks } from "@/lib/admin";

export const dynamic = "force-dynamic";

function resultTone(result: string) {
  if (result === "win") return "text-accent-green";
  if (result === "loss") return "text-accent-red";
  if (result === "push") return "text-accent-yellow";
  return "text-gray-400";
}

export default async function AdminPicksPage() {
  const picks = await getAdminPicks();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Pick History</h2>
        <p className="text-sm text-gray-400">Supabase `pick_history` is preferred. The file-backed store is used when the table is empty or unavailable.</p>
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
                <p className="truncate text-sm font-medium text-white">{pick.pick_label}</p>
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
