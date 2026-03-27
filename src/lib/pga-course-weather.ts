/**
 * PGA Course Weather — Open-Meteo forecast for PGA Tour tournament venues.
 *
 * Uses the same Open-Meteo free API already trusted for MLB weather.
 * Fetches hourly forecast for the course location during tournament rounds.
 *
 * Source strategy:
 *   - Primary: Open-Meteo hourly forecast (lat/lon → free, no API key)
 *   - Venue coordinates: hardcoded database of known PGA Tour courses
 *   - Tournament name → venue mapping via datagolf-cache tournament string
 *
 * Golf weather significance:
 *   - Wind > 15 mph: scoring averages rise ~0.5–1.5 strokes/round
 *   - Rain / wet conditions: affects grip, ball flight, green speeds
 *   - Temperature < 50°F: affects distance, player comfort
 *   - Wind direction matters at Augusta (Amen Corner), Pebble, etc.
 *
 * Design: additive context only — weather signals supplement DG skill data,
 * not replace it. Course-fit scores already partially encode historical
 * weather sensitivity per player.
 */

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const WEATHER_TTL_MS = 30 * 60 * 1000; // 30 min cache

type WeatherCacheEntry = {
  timestamp: number;
  data: PGACourseWeather;
};

const weatherCache = new Map<string, WeatherCacheEntry>();

// ── Venue database ─────────────────────────────────────────────────────────

export type PGAVenueEntry = {
  courseName: string;
  tournamentKeywords: string[]; // lower-case substrings to match tournament name
  latitude: number;
  longitude: number;
  timezone: string;
  city: string;
  state: string;
  notes?: string;
};

/**
 * Known PGA Tour course coordinates.
 * Match via tournamentKeywords against DG cache tournament name (case-insensitive, substring).
 *
 * Add new venues at the bottom as they come up. Do not remove existing entries.
 */
