const SPORTS_DATA_IO_BASES: Record<string, string> = {
  NFL: "https://api.sportsdata.io/v3/nfl",
  NBA: "https://api.sportsdata.io/v3/nba",
  MLB: "https://api.sportsdata.io/v3/mlb",
  NHL: "https://api.sportsdata.io/v3/nhl",
};

function getSportsDataIoKey() {
  return process.env.SPORTSGAMEODDS_API_KEY?.trim() || null;
}

export function getSportsDataIoBaseUrl(sport: string) {
  return SPORTS_DATA_IO_BASES[String(sport || "").toUpperCase()] ?? null;
}

export async function fetchSportsDataIoJson<T>(sport: string, path: string): Promise<T> {
  const key = getSportsDataIoKey();
  const baseUrl = getSportsDataIoBaseUrl(sport);
  if (!key) throw new Error("Missing SPORTSGAMEODDS_API_KEY for SportsData.io");
  if (!baseUrl) throw new Error(`Unsupported SportsData.io sport: ${sport}`);

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${baseUrl}${normalizedPath}`, {
    headers: {
      "Ocp-Apim-Subscription-Key": key,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SportsData.io error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}
