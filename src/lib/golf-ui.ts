import type {
  GolfLeaderboard,
  GolfPrediction,
  GolfPredictionBoard,
  GolfPredictionMarket,
  GolfTournament,
} from "@/lib/types";

function normalizeTournamentName(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isGolfMajor(name?: string) {
  const normalized = normalizeTournamentName(name);
  return normalized === "masters tournament"
    || normalized === "the masters"
    || normalized === "masters"
    || normalized === "pga championship"
    || normalized === "u s open"
    || normalized === "the open"
    || normalized === "open championship"
    || normalized === "the open championship";
}

export function getGolfTournamentBadgeLabel(
  tournament: GolfTournament,
  leaderboard?: GolfLeaderboard | null,
  mode: "default" | "season" = "default",
) {
  if (leaderboard?.tournament.id === tournament.id) {
    return leaderboard.statusBadge
      ?? (tournament.status === "completed" ? "Final" : tournament.current ? "LIVE" : "In Progress");
  }

  if (tournament.status === "completed") return "Final";
  if (mode === "season" && tournament.status === "in-progress") return "LIVE";
  if (mode === "season" && tournament.current && tournament.status === "upcoming") return "This Week";
  if (typeof tournament.round === "number" && tournament.round > 0) return `Round ${tournament.round}`;
  if (tournament.current && tournament.status === "upcoming") return "This Week";
  if (tournament.status === "upcoming") return "Upcoming";
  return "In Progress";
}

export function getGolfBadgeTone(tournament: GolfTournament) {
  if (tournament.status === "completed") return "border-white/10 bg-white/5 text-gray-200";
  if (tournament.status === "in-progress") return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
  if (tournament.current) return "border-sky-400/30 bg-sky-400/15 text-sky-100";
  return "border-amber-400/30 bg-amber-400/15 text-amber-100";
}

export function getGolfRowTone(tournament: GolfTournament) {
  if (tournament.status === "completed") return "border-white/8 bg-white/[0.03]";
  if (tournament.current || tournament.status === "in-progress") return "border-emerald-500/25 bg-emerald-500/10";
  return "border-white/8 bg-black/20";
}

export function formatGolfOdds(odds?: number | null) {
  if (typeof odds !== "number" || !Number.isFinite(odds)) return "Odds pending";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatGolfPercent(value?: number | null, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "NA";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatGolfHitRate(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "NA";
  return `${Math.round(value)}%`;
}

export function formatGolfSignedPercent(value?: number | null, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Model only";
  const percent = value * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(digits)}%`;
}

export function formatGolfUpdatedAt(value?: string | null) {
  if (!value) return "Update pending";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Update pending";
  return `${parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })} ET`;
}

export function getGolfPredictionSourceLabel(predictions?: GolfPredictionBoard | null) {
  const modelSource = predictions?.dataSources?.model;
  if (modelSource === "datagolf-hybrid") return "DataGolf + ESPN";
  if (modelSource === "espn-form") return "ESPN history model";
  return "Field pending";
}

export function getGolfPredictionProbability(player: GolfPrediction, market: GolfPredictionMarket) {
  if (market === "Tournament Winner") return player.modelProb;
  if (market === "Top 5 Finish") return player.top5Prob;
  if (market === "Top 10 Finish") return player.top10Prob;
  return player.top20Prob;
}
