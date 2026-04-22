"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import DVPBadge from "@/components/player/DVPBadge";
import GameBarChart from "@/components/player/GameBarChart";
import GameLogTable, { GameLogTableTab } from "@/components/player/GameLogTable";
import HitRateTimeline from "@/components/player/HitRateTimeline";
import PlayerHeader from "@/components/player/PlayerHeader";
import PropBuilder from "@/components/player/PropBuilder";
import ResearchMarketCard from "@/components/player/ResearchMarketCard";
import StatTabs from "@/components/player/StatTabs";
import {
  NBA_PLAYER_RESEARCH_STATS,
  NHL_PLAYER_RESEARCH_STATS,
  PlayerResearchResponse,
  PlayerResearchStatOption,
  filterPlayerResearchGames,
  getDefenseRankTone,
  getDvpLabel,
  getOpponentOptions,
  getPlayerResearchHitRate,
  ordinal,
  rankToEdgeScore,
} from "@/lib/player-research";
import { PlayerTrendGame, SupportedTrendLeague, getTrendGameStatValue } from "@/lib/player-trend";

type VenueFilter = "all" | "home" | "away";
type MinuteOption = { label: string; minMinutes?: number };

function resolveLeague(value: string | null): SupportedTrendLeague {
  if (value === "NBA") return "NBA";
  if (value === "MLB") return "MLB";
  return "NHL";
}

function parseLine(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToHalf(value: number) {
  return Math.round(value * 2) / 2;
}

function abbreviateStat(label: string) {
  return label.replace(/[^A-Za-z0-9+]/g, "").toUpperCase().slice(0, 6) || "STAT";
}

function getFallbackOptions(league: SupportedTrendLeague, propType: string): PlayerResearchStatOption[] {
  if (league === "NBA") return NBA_PLAYER_RESEARCH_STATS;
  if (league === "NHL") return NHL_PLAYER_RESEARCH_STATS;
  const safeProp = propType || "Stat";
  return [{ key: safeProp, label: safeProp, shortLabel: abbreviateStat(safeProp) }];
}

function resolveStatFromOptions(options: PlayerResearchStatOption[], value: string) {
  return options.find((option) => option.key === value || option.label === value || option.shortLabel === value)?.key
    || options[0]?.key
    || value
    || "Points";
}

function getSuggestedLine(games: PlayerTrendGame[], league: SupportedTrendLeague, statKey: string) {
  const sample = games.slice(0, 10);
  if (!sample.length) return 0.5;
  const total = sample.reduce((sum, game) => sum + getTrendGameStatValue(game, statKey, league), 0);
  return Math.max(roundToHalf(total / sample.length), 0.5);
}

function getMinuteOptions(league: SupportedTrendLeague): MinuteOption[] {
  if (league === "NBA") {
    return [
      { label: "All Min" },
      { label: "20+", minMinutes: 20 },
      { label: "30+", minMinutes: 30 },
      { label: "35+", minMinutes: 35 },
    ];
  }

  if (league === "NHL") {
    return [
      { label: "All Min" },
      { label: "12+", minMinutes: 12 },
      { label: "16+", minMinutes: 16 },
      { label: "20+", minMinutes: 20 },
    ];
  }

  return [{ label: "All Min" }];
}

function getTableGames(
  tab: GameLogTableTab,
  games: PlayerTrendGame[],
  targetOpponent: string
) {
  if (tab === "h2h") return targetOpponent ? games.filter((game) => game.opponentAbbrev.toUpperCase() === targetOpponent) : [];
  if (tab === "l5") return games.slice(0, 5);
  if (tab === "l10") return games.slice(0, 10);
  if (tab === "l20") return games.slice(0, 20);
  return games;
}

function getDefenseMetricLabel(league: SupportedTrendLeague, statKey: string) {
  if (league === "NBA") {
    if (statKey === "Points") return "PTS";
    if (statKey === "Rebounds") return "REB";
    if (statKey === "Assists") return "AST";
    if (statKey === "3PM") return "3PM";
    if (statKey === "PTS+REB+AST") return "PRA";
  }

  if (league === "NHL") {
    if (statKey === "Goals") return "Goals";
    if (statKey === "Assists") return "Assists";
    if (statKey === "Shots") return "Shots";
    return "Points";
  }

  return abbreviateStat(statKey);
}

function getDefenseCell(data: PlayerResearchResponse | null, league: SupportedTrendLeague, statKey: string) {
  const grid = data?.defenseGrid;
  if (!grid) return null;

  if (league === "NBA" && statKey === "PTS+REB+AST") {
    const keys = ["PTS", "REB", "AST"];
    const cells = keys.map((key) => grid.vsPosition.find((cell) => cell.label === key)).filter(Boolean);
    if (!cells.length) return null;
    const rank = Math.round(cells.reduce((sum, cell) => sum + (cell?.rank || 0), 0) / cells.length);
    return { label: "PRA", rank };
  }

  const label = getDefenseMetricLabel(league, statKey);
  const cell = grid.vsPosition.find((entry) => entry.label === label) || grid.overall.find((entry) => entry.label === label);
  if (!cell) return null;
  return { label, rank: cell.rank };
}

function getRankPillClasses(rank: number, teamCount: number) {
  const tone = getDefenseRankTone(rank, teamCount);
  if (tone === "good") return "border-emerald-500/30 bg-emerald-500/12 text-emerald-100";
  if (tone === "neutral") return "border-amber-500/30 bg-amber-500/12 text-amber-100";
  return "border-red-500/30 bg-red-500/12 text-red-100";
}

function SectionToggle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details open className="overflow-hidden rounded-[28px] border border-dark-border bg-dark-surface/95 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{title}</p>
          <p className="mt-1 text-sm text-gray-300">{description}</p>
        </div>
        <span className="text-xl text-gray-500">+</span>
      </summary>
      <div className="border-t border-dark-border/80 p-4">{children}</div>
    </details>
  );
}

