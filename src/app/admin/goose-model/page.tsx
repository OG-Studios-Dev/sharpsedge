"use client";

import { useEffect, useState, useCallback } from "react";
import type {
  GooseModelPick,
  GooseSignalWeight,
  GooseModelStats,
  GooseAnalyticsBucket,
  GooseAnalyticsResult,
} from "@/lib/goose-model/types";

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

// ── volume badge ───────────────────────────────────────────────

function VolumeBadge({ sport, picks }: { sport: string; picks: GooseModelPick[] }) {
  const todayStr = today();
  const count = picks.filter((p) => p.sport === sport && p.date === todayStr).length;
  const tone =
    count >= 8 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
    count >= 4 ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
    count > 0  ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
    "bg-gray-500/10 text-gray-600 border-gray-700";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {sport} {count}
    </span>
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
            {pick.experiment_tag && (
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
                {pick.experiment_tag}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{pick.date}</span>
            {pick.odds_at_capture != null && (
              <span title="odds at capture">
                {pick.odds_at_capture > 0 ? "+" : ""}{pick.odds_at_capture}
              </span>
            )}
            {pick.hit_rate_at_capture != null && (
              <span title="hitRate at capture">HR: {pick.hit_rate_at_capture.toFixed(0)}%</span>
            )}
            {pick.edge_at_capture != null && (
              <span title="edge at capture" className="text-emerald-600">
                edge: +{pick.edge_at_capture.toFixed(1)}%
              </span>
            )}
            {pick.signals_count != null && (
              <span title="signals count">🔬 {pick.signals_count}</span>
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

          {/* Factors snapshot */}
          {pick.pick_snapshot && (pick.pick_snapshot as any).factors && (
            <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 p-3 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Capture factors
              </p>
              {Object.entries((pick.pick_snapshot as any).factors as Record<string, unknown>)
                .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">{k.replace(/_/g, " ")}</span>
                    <span className="text-gray-300 font-mono">
                      {Array.isArray(v) ? v.join(", ") : String(v)}
                    </span>
                  </div>
                ))}
            </div>
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

// ── analytics bucket table ─────────────────────────────────────

function BucketTable({
  title,
  buckets,
  emptyMsg = "No data yet — need more graded picks.",
}: {
  title: string;
  buckets: GooseAnalyticsBucket[];
  emptyMsg?: string;
}) {
  if (!buckets.length) {
    return (
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
        <h4 className="text-sm font-semibold text-white mb-2">{title}</h4>
        <p className="text-xs text-gray-500">{emptyMsg}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
      <h4 className="text-sm font-semibold text-white mb-3">{title}</h4>
      <div className="space-y-2">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="flex items-center justify-between rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-white">{b.label}</p>
              <p className="text-xs text-gray-500">
                {b.count} picks · {b.wins}W {b.losses}L {b.pushes}P
              </p>
            </div>
            <p className={`text-lg font-bold ${winRateColor(b.win_rate)}`}>
              {pct(b.win_rate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── analytics tab ─────────────────────────────────────────────

type AnalyticsData = GooseAnalyticsResult & { by_cohort: GooseAnalyticsBucket[] };

function AnalyticsTab({ sportFilter }: { sportFilter: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState("");
  const [minSample, setMinSample] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ min_sample: String(minSample) });
      if (sportFilter !== "ALL") params.set("sport", sportFilter);
      if (tagFilter) params.set("experiment_tag", tagFilter);
      const res = await fetch(`/api/admin/goose-model/analytics?${params}`);
      const json = await res.json() as AnalyticsData & { error?: string };
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [sportFilter, tagFilter, minSample]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Experiment tag</label>
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="baseline-v1"
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white w-40"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Min sample</label>
            <select
              value={minSample}
              onChange={(e) => setMinSample(Number(e.target.value))}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>≥ {n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={load}
            className="self-end rounded-full border border-dark-border px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-500 text-center py-8">Loading analytics…</p>
      )}

      {!loading && data && (
        <>
          {/* Recommendation banner */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-1">
              Model recommendation · {data.total_graded} graded picks
            </p>
            <p className="text-sm text-gray-200 leading-relaxed">{data.recommendation}</p>
          </div>

          {/* Cohort comparison */}
          {data.by_cohort.length > 1 && (
            <BucketTable title="Win rate by experiment cohort" buckets={data.by_cohort} />
          )}

          {/* Analytics grids */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BucketTable
              title="Win rate by edge % at capture"
              buckets={data.by_edge_bucket}
              emptyMsg="Need ≥10 graded picks per edge bucket. Keep generating."
            />
            <BucketTable
              title="Win rate by hit rate % at capture"
              buckets={data.by_hit_rate_bucket}
              emptyMsg="Need ≥10 graded picks per hitRate bucket."
            />
            <BucketTable
              title="Win rate by signals present"
              buckets={data.by_signals_count}
              emptyMsg="Need ≥10 graded picks per signals bucket."
            />
            <BucketTable
              title="Win rate by sport"
              buckets={data.by_sport}
            />
          </div>

          {/* Signal win rates */}
          {data.by_signal.length > 0 && (
            <BucketTable
              title="Win rate by signal (cross-validated)"
              buckets={[...data.by_signal].sort((a, b) => b.win_rate - a.win_rate)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────

type Tab = "picks" | "signals" | "performance" | "analytics";

export default function GooseModelAdminPage() {
  const [tab, setTab] = useState<Tab>("picks");
  const [date, setDate] = useState(today());
  const [sportFilter, setSportFilter] = useState<string>("ALL");
  const [experimentTagFilter, setExperimentTagFilter] = useState<string>("ALL");
  const [picks, setPicks] = useState<GooseModelPick[]>([]);
  const [weights, setWeights] = useState<GooseSignalWeight[]>([]);
  const [stats, setStats] = useState<GooseModelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbNotReady, setDbNotReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateSport, setGenerateSport] = useState("NHL");
  const [topN, setTopN] = useState(5);
  const [sandboxMode, setSandboxMode] = useState(true);

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
      const msg = e instanceof Error ? e.message : "Failed to load picks";
      setError(msg);
      // If the table doesn't exist yet, surface a friendly setup banner
      if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation") || msg.toLowerCase().includes("undefined")) {
        setDbNotReady(true);
      }
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
      // graceful
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
        body: JSON.stringify({
          date,
          sport: generateSport,
          topN,
          sandbox: sandboxMode,
        }),
      });
      const data = await res.json() as {
        picks?: GooseModelPick[];
        selected_count?: number;
        odds_rejected?: number;
        message?: string;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      const count = data.selected_count ?? data.picks?.length ?? 0;
      const rejected = data.odds_rejected ? ` (${data.odds_rejected} rejected by -200 odds cap)` : "";
      await loadPicks();
      alert(`Generated ${count} ${generateSport} picks for ${date}${rejected}`);
    } catch (e) {
      alert(`Generate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  // Derive available experiment tags from loaded picks
  const experimentTags = Array.from(
    new Set(picks.map((p) => p.experiment_tag).filter(Boolean) as string[]),
  );

  const filteredPicks = picks.filter((p) => {
    if (experimentTagFilter !== "ALL" && p.experiment_tag !== experimentTagFilter) return false;
    return true;
  });

  const settledPicks = filteredPicks.filter((p) => p.result !== "pending");
  const pendingPicks = filteredPicks.filter((p) => p.result === "pending");
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
              High-volume sandbox · signal-weight learning engine
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
                <option key={s} value={s}>{s}</option>
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

        {/* Volume badges — today's pick count per sport */}
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-600">Today's sandbox picks:</span>
          {(["NHL", "NBA", "MLB", "PGA"] as const).map((s) => (
            <VolumeBadge key={s} sport={s} picks={picks} />
          ))}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Total picks" value={String(stats.total)} />
          <StatCard label="Wins" value={String(stats.wins)} tone="text-emerald-400" />
          <StatCard label="Losses" value={String(stats.losses)} tone="text-rose-400" />
          <StatCard label="Pending" value={String(stats.pending)} tone="text-gray-400" />
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
          ⚡ Generate Sandbox Picks
        </h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={generateSport}
            onChange={(e) => setGenerateSport(e.target.value)}
            className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
          >
            {["NHL", "NBA", "MLB", "PGA"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
          >
            {[5, 8, 10].map((n) => (
              <option key={n} value={n}>Top {n}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={sandboxMode}
              onChange={(e) => setSandboxMode(e.target.checked)}
              className="rounded"
            />
            Sandbox mode (55% HR / 3% edge)
          </label>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-accent-blue/20 border border-accent-blue/30 px-4 py-2 text-sm font-semibold text-accent-blue hover:bg-accent-blue/30 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : `Generate ${generateSport} for ${date}`}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Hard rules: -200 max odds cap · PGA outrights minimum +200 · picks graded and fed into signal weights
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["picks", "analytics", "signals", "performance"] as Tab[]).map((t) => (
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
              ? `Daily picks (${filteredPicks.length})`
              : t === "analytics"
              ? "Analytics"
              : t === "signals"
              ? "Signal leaderboard"
              : "Performance"}
          </button>
        ))}
      </div>

      {/* Experiment tag filter (visible in picks tab) */}
      {tab === "picks" && experimentTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500">Cohort:</span>
          {(["ALL", ...experimentTags]).map((tag) => (
            <button
              key={tag}
              onClick={() => setExperimentTagFilter(tag)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                experimentTagFilter === tag
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
                  : "border-dark-border text-gray-500 hover:text-gray-300"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* DB not ready banner */}
      {dbNotReady && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Goose model DB not ready — ask Nick to apply the migration.</p>
          <p className="mt-1">
            Migration file: <code className="rounded bg-black/20 px-1 text-amber-50">supabase/migrations/20260325120000_goose_model_picks.sql</code>
          </p>
        </div>
      )}

      {/* Error */}
      {error && !dbNotReady && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* ── Picks tab ── */}
      {tab === "picks" && (
        <div className="space-y-3">
          {loading && (
            <p className="text-sm text-gray-500 text-center py-8">Loading picks…</p>
          )}

          {!loading && filteredPicks.length === 0 && (
            <div className="rounded-2xl border border-dark-border bg-dark-surface p-8 text-center">
              <p className="text-gray-400">No picks for this date/sport/cohort.</p>
              <p className="text-sm text-gray-600 mt-1">
                Use the Generate button above or wait for the 11 AM ET cron.
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
                  <PickRow key={p.id} pick={p} onGrade={handleGrade} onPromote={handlePromote} />
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
                  <PickRow key={p.id} pick={p} onGrade={handleGrade} onPromote={handlePromote} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Analytics tab ── */}
      {tab === "analytics" && (
        <AnalyticsTab sportFilter={sportFilter} />
      )}

      {/* ── Signals tab ── */}
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
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <SignalLeaderboard weights={weights} sportFilter={sportFilter} />
        </div>
      )}

      {/* ── Performance tab ── */}
      {tab === "performance" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Win rate by sport</h3>
            <div className="space-y-3">
              {(["NHL", "NBA", "MLB", "PGA"] as const).map((sport) => {
                const sp = picks.filter((p) => p.sport === sport && p.result !== "pending");
                const wins = sp.filter((p) => p.result === "win").length;
                const wr = sp.length > 0 ? wins / sp.length : 0;
                return (
                  <div
                    key={sport}
                    className="flex items-center justify-between rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{sport}</p>
                      <p className="text-xs text-gray-500">
                        {sp.length} settled · {wins}W
                      </p>
                    </div>
                    <p className={`text-lg font-bold ${winRateColor(wr)}`}>
                      {sp.length > 0 ? pct(wr) : "—"}
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
                  <div key={`${w.signal}-${w.sport}`} className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{w.signal.replace(/_/g, " ")}</span>
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
                        <p className="text-xs text-gray-500">{p.date} · {p.sport}</p>
                        {p.promotion_notes && (
                          <p className="text-xs text-gray-400 mt-1">{p.promotion_notes}</p>
                        )}
                      </div>
                      <span className={`text-sm font-semibold ${resultColor(p.result)}`}>
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
