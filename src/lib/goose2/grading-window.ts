function dateKeyUTC(now: Date, offsetDays = 0) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function goose2GradeEventDates(explicitDate?: string, lookbackDays = 3, now = new Date()) {
  if (explicitDate) return [explicitDate];
  const days = Math.min(Math.max(Number(lookbackDays) || 3, 1), 7);
  return Array.from({ length: days }, (_, index) => dateKeyUTC(now, -index));
}

export default { goose2GradeEventDates };
