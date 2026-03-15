import { BookOdds } from "@/lib/types";

function sameLine(left: number, right?: number) {
  if (typeof right !== "number" || !Number.isFinite(right)) return false;
  return Math.abs(left - right) < 0.001;
}

export function sameBookOdds(left: BookOdds, right: BookOdds) {
  return left.book === right.book && left.odds === right.odds && sameLine(left.line, right.line);
}

export function formatAmericanOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatOddsLine(line?: number | null) {
  if (typeof line !== "number" || !Number.isFinite(line) || line === 0) return "-";
  return Number.isInteger(line) ? String(line) : line.toFixed(1);
}

export function sortBookOdds(offers: BookOdds[]) {
  return [...offers].sort((left, right) => (
    right.odds - left.odds
    || left.impliedProbability - right.impliedProbability
    || left.book.localeCompare(right.book)
  ));
}

export function getComparableBookOdds(offers: BookOdds[], line?: number) {
  const sorted = sortBookOdds(offers);
  if (typeof line !== "number" || !Number.isFinite(line)) return sorted;

  const matchingLine = sorted.filter((offer) => sameLine(offer.line, line));
  return matchingLine.length > 0 ? matchingLine : sorted;
}

export function sortBookOddsForDisplay(offers: BookOdds[], line?: number) {
  const comparable = getComparableBookOdds(offers, line);
  const remainder = sortBookOdds(
    offers.filter((offer) => !comparable.some((candidate) => sameBookOdds(candidate, offer))),
  );

  return [...comparable, ...remainder];
}

export function resolveSelectedBookOdds(
  offers: BookOdds[],
  selected?: { book?: string; odds?: number; line?: number },
) {
  const sorted = getComparableBookOdds(offers, selected?.line);
  const matched = sorted.find((offer) => (
    offer.book === selected?.book
    && offer.odds === selected?.odds
    && (typeof selected?.line !== "number" || sameLine(offer.line, selected.line))
  ));

  return matched || sorted[0] || null;
}

function payoutPerDollar(odds: number) {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

export function describeBookSavings(
  offers: BookOdds[],
  selected?: { book?: string; odds?: number; line?: number },
) {
  const comparable = getComparableBookOdds(offers, selected?.line);
  const best = resolveSelectedBookOdds(comparable, selected);
  if (!best) return null;

  const comparison = comparable.find((offer) => !sameBookOdds(offer, best));
  if (!comparison) return null;

  const centsPerDollar = Math.round((payoutPerDollar(best.odds) - payoutPerDollar(comparison.odds)) * 100);
  if (centsPerDollar <= 0) return null;

  return {
    best,
    comparison,
    centsPerDollar,
  };
}

export function hasAlternateBookLines(offers: BookOdds[]) {
  const uniqueLines = new Set(
    offers
      .map((offer) => offer.line)
      .filter((line) => Number.isFinite(line))
      .map((line) => Number(line.toFixed(1))),
  );

  return uniqueLines.size > 1;
}
