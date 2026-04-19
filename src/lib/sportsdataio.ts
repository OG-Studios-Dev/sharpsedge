const SPORTS_DATA_IO_BASES: Record<string, string> = {
  NFL: "https://api.sportsdata.io/v3/nfl",
  NBA: "https://api.sportsdata.io/v3/nba",
  MLB: "https://api.sportsdata.io/v3/mlb",
  NHL: "https://api.sportsdata.io/v3/nhl",
};

function getSportsDataIoKeys() {
  const raw = [
    process.env.SPORTSDATAIO_API_KEYS,
    process.env.SPORTSDATAIO_API_KEY,
    process.env.SPORTS_DATA_IO_API_KEYS,
    process.env.SPORTS_DATA_IO_API_KEY,
  ]
    .filter(Boolean)
    .join(",");

  return Array.from(new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

export function getSportsDataIoBaseUrl(sport: string) {
  return SPORTS_DATA_IO_BASES[String(sport || "").toUpperCase()] ?? null;
}

export async function fetchSportsDataIoJson<T>(sport: string, path: string): Promise<T> {
  const keys = getSportsDataIoKeys();
  const baseUrl = getSportsDataIoBaseUrl(sport);
  if (!keys.length) throw new Error("Missing SportsData.io API key env for SportsData.io");
  if (!baseUrl) throw new Error(`Unsupported SportsData.io sport: ${sport}`);

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  let lastError = "SportsData.io request failed before attempt";

  for (const key of keys) {
    const response = await fetch(`${baseUrl}${normalizedPath}`, {
      headers: {
        "Ocp-Apim-Subscription-Key": key,
      },
      cache: "no-store",
    });

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    const text = await response.text().catch(() => "");
    lastError = `SportsData.io error ${response.status}: ${text.slice(0, 300)}`;
    if (![401, 403, 429].includes(response.status)) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}
