import type { MLBGame } from "@/lib/types";

export type MLBRoofType = "open_air" | "retractable" | "fixed_dome";

export type MLBStadium = {
  teamAbbrev: string;
  teamId: number;
  venueId?: number;
  venueName: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  roofType: MLBRoofType;
  weatherEligible: boolean;
  notes?: string;
};

export const MLB_STADIUMS: Record<string, MLBStadium> = {
  ARI: { teamAbbrev: "ARI", teamId: 109, venueId: 15, venueName: "Chase Field", city: "Phoenix", state: "AZ", latitude: 33.4453, longitude: -112.0667, timeZone: "America/Phoenix", roofType: "retractable", weatherEligible: true },
  ATL: { teamAbbrev: "ATL", teamId: 144, venueId: 4705, venueName: "Truist Park", city: "Atlanta", state: "GA", latitude: 33.8908, longitude: -84.4677, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  BAL: { teamAbbrev: "BAL", teamId: 110, venueId: 2, venueName: "Oriole Park at Camden Yards", city: "Baltimore", state: "MD", latitude: 39.2838, longitude: -76.6217, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  BOS: { teamAbbrev: "BOS", teamId: 111, venueId: 3, venueName: "Fenway Park", city: "Boston", state: "MA", latitude: 42.3467, longitude: -71.0972, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  CHC: { teamAbbrev: "CHC", teamId: 112, venueId: 17, venueName: "Wrigley Field", city: "Chicago", state: "IL", latitude: 41.9484, longitude: -87.6553, timeZone: "America/Chicago", roofType: "open_air", weatherEligible: true },
  CWS: { teamAbbrev: "CWS", teamId: 145, venueId: 4, venueName: "Rate Field", city: "Chicago", state: "IL", latitude: 41.83, longitude: -87.6338, timeZone: "America/Chicago", roofType: "open_air", weatherEligible: true },
  CIN: { teamAbbrev: "CIN", teamId: 113, venueId: 2602, venueName: "Great American Ball Park", city: "Cincinnati", state: "OH", latitude: 39.0979, longitude: -84.5066, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  CLE: { teamAbbrev: "CLE", teamId: 114, venueId: 5, venueName: "Progressive Field", city: "Cleveland", state: "OH", latitude: 41.4962, longitude: -81.6852, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  COL: { teamAbbrev: "COL", teamId: 115, venueId: 19, venueName: "Coors Field", city: "Denver", state: "CO", latitude: 39.7559, longitude: -104.9942, timeZone: "America/Denver", roofType: "open_air", weatherEligible: true },
  DET: { teamAbbrev: "DET", teamId: 116, venueId: 2394, venueName: "Comerica Park", city: "Detroit", state: "MI", latitude: 42.339, longitude: -83.0485, timeZone: "America/Detroit", roofType: "open_air", weatherEligible: true },
  HOU: { teamAbbrev: "HOU", teamId: 117, venueId: 2392, venueName: "Daikin Park", city: "Houston", state: "TX", latitude: 29.7573, longitude: -95.3555, timeZone: "America/Chicago", roofType: "retractable", weatherEligible: true, notes: "Formerly Minute Maid Park." },
  KC: { teamAbbrev: "KC", teamId: 118, venueId: 7, venueName: "Kauffman Stadium", city: "Kansas City", state: "MO", latitude: 39.0517, longitude: -94.4803, timeZone: "America/Chicago", roofType: "open_air", weatherEligible: true },
  LAA: { teamAbbrev: "LAA", teamId: 108, venueId: 1, venueName: "Angel Stadium", city: "Anaheim", state: "CA", latitude: 33.8003, longitude: -117.8827, timeZone: "America/Los_Angeles", roofType: "open_air", weatherEligible: true },
  LAD: { teamAbbrev: "LAD", teamId: 119, venueId: 22, venueName: "Dodger Stadium", city: "Los Angeles", state: "CA", latitude: 34.0739, longitude: -118.24, timeZone: "America/Los_Angeles", roofType: "open_air", weatherEligible: true },
  MIA: { teamAbbrev: "MIA", teamId: 146, venueId: 4169, venueName: "loanDepot park", city: "Miami", state: "FL", latitude: 25.7781, longitude: -80.2197, timeZone: "America/New_York", roofType: "retractable", weatherEligible: true },
  MIL: { teamAbbrev: "MIL", teamId: 158, venueId: 32, venueName: "American Family Field", city: "Milwaukee", state: "WI", latitude: 43.028, longitude: -87.9712, timeZone: "America/Chicago", roofType: "retractable", weatherEligible: true },
  MIN: { teamAbbrev: "MIN", teamId: 142, venueId: 3312, venueName: "Target Field", city: "Minneapolis", state: "MN", latitude: 44.9817, longitude: -93.2778, timeZone: "America/Chicago", roofType: "open_air", weatherEligible: true },
  NYM: { teamAbbrev: "NYM", teamId: 121, venueId: 3289, venueName: "Citi Field", city: "Queens", state: "NY", latitude: 40.7571, longitude: -73.8458, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  NYY: { teamAbbrev: "NYY", teamId: 147, venueId: 3313, venueName: "Yankee Stadium", city: "Bronx", state: "NY", latitude: 40.8296, longitude: -73.9262, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  OAK: { teamAbbrev: "OAK", teamId: 133, venueId: 11, venueName: "Sutter Health Park", city: "West Sacramento", state: "CA", latitude: 38.5806, longitude: -121.5136, timeZone: "America/Los_Angeles", roofType: "open_air", weatherEligible: true, notes: "Temporary Sacramento home while Athletics branding/feed identifiers remain in transition." },
  PHI: { teamAbbrev: "PHI", teamId: 143, venueId: 2681, venueName: "Citizens Bank Park", city: "Philadelphia", state: "PA", latitude: 39.9061, longitude: -75.1665, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  PIT: { teamAbbrev: "PIT", teamId: 134, venueId: 31, venueName: "PNC Park", city: "Pittsburgh", state: "PA", latitude: 40.4469, longitude: -80.0057, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
  SD: { teamAbbrev: "SD", teamId: 135, venueId: 2680, venueName: "Petco Park", city: "San Diego", state: "CA", latitude: 32.7073, longitude: -117.1573, timeZone: "America/Los_Angeles", roofType: "open_air", weatherEligible: true },
  SEA: { teamAbbrev: "SEA", teamId: 136, venueId: 680, venueName: "T-Mobile Park", city: "Seattle", state: "WA", latitude: 47.5914, longitude: -122.3325, timeZone: "America/Los_Angeles", roofType: "retractable", weatherEligible: true },
  SF: { teamAbbrev: "SF", teamId: 137, venueId: 2395, venueName: "Oracle Park", city: "San Francisco", state: "CA", latitude: 37.7786, longitude: -122.3893, timeZone: "America/Los_Angeles", roofType: "open_air", weatherEligible: true },
  STL: { teamAbbrev: "STL", teamId: 138, venueId: 2889, venueName: "Busch Stadium", city: "St. Louis", state: "MO", latitude: 38.6226, longitude: -90.1928, timeZone: "America/Chicago", roofType: "open_air", weatherEligible: true },
  TB: { teamAbbrev: "TB", teamId: 139, venueId: 12, venueName: "George M. Steinbrenner Field", city: "Tampa", state: "FL", latitude: 27.9804, longitude: -82.5062, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true, notes: "Temporary home while Tropicana Field is unavailable." },
  TEX: { teamAbbrev: "TEX", teamId: 140, venueId: 5325, venueName: "Globe Life Field", city: "Arlington", state: "TX", latitude: 32.7473, longitude: -97.0847, timeZone: "America/Chicago", roofType: "retractable", weatherEligible: true },
  TOR: { teamAbbrev: "TOR", teamId: 141, venueId: 14, venueName: "Rogers Centre", city: "Toronto", state: "ON", latitude: 43.6414, longitude: -79.3894, timeZone: "America/Toronto", roofType: "retractable", weatherEligible: true },
  WSH: { teamAbbrev: "WSH", teamId: 120, venueId: 3309, venueName: "Nationals Park", city: "Washington", state: "DC", latitude: 38.873, longitude: -77.0074, timeZone: "America/New_York", roofType: "open_air", weatherEligible: true },
};

const stadiumsByVenueId = new Map<string, MLBStadium>(
  Object.values(MLB_STADIUMS)
    .filter((stadium) => stadium.venueId != null)
    .map((stadium) => [String(stadium.venueId), stadium]),
);

export function getMLBStadium(teamAbbrev?: string | null) {
  if (!teamAbbrev) return null;
  return MLB_STADIUMS[teamAbbrev] ?? null;
}

export function getMLBStadiumForGame(game: MLBGame) {
  const byVenue = game.venue?.id ? stadiumsByVenueId.get(String(game.venue.id)) : null;
  if (byVenue) return byVenue;
  return getMLBStadium(game.homeTeam.abbreviation);
}
