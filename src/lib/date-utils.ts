export const APP_TIME_ZONE = "America/Toronto";
export const NBA_TIME_ZONE = "America/New_York";
export const MLB_TIME_ZONE = "America/New_York";

export function getDateKey(date: Date = new Date(), timeZone = APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function getDateKeyWithOffset(offsetDays: number, timeZone = APP_TIME_ZONE) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return getDateKey(date, timeZone);
}

function getHourInTimeZone(date: Date, timeZone: string) {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  return parseInt(hourStr, 10);
}

export function shouldIncludeTomorrowGames(date: Date = new Date(), timeZone = APP_TIME_ZONE) {
  return getHourInTimeZone(date, timeZone) >= 23;
}

export function getPickDateKeys(date: Date = new Date(), timeZone = APP_TIME_ZONE) {
  const today = getDateKey(date, timeZone);
  if (!shouldIncludeTomorrowGames(date, timeZone)) {
    return [today];
  }

  const tomorrowDate = new Date(date);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  return [today, getDateKey(tomorrowDate, timeZone)];
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

/**
 * How many days ahead to show in schedule/picks/props.
 * Before 11 PM ET: show today only (0 days ahead).
 * After 11 PM ET: show today + tomorrow (1 day ahead).
 */
export function getScheduleDaysAhead(timeZone = APP_TIME_ZONE): number {
  return shouldIncludeTomorrowGames(new Date(), timeZone) ? 1 : 0;
}
