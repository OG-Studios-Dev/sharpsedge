export function normalizeToken(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeNullableToken(value: string | null | undefined): string | null {
  const normalized = normalizeToken(value);
  return normalized || null;
}

export function normalizeDisplayText(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text || null;
}

export function normalizeSide(value: string | null | undefined): string {
  return normalizeToken(value) || "unknown";
}

export function normalizeLine(value: number | string | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(1);
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed.toFixed(1);
  }
  return "na";
}

export function normalizeBook(value: string | null | undefined): string {
  return normalizeToken(value) || "unknown-book";
}

export function normalizeParticipantKey(participantId: string | null | undefined, participantName: string | null | undefined): string {
  return normalizeNullableToken(participantId) ?? normalizeNullableToken(participantName) ?? "field";
}

export function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toDateKey(value: string | Date | null | undefined): string {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 10) : "unknown-date";
}

export function toHourBucket(value: string | Date | null | undefined): string {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 13) : "unknown-hour";
}

export function toMinuteBucket(value: string | Date | null | undefined): string {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 16) : "unknown-minute";
}
