import { Team } from "./types";

export const teams: Team[] = [
  {
    id: "bos", name: "Bruins", city: "Boston", abbrev: "BOS", logo: "🐻",
    record: { wins: 38, losses: 20, otl: 6 }, homeRecord: { wins: 22, losses: 8, otl: 2 },
    awayRecord: { wins: 16, losses: 12, otl: 4 }, last10: { wins: 7, losses: 2, otl: 1 },
    goalsFor: 212, goalsAgainst: 175, gamesPlayed: 64,
  },
  {
    id: "tor", name: "Maple Leafs", city: "Toronto", abbrev: "TOR", logo: "🍁",
    record: { wins: 36, losses: 22, otl: 6 }, homeRecord: { wins: 20, losses: 10, otl: 2 },
    awayRecord: { wins: 16, losses: 12, otl: 4 }, last10: { wins: 6, losses: 3, otl: 1 },
    goalsFor: 218, goalsAgainst: 192, gamesPlayed: 64,
  },
  {
    id: "fla", name: "Panthers", city: "Florida", abbrev: "FLA", logo: "🐆",
    record: { wins: 40, losses: 18, otl: 5 }, homeRecord: { wins: 23, losses: 7, otl: 2 },
    awayRecord: { wins: 17, losses: 11, otl: 3 }, last10: { wins: 8, losses: 1, otl: 1 },
    goalsFor: 225, goalsAgainst: 168, gamesPlayed: 63,
  },
  {
    id: "nyr", name: "Rangers", city: "New York", abbrev: "NYR", logo: "🗽",
    record: { wins: 35, losses: 23, otl: 5 }, homeRecord: { wins: 19, losses: 11, otl: 2 },
    awayRecord: { wins: 16, losses: 12, otl: 3 }, last10: { wins: 5, losses: 4, otl: 1 },
    goalsFor: 198, goalsAgainst: 185, gamesPlayed: 63,
  },
  {
    id: "car", name: "Hurricanes", city: "Carolina", abbrev: "CAR", logo: "🌀",
    record: { wins: 37, losses: 21, otl: 5 }, homeRecord: { wins: 21, losses: 9, otl: 2 },
    awayRecord: { wins: 16, losses: 12, otl: 3 }, last10: { wins: 7, losses: 3, otl: 0 },
    goalsFor: 210, goalsAgainst: 178, gamesPlayed: 63,
  },
  {
    id: "wpg", name: "Jets", city: "Winnipeg", abbrev: "WPG", logo: "✈️",
    record: { wins: 41, losses: 17, otl: 5 }, homeRecord: { wins: 23, losses: 7, otl: 2 },
    awayRecord: { wins: 18, losses: 10, otl: 3 }, last10: { wins: 8, losses: 2, otl: 0 },
    goalsFor: 230, goalsAgainst: 172, gamesPlayed: 63,
  },
  {
    id: "dal", name: "Stars", city: "Dallas", abbrev: "DAL", logo: "⭐",
    record: { wins: 37, losses: 20, otl: 7 }, homeRecord: { wins: 21, losses: 8, otl: 3 },
    awayRecord: { wins: 16, losses: 12, otl: 4 }, last10: { wins: 6, losses: 3, otl: 1 },
    goalsFor: 208, goalsAgainst: 182, gamesPlayed: 64,
  },
  {
    id: "col", name: "Avalanche", city: "Colorado", abbrev: "COL", logo: "🏔️",
    record: { wins: 39, losses: 19, otl: 5 }, homeRecord: { wins: 22, losses: 8, otl: 2 },
    awayRecord: { wins: 17, losses: 11, otl: 3 }, last10: { wins: 7, losses: 2, otl: 1 },
    goalsFor: 235, goalsAgainst: 190, gamesPlayed: 63,
  },
  {
    id: "edm", name: "Oilers", city: "Edmonton", abbrev: "EDM", logo: "🛢️",
    record: { wins: 36, losses: 22, otl: 6 }, homeRecord: { wins: 20, losses: 10, otl: 2 },
    awayRecord: { wins: 16, losses: 12, otl: 4 }, last10: { wins: 6, losses: 4, otl: 0 },
    goalsFor: 222, goalsAgainst: 198, gamesPlayed: 64,
  },
  {
    id: "vgk", name: "Golden Knights", city: "Vegas", abbrev: "VGK", logo: "⚔️",
    record: { wins: 35, losses: 22, otl: 6 }, homeRecord: { wins: 20, losses: 9, otl: 3 },
    awayRecord: { wins: 15, losses: 13, otl: 3 }, last10: { wins: 5, losses: 4, otl: 1 },
    goalsFor: 205, goalsAgainst: 188, gamesPlayed: 63,
  },
  {
    id: "min", name: "Wild", city: "Minnesota", abbrev: "MIN", logo: "🌲",
    record: { wins: 34, losses: 23, otl: 6 }, homeRecord: { wins: 19, losses: 10, otl: 3 },
    awayRecord: { wins: 15, losses: 13, otl: 3 }, last10: { wins: 5, losses: 3, otl: 2 },
    goalsFor: 195, goalsAgainst: 185, gamesPlayed: 63,
  },
  {
    id: "tbl", name: "Lightning", city: "Tampa Bay", abbrev: "TBL", logo: "⚡",
    record: { wins: 33, losses: 24, otl: 6 }, homeRecord: { wins: 19, losses: 10, otl: 3 },
    awayRecord: { wins: 14, losses: 14, otl: 3 }, last10: { wins: 6, losses: 3, otl: 1 },
    goalsFor: 202, goalsAgainst: 195, gamesPlayed: 63,
  },
  {
    id: "van", name: "Canucks", city: "Vancouver", abbrev: "VAN", logo: "🐋",
    record: { wins: 32, losses: 24, otl: 7 }, homeRecord: { wins: 18, losses: 11, otl: 3 },
    awayRecord: { wins: 14, losses: 13, otl: 4 }, last10: { wins: 4, losses: 5, otl: 1 },
    goalsFor: 195, goalsAgainst: 198, gamesPlayed: 63,
  },
  {
    id: "nsh", name: "Predators", city: "Nashville", abbrev: "NSH", logo: "🎸",
    record: { wins: 28, losses: 28, otl: 7 }, homeRecord: { wins: 16, losses: 13, otl: 3 },
    awayRecord: { wins: 12, losses: 15, otl: 4 }, last10: { wins: 4, losses: 5, otl: 1 },
    goalsFor: 182, goalsAgainst: 198, gamesPlayed: 63,
  },
  {
    id: "chi", name: "Blackhawks", city: "Chicago", abbrev: "CHI", logo: "🪶",
    record: { wins: 22, losses: 34, otl: 7 }, homeRecord: { wins: 13, losses: 16, otl: 3 },
    awayRecord: { wins: 9, losses: 18, otl: 4 }, last10: { wins: 3, losses: 6, otl: 1 },
    goalsFor: 168, goalsAgainst: 222, gamesPlayed: 63,
  },
  {
    id: "mtl", name: "Canadiens", city: "Montreal", abbrev: "MTL", logo: "🔴",
    record: { wins: 25, losses: 31, otl: 7 }, homeRecord: { wins: 15, losses: 14, otl: 3 },
    awayRecord: { wins: 10, losses: 17, otl: 4 }, last10: { wins: 3, losses: 5, otl: 2 },
    goalsFor: 178, goalsAgainst: 210, gamesPlayed: 63,
  },
];

export function getTeam(id: string): Team {
  return teams.find((t) => t.id === id)!;
}
