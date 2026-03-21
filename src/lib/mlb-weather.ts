import { getMLBStadiumForGame } from "@/lib/mlb-stadiums";
import type { MLBGame } from "@/lib/types";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const WEATHER_TTL_MS = 20 * 60 * 1000;

type WeatherCacheEntry = {
  timestamp: number;
  data: MLBWeatherSnapshot;
};

const weatherCache = new Map<string, WeatherCacheEntry>();

export type MLBWeatherSnapshot = {
  status: "available" | "indoor" | "unavailable";
  gameTimeLocal?: string;
  forecast: {
    temperatureF: number | null;
    precipitationProbability: number | null;
    windSpeedMph: number | null;
    windDirectionDeg: number | null;
  } | null;
  venue: {
    name: string;
    roofType: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    weatherEligible: boolean;
  } | null;
  source: {
    provider: string;
    url: string | null;
    fetchedAt: string;
    staleAfter: string;
  };
  note?: string;
};

function cToF(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number((value * 9 / 5 + 32).toFixed(1));
}

function roundOrNull(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(1));
}

function getGameTimeLocal(startTimeUTC: string, timeZone: string) {
  const date = new Date(startTimeUTC);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function buildSnapshot(params: Partial<MLBWeatherSnapshot>): MLBWeatherSnapshot {
  const fetchedAt = params.source?.fetchedAt ?? new Date().toISOString();
  const staleAfter = params.source?.staleAfter ?? new Date(Date.now() + WEATHER_TTL_MS).toISOString();
  return {
    status: params.status ?? "unavailable",
    gameTimeLocal: params.gameTimeLocal,
    forecast: params.forecast ?? null,
    venue: params.venue ?? null,
    note: params.note,
    source: {
      provider: params.source?.provider ?? "Open-Meteo",
      url: params.source?.url ?? null,
      fetchedAt,
      staleAfter,
    },
  };
}

export async function getMLBWeatherForGame(game: MLBGame): Promise<MLBWeatherSnapshot> {
  const stadium = getMLBStadiumForGame(game);
  const nowIso = new Date().toISOString();
  const staleAfter = new Date(Date.now() + WEATHER_TTL_MS).toISOString();

  if (!stadium) {
    return buildSnapshot({
      status: "unavailable",
      note: "No stadium coordinate mapping is available for this venue yet.",
      source: { provider: "Open-Meteo", url: null, fetchedAt: nowIso, staleAfter },
    });
  }

  const venue = {
    name: stadium.venueName,
    roofType: stadium.roofType,
    latitude: stadium.latitude,
    longitude: stadium.longitude,
    city: stadium.city,
    state: stadium.state,
    weatherEligible: stadium.weatherEligible,
  };

  if (!stadium.weatherEligible || stadium.roofType === "fixed_dome") {
    return buildSnapshot({
      status: "indoor",
      venue,
      note: `${stadium.venueName} is treated as an indoor venue for this board, so outdoor weather is intentionally not applied.`,
      source: { provider: "Open-Meteo", url: null, fetchedAt: nowIso, staleAfter },
    });
  }

  const gameTimeLocal = getGameTimeLocal(game.startTimeUTC, stadium.timeZone);
  if (!gameTimeLocal) {
    return buildSnapshot({
      status: "unavailable",
      venue,
      note: "Game start time is missing, so the weather slot could not be aligned.",
      source: { provider: "Open-Meteo", url: null, fetchedAt: nowIso, staleAfter },
    });
  }

  const cacheKey = `${stadium.teamAbbrev}:${game.date}:${gameTimeLocal}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEATHER_TTL_MS) {
    return cached.data;
  }

  const url = `${OPEN_METEO_BASE}?latitude=${stadium.latitude}&longitude=${stadium.longitude}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m&forecast_days=2&timezone=${encodeURIComponent(stadium.timeZone)}`;

  try {
    const res = await fetch(url, { next: { revalidate: Math.round(WEATHER_TTL_MS / 1000) } });
    if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
    const payload = await res.json() as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
      };
    };

    const timeIndex = payload.hourly?.time?.findIndex((time) => time === gameTimeLocal) ?? -1;
    if (timeIndex < 0) {
      const snapshot = buildSnapshot({
        status: "unavailable",
        venue,
        gameTimeLocal,
        note: "Open-Meteo returned a forecast window, but no exact hourly slot matched first pitch.",
        source: { provider: "Open-Meteo", url, fetchedAt: nowIso, staleAfter },
      });
      weatherCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });
      return snapshot;
    }

    const snapshot = buildSnapshot({
      status: "available",
      venue,
      gameTimeLocal,
      forecast: {
        temperatureF: cToF(payload.hourly?.temperature_2m?.[timeIndex]),
        precipitationProbability: roundOrNull(payload.hourly?.precipitation_probability?.[timeIndex]),
        windSpeedMph: roundOrNull(payload.hourly?.wind_speed_10m?.[timeIndex]),
        windDirectionDeg: roundOrNull(payload.hourly?.wind_direction_10m?.[timeIndex]),
      },
      note: stadium.roofType === "retractable"
        ? "Retractable-roof venue: outdoor forecast is useful context, but actual roof status is not confirmed in this pass."
        : undefined,
      source: { provider: "Open-Meteo", url, fetchedAt: nowIso, staleAfter },
    });

    weatherCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });
    return snapshot;
  } catch (error) {
    const snapshot = buildSnapshot({
      status: "unavailable",
      venue,
      gameTimeLocal,
      note: error instanceof Error ? error.message : "Weather lookup failed.",
      source: { provider: "Open-Meteo", url, fetchedAt: nowIso, staleAfter },
    });
    weatherCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });
    return snapshot;
  }
}
