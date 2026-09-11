function dateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function learningResultsCutoff(
  now: Date = new Date(),
  timeZone = "America/Toronto",
  daysAhead = 2,
) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() + daysAhead);
  return dateKey(cutoff, timeZone);
}

export function filterLearningRowsToCutoff<T extends { pick_date?: string | null }>(
  rows: T[],
  cutoff: string,
) {
  return rows.filter((row) => !row.pick_date || row.pick_date <= cutoff);
}

export default { filterLearningRowsToCutoff, learningResultsCutoff };
