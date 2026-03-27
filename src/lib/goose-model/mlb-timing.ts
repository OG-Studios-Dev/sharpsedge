// ============================================================
// MLB Season Timing Utility for Goose AI Picks Model
//
// MLB regular season: Opening Day (late March) → early October
// Playoffs: October–November (not targeted for picks in current build)
//
// The MLB season calendar is more predictable than PGA (week-by-week
// tournament windows) but less predictable than NBA/NHL (no mid-season gap).
//
// Key behaviors:
// - Between November 1 and mid-March: off-season, MLB picks skip
// - Opening Day onward: picks enabled; no day-of-week restriction
// - No pre-game cutoff: picks can generate any time game day is active
//
// Off-season detection is date-only (no ET cutoff needed like PGA).
// ============================================================

// MLB regular season typically runs March 27–October 5 (±1 week)
// We use month-based bounds that are safe across years.
// JavaScript Date months are 0-indexed: Jan=0, Feb=1, Mar=2, Apr=3 ... Oct=9, Nov=10
const MLB_SEASON_START_MONTH = 2;  // March (0-indexed: 0=Jan, 1=Feb, 2=Mar)
const MLB_SEASON_START_DAY   = 20; // ~Opening Day window (late March)
const MLB_SEASON_END_MONTH   = 10; // November (0-indexed: 10=Nov) — post-WS end
const MLB_SEASON_END_DAY     = 1;  // After WS ends early-to-mid Oct, safe cutoff Nov 1

export interface MLBSeasonTimingStatus {
  /** Is today within the MLB regular season window? */
  inSeason: boolean;
  /** Month (0-indexed) in ET */
  monthET: number;
  /** Day of month in ET */
  dayET: number;
  /** Human-readable status */
  reason: string;
}

function getETOffset(utcDate: Date): number {
  const month = utcDate.getUTCMonth();
  // DST approximation: April–October = EDT (UTC-4), else EST (UTC-5)
  return month >= 3 && month <= 10 ? -4 : -5;
}

function toETDate(utcDate: Date): { month: number; day: number } {
  const offset = getETOffset(utcDate);
  const etMs = utcDate.getTime() + offset * 3600 * 1000;
  const et = new Date(etMs);
  return {
    month: et.getUTCMonth(),  // 0-indexed
    day: et.getUTCDate(),
  };
}

/**
 * Returns MLB season timing status for a given UTC timestamp.
 * inSeason=true when the regular season calendar window is active.
 */
export function getMLBSeasonTimingStatus(now: Date = new Date()): MLBSeasonTimingStatus {
  const { month, day } = toETDate(now);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // In-season: March 20 – November 1
  const afterStart =
    month > MLB_SEASON_START_MONTH ||
    (month === MLB_SEASON_START_MONTH && day >= MLB_SEASON_START_DAY);

  const beforeEnd =
    month < MLB_SEASON_END_MONTH ||
    (month === MLB_SEASON_END_MONTH && day < MLB_SEASON_END_DAY);

  const inSeason = afterStart && beforeEnd;

  let reason: string;
  if (inSeason) {
    reason = `MLB regular season active (${monthNames[month]} ${day}).`;
  } else if (!afterStart) {
    reason = `Off-season — MLB regular season begins ~March 20 (currently ${monthNames[month]} ${day}).`;
  } else {
    reason = `Post-season concluded — MLB off-season until ~March 20 (currently ${monthNames[month]} ${day}).`;
  }

  return { inSeason, monthET: month, dayET: day, reason };
}

/**
 * Returns true if MLB picks can be generated today.
 * Use this as an off-season gate in generate-daily and manual triggers.
 */
export function canGenerateMLBPicksNow(now: Date = new Date()): boolean {
  return getMLBSeasonTimingStatus(now).inSeason;
}
