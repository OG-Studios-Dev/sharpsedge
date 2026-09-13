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

export function buildCandidatePagePath({ date, sport, capturedAfter, select, limit, offset }) {
  const params = new URLSearchParams({
    select,
    event_date: `eq.${date}`,
    order: "candidate_id.asc",
    limit: String(limit),
    offset: String(offset),
  });
  if (sport) params.set("sport", `eq.${sport}`);
  if (capturedAfter) params.set("capture_ts", `gte.${capturedAfter}`);
  return `/goose_market_candidates?${params.toString()}`;
}

export default { buildCandidatePagePath, filterRowsBySport, normalizeScoreSport };
