"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import type {
  MatchupComparisonMetric,
  MatchupLineup,
  MatchupPageData,
  MatchupPlayerCard,
  MatchupPropCard,
} from "@/lib/matchup-types";

type Tab = "matchup" | "players" | "props";

function statusClasses(status: MatchupPageData["header"]["status"]["code"]) {
  if (status === "LIVE") return "border-emerald-400/30 bg-emerald-400/15 text-emerald-200";
  if (status === "FINAL") return "border-gray-400/20 bg-white/5 text-gray-200";
  return "border-amber-400/30 bg-amber-400/15 text-amber-100";
}

function rankTone(rank: number) {
  if (rank <= 10) return "bg-emerald-400";
  if (rank <= 20) return "bg-amber-300";
  return "bg-rose-400";
}

function formatDisplayNumber(value: number, label: string) {
  if (label === "PP%") return `${value.toFixed(1)}%`;
  return value.toFixed(1);
}

function formatHitRate(value?: number | null) {
  if (typeof value !== "number") return "NA";
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(0)}%`;
}

function formatEdge(value?: number | null) {
  if (typeof value !== "number") return "NA";
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatOdds(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-white/20 bg-white text-dark-bg"
          : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function MatchupRow({ metric }: { metric: MatchupComparisonMetric }) {
  const advantageText = metric.advantage === "offense"
    ? "Offensive Advantage →"
    : metric.advantage === "defense"
      ? "← Defensive Advantage"
      : "Even";
  const advantageTone = metric.advantage === "offense"
    ? "text-emerald-200"
    : metric.advantage === "defense"
      ? "text-rose-200"
      : "text-gray-300";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 backdrop-blur-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${rankTone(metric.offenseRank)}`} />
          <span className="text-xs uppercase tracking-[0.16em] text-gray-500">Offense rank</span>
        </div>
        <p className="text-2xl font-semibold text-white">{metric.offenseRank}</p>
        <p className="text-sm text-gray-300">{formatDisplayNumber(metric.offenseValue, metric.label)}/gm</p>
      </div>

      <div className="flex flex-col items-center justify-center text-center">
        <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{metric.label}</p>
        <p className={`mt-2 text-xs font-semibold ${advantageTone}`}>{advantageText}</p>
      </div>

      <div className="space-y-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs uppercase tracking-[0.16em] text-gray-500">Defense rank</span>
          <span className={`h-2.5 w-2.5 rounded-full ${rankTone(metric.defenseRank)}`} />
        </div>
        <p className="text-2xl font-semibold text-white">{metric.defenseRank}</p>
        <p className="text-sm text-gray-300">{formatDisplayNumber(metric.defenseValue, metric.label)}/gm</p>
      </div>
    </div>
  );
}

