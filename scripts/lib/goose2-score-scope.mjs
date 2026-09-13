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

export function buildCandidatePagePath({ date, sport, capturedAfter, capturedAt, select, limit, offset }) {
  const params = new URLSearchParams({
    select,
    event_date: `eq.${date}`,
    order: "candidate_id.asc",
    limit: String(limit),
    offset: String(offset),
  });
  if (sport) params.set("sport", `eq.${sport}`);
  if (capturedAt) params.set("capture_ts", `eq.${capturedAt}`);
  else if (capturedAfter) params.set("capture_ts", `gte.${capturedAfter}`);
  return `/goose_market_candidates?${params.toString()}`;
}

export function buildLatestCandidateCapturePath({ date, sport, capturedAfter }) {
  const params = new URLSearchParams({
    select: "capture_ts",
    event_date: `eq.${date}`,
    capture_ts: `gte.${capturedAfter}`,
    order: "capture_ts.desc",
    limit: "1",
  });
  if (sport) params.set("sport", `eq.${sport}`);
  return `/goose_market_candidates?${params.toString()}`;
}

export default { buildCandidatePagePath, buildLatestCandidateCapturePath, filterRowsBySport, normalizeScoreSport };
