import parkFactorsSeed from "@/data/mlb-park-factors.json";

export type MLBParkFactorRow = {
  teamAbbrev: string;
  teamId: number;
  venueId: number;
  venueName: string;
  year: number;
  window: string;
  samplePlateAppearances: number;
  metrics: {
    runs: number;
    hits: number;
    homeRuns: number;
    strikeouts: number;
    walks: number;
    singles: number;
    doubles: number;
    triples: number;
    onBase: number;
    woba: number;
    wobaContact: number;
    expectedWobaContact: number;
    xbhOnContact: number;
    hardHit: number;
  };
  source: string;
  sourceUrl: string;
};

export type MLBParkFactorSnapshot = {
  status: "available" | "missing";
  teamAbbrev: string;
  venueName?: string;
  environment?: "hitter" | "pitcher" | "neutral";
  summary?: string;
  source: {
    provider: string;
    url: string;
    seededAt: string;
    season: number | null;
    window?: string;
  };
  metrics: MLBParkFactorRow["metrics"] | null;
  samplePlateAppearances?: number;
  note?: string;
};

const rows = (parkFactorsSeed.rows ?? []) as MLBParkFactorRow[];
const byTeam = new Map(rows.map((row) => [row.teamAbbrev, row]));

function describeEnvironment(runIndex: number) {
  if (runIndex >= 105) return { environment: "hitter" as const, summary: "boosts run scoring" };
  if (runIndex <= 95) return { environment: "pitcher" as const, summary: "suppresses run scoring" };
  return { environment: "neutral" as const, summary: "plays close to neutral" };
}

export function getMLBParkFactor(teamAbbrev: string): MLBParkFactorSnapshot {
  const row = byTeam.get(teamAbbrev);
  if (!row) {
    return {
      status: "missing",
      teamAbbrev,
      metrics: null,
      note: "No seeded park-factor row is available for this current venue yet. Keep the board honest and treat park context as unavailable instead of guessed.",
      source: {
        provider: parkFactorsSeed.source,
        url: parkFactorsSeed.sourceUrl,
        seededAt: parkFactorsSeed.generatedAt,
        season: null,
      },
    };
  }

  const descriptor = describeEnvironment(row.metrics.runs);
  return {
    status: "available",
    teamAbbrev,
    venueName: row.venueName,
    environment: descriptor.environment,
    summary: `${row.venueName} ${descriptor.summary} (runs index ${row.metrics.runs}).`,
    metrics: row.metrics,
    samplePlateAppearances: row.samplePlateAppearances,
    source: {
      provider: row.source,
      url: row.sourceUrl,
      seededAt: parkFactorsSeed.generatedAt,
      season: row.year,
      window: row.window,
    },
  };
}
