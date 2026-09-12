function torontoYearMonth(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month") => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month") };
}

export function resolveNFLSeasonStart(now: Date = new Date(), hasActiveSchedule = false) {
  const { year, month } = torontoYearMonth(now);
  const seasonYear = month >= 9
    ? year
    : hasActiveSchedule && month <= 2
      ? year - 1
      : year;
  return new Date(Date.UTC(seasonYear, 8, 1, 4));
}

export default { resolveNFLSeasonStart };
