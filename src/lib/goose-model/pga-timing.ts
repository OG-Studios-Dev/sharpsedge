// ============================================================
// PGA Timing Rules for Goose AI Picks Model
//
// Hard rules:
// - PGA picks must be generated/locked by Wednesday 10 PM ET of tournament week.
// - No PGA picks generated after Wednesday 10 PM ET for that tournament.
// - Tuesday and Wednesday are the priority days: cron should run PGA first.
// - Minimum outright winner odds: +200 (no chalk below this).
// - Hard max favorite odds cap: -200 (same as all other sports; golf outrights are
//   always plus-money so this is mostly a safety net).
// ============================================================

const ET_OFFSET_STANDARD = -5; // EST (UTC-5)
const ET_OFFSET_DAYLIGHT = -4; // EDT (UTC-4)
const PGA_CUTOFF_HOUR_ET = 22; // 10 PM ET
const PGA_CUTOFF_DAY     = 3;  // Wednesday (0=Sun, 1=Mon ... 3=Wed, 4=Thu)

/** Minimum outright winner odds for a PGA pick to qualify (American odds). */
export const PGA_OUTRIGHT_MIN_ODDS = 200; // +200

/** How many outright winner picks to generate per tournament. */
export const PGA_OUTRIGHT_WINNER_COUNT = 4;

/**
 * Best-effort ET offset. JS has no reliable built-in for arbitrary TZ,
 * so we use a simple DST heuristic (DST in effect Mar–Nov in the US).
 */
function getETOffset(utcDate: Date): number {
  const month = utcDate.getUTCMonth(); // 0-based
  // US DST: second Sunday of March → first Sunday of November
  // Approximation: months 3–10 (Apr–Oct) are always DST;
  // March and November need exact-day check, but simple month range is close enough
  // for cron scheduling purposes.
  if (month >= 3 && month <= 10) return ET_OFFSET_DAYLIGHT;
  return ET_OFFSET_STANDARD;
}

/** Convert a UTC Date to ET wall-clock components. */
function toET(utcDate: Date): { dayOfWeek: number; hour: number; minute: number } {
  const offset = getETOffset(utcDate);
  const etMs = utcDate.getTime() + offset * 3600 * 1000;
  const et = new Date(etMs);
  return {
    dayOfWeek: et.getUTCDay(),   // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    hour: et.getUTCHours(),
    minute: et.getUTCMinutes(),
  };
}

export interface PGATimingStatus {
  /** Is the current time inside the generation window (Mon–Wed before 10 PM ET)? */
  withinGenerationWindow: boolean;
  /** Should PGA be run first/with priority today? (Tue or Wed before 10 PM ET) */
  isPriorityDay: boolean;
  /** Is the Wednesday 10 PM cutoff already past for this week? */
  isPastCutoff: boolean;
  /** Day of week in ET (0=Sun…6=Sat) */
  dayOfWeekET: number;
  /** Hour in ET (0–23) */
  hourET: number;
  /** Human-readable description */
  reason: string;
}

/**
 * Returns the PGA generation timing status for a given UTC timestamp.
 * Drives decisions in the daily cron and manual generate triggers.
 */
export function getPGATimingStatus(now: Date = new Date()): PGATimingStatus {
  const { dayOfWeek, hour, minute } = toET(now);
  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek];

  // Past cutoff: Wednesday after 10 PM, or Thursday/Friday/Sat/Sun
  const isPastCutoff =
    (dayOfWeek === PGA_CUTOFF_DAY && hour >= PGA_CUTOFF_HOUR_ET) ||
    dayOfWeek === 4 || // Thu — tournament has started
    dayOfWeek === 5 || // Fri
    dayOfWeek === 6 || // Sat
    dayOfWeek === 0;   // Sun

  // Generation window: Mon (1), Tue (2), or Wed (3) before 10 PM ET
  const withinGenerationWindow =
    !isPastCutoff && (dayOfWeek >= 1 && dayOfWeek <= 3);

  // Priority days: Tue or Wed before cutoff (most data available, maximize signal)
  const isPriorityDay =
    withinGenerationWindow && (dayOfWeek === 2 || dayOfWeek === 3);

  let reason: string;
  if (isPastCutoff && dayOfWeek === PGA_CUTOFF_DAY) {
    reason = `Wednesday 10 PM ET cutoff has passed (${dayName} ${hour}:${String(minute).padStart(2, "0")} ET) — PGA picks locked for this tournament.`;
  } else if (isPastCutoff) {
    reason = `${dayName} — tournament is in progress. PGA picks already locked.`;
  } else if (isPriorityDay) {
    reason = `${dayName} is a priority PGA generation day — run PGA first with full analysis.`;
  } else if (withinGenerationWindow) {
    reason = `${dayName} is within the generation window but not a priority day.`;
  } else {
    reason = `${dayName} — no upcoming PGA tournament window detected.`;
  }

  return { withinGenerationWindow, isPriorityDay, isPastCutoff, dayOfWeekET: dayOfWeek, hourET: hour, reason };
}

/**
 * Returns true if PGA picks can still be generated right now.
 * Respects the Wednesday 10 PM ET hard cutoff.
 * Use this as a gate before any PGA generation call.
 */
export function canGeneratePGAPicksNow(now: Date = new Date()): boolean {
  return getPGATimingStatus(now).withinGenerationWindow;
}

/**
 * Returns the next Wednesday 10 PM ET cutoff as a UTC Date.
 * Useful for cron scheduling and UI display.
 */
export function getNextPGACutoff(now: Date = new Date()): Date {
  const { dayOfWeek, hour } = toET(now);
  const etOffset = getETOffset(now);

  // Days until next Wednesday
  let daysUntilWed = (PGA_CUTOFF_DAY - dayOfWeek + 7) % 7;
  // If today is Wednesday but before 10 PM, cutoff is tonight
  if (dayOfWeek === PGA_CUTOFF_DAY && hour < PGA_CUTOFF_HOUR_ET) daysUntilWed = 0;
  // If today is Wednesday but at or after 10 PM, cutoff is next Wednesday
  if (dayOfWeek === PGA_CUTOFF_DAY && hour >= PGA_CUTOFF_HOUR_ET) daysUntilWed = 7;

  const cutoffUTC = new Date(now);
  cutoffUTC.setUTCDate(cutoffUTC.getUTCDate() + daysUntilWed);
  // Set to 10 PM ET (expressed as UTC)
  cutoffUTC.setUTCHours(PGA_CUTOFF_HOUR_ET - etOffset, 0, 0, 0);
  return cutoffUTC;
}
