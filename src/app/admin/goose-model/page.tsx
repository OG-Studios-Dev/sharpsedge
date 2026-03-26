"use client";

import { useEffect, useState, useCallback } from "react";
import type { GooseModelPick, GooseSignalWeight, GooseModelStats } from "@/lib/goose-model/types";

// ── tiny helpers ──────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function resultColor(result: string): string {
  if (result === "win") return "text-emerald-400";
  if (result === "loss") return "text-rose-400";
  if (result === "push") return "text-yellow-400";
  return "text-gray-400";
}

function resultBadge(result: string): string {
  if (result === "win")
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (result === "loss")
    return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  if (result === "push")
    return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-gray-500/15 text-gray-400 border-gray-500/30";
}

function winRateColor(rate: number): string {
  if (rate >= 0.6) return "text-emerald-400";
  if (rate >= 0.5) return "text-yellow-400";
  return "text-rose-400";
}

const SPORTS = ["ALL", "NHL", "NBA", "MLB", "PGA"] as const;

// ── stat card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

// ── pick row ──────────────────────────────────────────────────

function PickRow({
  pick,
  onGrade,
  onPromote,
}: {
  pick: GooseModelPick;
  onGrade: (id: string, result: "win" | "loss" | "push") => void;
  onPromote: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface overflow-hidden">
      <div
        className="flex flex-wrap items-start justify-between gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">
              {pick.pick_label}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${resultBadge(pick.result)}`}
            >
              {pick.result}
            </span>
            {pick.promoted_to_production && (
              <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-xs font-semibold text-accent-blue">
                promoted
              </span>
            )}
            <span className="rounded-full border border-dark-border px-2 py-0.5 text-xs text-gray-400">
              {pick.sport}
            </span>
            <span className="rounded-full border border-dark-border px-2 py-0.5 text-xs text-gray-500">
              {pick.source}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{pick.date}</span>
            {pick.odds != null && <span>{pick.odds > 0 ? "+" : ""}{pick.odds}</span>}
            {pick.hit_rate_at_time != null && (
              <span>HR: {pct(pick.hit_rate_at_time / 100)}</span>
            )}
            {pick.book && <span>{pick.book}</span>}
            <span className="text-gray-600">{pick.model_version}</span>
          </div>

          {pick.signals_present.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {pick.signals_present.map((sig) => (
                <span
                  key={sig}
                  className="rounded-md border border-accent-blue/20 bg-accent-blue/5 px-2 py-0.5 text-xs text-accent-blue"
                >
                  {sig.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-gray-500 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-dark-border px-4 pb-4 pt-3 space-y-3">
          {pick.reasoning && (
            <p className="text-sm text-gray-300 leading-relaxed">{pick.reasoning}</p>
          )}

          {pick.result === "pending" && (
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center">Grade:</span>
              {(["win", "loss", "push"] as const).map((r) => (
                <button
                  key={r}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrade(pick.id, r);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:opacity-80 ${
                    r === "win"
                      ? "border-emerald-500/40 text-emerald-400"
                      : r === "loss"
                      ? "border-rose-500/40 text-rose-400"
                      : "border-yellow-500/40 text-yellow-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {!pick.promoted_to_production && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPromote(pick.id);
              }}
              className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-3 py-1 text-xs font-semibold text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              ✦ Promote to production consideration
            </button>
          )}

          {pick.promotion_notes && (
            <p className="text-xs text-gray-400">Note: {pick.promotion_notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── signal leaderboard ────────────────────────────────────────

function SignalLeaderboard({
  weights,
  sportFilter,
}: {
  weights: GooseSignalWeight[];
  sportFilter: string;
}) {
  const filtered = weights
    .filter((w) => sportFilter === "ALL" || w.sport === sportFilter)
    .filter((w) => w.sport === (sportFilter === "ALL" ? "ALL" : sportFilter))
    .filter((w) => w.appearances > 0)
    .sort((a, b) => b.win_rate - a.win_rate);

  if (!filtered.length) {
    return (
      <p className="text-sm text-gray-500">
        No signal data yet. Grade some picks to start building weights.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((w) => (
        <div
          key={`${w.signal}-${w.sport}`}
          className="flex items-center justify-between rounded-xl border border-dark-border bg-dark-bg/50 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-white">
              {w.signal.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-gray-500">
              {w.appearances} appearances · {w.wins}W {w.losses}L {w.pushes}P
            </p>
          </div>
          <div className="text-right">
            <p className={`text-lg font-bold ${winRateColor(w.win_rate)}`}>
              {pct(w.win_rate)}
            </p>
            <p className="text-xs text-gray-500">win rate</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────

type Tab = "picks" | "signals" | "performance";

export default function GooseModelAdminPage() {
  const [tab, setTab] = useState<Tab>("picks");
  const [date, setDate] = useState(today());
  const [sportFilter, setSportFilter] = useState<string>("ALL");
  const [picks, setPicks] = useState<GooseModelPick[]>([]);
  const [weights, setWeights] = useState<GooseSignalWeight[]>([]);
  const [stats, setStats] = useState<GooseModelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateSport, setGenerateSport] = useState("NHL");
  const [topN, setTopN] = useState(5);

  const loadPicks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "picks" });
      if (date) params.set("date", date);
      if (sportFilter !== "ALL") params.set("sport", sportFilter);

      const res = await fetch(`/api/admin/goose-model?${params}`);
      const data = await res.json() as { picks?: GooseModelPick[]; error?: string };
      if (data.error) throw new Error(data.error);
      setPicks(data.picks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load picks");
    } finally {
      setLoading(false);
    }
  }, [date, sportFilter]);

  const loadWeights = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/goose-model?view=weights`);
      const data = await res.json() as { weights?: GooseSignalWeight[] };
      setWeights(data.weights ?? []);
    } catch {
      // graceful — weights may not exist yet
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/goose-model?view=stats`);
      const data = await res.json() as { stats?: GooseModelStats };
      setStats(data.stats ?? null);
    } catch {
      // graceful
    }
  }, []);

  useEffect(() => {
    loadPicks();
    loadWeights();
    loadStats();
  }, [loadPicks, loadWeights, loadStats]);

  async function handleGrade(id: string, result: "win" | "loss" | "push") {
    try {
      await fetch("/api/admin/goose-model/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades: [{ id, result }] }),
      });
      await Promise.all([loadPicks(), loadWeights(), loadStats()]);
    } catch {
      alert("Grade failed");
    }
  }

  async function handlePromote(id: string) {
    const notes = prompt("Promotion notes (optional):");
    try {
      await fetch("/api/admin/goose-model/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notes }),
      });
      await loadPicks();
    } catch {
      alert("Promote failed");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/goose-model/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sport: generateSport, topN }),
      });
      const data = await res.json() as { picks?: GooseModelPick[]; message?: string; error?: string };
      if (data.error) throw new Error(data.error);
      await loadPicks();
      alert(`Generated ${data.picks?.length ?? 0} ${generateSport} picks for ${date}`);
    } catch (e) {
      alert(`Generate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  const settledPicks = picks.filter((p) => p.result !== "pending");
  const pendingPicks = picks.filter((p) => p.result === "pending");
  const winRate =
    settledPicks.length > 0
      ? settledPicks.filter((p) => p.result === "win").length / settledPicks.length
      : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">🪿 Goose AI Picks Model</h2>
            <p className="mt-1 text-sm text-gray-400">
              Self-improving picks model · learns from its own track record
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            />
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={loadPicks}
              className="rounded-full border border-dark-border px-4 py-2 text-sm font-semibold text-gray-300 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Total picks" value={String(stats.total)} />
          <StatCard
            label="Wins"
            value={String(stats.wins)}
            tone="text-emerald-400"
          />
          <StatCard
            label="Losses"
            value={String(stats.losses)}
            tone="text-rose-400"
          />
          <StatCard
            label="Pending"
            value={String(stats.pending)}
            tone="text-gray-400"
          />
          <StatCard
            label="Win rate"
            value={pct(stats.win_rate)}
            tone={winRateColor(stats.win_rate)}
          />
        </div>
      )}

      {/* Generate panel */}
      <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-4">
        <h3 className="text-sm font-semibold text-accent-blue mb-3">
          ⚡ Generate Model Picks
        </h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={generateSport}
            onChange={(e) => setGenerateSport(e.target.value)}
            className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
          >
            {["NHL", "NBA", "MLB", "PGA"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
          >
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-accent-blue/20 border border-accent-blue/30 px-4 py-2 text-sm font-semibold text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : `Generate ${generateSport} picks for ${date}`}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["picks", "signals", "performance"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t
                ? "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
                : "border-dark-border text-gray-400 hover:text-white"
            }`}
          >
            {t === "picks"
              ? `Daily picks (${picks.length})`
              : t === "signals"
              ? "Signal leaderboard"
              : "Performance"}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Picks tab */}
      {tab === "picks" && (
        <div className="space-y-3">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Loading picks…</p>
          )}

          {!loading && picks.length === 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-8 text-center">
              <p className="text-gray-400">No picks for this date/sport.</p>
              <p className="text-sm text-gray-600 mt-1">
                Use the Generate button above or capture picks from the live pipeline.
              </p>
            </div>
          )}

          {pendingPicks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Pending ({pendingPicks.length})
              </p>
              <div className="space-y-2">
                {pendingPicks.map((p) => (
                  <PickRow
                    key={p.id}
                    pick={p}
                    onGrade={handleGrade}
                    onPromote={handlePromote}
                  />
                ))}
              </div>
            </div>
          )}

          {settledPicks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 mt-4">
                Settled ({settledPicks.length}) · {pct(winRate)} win rate
              </p>
              <div className="space-y-2">
                {settledPicks.map((p) => (
                  <PickRow
                    key={p.id}
                    pick={p}
                    onGrade={handleGrade}
                    onPromote={handlePromote}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Signals tab */}
      {tab === "signals" && (
        <div className="rounded-2xl border border-dark-border bg-dark-surface p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">Signal weight leaderboard</h3>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <SignalLeaderboard
            weights={weights}
            sportFilter={sportFilter}
          />
        </div>
      )}

      {/* Performance tab */}
      {tab === "performance" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Win rate by sport</h3>
            <div className="space-y-3">
              {(["NHL", "NBA", "MLB", "PGA"] as const).map((sport) => {
                const sportPicks = picks.filter((p) => p.sport === sport && p.result !== "pending");
                const sportWins = sportPicks.filter((p) => p.result === "win").length;
                const sportWinRate = sportPicks.length > 0 ? sportWins / sportPicks.length : 0;
                return (
                  <div
                    key={sport}
                    className="flex items-center justify-between rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{sport}</p>
                      <p className="text-xs text-gray-500">
                        {sportPicks.length} settled · {sportWins}W
                      </p>
                    </div>
                    <p className={`text-lg font-bold ${winRateColor(sportWinRate)}`}>
                      {sportPicks.length > 0 ? pct(sportWinRate) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Win rate by signal</h3>
            <div className="space-y-2">
              {weights
                .filter((w) => w.sport === (sportFilter === "ALL" ? "ALL" : sportFilter) && w.appearances > 0)
                .sort((a, b) => b.win_rate - a.win_rate)
                .map((w) => (
                  <div
                    key={`${w.signal}-${w.sport}`}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-300">
                      {w.signal.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">{w.appearances}×</span>
                      <span className={`text-sm font-semibold ${winRateColor(w.win_rate)}`}>
                        {pct(w.win_rate)}
                      </span>
                    </div>
                  </div>
                ))}
              {weights.filter((w) => w.sport === (sportFilter === "ALL" ? "ALL" : sportFilter) && w.appearances > 0).length === 0 && (
                <p className="text-sm text-gray-500">No signal data yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Promoted picks</h3>
            {picks.filter((p) => p.promoted_to_production).length === 0 ? (
              <p className="text-sm text-gray-500">
                No picks promoted yet. Expand a pick and click "Promote" to flag it for production.
              </p>
            ) : (
              <div className="space-y-2">
                {picks
                  .filter((p) => p.promoted_to_production)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl border border-accent-blue/20 bg-accent-blue/5 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{p.pick_label}</p>
                        <p className="text-xs text-gray-500">
                          {p.date} · {p.sport}
                        </p>
                        {p.promotion_notes && (
                          <p className="text-xs text-gray-400 mt-1">{p.promotion_notes}</p>
                        )}
                      </div>
                      <span
                        className={`text-sm font-semibold ${resultColor(p.result)}`}
                      >
                        {p.result}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
