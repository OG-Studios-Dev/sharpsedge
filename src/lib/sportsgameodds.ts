const SPORTSGAMEODDS_BASE = "https://api.sportsgameodds.com/v2";

export type SportsGameOddsAccountUsage = {
  used?: number;
  remaining?: number;
  limit?: number;
  resetAt?: string | null;
  raw: unknown;
};

export type SportsGameOddsFetchResult<T> = {
  ok: boolean;
  status: number;
  url: string;
  data: T | null;
  error?: string;
  text?: string;
};

const LEAGUE_IDS: Record<string, string> = {
  NBA: "4",
  NHL: "5",
  MLB: "6",
  NFL: "7",
  PGA: "2",
  UFC: "10",
  EPL: "17",
  SERIE_A: "18",
  "SERIE A": "18",
};

function getApiKey(): string {
  const key = process.env.SPORTSGAMEODDS_API_KEY;
  if (!key) throw new Error("SPORTSGAMEODDS_API_KEY missing");
  return key;
}

function getLeagueId(sport: string): string | null {
  const normalized = String(sport || "NBA").toUpperCase();
  return LEAGUE_IDS[normalized] ?? null;
}

async function sgFetch<T>(path: string): Promise<SportsGameOddsFetchResult<T>> {
  const apiKey = getApiKey();
  const url = `${SPORTSGAMEODDS_BASE}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        accept: "application/json",
      },
      next: { revalidate: 300 },
    });

    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      data = null;
    }

    return {
      ok: res.ok,
      status: res.status,
      url,
      data,
      text,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      data: null,
      text: null as unknown as string,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getSportsGameOddsUsage(): Promise<SportsGameOddsFetchResult<SportsGameOddsAccountUsage>> {
  const result = await sgFetch<any>("/account/usage");
  const raw = result.data;

  const normalized: SportsGameOddsAccountUsage | null = raw
    ? {
        used: Number(raw.used ?? raw.objects_used ?? raw.current ?? raw.usage ?? 0) || 0,
        remaining: Number(raw.remaining ?? raw.objects_remaining ?? raw.left ?? 0) || 0,
        limit: Number(raw.limit ?? raw.monthly_limit ?? raw.objects_limit ?? 0) || 0,
        resetAt: raw.resetAt ?? raw.reset_at ?? raw.period_ends_at ?? null,
        raw,
      }
    : null;

  return {
    ...result,
    data: normalized,
  };
}

export async function getSportsGameOddsSample(sport = "NBA") {
  const normalized = String(sport || "NBA").toUpperCase();
  const leagueID = getLeagueId(normalized);
  const paths = leagueID
    ? [
        `/events?leagueID=${encodeURIComponent(leagueID)}`,
        `/odds?leagueID=${encodeURIComponent(leagueID)}`,
      ]
    : [
        `/events?league=${encodeURIComponent(normalized)}`,
        `/odds?league=${encodeURIComponent(normalized)}`,
      ];

  const attempts = [] as Array<{ path: string; ok: boolean; status: number; error?: string; text?: string; sampleSize: number }>;

  for (const path of paths) {
    const res = await sgFetch<any>(path);
    const payload = res.data;
    const sampleSize = Array.isArray(payload)
      ? payload.length
      : Array.isArray(payload?.data)
      ? payload.data.length
      : Array.isArray(payload?.results)
      ? payload.results.length
      : payload && typeof payload === "object"
      ? Object.keys(payload).length
      : 0;

    attempts.push({ path, ok: res.ok, status: res.status, error: res.error, text: res.text?.slice(0, 400), sampleSize });

    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        path,
        leagueID,
        attempts,
        sample: payload,
      };
    }
  }

  return {
    ok: false,
    status: attempts[0]?.status ?? 0,
    path: null,
    leagueID,
    attempts,
    sample: null,
  };
}
