const SUPPORTED_SCORE_SPORTS = new Set(["NHL", "NBA", "MLB", "NFL", "PGA"]);

export function normalizeScoreSport(value) {
  if (value == null || String(value).trim() === "") return null;
  const normalized = String(value).trim().toUpperCase();
  if (!SUPPORTED_SCORE_SPORTS.has(normalized)) {
    throw new Error(`Unsupported score sport: ${value}`);
  }
  return normalized;
}

export function filterRowsBySport(rows, sport) {
  if (!sport) return rows;
  return rows.filter((row) => String(row?.sport ?? "").toUpperCase() === sport);
}

export default { filterRowsBySport, normalizeScoreSport };