export const PGA_VENUES: PGAVenueEntry[] = [
  {
    courseName: "Augusta National Golf Club",
    tournamentKeywords: ["masters", "augusta"],
    latitude: 33.5021,
    longitude: -82.0232,
    timezone: "America/New_York",
    city: "Augusta",
    state: "GA",
    notes: "Augusta National — wind on Amen Corner (holes 11–13) is primary weather factor",
  },
  {
    courseName: "TPC Sawgrass (Stadium Course)",
    tournamentKeywords: ["players championship", "tpc sawgrass", "sawgrass"],
    latitude: 30.1977,
    longitude: -81.3948,
    timezone: "America/New_York",
    city: "Ponte Vedra Beach",
    state: "FL",
  },
  {
    courseName: "Pebble Beach Golf Links",
    tournamentKeywords: ["pebble beach", "at&t pro-am", "at&t pebble"],
    latitude: 36.5685,
    longitude: -121.9508,
    timezone: "America/Los_Angeles",
    city: "Pebble Beach",
    state: "CA",
    notes: "Pacific coastal wind — highly weather-sensitive",
  },
  {
    courseName: "TPC Houston (Memorial Park)",
    tournamentKeywords: ["houston", "texas children", "memorial park"],
    latitude: 29.7656,
    longitude: -95.4307,
    timezone: "America/Chicago",
    city: "Houston",
    state: "TX",
  },
  {
    courseName: "Bay Hill Club",
    tournamentKeywords: ["bay hill", "arnold palmer", "orlando"],
    latitude: 28.4831,
    longitude: -81.4980,
    timezone: "America/New_York",
    city: "Orlando",
    state: "FL",
  },
  {
    courseName: "Riviera Country Club",
    tournamentKeywords: ["riviera", "genesis invitational", "los angeles open"],
    latitude: 34.0497,
    longitude: -118.5186,
    timezone: "America/Los_Angeles",
    city: "Pacific Palisades",
    state: "CA",
  },
  {
    courseName: "Torrey Pines (South Course)",
    tournamentKeywords: ["torrey pines", "san diego", "farmers insurance"],
    latitude: 32.8997,
    longitude: -117.2534,
    timezone: "America/Los_Angeles",
    city: "La Jolla",
    state: "CA",
    notes: "Pacific coastal — morning marine layer, afternoon wind",
  },
  {
    courseName: "Valhalla Golf Club",
    tournamentKeywords: ["valhalla", "pga championship", "louisville"],
    latitude: 38.2542,
    longitude: -85.3977,
    timezone: "America/New_York",
    city: "Louisville",
    state: "KY",
  },
  {
    courseName: "Pinehurst No. 2",
    tournamentKeywords: ["pinehurst", "us open pinehurst", "north carolina open"],
    latitude: 35.1948,
    longitude: -79.4728,
    timezone: "America/New_York",
    city: "Pinehurst",
    state: "NC",
  },
  {
    courseName: "Muirfield Village Golf Club",
    tournamentKeywords: ["memorial tournament", "muirfield", "dublin ohio"],
    latitude: 40.1014,
    longitude: -83.1297,
    timezone: "America/New_York",
    city: "Dublin",
    state: "OH",
  },
  {
    courseName: "Colonial Country Club",
    tournamentKeywords: ["charles schwab", "colonial", "fort worth"],
    latitude: 32.7266,
    longitude: -97.3744,
    timezone: "America/Chicago",
    city: "Fort Worth",
    state: "TX",
  },
  {
    courseName: "Detroit Golf Club",
    tournamentKeywords: ["rocket mortgage", "detroit", "michigan"],
    latitude: 42.3890,
    longitude: -83.0862,
    timezone: "America/Detroit",
    city: "Detroit",
    state: "MI",
  },
  {
    courseName: "TPC Scottsdale (Stadium Course)",
    tournamentKeywords: ["waste management", "phoenix open", "scottsdale", "phoenix"],
    latitude: 33.6611,
    longitude: -111.8971,
    timezone: "America/Phoenix",
    city: "Scottsdale",
    state: "AZ",
  },
  {
    courseName: "TPC Twin Cities",
    tournamentKeywords: ["3m open", "tpc twin cities", "minnesota"],
    latitude: 45.1058,
    longitude: -93.5208,
    timezone: "America/Chicago",
    city: "Blaine",
    state: "MN",
  },
  {
    courseName: "Quail Hollow Club",
    tournamentKeywords: ["wells fargo", "quail hollow", "charlotte"],
    latitude: 35.1817,
    longitude: -80.8073,
    timezone: "America/New_York",
    city: "Charlotte",
    state: "NC",
  },
  {
    courseName: "East Lake Golf Club",
    tournamentKeywords: ["tour championship", "east lake", "atlanta"],
    latitude: 33.7326,
    longitude: -84.2898,
    timezone: "America/New_York",
    city: "Atlanta",
    state: "GA",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────

export type PGACourseWeather = {
  status: "available" | "unavailable" | "no_venue_match";
  venue: {
    courseName: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    notes?: string;
  } | null;
  /** Weather at tournament start window (10am local default if game time unavailable) */
  roundForecast: {
    temperatureF: number | null;
    windSpeedMph: number | null;
    windDirectionDeg: number | null;
    precipitationProbability: number | null;
  } | null;
  /** Derived flags for signal tagging */
  conditions: {
    isWindy: boolean;        // wind > 15 mph
    isVeryWindy: boolean;    // wind > 25 mph
    isCold: boolean;         // temp < 50°F
    isWarm: boolean;         // temp > 80°F
    isWet: boolean;          // precip prob > 40%
    isGoodConditions: boolean; // not windy, not wet, not cold
  };
  /** Auto-signals from weather conditions */
  auto_signals: string[];
  note?: string;
  fetchedAt: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normTournament(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function findVenueForTournament(tournamentName: string | null | undefined): PGAVenueEntry | null {
  if (!tournamentName) return null;
  const norm = normTournament(tournamentName);
  return PGA_VENUES.find((v) =>
    v.tournamentKeywords.some((kw) => norm.includes(kw)),
  ) ?? null;
}

function cToF(val: number | null | undefined): number | null {
  if (val == null || !Number.isFinite(val)) return null;
  return Number((val * 9 / 5 + 32).toFixed(1));
}

function kphToMph(val: number | null | undefined): number | null {
  if (val == null || !Number.isFinite(val)) return null;
  return Number((val * 0.621371).toFixed(1));
}

function roundOrNull(val: number | null | undefined): number | null {
  if (val == null || !Number.isFinite(val)) return null;
  return Number(val.toFixed(1));
}

/**
 * Find the floor hourly slot for a given local time string (YYYY-MM-DDTHH:MM).
 * Open-Meteo returns hourly slots (HH:00); game/round times are rarely on the hour.
 */
function findFloorTimeIndex(times: string[], targetLocalTime: string): number {
  let idx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= targetLocalTime) idx = i;
    else break;
  }
  return idx;
}

/** Build today's 10am local time for the venue as a default round slot. */
function getTodayRoundSlot(timezone: string, offsetHours = 10): string {
  const now = new Date();
  const localStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localStr}T${pad(offsetHours)}:00`;
}

function buildConditions(roundForecast: PGACourseWeather["roundForecast"]): PGACourseWeather["conditions"] {
  const wind = roundForecast?.windSpeedMph ?? 0;
  const temp = roundForecast?.temperatureF ?? 72;
  const precip = roundForecast?.precipitationProbability ?? 0;

  const isWindy = wind > 15;
  const isVeryWindy = wind > 25;
  const isCold = temp < 50;
  const isWarm = temp > 80;
  const isWet = precip > 40;
  const isGoodConditions = !isWindy && !isWet && !isCold;

  return { isWindy, isVeryWindy, isCold, isWarm, isWet, isGoodConditions };
}

function buildAutoSignals(conditions: PGACourseWeather["conditions"]): string[] {
  const signals: string[] = [];
  if (conditions.isVeryWindy) signals.push("course_very_windy");
  else if (conditions.isWindy) signals.push("course_windy");
  if (conditions.isWet) signals.push("course_wet_conditions");
  if (conditions.isCold) signals.push("course_cold_conditions");
  if (conditions.isGoodConditions) signals.push("course_good_conditions");
  return signals;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Fetch Open-Meteo weather for a PGA Tour tournament.
 * Uses venue coordinates from the hardcoded database.
 * Safe to call per pick — uses an in-process cache (30-min TTL).
 *
 * @param tournamentName  Current tournament name (from DG cache)
 * @param localRoundTime  Optional local time slot to fetch (YYYY-MM-DDTHH:MM);
 *                        defaults to 10am local at the venue (morning round window)
 */
export async function getPGACourseWeather(
  tournamentName: string | null | undefined,
  localRoundTime?: string | null,
): Promise<PGACourseWeather> {
  const fetchedAt = new Date().toISOString();

  const venue = findVenueForTournament(tournamentName);
  if (!venue) {
    return {
      status: "no_venue_match",
      venue: null,
      roundForecast: null,
      conditions: buildConditions(null),
      auto_signals: [],
      note: tournamentName
        ? `No venue match for tournament: "${tournamentName}". Add to PGA_VENUES database.`
        : "No tournament name provided.",
      fetchedAt,
    };
  }

  const targetSlot = localRoundTime || getTodayRoundSlot(venue.timezone);
  const cacheKey = `pga-weather:${venue.courseName}:${targetSlot}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEATHER_TTL_MS) {
    return cached.data;
  }

  const venueInfo = {
    courseName: venue.courseName,
    city: venue.city,
    state: venue.state,
    latitude: venue.latitude,
    longitude: venue.longitude,
    notes: venue.notes,
  };

  const url = [
    `${OPEN_METEO_BASE}`,
    `?latitude=${venue.latitude}`,
    `&longitude=${venue.longitude}`,
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m`,
    `&wind_speed_unit=kmh`,
    `&forecast_days=3`,
    `&timezone=${encodeURIComponent(venue.timezone)}`,
  ].join("");

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

    const times = payload.hourly?.time ?? [];
    const timeIndex = findFloorTimeIndex(times, targetSlot);

    if (timeIndex < 0) {
      const data: PGACourseWeather = {
        status: "unavailable",
        venue: venueInfo,
        roundForecast: null,
        conditions: buildConditions(null),
        auto_signals: [],
        note: `Open-Meteo returned forecast data, but no slot at or before ${targetSlot} was found.`,
        fetchedAt,
      };
      weatherCache.set(cacheKey, { timestamp: Date.now(), data });
      return data;
    }

    const roundForecast = {
      temperatureF: cToF(payload.hourly?.temperature_2m?.[timeIndex]),
      windSpeedMph: kphToMph(payload.hourly?.wind_speed_10m?.[timeIndex]),
      windDirectionDeg: roundOrNull(payload.hourly?.wind_direction_10m?.[timeIndex]),
      precipitationProbability: roundOrNull(payload.hourly?.precipitation_probability?.[timeIndex]),
    };

    const conditions = buildConditions(roundForecast);
    const auto_signals = buildAutoSignals(conditions);

    const data: PGACourseWeather = {
      status: "available",
      venue: venueInfo,
      roundForecast,
      conditions,
      auto_signals,
      note: venue.notes,
      fetchedAt,
    };
    weatherCache.set(cacheKey, { timestamp: Date.now(), data });
    return data;
  } catch (err) {
    const data: PGACourseWeather = {
      status: "unavailable",
      venue: venueInfo,
      roundForecast: null,
      conditions: buildConditions(null),
      auto_signals: [],
      note: err instanceof Error ? err.message : "Weather fetch failed.",
      fetchedAt,
    };
    weatherCache.set(cacheKey, { timestamp: Date.now(), data });
    return data;
  }
}
