"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TeamLogo from "@/components/TeamLogo";
import { TrendSplit } from "@/lib/types";
import {
  PlayerTrendGame,
  SupportedTrendLeague,
  buildPlayerSplits,
  formatTrendOdds,
  getSplitByType,
  getTrendGameStatValue,
  parseTrendBoolean,
} from "@/lib/player-trend";

type TrendApiResponse = {
  league: SupportedTrendLeague;
  playerId?: number;
  playerName?: string;
  team?: string;
  teamColor?: string;
  headshot?: string | null;
  games: PlayerTrendGame[];
};

type GameLogTab = "last10" | "h2h" | "venue";

function resolveLeague(value: string | null): SupportedTrendLeague {
  if (value === "NBA") return "NBA";
  if (value === "MLB") return "MLB";
  return "NHL";
}

function parseLine(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  if (!value) return "TBD";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function didHitLine(value: number, line: number, overUnder: "Over" | "Under") {
  return overUnder === "Under" ? value < line : value > line;
}

function formatResult(result: PlayerTrendGame["result"], score: string) {
  if (!result) return score || "Final";
  return `${result} ${score}`;
}

function tabTitle(tab: GameLogTab) {
  if (tab === "h2h") return "Head to Head";
  if (tab === "venue") return "Home/Away";
  return "Last 10";
}

function signalTitle(split: TrendSplit, opponent: string, isAway: boolean) {
  if (split.type === "vs_opponent") return `vs ${opponent || "OPP"}`;
  if (split.type === "home_away") return isAway ? "Away" : "Home";
  if (split.type === "without_player") return "Without Player";
  return "Recent";
}

function signalDescription(split: TrendSplit, opponent: string, isAway: boolean) {
  if (split.type === "without_player") return "Coming soon";
  if (split.total === 0) {
    if (split.type === "vs_opponent") return `No recent games vs ${opponent || "this opponent"}`;
    if (split.type === "home_away") return `No ${isAway ? "away" : "home"} sample yet`;
    return "No recent sample yet";
  }
  return `Hit in ${split.hits} of last ${split.total} games`;
}

function SkeletonCard() {
  return <div className="h-28 rounded-[24px] border border-dark-border bg-dark-surface/70 animate-pulse" />;
}

function SignalCard({
  accent,
  icon,
  split,
  title,
  description,
}: {
  accent: string;
  icon: string;
  split: TrendSplit;
  title: string;
  description: string;
}) {
  const width = split.total > 0 ? Math.max(split.hitRate, 6) : 20;
  const muted = split.type === "without_player" || split.total === 0;

  return (
    <div className="rounded-[24px] border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.96)_0%,rgba(12,16,24,0.96)_100%)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-gray-500">{title}</div>
          <div className="mt-2 text-2xl">{icon}</div>
        </div>
        <div className={`text-right text-lg font-semibold ${muted ? "text-gray-500" : "text-white"}`}>
          {split.total > 0 ? `${Math.round(split.hitRate)}%` : "Soon"}
        </div>
      </div>
      <p className={`mt-3 text-sm leading-5 ${muted ? "text-gray-500" : "text-gray-300"}`}>
        {description}
      </p>
      <div className="mt-4 h-2 rounded-full bg-dark-bg/90 overflow-hidden border border-dark-border/70">
        <div
          className={`h-full rounded-full transition-all ${muted ? "bg-gray-600/70" : ""}`}
          style={{
            width: `${Math.min(width, 100)}%`,
            backgroundColor: muted ? undefined : accent,
          }}
        />
      </div>
    </div>
  );
}

export default function PlayerTrendPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<TrendApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GameLogTab>("last10");

  const id = params.id;
  const league = resolveLeague(searchParams.get("league"));
  const propType = searchParams.get("propType") || (league === "NBA" ? "Points" : league === "MLB" ? "Hits" : "Points");
  const line = parseLine(searchParams.get("line"));
  const opponent = (searchParams.get("opponent") || "").toUpperCase();
  const overUnder = searchParams.get("overUnder") === "Under" ? "Under" : "Over";
  const playerName = searchParams.get("playerName") || id.replace(/-/g, " ");
  const queryTeam = searchParams.get("team") || "";
  const isAway = parseTrendBoolean(searchParams.get("isAway")) ?? false;
  const queryTeamColor = searchParams.get("teamColor") || "";
  const odds = searchParams.get("odds");
  const book = searchParams.get("book");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams();
      if (playerName) query.set("playerName", playerName);
      if (queryTeam) query.set("team", queryTeam);
      const playerId = searchParams.get("playerId");
      if (playerId) query.set("playerId", playerId);
      if (propType) query.set("propType", propType);
      const endpoint = league === "NBA"
        ? `/api/nba/player/${encodeURIComponent(id)}/game-log?${query.toString()}`
        : league === "MLB"
          ? `/api/mlb/player/${encodeURIComponent(id)}/game-log?${query.toString()}`
          : `/api/player/${encodeURIComponent(id)}/game-log`;

      try {
        const response = await fetch(endpoint);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to load game log");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load game log");
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
  }, [id, league, playerName, propType, queryTeam, searchParams]);

  const games = data?.games || [];
  const accent = data?.teamColor || queryTeamColor || "#4a9eff";
  const displayName = data?.playerName || playerName || "Player";
  const displayTeam = data?.team || queryTeam;
  const matchup = displayTeam && opponent ? `${displayTeam} ${isAway ? "@" : "vs"} ${opponent}` : displayTeam || opponent;
  const formattedOdds = formatTrendOdds(odds ? Number(odds) : null);

  const splits = useMemo(() => (
    buildPlayerSplits({
      games,
      didHit: (game) => didHitLine(getTrendGameStatValue(game, propType, league), line, overUnder),
      isAway,
      opponent,
      lastN: 10,
    })
  ), [games, isAway, league, line, opponent, overUnder, propType]);

  const signalCards = [
    { icon: "⚡", split: getSplitByType(splits, "last_n") || splits[0] },
    { icon: "🎯", split: getSplitByType(splits, "vs_opponent") || splits[1] },
    { icon: "🏠", split: getSplitByType(splits, "home_away") || splits[2] },
    { icon: "🤕", split: getSplitByType(splits, "without_player") || splits[3] },
  ];

  const tabGames = useMemo(() => {
    if (activeTab === "h2h") {
      return games.filter((game) => game.opponentAbbrev.toUpperCase() === opponent);
    }
    if (activeTab === "venue") {
      return games.filter((game) => game.isHome !== isAway);
    }
    return games.slice(0, 10);
  }, [activeTab, games, isAway, opponent]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <header className="sticky top-0 z-40 border-b border-dark-border bg-dark-bg/95 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => router.back()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dark-border bg-dark-surface text-gray-200 transition-colors hover:border-gray-500"
              aria-label="Go back"
            >
              ←
            </button>
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Player Analysis</p>
              <p className="text-sm text-gray-300">{propType}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 pb-28">
        {loading ? (
          <div className="space-y-4">
            <SkeletonCard />
            <div className="grid grid-cols-2 gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="h-80 rounded-[28px] border border-dark-border bg-dark-surface/70 animate-pulse" />
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-dark-border bg-dark-surface/90 p-6 text-center shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Game log unavailable</p>
            <h1 className="mt-2 text-xl font-semibold text-white">{displayName}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full border border-accent-blue/40 bg-accent-blue/10 px-4 text-sm font-semibold text-accent-blue"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <section
              className="overflow-hidden rounded-[30px] border border-dark-border bg-[linear-gradient(180deg,rgba(21,24,33,0.98)_0%,rgba(12,16,24,0.98)_100%)] shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
            >
              <div className="h-1.5 w-full" style={{ background: accent }} />
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {data?.headshot ? (
                    <img
                      src={data.headshot}
                      alt={displayName}
                      className="h-16 w-16 rounded-full border border-dark-border object-cover"
                    />
                  ) : (
                    <TeamLogo team={displayTeam || displayName.slice(0, 3)} color={accent} size={64} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{league}</p>
                    <h1 className="mt-1 truncate text-2xl font-semibold text-white">{displayName}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {matchup && (
                        <span className="rounded-full border border-dark-border bg-dark-bg/70 px-3 py-1 text-xs font-medium text-gray-300">
                          {matchup}
                        </span>
                      )}
                      <span className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-xs font-semibold text-accent-blue">
                        {overUnder} {line} {propType}
                      </span>
                      {formattedOdds && (
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                          {formattedOdds}
                          {book ? ` · ${book}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              {signalCards.map(({ icon, split }) => (
                <SignalCard
                  key={`${split.type}-${icon}`}
                  accent={accent}
                  icon={icon}
                  split={split}
                  title={signalTitle(split, opponent, isAway)}
                  description={signalDescription(split, opponent, isAway)}
                />
              ))}
            </section>

            <section className="overflow-hidden rounded-[28px] border border-dark-border bg-dark-surface/95 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
              <div className="border-b border-dark-border/80 px-4 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Game Log</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">{tabTitle(activeTab)}</h2>
                  </div>
                  <div className="rounded-full border border-dark-border bg-dark-bg/70 px-3 py-1 text-xs text-gray-400">
                    {propType}
                  </div>
                </div>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                  {([
                    { key: "last10", label: "Last 10" },
                    { key: "h2h", label: "Head to Head" },
                    { key: "venue", label: isAway ? "Away" : "Home" },
                  ] as Array<{ key: GameLogTab; label: string }>).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`min-h-[44px] shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
                        activeTab === tab.key
                          ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue"
                          : "border-dark-border bg-dark-bg/60 text-gray-400"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {tabGames.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm font-medium text-white">No matching games found</p>
                  <p className="mt-2 text-sm text-gray-500">
                    This split will populate automatically once enough recent game log data is available.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-dark-border/60">
                  {tabGames.map((game) => {
                    const statValue = getTrendGameStatValue(game, propType, league);
                    const hit = didHitLine(statValue, line, overUnder);
                    return (
                      <div
                        key={`${game.gameId}-${game.date}`}
                        className={`grid grid-cols-[40px_64px_1fr_88px_72px] items-center gap-3 px-4 py-3 text-sm ${
                          hit ? "bg-emerald-500/8" : "bg-transparent"
                        }`}
                      >
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${
                              hit
                                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                                : "border-red-500/20 bg-red-500/10 text-red-300"
                            }`}
                          >
                            {hit ? "✓" : "×"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(game.date)}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-white">
                            {game.isHome ? "vs" : "@"} {game.opponentAbbrev}
                          </div>
                          {game.minutes && (
                            <div className="mt-1 text-xs text-gray-500">{game.minutes}</div>
                          )}
                        </div>
                        <div className="text-xs font-medium text-gray-300">{formatResult(game.result, game.score)}</div>
                        <div className={`text-right text-base font-semibold ${hit ? "text-emerald-300" : "text-white"}`}>
                          {statValue}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-dark-border bg-dark-surface/95 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Action Bar</p>
                  <p className="mt-1 text-sm text-gray-300">Pick saving is reserved for the next sprint.</p>
                </div>
                <button
                  disabled
                  className="min-h-[44px] rounded-full border border-gray-700 bg-dark-bg/70 px-4 text-sm font-semibold text-gray-500"
                >
                  Add to My Picks
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
