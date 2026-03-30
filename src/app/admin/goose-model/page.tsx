"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Zap, BarChart2, TrendingUp, AlertTriangle, HeartPulse, FlaskConical } from "lucide-react";
import type {
  GooseModelPick,
  GooseSignalWeight,
  GooseModelStats,
  GooseAnalyticsBucket,
  GooseAnalyticsResult,
} from "@/lib/goose-model/types";
import { LOGIC_NOTES, THRESHOLD_REFERENCE } from "@/lib/goose-model/logic-notes";

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

// ── sport filter pills ─────────────────────────────────────

function SportFilterPills({
  value,
  onChange,
  picks,
}: {
  value: string;
  onChange: (sport: string) => void;
  picks: GooseModelPick[];
}) {
  // Show pick count per sport (all dates, not just today — gives a sense of learning data size)
  const countBySport = Object.fromEntries(
    (["NHL", "NBA", "MLB", "PGA"] as const).map((s) => [
      s,
      picks.filter((p) => p.sport === s).length,
    ]),
  );

  return (
    <div className="rounded-2xl border border-dark-border bg-dark-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mr-1">
          Sport
        </span>
        {(["ALL", "NHL", "NBA", "MLB", "PGA"] as const).map((s) => {
          const active = value === s;
          const count = s !== "ALL" ? countBySport[s] : picks.length;
          return (
            <button
              key={s}
              onClick={() => onChange(s)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue"
                  : "border-dark-border text-gray-400 hover:border-gray-500 hover:text-white"
              }`}
            >
              {s === "ALL" ? "All" : s}
              {count > 0 && (
                <span className={`ml-1.5 text-xs ${active ? "opacity-80" : "opacity-40"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <span className="text-xs text-gray-600 ml-1">Filters all tabs</span>
      </div>
    </div>
  );
}

// ── stat card ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  tone = "text-white",
  onClick,
  active,
}: {
  label: string;
  value: string;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-dark-surface p-4 transition-colors ${
        onClick
          ? "cursor-pointer hover:border-accent-blue/40 hover:bg-dark-surface/80"
          : ""
      } ${active ? "border-accent-blue/50 ring-1 ring-accent-blue/30" : "border-dark-border"}`}
      onClick={onClick}
      title={onClick ? `Click to filter picks by ${label.toLowerCase()}` : undefined}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
        {onClick && <span className="ml-1 text-gray-700">↗</span>}
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
              <span title="signals count" className="inline-flex items-center gap-1"><FlaskConical size={12} /> {pick.signals_count}</span>
            )}
            {/* Prop-line data from factors snapshot */}
            {(() => {
              const factors = (pick.pick_snapshot as any)?.factors;
              if (!factors) return null;
              const parts: React.ReactNode[] = [];
              if (factors.prop_line != null) {
                const dir = factors.prop_direction ? (factors.prop_direction === "over" ? "O" : "U") : "";
                parts.push(
                  <span key="line" title="prop line" className="text-blue-400 font-mono">
                    {dir && `${dir} `}{factors.prop_line}
                    {factors.prop_is_combo && <span className="ml-0.5 text-purple-400">combo</span>}
                  </span>
                );
              }
              if (factors.l5_hit_rate != null) {
                const pctVal = (factors.l5_hit_rate * 100).toFixed(0);
                const tone = factors.l5_hit_rate >= 0.6 ? "text-emerald-400" : factors.l5_hit_rate >= 0.4 ? "text-yellow-400" : "text-rose-400";
                parts.push(
                  <span key="l5hr" title="L5 hit rate over line" className={tone}>L5: {pctVal}%</span>
                );
              }
              if (factors.l5_avg_stat != null && factors.prop_line != null) {
                const delta = (factors.l5_avg_stat - factors.prop_line).toFixed(1);
                const tone = parseFloat(delta) > 0 ? "text-emerald-500" : "text-rose-500";
                parts.push(
                  <span key="l5avg" title={`L5 avg ${factors.l5_avg_stat} vs line ${factors.prop_line}`} className={tone}>
                    avg {factors.l5_avg_stat.toFixed(1)} ({parseFloat(delta) > 0 ? "+" : ""}{delta})
                  </span>
                );
              }
              return parts;
            })()}
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
          {pick.pick_snapshot && (pick.pick_snapshot as any).factors && (() => {
            const factors = (pick.pick_snapshot as any).factors as Record<string, unknown>;
            const nbaFeatures = factors.nba_features as Record<string, unknown> | null | undefined;
            // Top-level factors without the nba_features blob (rendered separately)
            const topFactors = Object.entries(factors)
              .filter(([k, v]) => k !== "nba_features" && v !== null && v !== undefined && v !== false && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0))
              .filter(([, v]) => typeof v !== "object"); // objects rendered below

            return (
              <div className="space-y-2">
                {/* Core factors */}
                <div className="rounded-xl border border-dark-border/50 bg-dark-bg/40 p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Capture factors
                  </p>
                  {topFactors.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{k.replace(/_/g, " ")}</span>
                      <span className="text-gray-300 font-mono">{String(v)}</span>
                    </div>
                  ))}
                  {/* Signals array inline */}
                  {Array.isArray(factors.signals) && (factors.signals as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(factors.signals as string[]).map((s) => (
                        <span key={s} className="rounded bg-accent-blue/10 border border-accent-blue/20 px-1.5 py-0.5 text-[10px] text-accent-blue">{s.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* NBA feature snapshot — rich display */}
                {nbaFeatures && (() => {
                  // Cast to any for JSX rendering since nbaFeatures is Record<string, unknown>
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const nba = nbaFeatures as any;
                  return (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                        NBA feature snapshot
                      </p>
                      <span className="rounded-full border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-400">
                        {String(nba.market_type ?? "unknown")}
                        {nba.market_aware_priors ? " · market-aware" : ""}
                      </span>
                    </div>

                    {/* Numeric context */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {nba.opponent_dvp_rank != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Opp DvP rank</span>
                          <span className={`font-mono ${Number(nba.opponent_dvp_rank) >= 20 ? "text-emerald-400" : "text-gray-300"}`}>
                            {"#"}{String(nba.opponent_dvp_rank)} / 30
                          </span>
                        </div>
                      )}
                      {nba.opponent_dvp_avg_allowed != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Opp avg allowed</span>
                          <span className="font-mono text-gray-300">{Number(nba.opponent_dvp_avg_allowed).toFixed(1)}</span>
                        </div>
                      )}
                      {nba.player_avg_minutes_l5 != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Avg min L5</span>
                          <span className="font-mono text-gray-300">{Number(nba.player_avg_minutes_l5).toFixed(1)}</span>
                        </div>
                      )}
                      {nba.player_avg_stat_l5 != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Avg stat L5</span>
                          <span className="font-mono text-gray-300">{Number(nba.player_avg_stat_l5).toFixed(1)}</span>
                        </div>
                      )}
                      {nba.player_l5_hit_rate != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">L5 hit rate</span>
                          <span className={`font-mono ${Number(nba.player_l5_hit_rate) >= 0.6 ? "text-emerald-400" : Number(nba.player_l5_hit_rate) >= 0.4 ? "text-yellow-400" : "text-rose-400"}`}>
                            {(Number(nba.player_l5_hit_rate) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {nba.team_pace_rank != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Team pace rank</span>
                          <span className={`font-mono ${Number(nba.team_pace_rank) <= 10 ? "text-emerald-400" : "text-gray-300"}`}>{"#"}{String(nba.team_pace_rank)}</span>
                        </div>
                      )}
                      {nba.opponent_pace_rank != null && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Opp pace rank</span>
                          <span className={`font-mono ${Number(nba.opponent_pace_rank) <= 10 ? "text-emerald-400" : "text-gray-300"}`}>{"#"}{String(nba.opponent_pace_rank)}</span>
                        </div>
                      )}
                    </div>

                    {/* Boolean flags */}
                    <div className="flex flex-wrap gap-1.5">
                      {nba.high_pace_game && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 inline-flex items-center gap-1"><Zap size={9} /> high-pace game</span>
                      )}
                      {nba.dvp_advantage_present && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 inline-flex items-center gap-1"><BarChart2 size={9} /> DvP advantage</span>
                      )}
                      {nba.usage_surge_active && (
                        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400 inline-flex items-center gap-1"><TrendingUp size={9} /> usage surge</span>
                      )}
                      {nba.recent_trend_active && (
                        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400 inline-flex items-center gap-1"><TrendingUp size={9} /> recent trend</span>
                      )}
                      {nba.back_to_back_penalty && (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-400 inline-flex items-center gap-1"><AlertTriangle size={9} /> B2B penalty</span>
                      )}
                      {nba.player_confirmed_active === true && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">✓ confirmed active</span>
                      )}
                      {nba.player_confirmed_active === false && (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-400">✗ not confirmed</span>
                      )}
                      {nba.key_teammate_out && (
                        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-400 inline-flex items-center gap-1">
                          <HeartPulse size={9} /> key teammate out{Array.isArray(nba.key_teammates_out) && (nba.key_teammates_out as string[]).length > 0 ? `: ${(nba.key_teammates_out as string[]).join(", ")}` : ""}
                        </span>
                      )}
                    </div>

                    {/* NBA feature score */}
                    {nba.nba_feature_score != null && Number(nba.nba_feature_score) > 0 && (
                      <div className="flex items-center justify-between text-xs border-t border-purple-500/10 pt-2">
                        <span className="text-gray-500">NBA feature score</span>
                        <span className={`font-mono font-bold ${Number(nba.nba_feature_score) >= 0.63 ? "text-emerald-400" : "text-gray-300"}`}>
                          {(Number(nba.nba_feature_score) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}

                    {/* Context warnings */}
                    {Array.isArray(nba.context_warnings) && (nba.context_warnings as string[]).length > 0 && (
                      <div className="border-t border-purple-500/10 pt-2">
                        <p className="text-[10px] text-gray-600 mb-1">Context warnings:</p>
                        {(nba.context_warnings as string[]).map((w, i) => (
                          <p key={i} className="text-[10px] text-yellow-600">{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })()}

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

type AnalyticsData = GooseAnalyticsResult & {
  by_cohort: GooseAnalyticsBucket[];
  by_prop_type: GooseAnalyticsBucket[];
  by_prop_direction: GooseAnalyticsBucket[];
};

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
            {data.by_prop_type?.length > 0 && (
              <BucketTable
                title="Win rate by prop type (player picks)"
                buckets={data.by_prop_type}
                emptyMsg="Need more graded player prop picks."
              />
            )}
            {data.by_prop_direction?.length > 0 && (
              <BucketTable
                title="Win rate by prop direction (Over vs Under)"
                buckets={data.by_prop_direction}
                emptyMsg="Need more graded over/under picks."
              />
            )}
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

// ── MLB lineup refresh panel ──────────────────────────────────

interface MLBRefreshResult {
  date: string;
  experiment_tag: string;
  lineup_status_note: string;
  mlb_timing: { season: string; reason: string; canGenerate: boolean };
  prior_picks_today: number;
  refresh_picks: number;
  scored_count: number;
  skipped: boolean;
  skip_reason?: string;
}

function MLBLineupPanel({ date }: { date: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MLBRefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function triggerRefresh() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/goose-model/mlb-lineup-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, sandbox: true }),
      });
      const data = await res.json() as MLBRefreshResult & { error?: string };
      if ((data as { error?: string }).error) throw new Error((data as { error?: string }).error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-yellow-400">MLB Lineup Refresh</h3>
          <p className="mt-1 text-xs text-gray-500">
            Re-generates MLB picks after lineups are confirmed (~5 PM ET). Tags picks{" "}
            <code className="rounded bg-black/20 px-1 text-yellow-300">lineup-refresh-v1</code> for comparison.
          </p>
        </div>
        <button
          onClick={triggerRefresh}
          disabled={running}
          className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-semibold text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
        >
          {running ? "Running…" : "Trigger Lineup Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-dark-border/50 bg-dark-bg/50 p-3 space-y-2">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className={`rounded-full border px-2 py-0.5 font-semibold ${result.skipped ? "border-gray-700 text-gray-500" : "border-yellow-500/30 text-yellow-400"}`}>
              {result.skipped ? `Skipped: ${result.skip_reason ?? "off-season"}` : `Generated ${result.refresh_picks} refresh pick(s)`}
            </span>
            {!result.skipped && (
              <>
                <span className="text-gray-500">Prior today: {result.prior_picks_today}</span>
                <span className="text-gray-500">Scored: {result.scored_count}</span>
                <span className="rounded-full border border-dark-border px-2 py-0.5 text-gray-400">
                  {result.experiment_tag}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-gray-400">{result.lineup_status_note}</p>
          {result.mlb_timing && (
            <p className="text-xs text-gray-600">
              MLB season: {result.mlb_timing.season} — {result.mlb_timing.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── signal scorecard tab ──────────────────────────────────────

interface SignalStat {
  signal: string;
  sport: string;
  appearances: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number;
  estimated_roi: number | null;
  avg_odds: number | null;
  sample_confidence: "low" | "medium" | "high";
  thin_sample_decay_noted: boolean;
  top_market_types: string[];
}

interface SportScorecard {
  sport: string;
  total_graded: number;
  signals: SignalStat[];
  top_signal: SignalStat | null;
  strong_signals: string[];
  weak_signals: string[];
}

interface ScorecardResult {
  generated_at: string;
  sports: SportScorecard[];
  overall_by_signal: SignalStat[];
  summary: string;
}

function confidenceBadge(c: "low" | "medium" | "high"): string {
  if (c === "high") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (c === "medium") return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-gray-500/15 text-gray-500 border-gray-700";
}

function roiColor(roi: number): string {
  if (roi > 5) return "text-emerald-400";
  if (roi >= 0) return "text-yellow-400";
  return "text-rose-400";
}

function ScorecardTab({ sportFilter }: { sportFilter: string }) {
  const [data, setData] = useState<ScorecardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minSample, setMinSample] = useState(5);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ min_sample: String(minSample) });
      if (sportFilter !== "ALL") params.set("sport", sportFilter);
      const res = await fetch(`/api/admin/goose-model/signal-scorecard?${params}`);
      const json = await res.json() as ScorecardResult & { error?: string };
      if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scorecard");
    } finally {
      setLoading(false);
    }
  }, [sportFilter, minSample]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Signal Scorecard</h3>
            <p className="mt-1 text-xs text-gray-500">Win rate, ROI, and sample confidence per signal by sport. Use this to identify signals worth promoting.</p>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={minSample}
              onChange={(e) => setMinSample(Number(e.target.value))}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            >
              {[5, 10, 20].map((n) => <option key={n} value={n}>≥ {n} picks</option>)}
            </select>
            <button onClick={load} className="rounded-full border border-dark-border px-4 py-2 text-sm text-gray-300 hover:text-white">Refresh</button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">{error}</div>
      )}

      {loading && <p className="text-sm text-gray-500 text-center py-8">Loading scorecard…</p>}

      {!loading && data && (
        <>
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
            <p className="text-xs text-gray-400">{data.summary}</p>
          </div>

          {data.sports.map((sc) => (
            <div key={sc.sport} className="rounded-2xl border border-dark-border bg-dark-surface p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-white">{sc.sport} — {sc.total_graded} graded picks</h4>
                  {sc.strong_signals.length > 0 && (
                    <p className="mt-1 text-xs text-emerald-400">
                      ✓ Strong: {sc.strong_signals.join(", ")}
                    </p>
                  )}
                  {sc.weak_signals.length > 0 && (
                    <p className="mt-0.5 text-xs text-rose-400">
                      ✗ Weak: {sc.weak_signals.join(", ")}
                    </p>
                  )}
                </div>
                {sc.top_signal && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                    <span className="text-gray-500">Top signal: </span>
                    <span className="text-emerald-400 font-semibold">{sc.top_signal.signal.replace(/_/g, " ")}</span>
                    <span className="ml-2 text-emerald-300">{sc.top_signal.win_rate}% WR</span>
                    <span className={`ml-2 rounded-full border px-1.5 py-0.5 ${confidenceBadge(sc.top_signal.sample_confidence)}`}>
                      {sc.top_signal.sample_confidence}
                    </span>
                  </div>
                )}
              </div>

              {sc.signals.length === 0 ? (
                <p className="text-sm text-gray-500">No signals with {minSample}+ graded picks yet.</p>
              ) : (
                <div className="space-y-2">
                  {sc.signals.map((sig) => (
                    <div key={sig.signal} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-white">{sig.signal.replace(/_/g, " ")}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confidenceBadge(sig.sample_confidence)}`}>
                              {sig.sample_confidence}
                            </span>
                            {sig.thin_sample_decay_noted && (
                              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-500">
                                thin-sample caution
                              </span>
                            )}
                            {sig.top_market_types.length > 0 && sig.top_market_types.map((mt) => (
                              <span key={mt} className="rounded-full border border-dark-border px-2 py-0.5 text-[10px] text-gray-500">{mt}</span>
                            ))}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {sig.appearances} picks · {sig.wins}W {sig.losses}L {sig.pushes}P
                            {sig.avg_odds !== null && ` · avg odds ${sig.avg_odds > 0 ? "+" : ""}${sig.avg_odds}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${winRateColor(sig.win_rate / 100)}`}>{sig.win_rate}%</p>
                          {sig.estimated_roi !== null && (
                            <p className={`text-xs font-semibold ${roiColor(sig.estimated_roi)}`}>
                              ROI: {sig.estimated_roi > 0 ? "+" : ""}{sig.estimated_roi}%
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── promotions tab ────────────────────────────────────────────

interface PromotionGateResult {
  passed: boolean;
  gate: string;
  detail: string;
  value: number | null;
  threshold: number | null;
}

interface PromotionCandidate {
  pick: GooseModelPick;
  promotion_score: number;
  gates_passed: PromotionGateResult[];
  gates_failed: PromotionGateResult[];
  eligible: boolean;
  strong_signals: string[];
  promotion_notes: string;
}

interface PromotionCandidatesResult {
  generated_at: string;
  lookback_days: number;
  sport_filter: string;
  gates: {
    signal_min_appearances: number;
    signal_min_win_rate: number;
    edge_floor: number;
    hit_rate_floor: number;
    sport_min_graded: number;
    odds_floor: number;
  };
  sport_graded_counts: Record<string, number>;
  eligible_candidates: PromotionCandidate[];
  borderline_candidates: PromotionCandidate[];
  summary: string;
}

function GatePill({ gate }: { gate: PromotionGateResult }) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${gate.passed ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-bold ${gate.passed ? "text-emerald-400" : "text-rose-400"}`}>
          {gate.passed ? "✓" : "✗"}
        </span>
        <span className="text-xs font-semibold text-white">{gate.gate.replace(/_/g, " ")}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-gray-500">{gate.detail}</p>
    </div>
  );
}

function CandidateCard({
  candidate,
  onPromote,
}: {
  candidate: PromotionCandidate;
  onPromote: (id: string) => void;
}) {
  const { pick, promotion_score, gates_passed, gates_failed, eligible, strong_signals } = candidate;
  const allGates = [...gates_passed, ...gates_failed].sort((a, b) => a.gate.localeCompare(b.gate));

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${eligible ? "border-emerald-500/20 bg-emerald-500/5" : "border-dark-border bg-dark-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{pick.pick_label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${eligible ? "border-emerald-500/30 text-emerald-400" : "border-gray-700 text-gray-500"}`}>
              Score: {promotion_score}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs ${resultBadge(pick.result)}`}>
              {pick.result}
            </span>
            <span className="rounded-full border border-dark-border px-2 py-0.5 text-xs text-gray-500">{pick.sport}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {pick.date}
            {pick.edge_at_capture != null && ` · edge: +${pick.edge_at_capture.toFixed(1)}%`}
            {pick.hit_rate_at_capture != null && ` · HR: ${pick.hit_rate_at_capture.toFixed(0)}%`}
            {pick.odds_at_capture != null && ` · odds: ${pick.odds_at_capture > 0 ? "+" : ""}${pick.odds_at_capture}`}
          </p>
          {strong_signals.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {strong_signals.map((s) => (
                <span key={s} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-400">
                  ★ {s.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
        {eligible && !pick.promoted_to_production && (
          <button
            onClick={() => onPromote(pick.id)}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            ✦ Promote
          </button>
        )}
        {pick.promoted_to_production && (
          <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-xs font-semibold text-accent-blue">
            promoted ✓
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {allGates.map((g) => <GatePill key={g.gate} gate={g} />)}
      </div>

      {gates_failed.length > 0 && (
        <p className="text-[10px] text-gray-600">
          Failed: {gates_failed.map((g) => g.gate).join(", ")}
        </p>
      )}
    </div>
  );
}

function PromotionsTab({
  sportFilter,
  onPromote,
}: {
  sportFilter: string;
  onPromote: (id: string) => void;
}) {
  const [data, setData] = useState<PromotionCandidatesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (sportFilter !== "ALL") params.set("sport", sportFilter);
      const res = await fetch(`/api/admin/goose-model/promotion-candidates?${params}`);
      const json = await res.json() as PromotionCandidatesResult & { error?: string };
      if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load promotion candidates");
    } finally {
      setLoading(false);
    }
  }, [sportFilter, days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-dark-border bg-dark-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Signal Lab → Production Consideration</h3>
            <p className="mt-1 text-xs text-gray-500">
              Research picks evaluated against 5 promotion gates: signal quality, edge floor, hit rate, sport sample, and odds gate. Promoted picks inform production pick selection — they are not auto-published to users.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            >
              {[7, 14, 30, 60].map((d) => <option key={d} value={d}>Last {d}d</option>)}
            </select>
            <button onClick={load} className="rounded-full border border-dark-border px-4 py-2 text-sm text-gray-300 hover:text-white">Refresh</button>
          </div>
        </div>

        {data && (
          <div className="mt-3 rounded-xl border border-dark-border/50 bg-dark-bg/40 p-3 text-xs text-gray-400 space-y-1">
            <p>{data.summary}</p>
            <div className="flex flex-wrap gap-3 text-[10px] text-gray-600 mt-2">
              <span>Signal: ≥{data.gates.signal_min_appearances} appearances, ≥{Math.round(data.gates.signal_min_win_rate * 100)}% WR</span>
              <span>Edge: ≥{data.gates.edge_floor}%</span>
              <span>Hit rate: ≥{data.gates.hit_rate_floor}%</span>
              <span>Sport sample: ≥{data.gates.sport_min_graded} graded</span>
              <span>Odds: ≥{data.gates.odds_floor}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">{error}</div>
      )}

      {loading && <p className="text-sm text-gray-500 text-center py-8">Loading candidates…</p>}

      {!loading && data && (
        <>
          {/* Sport graded counts */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.sport_graded_counts).map(([sport, count]) => (
              <span key={sport} className="rounded-full border border-dark-border px-3 py-1 text-xs text-gray-400">
                {sport}: {count} graded
              </span>
            ))}
          </div>

          {/* Eligible candidates */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3">
              ✦ Eligible for Promotion ({data.eligible_candidates.length})
            </h4>
            {data.eligible_candidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-dark-border/70 bg-dark-bg/40 px-4 py-8 text-center text-sm text-gray-500">
                No picks pass all 5 gates yet. Keep grading to build signal weights.
              </div>
            ) : (
              <div className="space-y-3">
                {data.eligible_candidates.map((c) => (
                  <CandidateCard key={c.pick.id} candidate={c} onPromote={onPromote} />
                ))}
              </div>
            )}
          </div>

          {/* Borderline candidates */}
          {data.borderline_candidates.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-yellow-400 mb-3">
                ◎ Borderline — 1 Gate Failed ({data.borderline_candidates.length})
              </h4>
              <div className="space-y-3">
                {data.borderline_candidates.slice(0, 10).map((c) => (
                  <CandidateCard key={c.pick.id} candidate={c} onPromote={onPromote} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── system results ingestion panel ───────────────────────────

interface IngestResult {
  ingested: number;
  skipped: number;
  dry_run: boolean;
  sports_summary: Record<string, { ingested: number; skipped: number }>;
  message: string;
}

function SystemResultsPanel({ sport }: { sport: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState(false);

  async function triggerIngest(dryRun = false) {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/goose-model/ingest-system-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          sport: sport !== "ALL" ? sport : undefined,
          dry_run: dryRun,
        }),
      });
      const data = (await res.json()) as IngestResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-1.5">
            <BarChart2 size={13} /> Learn from System Results
          </h3>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            Pull settled outcomes from all tracked systems (wins/losses/pushes) into the learning
            store. Expands signal weight data beyond lab-generated picks — covers every game any
            system reviewed, not just what the lab generated itself.
          </p>
          <button
            className="mt-1 text-xs text-gray-600 hover:text-gray-400 underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "▲ less" : "▼ what this covers"}
          </button>
          {expanded && (
            <div className="mt-2 rounded-xl border border-purple-500/10 bg-black/20 p-3 text-xs text-gray-400 space-y-1">
              <p>✓ All settled system_qualifiers (win/loss/push) within the selected date window</p>
              <p>✓ Signal tags extracted from qualifier labels and provenance snapshots</p>
              <p>✓ Signal weights updated immediately on ingestion</p>
              <p>✗ Does NOT include games where no system fired a qualifier</p>
              <p>✗ Does NOT cover production pick_history (separate table — future work)</p>
              <p>✗ Signal tags from system results are less rich than lab-generated picks (no factor snapshots)</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center shrink-0">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={running}
            className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
          >
            {[7, 14, 30, 60, 90].map((d) => (
              <option key={d} value={d}>Last {d}d</option>
            ))}
          </select>
          <button
            onClick={() => triggerIngest(true)}
            disabled={running}
            className="rounded-full border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
          >
            {running ? "…" : "Preview"}
          </button>
          <button
            onClick={() => triggerIngest(false)}
            disabled={running}
            className="rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-semibold text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-colors"
          >
            {running ? "Ingesting…" : "Ingest Results"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-dark-border/50 bg-dark-bg/50 p-3 space-y-2">
          <p className="text-xs text-gray-300">{result.message}</p>
          {Object.entries(result.sports_summary).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(result.sports_summary).map(([sport, counts]) => (
                <span
                  key={sport}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    counts.ingested > 0
                      ? "border-purple-500/30 text-purple-400"
                      : "border-gray-700 text-gray-600"
                  }`}
                >
                  {sport}: {counts.ingested > 0 ? `+${counts.ingested}` : "0 new"}
                  {counts.skipped > 0 ? ` (${counts.skipped} already present)` : ""}
                </span>
              ))}
            </div>
          )}
          {result.dry_run && (
            <p className="text-[10px] text-gray-600">
              Preview only — nothing was saved. Click "Ingest Results" to commit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────

type Tab = "picks" | "signals" | "performance" | "analytics" | "scorecard" | "promotions" | "logic";

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
  // Result drill-down filter — set by clicking stat cards
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "loss" | "push" | "pending">("all");

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
    // Reset result filter whenever the primary query changes
    setResultFilter("all");
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
    if (resultFilter !== "all" && p.result !== resultFilter) return false;
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2"><FlaskConical size={18} /> Signal Lab — Pick Learning Engine</h2>
            <p className="mt-1 text-sm text-gray-400">
              Run pick experiments · grade results · learn which signals actually win
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-sm text-white"
            />
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
          <span className="text-xs text-gray-600">Today's research picks:</span>
          {(["NHL", "NBA", "MLB", "PGA"] as const).map((s) => (
            <VolumeBadge key={s} sport={s} picks={picks} />
          ))}
        </div>
      </div>

      {/* Sport filter pills — filters all tabs */}
      <SportFilterPills value={sportFilter} onChange={setSportFilter} picks={picks} />

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            label="Total picks"
            value={String(stats.total)}
            onClick={() => { setResultFilter("all"); setTab("picks"); }}
            active={tab === "picks" && resultFilter === "all"}
          />
          <StatCard
            label="Wins"
            value={String(stats.wins)}
            tone="text-emerald-400"
            onClick={() => { setResultFilter("win"); setTab("picks"); }}
            active={tab === "picks" && resultFilter === "win"}
          />
          <StatCard
            label="Losses"
            value={String(stats.losses)}
            tone="text-rose-400"
            onClick={() => { setResultFilter("loss"); setTab("picks"); }}
            active={tab === "picks" && resultFilter === "loss"}
          />
          <StatCard
            label="Pending"
            value={String(stats.pending)}
            tone="text-gray-400"
            onClick={() => { setResultFilter("pending"); setTab("picks"); }}
            active={tab === "picks" && resultFilter === "pending"}
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
        <h3 className="text-sm font-semibold text-accent-blue mb-1 flex items-center gap-1.5">
          <Zap size={13} /> Generate Picks for Research
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Picks generated here go into the learning engine only — not into production or user-facing history.
          Grade them after games settle to build signal weights.
        </p>
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
            Learning mode (relaxed thresholds: 55% HR / 3% edge — more picks, faster signal data)
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
          Hard rules: -200 max odds cap · PGA outrights minimum +200 · picks graded here feed signal weights
        </p>
      </div>

      {/* MLB lineup refresh panel — always visible, skips gracefully off-season */}
      <MLBLineupPanel date={date} />

      {/* System results ingestion — broader learning beyond lab-generated picks */}
      <SystemResultsPanel sport={sportFilter} />

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["picks", "analytics", "signals", "scorecard", "promotions", "performance", "logic"] as Tab[]).map((t) => (
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
              ? `Pick history (${filteredPicks.length})`
              : t === "analytics"
              ? "Analytics"
              : t === "signals"
              ? "Signal weights"
              : t === "scorecard"
              ? "Scorecard"
              : t === "promotions"
              ? "Promote to production"
              : t === "logic"
              ? "Logic notes"
              : "Performance"}
          </button>
        ))}
      </div>

      {/* Result drill-down filter (visible in picks tab) */}
      {tab === "picks" && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-gray-500">Result filter:</span>
          {(["all", "win", "loss", "push", "pending"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setResultFilter(r)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                resultFilter === r
                  ? r === "win"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : r === "loss"
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                    : r === "push"
                    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                    : r === "pending"
                    ? "border-gray-500/40 bg-gray-500/10 text-gray-400"
                    : "border-accent-blue/40 bg-accent-blue/10 text-accent-blue"
                  : "border-dark-border text-gray-500 hover:text-gray-300"
              }`}
            >
              {r === "all" ? `All (${picks.length})` : r}
            </button>
          ))}
          {resultFilter !== "all" && (
            <span className="text-xs text-gray-600 italic">
              Showing {filteredPicks.length} {resultFilter} pick{filteredPicks.length !== 1 ? "s" : ""}
              {" "}·{" "}
              <button
                onClick={() => setResultFilter("all")}
                className="underline text-gray-500 hover:text-gray-300"
              >
                clear
              </button>
            </span>
          )}
        </div>
      )}

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

      {/* ── Scorecard tab ── */}
      {tab === "scorecard" && (
        <ScorecardTab sportFilter={sportFilter} />
      )}

      {/* ── Promotions tab ── */}
      {tab === "promotions" && (
        <PromotionsTab sportFilter={sportFilter} onPromote={handlePromote} />
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

      {/* ── Logic Notes tab ── */}
      {tab === "logic" && (
        <div className="space-y-5">
          {/* What is this page */}
          <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-5">
            <h3 className="text-base font-bold text-white mb-1">What is the Signal Lab?</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              The Signal Lab is a <strong className="text-white">pick research and learning engine</strong> — separate from the production picks that users see.
              It generates picks against today&apos;s live data, you grade them after games settle (win / loss / push),
              and the engine builds a record of which <em>signals</em> (e.g. DvP advantage, pace matchup, rest days) actually
              correlate with winning picks over time.
            </p>
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              Once a signal pattern clears all 5 promotion gates, you can flag those picks for production consideration.
              Promoted picks inform how the production engine prioritises its output — they are never auto-published.
            </p>
            <div className="mt-3 rounded-xl border border-accent-blue/10 bg-black/20 p-3">
              <p className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-1">Not the same as the Daily Board</p>
              <p className="text-xs text-gray-400">
                The <strong className="text-gray-300">📋 Daily Board</strong> (/admin/sandbox) is a separate review surface for the{" "}
                <em>production</em> picks engine — it shows what the live engine chose today and lets you run a daily postmortem.
                The Signal Lab uses its own pick generator and its own database tables. The two do not share data.
              </p>
            </div>
          </div>

          {/* Threshold reference */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5 space-y-4">
            <h3 className="text-base font-bold text-white">Threshold reference</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {[THRESHOLD_REFERENCE.learning_mode, THRESHOLD_REFERENCE.production_mode].map((mode) => (
                <div key={mode.label} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
                  <p className="text-sm font-semibold text-white">{mode.label}</p>
                  <p className="mt-1 text-xs text-gray-500">{mode.description}</p>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Hit rate floor</span>
                      <span className="font-mono text-gray-300">≥ {mode.hit_rate_floor}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Edge floor</span>
                      <span className="font-mono text-gray-300">≥ {mode.edge_floor}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Default top-N</span>
                      <span className="font-mono text-gray-300">{mode.default_top_n} picks</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Odds cap</span>
                      <span className="font-mono text-gray-300">{mode.odds_cap} (harder is excluded)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Promotion gates */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold text-emerald-400 mb-1">{THRESHOLD_REFERENCE.promotion_gates.label}</p>
              <p className="text-xs text-gray-500 mb-3">{THRESHOLD_REFERENCE.promotion_gates.description}</p>
              <div className="space-y-2">
                {THRESHOLD_REFERENCE.promotion_gates.gates.map((gate, i) => (
                  <div key={gate.name} className="flex items-start gap-2 text-xs">
                    <span className="text-emerald-500 font-bold shrink-0">{i + 1}.</span>
                    <div>
                      <span className="font-semibold text-white">{gate.name}: </span>
                      <span className="text-gray-400">{gate.rule}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Model changelog */}
          <div className="rounded-2xl border border-dark-border bg-dark-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Logic changelog</h3>
              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-500">
                Static — embedded in code
              </span>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              Key model decisions and logic milestones. These are honest static notes — not dynamically stored.
              Add entries to <code className="text-gray-500">src/lib/goose-model/logic-notes.ts</code> when the model changes.
            </p>
            <div className="space-y-3">
              {[...LOGIC_NOTES].reverse().map((note) => (
                <div key={`${note.date}-${note.version}`} className="rounded-xl border border-dark-border/50 bg-dark-bg/50 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm font-bold text-white">{note.title}</span>
                    <span className="rounded-full border border-dark-border px-2 py-0.5 text-xs text-gray-500 font-mono">
                      {note.version}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      note.impact === "thresholds" ? "border-yellow-500/30 text-yellow-400" :
                      note.impact === "signals" ? "border-blue-500/30 text-blue-400" :
                      note.impact === "gates" ? "border-emerald-500/30 text-emerald-400" :
                      note.impact === "engine" ? "border-purple-500/30 text-purple-400" :
                      "border-dark-border text-gray-500"
                    }`}>
                      {note.impact}
                    </span>
                    {note.sports?.map((s) => (
                      <span key={s} className="rounded-full border border-dark-border/50 px-2 py-0.5 text-xs text-gray-600">{s}</span>
                    ))}
                    <span className="text-xs text-gray-600 ml-auto">{note.date}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{note.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
