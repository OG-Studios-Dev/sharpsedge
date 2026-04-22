"use client";

import Link from "next/link";
import { useState } from "react";
import PropCard from "@/components/PropCard";
import TeamLogo from "@/components/TeamLogo";
import type {
  MatchupComparisonView,
  MatchupPageData,
  MatchupPlayerCard,
  MatchupPropCard,
} from "@/lib/matchup-types";
import type { PlayerProp } from "@/lib/types";

type Tab = "props" | "matchup" | "players" | "injuries";

function tabClasses(active: boolean) {
  return active
    ? "border-white/20 bg-white text-dark-bg"
    : "border-white/10 bg-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10";
}

function toPlayerProp(data: MatchupPageData, prop: MatchupPropCard): PlayerProp {
  const team = prop.team === data.header.away.abbrev ? data.header.away : data.header.home;
  return {
    id: prop.id,
    playerName: prop.playerName,
    team: prop.team,
    teamColor: team.color,
    opponent: prop.opponent,
    isAway: prop.team === data.header.away.abbrev,
    propType: prop.propType,
    line: prop.line,
    overUnder: prop.overUnder,
    odds: prop.odds,
    book: prop.book,
    hitRate: prop.hitRate ?? undefined,
    edge: prop.edgePct ?? undefined,
    edgePct: prop.edgePct ?? undefined,
    splits: [],
    indicators: [],
    league: data.league,
    matchup: `${data.header.away.abbrev} @ ${data.header.home.abbrev}`,
  };
}

function PlayerListCard({
  team,
  players,
  league,
}: {
  team: MatchupPageData["header"]["away"];
  players: MatchupPlayerCard[];
  league?: string;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <div className="flex items-center gap-3">
        <TeamLogo team={team.abbrev} logo={team.logo} size={34} color={team.color} sport={league} />
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{team.abbrev}</p>
          <h2 className="text-xl font-semibold text-white">{team.fullName || team.name}</h2>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {players.length > 0 ? players.map((player) => (
          <Link
            key={player.id}
            href={player.trendHref}
            className="block rounded-2xl border border-white/8 bg-black/20 px-4 py-3 transition hover:border-white/20 hover:bg-black/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{player.name}</p>
                <p className="mt-1 text-xs text-gray-500">{player.position} · {player.avgMinutes?.toFixed(1) || "0.0"} MIN</p>
              </div>
              <p className="text-xs text-gray-400">{player.seasonStats.slice(0, 3).map((stat) => `${stat.label} ${stat.value.toFixed(1)}`).join(" · ")}</p>
            </div>
            <p className="mt-3 text-sm text-gray-300">{player.dvp}</p>
          </Link>
        )) : (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-gray-400">
            No player board available yet.
          </div>
        )}
      </div>
    </section>
  );
}

