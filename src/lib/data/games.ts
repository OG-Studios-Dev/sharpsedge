import { Game } from "./types";
import { getTeam } from "./teams";

export const todayGames: Game[] = [
  {
    id: "game-1",
    homeTeam: getTeam("bos"),
    awayTeam: getTeam("tor"),
    time: "7:00 PM ET",
    date: "2026-03-06",
    venue: "TD Garden",
    status: "upcoming",
    odds: {
      homeML: -155, awayML: +135,
      puckLineHome: +145, puckLineAway: -170,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 6.5, overOdds: -110, underOdds: -110,
    },
  },
  {
    id: "game-2",
    homeTeam: getTeam("fla"),
    awayTeam: getTeam("car"),
    time: "7:30 PM ET",
    date: "2026-03-06",
    venue: "Amerant Bank Arena",
    status: "upcoming",
    odds: {
      homeML: -140, awayML: +120,
      puckLineHome: +155, puckLineAway: -180,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 6.0, overOdds: -105, underOdds: -115,
    },
  },
  {
    id: "game-3",
    homeTeam: getTeam("wpg"),
    awayTeam: getTeam("edm"),
    time: "8:00 PM ET",
    date: "2026-03-06",
    venue: "Canada Life Centre",
    status: "upcoming",
    odds: {
      homeML: -145, awayML: +125,
      puckLineHome: +150, puckLineAway: -175,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 6.5, overOdds: +100, underOdds: -120,
    },
  },
  {
    id: "game-4",
    homeTeam: getTeam("dal"),
    awayTeam: getTeam("min"),
    time: "8:30 PM ET",
    date: "2026-03-06",
    venue: "American Airlines Center",
    status: "upcoming",
    odds: {
      homeML: -160, awayML: +140,
      puckLineHome: +140, puckLineAway: -165,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 5.5, overOdds: -110, underOdds: -110,
    },
  },
  {
    id: "game-5",
    homeTeam: getTeam("col"),
    awayTeam: getTeam("vgk"),
    time: "9:00 PM ET",
    date: "2026-03-06",
    venue: "Ball Arena",
    status: "upcoming",
    odds: {
      homeML: -175, awayML: +150,
      puckLineHome: +130, puckLineAway: -155,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 7.0, overOdds: -115, underOdds: -105,
    },
  },
  {
    id: "game-6",
    homeTeam: getTeam("nsh"),
    awayTeam: getTeam("chi"),
    time: "8:00 PM ET",
    date: "2026-03-06",
    venue: "Bridgestone Arena",
    status: "upcoming",
    odds: {
      homeML: -185, awayML: +160,
      puckLineHome: +120, puckLineAway: -145,
      puckLineHomeSpread: -1.5, puckLineAwaySpread: 1.5,
      overUnder: 6.0, overOdds: -110, underOdds: -110,
    },
  },
];

export function getGame(id: string): Game | undefined {
  return todayGames.find((g) => g.id === id);
}
