export const APP_TIME_ZONE = "America/Toronto";
export const NBA_TIME_ZONE = "America/New_York";

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

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}