function ComparisonCard({ view }: { view: MatchupComparisonView }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{view.offenseTeam} offense vs {view.defenseTeam} defense</p>
      <h2 className="mt-1 text-xl font-semibold text-white">{view.label}</h2>

      <div className="mt-4 space-y-3">
        {view.stats.map((metric) => (
          <div key={metric.key} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white">{metric.label}</p>
              <p className={`text-xs font-semibold ${
                metric.advantage === "offense"
                  ? "text-emerald-300"
                  : metric.advantage === "defense"
                    ? "text-rose-300"
                    : "text-gray-300"
              }`}>
                {metric.advantage === "offense" ? "Offense edge" : metric.advantage === "defense" ? "Defense edge" : "Even"}
              </p>
            </div>
            <p className="mt-2 text-sm text-gray-300">
              Offense #{metric.offenseRank} ({metric.offenseValue.toFixed(1)}) vs Defense #{metric.defenseRank} ({metric.defenseValue.toFixed(1)})
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CompactMatchupPageClient({
  data,
  backHref = "/schedule",
  title = "Matchup",
}: {
  data: MatchupPageData;
  backHref?: string;
  title?: string;
}) {
  const [tab, setTab] = useState<Tab>("props");
  const [propFilter, setPropFilter] = useState("All");
  const filteredProps = propFilter === "All"
    ? data.props
    : data.props.filter((prop) => prop.propType === propFilter);

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-dark-bg/90 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href={backHref} className="text-gray-400 transition hover:text-white" aria-label={`Back to ${title}`}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{data.league}</p>
            <h1 className="text-lg font-semibold text-white">{title}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_32%),rgba(255,255,255,0.04)] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)]">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="flex items-center gap-3">
              <TeamLogo team={data.header.away.abbrev} logo={data.header.away.logo} size={34} color={data.header.away.color} sport={data.league} />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-white">
                  {data.header.away.abbrev}
                  {typeof data.header.away.score === "number" ? ` ${data.header.away.score}` : ""}
                </p>
                <p className="truncate text-xs text-gray-400">{data.header.away.record}</p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">vs</p>
              <p className="mt-1 text-xs text-gray-400">{data.header.status.detail}</p>
            </div>

            <div className="flex items-center justify-end gap-3 text-right">
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-white">
                  {data.header.home.abbrev}
                  {typeof data.header.home.score === "number" ? ` ${data.header.home.score}` : ""}
                </p>
                <p className="truncate text-xs text-gray-400">{data.header.home.record}</p>
              </div>
              <TeamLogo team={data.header.home.abbrev} logo={data.header.home.logo} size={34} color={data.header.home.color} sport={data.league} />
            </div>
          </div>

          <div className="mt-4 space-y-3 border-t border-white/10 pt-4 text-sm text-gray-300">
            <p>{data.header.away.abbrev}: {data.header.compact.away}</p>
            <p>{data.header.home.abbrev}: {data.header.compact.home}</p>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Game lines & odds</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-gray-300">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Moneyline</p>
                <p className="mt-1 text-white">{data.header.compact.betting.moneyline ?? "Unavailable"}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm text-gray-300">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Spread / total</p>
                <p className="mt-1 text-white">
                  {data.header.compact.betting.spread ?? "Unavailable"}
                  {data.header.compact.betting.total ? ` | ${data.header.compact.betting.total}` : ""}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 flex flex-wrap gap-2">
          {([
            { key: "props", label: "Props" },
            { key: "matchup", label: "Matchup" },
            { key: "players", label: "Players" },
            { key: "injuries", label: "Injuries" },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${tabClasses(tab === item.key)}`}
            >
              {item.label}
            </button>
          ))}
        </section>

        {tab === "props" && (
          <section className="mt-6 rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Props</p>
                <h2 className="mt-1 text-xl font-semibold text-white">Game-specific player props</h2>
                <p className="mt-2 text-sm text-gray-400">Every available prop should be actionable here, with live odds, hit rate, edge, and a direct + add-to-bets control.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["All", ...data.propFilters].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPropFilter(filter)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${tabClasses(propFilter === filter)}`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {filteredProps.length > 0 ? filteredProps.map((prop) => (
                <PropCard key={prop.id} prop={toPlayerProp(data, prop)} compact />
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-gray-400">
                  No props matched this filter.
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "matchup" && (
          <div className="mt-6 space-y-6">
            <section className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{data.header.away.abbrev} team snapshot</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{data.header.away.fullName || data.header.away.name}</h2>
                <div className="mt-4 space-y-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-gray-300">
                  <p>{data.teamStats.away.row1}</p>
                  <p>{data.teamStats.away.row2}</p>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{data.header.home.abbrev} team snapshot</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{data.header.home.fullName || data.header.home.name}</h2>
                <div className="mt-4 space-y-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-gray-300">
                  <p>{data.teamStats.home.row1}</p>
                  <p>{data.teamStats.home.row2}</p>
                </div>
              </section>
            </section>

            {data.teamStats.seriesNote ? (
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-sm text-gray-300 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                {data.teamStats.seriesNote}
              </section>
            ) : null}

            {data.lineup && (data.lineup.away.length > 0 || data.lineup.home.length > 0) ? (
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Lineup Intel</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{data.lineup.title}</h2>
                {data.lineup.note ? <p className="mt-2 text-sm text-gray-400">{data.lineup.note}</p> : null}
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {[{ team: data.header.away.abbrev, players: data.lineup.away }, { team: data.header.home.abbrev, players: data.lineup.home }].map((group) => (
                    <div key={group.team} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{group.team}</p>
                      <div className="mt-3 space-y-3">
                        {group.players.map((player) => (
                          <div key={player.id} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-3">
                            <p className="text-sm font-medium text-white">{player.name}</p>
                            <p className="mt-1 text-xs text-gray-400">{player.subtitle}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              {data.comparisonViews.map((view) => <ComparisonCard key={view.id} view={view} />)}
            </section>
          </div>
        )}

        {tab === "players" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <PlayerListCard team={data.header.away} players={data.players.away} league={data.league} />
            <PlayerListCard team={data.header.home} players={data.players.home} league={data.league} />
          </div>
        )}

        {tab === "injuries" && (
          <section className="mt-6 rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Injuries</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Injury report placeholder</h2>
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-sm text-gray-400">
              Injury report wiring is still pending for this compact rebuild. This tab is reserved so the final layout already has the correct above-the-fold structure.
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