function LineupPanel({ lineup }: { lineup: MatchupLineup | null }) {
  if (!lineup || (lineup.away.length === 0 && lineup.home.length === 0)) return null;

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Lineup Intel</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{lineup.title}</h2>
        </div>
        {lineup.note && <p className="max-w-xl text-sm text-gray-400">{lineup.note}</p>}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {[lineup.away, lineup.home].map((group, index) => (
          <div key={index} className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="space-y-3">
              {group.length > 0 ? group.map((starter) => (
                <div key={starter.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-3">
                  <div className="min-w-0">
                    {starter.trendHref ? (
                      <Link href={starter.trendHref} className="text-sm font-semibold text-white hover:text-accent-blue">
                        {starter.name}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold text-white">{starter.name}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">{starter.subtitle}</p>
                  </div>
                  {starter.badge && (
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200">
                      {starter.badge}
                    </span>
                  )}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-sm text-gray-500">No confirmed data yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlayerCard({ player }: { player: MatchupPlayerCard }) {
  return (
    <Link
      href={player.trendHref}
      className="group rounded-2xl border border-white/8 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white group-hover:text-accent-blue">{player.name}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-500">{player.position}</p>
        </div>
        {typeof player.avgMinutes === "number" && (
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-gray-200">
            {player.avgMinutes.toFixed(1)} MIN
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {player.seasonStats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{stat.label}</p>
            <p className="mt-1 text-sm font-semibold text-white">{stat.value.toFixed(stat.decimals ?? 1)}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-gray-300">{player.dvp}</p>
    </Link>
  );
}

function PropCardCompact({ prop }: { prop: MatchupPropCard }) {
  return (
    <Link
      href={prop.trendHref}
      className="group rounded-2xl border border-white/8 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white group-hover:text-accent-blue">{prop.playerName}</p>
          <p className="mt-1 text-sm text-gray-300">
            {prop.overUnder} {prop.line} {prop.propType}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-gray-500">
            {prop.team} {prop.team === prop.opponent ? "vs" : "vs"} {prop.opponent}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base font-semibold text-white">{formatOdds(prop.odds)}</p>
          <p className="mt-1 text-xs text-gray-400">{prop.book || "Model"}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Hit rate</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatHitRate(prop.hitRate)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">Edge</p>
          <p className={`mt-1 text-sm font-semibold ${prop.edgePct && prop.edgePct > 0 ? "text-emerald-300" : "text-gray-200"}`}>
            {formatEdge(prop.edgePct)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-[28px] border border-white/6 bg-white/5" />
      ))}
    </div>
  );
}

export default function MatchupResearchClient({
  apiPath,
  backHref = "/schedule",
  title = "Matchup",
}: {
  apiPath: string;
  backHref?: string;
  title?: string;
}) {
  const [data, setData] = useState<MatchupPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matchup");
  const [comparisonIndex, setComparisonIndex] = useState(0);
  const [propFilter, setPropFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(apiPath);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load matchup");
        }

        if (!cancelled) {
          setData(payload);
          setComparisonIndex(0);
          setPropFilter("All");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load matchup");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  useEffect(() => {
    if (!data) return;
    const filters = ["All", ...data.propFilters];
    if (!filters.includes(propFilter)) {
      setPropFilter("All");
    }
  }, [data, propFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <header className="sticky top-0 z-40 border-b border-white/8 bg-dark-bg/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link href={backHref} className="text-gray-400 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
        </header>
        <LoadingState />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-dark-bg">
        <header className="sticky top-0 z-40 border-b border-white/8 bg-dark-bg/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <Link href={backHref} className="text-gray-400 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
        </header>
        <div className="px-4 py-16 text-center text-sm text-gray-400">{error || "Matchup not found."}</div>
      </div>
    );
  }

  const comparison = data.comparisonViews[comparisonIndex] || data.comparisonViews[0];
  const filteredProps = propFilter === "All"
    ? data.props
    : data.props.filter((prop) => prop.propType === propFilter);
  const awayTeam = data.header.away;
  const homeTeam = data.header.home;
  const showScores = data.header.status.code !== "FUT";
  const accent = data.league === "NBA"
    ? "linear-gradient(135deg, rgba(249,115,22,0.35), rgba(190,24,93,0.12))"
    : "linear-gradient(135deg, rgba(34,211,238,0.28), rgba(59,130,246,0.12))";

  return (
    <div className="min-h-screen overflow-x-hidden bg-dark-bg">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-dark-bg/88 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{data.league} Research</p>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 rounded-[48px] blur-3xl" style={{ background: accent }} />

        <section
          className="rounded-[32px] border border-white/10 px-5 py-6 shadow-[0_28px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl md:px-8 md:py-8"
          style={{
            background: `radial-gradient(circle at top left, ${awayTeam.color}22, transparent 35%), radial-gradient(circle at top right, ${homeTeam.color}22, transparent 35%), rgba(255,255,255,0.04)`,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">{data.league} Matchup Page V2</p>
              <p className="mt-2 text-sm text-gray-300">{data.header.status.detail}</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusClasses(data.header.status.code)}`}>
              {data.header.status.label}
            </span>
          </div>

          <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-4 rounded-[28px] border border-white/8 bg-black/20 p-4">
              <TeamLogo team={awayTeam.abbrev} logo={awayTeam.logo} size={64} color={awayTeam.color} />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">{awayTeam.record}</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{awayTeam.abbrev}</h2>
                <p className="truncate text-sm text-gray-300">{awayTeam.fullName || awayTeam.name}</p>
              </div>
              {showScores && awayTeam.score !== null && (
                <div className="ml-auto text-4xl font-black tabular-nums text-white">{awayTeam.score}</div>
              )}
            </div>

            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">vs</p>
              <p className="mt-2 text-sm text-gray-300">{showScores ? "Live scoreboard" : "Game time"}</p>
            </div>

            <div className="flex items-center gap-4 rounded-[28px] border border-white/8 bg-black/20 p-4">
              <TeamLogo team={homeTeam.abbrev} logo={homeTeam.logo} size={64} color={homeTeam.color} />
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">{homeTeam.record}</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">{homeTeam.abbrev}</h2>
                <p className="truncate text-sm text-gray-300">{homeTeam.fullName || homeTeam.name}</p>
              </div>
              {showScores && homeTeam.score !== null && (
                <div className="ml-auto text-4xl font-black tabular-nums text-white">{homeTeam.score}</div>
              )}
            </div>
          </div>

          {data.insights.length > 0 && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.insights.map((insight) => (
                <div key={`${insight.label}-${insight.value}`} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{insight.label}</p>
                  <p className={`mt-2 text-sm font-semibold ${
                    insight.tone === "positive" ? "text-emerald-200" : insight.tone === "warning" ? "text-amber-100" : "text-white"
                  }`}>
                    {insight.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6">
          <LineupPanel lineup={data.lineup} />
        </div>

        <section className="mt-6">
          <div className="flex flex-wrap gap-2">
            {([
              { key: "matchup", label: "Matchup" },
              { key: "players", label: "Players" },
              { key: "props", label: "Props" },
            ] as const).map((item) => (
              <ToggleButton key={item.key} active={tab === item.key} onClick={() => setTab(item.key)}>
                {item.label}
              </ToggleButton>
            ))}
          </div>
        </section>

        {tab === "matchup" && comparison && (
          <section className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Team Comparison</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{comparison.label}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.comparisonViews.map((view, index) => (
                  <ToggleButton key={view.id} active={comparisonIndex === index} onClick={() => setComparisonIndex(index)}>
                    {view.offenseTeam} O vs {view.defenseTeam} D
                  </ToggleButton>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {comparison.stats.map((metric) => (
                <MatchupRow key={metric.key} metric={metric} />
              ))}
            </div>
          </section>
        )}

        {tab === "players" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <TeamLogo team={awayTeam.abbrev} logo={awayTeam.logo} size={36} color={awayTeam.color} />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Top 5</p>
                  <h2 className="text-xl font-semibold text-white">{awayTeam.abbrev} Key Players</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {data.players.away.map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <TeamLogo team={homeTeam.abbrev} logo={homeTeam.logo} size={36} color={homeTeam.color} />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Top 5</p>
                  <h2 className="text-xl font-semibold text-white">{homeTeam.abbrev} Key Players</h2>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {data.players.home.map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === "props" && (
          <section className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-gray-500">Game Props</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{awayTeam.abbrev} at {homeTeam.abbrev}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {["All", ...data.propFilters].map((filter) => (
                  <ToggleButton key={filter} active={propFilter === filter} onClick={() => setPropFilter(filter)}>
                    {filter}
                  </ToggleButton>
                ))}
              </div>
            </div>

            {filteredProps.length > 0 ? (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {filteredProps.map((prop) => (
                  <PropCardCompact key={prop.id} prop={prop} />
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-gray-500">
                No props matched this filter for the selected game.
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