function SkeletonCard({ height }: { height: string }) {
  return <div className={`${height} animate-pulse rounded-[28px] border border-dark-border bg-dark-surface/80`} />;
}

export default function PlayerTrendPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<PlayerResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStat, setActiveStat] = useState("Points");
  const [direction, setDirection] = useState<"Over" | "Under">("Over");
  const [lineByStat, setLineByStat] = useState<Record<string, number>>({});
  const [tableTab, setTableTab] = useState<GameLogTableTab>("l10");
  const [teamFilter, setTeamFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("all");
  const [minMinutes, setMinMinutes] = useState<number | undefined>(undefined);

  const id = params.id;
  const league = resolveLeague(searchParams.get("league"));
  const requestedPropType = searchParams.get("propType") || (league === "NBA" ? "Points" : league === "MLB" ? "Hits" : "Points");
  const requestedLine = parseLine(searchParams.get("line"));
  const requestedDirection = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
  const opponent = (searchParams.get("opponent") || "").toUpperCase();
  const playerName = searchParams.get("playerName") || id.replace(/-/g, " ");
  const queryTeam = searchParams.get("team") || "";
  const oddsEventId = searchParams.get("oddsEventId") || "";
  const requestedPlayerId = searchParams.get("playerId") || "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setLineByStat({});
      setTeamFilter("");
      setVenueFilter("all");
      setMinMinutes(undefined);
      setTableTab("l10");
      setDirection(requestedDirection);

      const query = new URLSearchParams();
      if (playerName) query.set("playerName", playerName);
      if (queryTeam) query.set("team", queryTeam);
      if (opponent) query.set("opponent", opponent);
      if (requestedPropType) query.set("propType", requestedPropType);
      if (requestedDirection) query.set("overUnder", requestedDirection);
      if (oddsEventId) query.set("oddsEventId", oddsEventId);
      if (requestedPlayerId) query.set("playerId", requestedPlayerId);

      const endpoint = league === "NBA"
        ? `/api/nba/player/${encodeURIComponent(id)}/game-log?${query.toString()}`
        : league === "MLB"
          ? `/api/mlb/player/${encodeURIComponent(id)}/game-log?${query.toString()}`
          : `/api/player/${encodeURIComponent(id)}/game-log?${query.toString()}`;

      try {
        const response = await fetch(endpoint);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load player research");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load player research");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, league, oddsEventId, opponent, playerName, queryTeam, requestedDirection, requestedPlayerId, requestedPropType]);

  const statOptions = data?.availableStats?.length
    ? data.availableStats
    : getFallbackOptions(data?.league || league, requestedPropType);
  const resolvedStat = resolveStatFromOptions(statOptions, activeStat || requestedPropType);
  const currentLeague = data?.league || league;

  useEffect(() => {
    if (!data) return;
    const nextActiveStat = resolveStatFromOptions(statOptions, requestedPropType);
    setActiveStat(nextActiveStat);
    setLineByStat(() => {
      const next: Record<string, number> = {};
      for (const option of statOptions) {
        next[option.key] = option.key === nextActiveStat && requestedLine > 0
          ? requestedLine
          : getSuggestedLine(data.games || [], data.league, option.key);
      }
      return next;
    });
  }, [data, requestedLine, requestedPropType]);

  const selectedLine = typeof lineByStat[resolvedStat] === "number"
    ? lineByStat[resolvedStat]
    : requestedLine > 0
      ? requestedLine
      : getSuggestedLine(data?.games || [], currentLeague, resolvedStat);

  const currentOpponent = (teamFilter || opponent || data?.nextGame?.opponent || "").toUpperCase();
  const filteredGames = filterPlayerResearchGames(data?.games || [], {
    opponent: teamFilter || undefined,
    venue: venueFilter,
    minMinutes,
  });
  const filteredPreviousSeasonGames = filterPlayerResearchGames(data?.previousSeasonGames || [], {
    opponent: teamFilter || undefined,
    venue: venueFilter,
    minMinutes,
  });
  const currentHitRate = getPlayerResearchHitRate(filteredGames, currentLeague, resolvedStat, selectedLine, direction);
  const timelineItems = [
    { label: "H2H", value: currentOpponent ? getPlayerResearchHitRate(filteredGames.filter((game) => game.opponentAbbrev.toUpperCase() === currentOpponent), currentLeague, resolvedStat, selectedLine, direction) : null },
    { label: "L5", value: getPlayerResearchHitRate(filteredGames.slice(0, 5), currentLeague, resolvedStat, selectedLine, direction) },
    { label: "L10", value: getPlayerResearchHitRate(filteredGames.slice(0, 10), currentLeague, resolvedStat, selectedLine, direction) },
    { label: "L20", value: getPlayerResearchHitRate(filteredGames.slice(0, 20), currentLeague, resolvedStat, selectedLine, direction) },
    { label: "Season", value: getPlayerResearchHitRate(filteredGames, currentLeague, resolvedStat, selectedLine, direction) },
    { label: "Prev Season", value: getPlayerResearchHitRate(filteredPreviousSeasonGames, currentLeague, resolvedStat, selectedLine, direction) },
  ];
  const tableGames = getTableGames(tableTab, filteredGames, currentOpponent);
  const defenseCell = getDefenseCell(data, currentLeague, resolvedStat);
  const minuteOptions = getMinuteOptions(currentLeague);
  const opponentOptions = getOpponentOptions(data?.games || []);

  function handleStatChange(nextStat: string) {
    setActiveStat(nextStat);
    setLineByStat((previous) => {
      if (typeof previous[nextStat] === "number") return previous;
      return {
        ...previous,
        [nextStat]: getSuggestedLine(data?.games || [], currentLeague, nextStat),
      };
    });
  }

  function handleLineAdjust(delta: number) {
    setLineByStat((previous) => ({
      ...previous,
      [resolvedStat]: Math.max(0, roundToHalf((previous[resolvedStat] ?? selectedLine) + delta)),
    }));
  }

  return (
    <div className="min-h-screen bg-dark-bg">
      <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dark-border bg-dark-surface text-gray-200 transition-colors hover:border-gray-500"
            aria-label="Go back"
          >
            ←
          </button>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Player Page V2</p>
            <p className="text-sm text-gray-300">{resolvedStat}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 pb-28">
        {loading ? (
          <div className="space-y-4">
            <SkeletonCard height="h-48" />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
              <div className="space-y-4">
                <SkeletonCard height="h-36" />
                <SkeletonCard height="h-28" />
                <SkeletonCard height="h-[380px]" />
                <SkeletonCard height="h-[420px]" />
              </div>
              <div className="space-y-4">
                <SkeletonCard height="h-40" />
                <SkeletonCard height="h-64" />
                <SkeletonCard height="h-64" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-6 text-center shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Player research unavailable</p>
            <h1 className="mt-2 text-xl font-semibold text-white">{playerName}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <PlayerHeader
              headshot={data?.headshot}
              league={currentLeague}
              name={data?.playerName || playerName}
              team={data?.team || queryTeam}
              teamColor={data?.teamColor}
              player={data?.player || {
                position: "",
                positionLabel: currentLeague,
                jerseyNumber: null,
                injuryStatus: null,
              }}
              nextGame={data?.nextGame}
            />

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
              <div className="space-y-4">
                <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Stat Tabs</p>
                  <p className="mt-1 text-sm text-gray-300">Switching tabs updates the builder, hit rates, chart, and table.</p>
                  <div className="mt-4">
                    <StatTabs options={statOptions} activeKey={resolvedStat} onChange={handleStatChange} />
                  </div>
                </section>

                <PropBuilder
                  options={statOptions}
                  activeStat={resolvedStat}
                  direction={direction}
                  line={selectedLine}
                  hitRate={currentHitRate}
                  onStatChange={handleStatChange}
                  onDirectionChange={setDirection}
                  onLineAdjust={handleLineAdjust}
                />

                <ResearchMarketCard
                  oddsComparison={data?.oddsComparison}
                  statLabel={resolvedStat}
                  direction={direction}
                  line={selectedLine}
                  opponent={currentOpponent || undefined}
                  nextGameDisplay={data?.nextGame?.display || null}
                />

                <HitRateTimeline items={timelineItems} />

                <GameBarChart
                  games={filteredGames}
                  league={currentLeague}
                  statKey={resolvedStat}
                  line={selectedLine}
                  direction={direction}
                />

                <GameLogTable
                  games={tableGames}
                  league={currentLeague}
                  statKey={resolvedStat}
                  line={selectedLine}
                  direction={direction}
                  activeTab={tableTab}
                  onTabChange={setTableTab}
                />
              </div>

              <div className="space-y-4">
                {data?.defenseGrid && defenseCell ? (
                  <>
                    <DVPBadge
                      opponent={data.defenseGrid.opponent}
                      position={data.player?.position || data.defenseGrid.position}
                      statLabel={defenseCell.label}
                      rank={defenseCell.rank}
                      teamCount={data.defenseGrid.teamCount}
                    />

                    <SectionToggle
                      title="Opponent Defense Grid"
                      description={`${data.defenseGrid.opponent} recent allowance profile`}
                    >
                      <div
                        className="grid gap-2 text-center text-xs"
                        style={{ gridTemplateColumns: `88px repeat(${data.defenseGrid.overall.length}, minmax(0, 1fr))` }}
                      >
                        <div className="text-left text-[11px] uppercase tracking-[0.18em] text-gray-500">Split</div>
                        {data.defenseGrid.overall.map((cell) => (
                          <div key={`header-${cell.label}`} className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                            {cell.label}
                          </div>
                        ))}

                        <div className="flex items-center text-sm font-medium text-white">Overall</div>
                        {data.defenseGrid.overall.map((cell) => (
                          <div
                            key={`overall-${cell.label}`}
                            className={`rounded-[18px] border px-2 py-3 font-semibold ${getRankPillClasses(cell.rank, data.defenseGrid?.teamCount || 30)}`}
                          >
                            {cell.rank}
                          </div>
                        ))}

                        <div className="flex items-center text-sm font-medium text-white">
                          vs {data.player?.position || data.defenseGrid.position}
                        </div>
                        {data.defenseGrid.vsPosition.map((cell) => (
                          <div
                            key={`position-${cell.label}`}
                            className={`rounded-[18px] border px-2 py-3 font-semibold ${getRankPillClasses(cell.rank, data.defenseGrid?.teamCount || 30)}`}
                          >
                            {cell.rank}
                          </div>
                        ))}
                      </div>
                    </SectionToggle>
                  </>
                ) : null}

                <SectionToggle
                  title="Filters"
                  description="Team, venue, and minutes thresholds"
                >
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Opponent</p>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        <button
                          type="button"
                          onClick={() => setTeamFilter("")}
                          className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold ${
                            !teamFilter
                              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                              : "border-dark-border bg-dark-bg/70 text-gray-400"
                          }`}
                        >
                          All Teams
                        </button>
                        {opponentOptions.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setTeamFilter(option)}
                            className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold ${
                              teamFilter === option
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                                : "border-dark-border bg-dark-bg/70 text-gray-400"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Home / Away</p>
                      <div className="mt-3 flex gap-2">
                        {([
                          { value: "all", label: "All" },
                          { value: "home", label: "Home" },
                          { value: "away", label: "Away" },
                        ] as const).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setVenueFilter(option.value)}
                            className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                              venueFilter === option.value
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                                : "border-dark-border bg-dark-bg/70 text-gray-400"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Minutes</p>
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {minuteOptions.map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setMinMinutes(option.minMinutes)}
                            className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-semibold ${
                              minMinutes === option.minMinutes
                                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                                : "border-dark-border bg-dark-bg/70 text-gray-400"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </SectionToggle>

                {data?.defenseGrid && defenseCell ? (
                  <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Matchup Summary</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {data.defenseGrid.opponent} allows {ordinal(defenseCell.rank)} most {defenseCell.label} to {data.player?.position || data.defenseGrid.position}
                    </p>
                    <p className="mt-3 text-sm text-gray-300">
                      Edge score {rankToEdgeScore(defenseCell.rank, data.defenseGrid.teamCount)} • {getDvpLabel(defenseCell.rank, data.defenseGrid.teamCount)}
                    </p>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
