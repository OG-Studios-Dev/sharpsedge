import type { NFLGame } from "@/lib/nfl-api";

export type NFLWeekSummary = {
  number: number | null;
  label: string;
  dateRange: string | null;
  gameCount: number;
  startDate: string | null;
  endDate: string | null;
};

const TORONTO_TIME_ZONE = "America/Toronto";

export function normalizeNFLWeekParam(value: string | null | undefined): number | null {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(normalized)) return null;
  const week = Number(normalized);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : null;
}

function dateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function rangeLabel(start: Date, end: Date) {
  const left = dateParts(start);
  const right = dateParts(end);
  if (left.year === right.year && left.month === right.month) {
    return `${left.month} ${left.day}–${right.day}`;
  }
  return `${left.month} ${left.day}–${right.month} ${right.day}`;
}

export function nflWeekSummary(games: NFLGame[]): NFLWeekSummary {
  const datedGames = games
    .map((game) => ({ game, date: new Date(game.date) }))
    .filter(({ date }) => Number.isFinite(date.getTime()))
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  if (datedGames.length === 0) {
    return {
      number: null,
      label: "NFL Week",
      dateRange: null,
      gameCount: 0,
      startDate: null,
      endDate: null,
    };
  }

  const number = games
    .map((game) => Number(String(game.week || "").match(/\d+/)?.[0]))
    .find((value) => Number.isInteger(value) && value > 0) ?? null;
  const start = datedGames[0].date;
  const end = datedGames[datedGames.length - 1].date;

  return {
    number,
    label: number ? `Week ${number}` : "NFL Week",
    dateRange: rangeLabel(start, end),
    gameCount: games.length,
    startDate: dateKey(start),
    endDate: dateKey(end),
  };
}

export default { nflWeekSummary, normalizeNFLWeekParam };
