import type { NHLContextBoardResponse, NHLContextTeamBoardEntry } from "@/lib/nhl-context";

function toneForUrgency(tier: NHLContextTeamBoardEntry["derived"]["playoffPressure"]["urgencyTier"]) {
  if (tier === "high") return "border-red-500/30 bg-red-500/10 text-red-200";
  if (tier === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (tier === "low") return "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return "border-dark-border bg-dark-bg/60 text-gray-300";
}

function toneForGoalie(entry: NHLContextTeamBoardEntry) {
  const derived = entry.derived.goalie;
  if (!entry.sourced.goalie.starter) return "border-red-500/30 bg-red-500/10 text-red-200";
  if (derived.isBackup) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (derived.isConfirmed) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  return "border-dark-border bg-dark-bg/60 text-gray-300";
}

function toneForFatigue(score: number | null) {
  if (score == null) return "border-dark-border bg-dark-bg/60 text-gray-300";
  if (score >= 55) return "border-red-500/30 bg-red-500/10 text-red-200";
  if (score >= 30) return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function formatGoalie(entry: NHLContextTeamBoardEntry) {
  const starter = entry.sourced.goalie.starter;
  if (!starter) return "Starter unavailable";
  const status = starter.status === "confirmed" ? "confirmed" : starter.status === "probable" ? "probable" : "tbd";
  const backup = starter.isBackup ? " • backup" : "";
  return `${starter.name} • ${status}${backup}`;
}

function formatRest(entry: NHLContextTeamBoardEntry) {
  const rest = entry.derived.rest;
  const travel = entry.derived.travel;
  const parts: string[] = [];
  if (rest.isBackToBack) parts.push("B2B");
  else if (rest.restDays != null) parts.push(`${rest.restDays}d rest`);
  if (travel.travelKm != null) parts.push(`${Math.round(travel.travelKm)} km`);
  if (travel.timezoneShiftHours != null && Math.abs(travel.timezoneShiftHours) >= 1) parts.push(`${travel.timezoneShiftHours > 0 ? "+" : ""}${travel.timezoneShiftHours} tz`);
  if (!parts.length) return "Schedule context limited";
  return parts.join(" • ");
}

function formatPressure(entry: NHLContextTeamBoardEntry) {
  const pressure = entry.derived.playoffPressure;
  if (pressure.urgencyTier === "none") return "No live urgency flag";
  const delta = pressure.cutlineDeltaPoints;
  return `${pressure.urgencyTier} urgency${delta == null ? "" : ` • ${delta >= 0 ? "+" : ""}${delta} pts vs cutline`}`;
}

function formatNews(entry: NHLContextTeamBoardEntry) {
  const items = entry.sourced.news.items;
  const labels = entry.derived.news.labels;
  if (!items.length) return "No official-team news hits";
  return labels.length ? labels.join(" • ") : `${items.length} official post${items.length === 1 ? "" : "s"}`;
}

function TeamContextCard({ entry }: { entry: NHLContextTeamBoardEntry }) {
  return (
    <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{entry.teamAbbrev}</p>
          <p className="mt-1 text-xs text-gray-500">vs {entry.opponentAbbrev}</p>
        </div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${toneForUrgency(entry.derived.playoffPressure.urgencyTier)}`}>
          {entry.derived.playoffPressure.urgencyTier} urgency
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className={`rounded-2xl border px-3 py-2 ${toneForFatigue(entry.derived.fatigueScore)}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">Rest / travel</p>
          <p className="mt-1 text-sm font-semibold">{formatRest(entry)}</p>
          <p className="mt-1 text-xs opacity-80">Fatigue score {entry.derived.fatigueScore ?? "—"}</p>
        </div>

        <div className={`rounded-2xl border px-3 py-2 ${toneForGoalie(entry)}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">Goalie</p>
          <p className="mt-1 text-sm font-semibold">{formatGoalie(entry)}</p>
          <p className="mt-1 text-xs opacity-80">Derived flags: {entry.derived.goalie.alertFlags.length ? entry.derived.goalie.alertFlags.join(", ") : "none"}</p>
        </div>

        <div className="rounded-2xl border border-dark-border px-3 py-2 text-gray-300">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Playoff pressure</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatPressure(entry)}</p>
          <p className="mt-1 text-xs text-gray-500">{entry.derived.playoffPressure.reason}</p>
        </div>

        <div className="rounded-2xl border border-dark-border px-3 py-2 text-gray-300">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Official news</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatNews(entry)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {entry.sourced.news.items[0]
              ? entry.sourced.news.items[0].title
              : "Source stays optional until team-site coverage is more complete."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SystemNhlContextBoard({ board }: { board: NHLContextBoardResponse | null }) {
  if (!board || board.games.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-dark-border bg-dark-bg/50 p-4 text-sm text-gray-400">
        NHL context board unavailable for this request. Swaggy's stays definition-only instead of guessing urgency or goalie context.
      </div>
    );
  }

  const topGames = board.games.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
        <p className="text-sm font-semibold text-white">Live NHL context board</p>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          These are supporting rails for Swaggy's, not auto-bets. MoneyPuck and goalie/news inputs are sourced; rest, travel, fatigue, and playoff pressure are derived heuristics.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-400">
          <span className="rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">Games: {board.games.length}</span>
          <span className="rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">Built: {new Date(board.builtAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <span className="rounded-full border border-dark-border bg-dark-surface px-2.5 py-1">MoneyPuck: {board.meta.sources.moneyPuck.kind}</span>
        </div>
      </div>

      <div className="space-y-3">
        {topGames.map((game) => (
          <div key={game.gameId} className="rounded-[24px] border border-dark-border bg-[linear-gradient(180deg,#141821_0%,#0f131b_100%)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{game.matchup.awayTeam.abbrev} @ {game.matchup.homeTeam.abbrev}</p>
                <p className="mt-1 text-xs text-gray-500">{new Date(game.startTimeUTC).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <div className="rounded-full border border-dark-border bg-dark-bg/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                {game.gameState}
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <TeamContextCard entry={game.teams.away} />
              <TeamContextCard entry={game.teams.home} />
            </div>
          </div>
        ))}
      </div>

      {board.meta.notes.length > 0 && (
        <div className="rounded-2xl border border-dark-border/70 bg-dark-bg/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Board notes</p>
          <div className="mt-2 space-y-1.5 text-sm text-gray-400">
            {board.meta.notes.slice(0, 4).map((note) => <p key={note}>• {note}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}
