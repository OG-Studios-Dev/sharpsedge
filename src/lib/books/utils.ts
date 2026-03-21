import type { AggregatedBookOdds } from "@/lib/books/types";

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[+,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function decimalToAmerican(decimal: number | null | undefined): number | null {
  if (typeof decimal !== "number" || !Number.isFinite(decimal) || decimal <= 1) return null;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function normalizeAmericanOdds(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null || parsed === 0) return null;
  return Math.round(parsed);
}

export function isoNow() {
  return new Date().toISOString();
}

export function makeEmptyBookOdds(book: string, lastUpdated = isoNow()): AggregatedBookOdds {
  return {
    book,
    homeML: null,
    awayML: null,
    spread: null,
    spreadOdds: null,
    homeSpread: null,
    homeSpreadOdds: null,
    awaySpread: null,
    awaySpreadOdds: null,
    firstQuarterHomeSpread: null,
    firstQuarterHomeSpreadOdds: null,
    firstQuarterAwaySpread: null,
    firstQuarterAwaySpreadOdds: null,
    thirdQuarterHomeSpread: null,
    thirdQuarterHomeSpreadOdds: null,
    thirdQuarterAwaySpread: null,
    thirdQuarterAwaySpreadOdds: null,
    total: null,
    overOdds: null,
    underOdds: null,
    lastUpdated,
  };
}

export function parseSpreadDetails(
  details: string | undefined,
  homeTeam: string,
  awayTeam: string,
) {
  const raw = String(details || "").trim();
  if (!raw) return null;

  const match = raw.match(/(.+?)\s+([+-]?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const side = match[1].trim().toLowerCase();
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;

  if (side.includes(homeTeam.toLowerCase())) {
    return {
      homeSpread: line,
      awaySpread: line * -1,
    };
  }

  if (side.includes(awayTeam.toLowerCase())) {
    return {
      homeSpread: line * -1,
      awaySpread: line,
    };
  }

  return null;
}
