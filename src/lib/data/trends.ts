import { Trend } from "./types";

export const trends: Trend[] = [
  {
    id: "t1", description: "Boston is 7-1 in last 8 home games",
    teamId: "bos", type: "home_away", sampleSize: 8, hits: 7,
    hitRate: 87.5, avgOdds: -145, theoreticalROI: 18.2, confidence: 5, relatedGameId: "game-1",
  },
  {
    id: "t2", description: "Over has hit in 6 of last 7 BOS vs TOR matchups",
    teamId: "bos", type: "h2h", sampleSize: 7, hits: 6,
    hitRate: 85.7, avgOdds: -108, theoreticalROI: 22.4, confidence: 5, relatedGameId: "game-1",
  },
  {
    id: "t3", description: "Florida is 10-1 in last 11 home games vs East opponents",
    teamId: "fla", type: "home_away", sampleSize: 11, hits: 10,
    hitRate: 90.9, avgOdds: -150, theoreticalROI: 15.6, confidence: 5, relatedGameId: "game-2",
  },
  {
    id: "t4", description: "Carolina Under has hit in 5 of last 7 road games",
    teamId: "car", type: "over_under", sampleSize: 7, hits: 5,
    hitRate: 71.4, avgOdds: -110, theoreticalROI: 12.8, confidence: 4, relatedGameId: "game-2",
  },
  {
    id: "t5", description: "Winnipeg is 8-2 in last 10 home games",
    teamId: "wpg", type: "home_away", sampleSize: 10, hits: 8,
    hitRate: 80.0, avgOdds: -140, theoreticalROI: 14.3, confidence: 4, relatedGameId: "game-3",
  },
  {
    id: "t6", description: "Edmonton has won 6 of last 8 games overall",
    teamId: "edm", type: "recent_form", sampleSize: 8, hits: 6,
    hitRate: 75.0, avgOdds: +115, theoreticalROI: 19.8, confidence: 4, relatedGameId: "game-3",
  },
  {
    id: "t7", description: "Dallas is 7-1-1 in last 9 home games",
    teamId: "dal", type: "home_away", sampleSize: 9, hits: 7,
    hitRate: 77.8, avgOdds: -155, theoreticalROI: 10.2, confidence: 4, relatedGameId: "game-4",
  },
  {
    id: "t8", description: "Under has hit in 7 of last 10 DAL vs MIN games",
    teamId: "dal", type: "h2h", sampleSize: 10, hits: 7,
    hitRate: 70.0, avgOdds: -105, theoreticalROI: 16.5, confidence: 4, relatedGameId: "game-4",
  },
  {
    id: "t9", description: "Colorado is 9-1 in last 10 home games",
    teamId: "col", type: "home_away", sampleSize: 10, hits: 9,
    hitRate: 90.0, avgOdds: -165, theoreticalROI: 11.4, confidence: 5, relatedGameId: "game-5",
  },
  {
    id: "t10", description: "Over has hit in 8 of last 10 COL home games",
    teamId: "col", type: "over_under", sampleSize: 10, hits: 8,
    hitRate: 80.0, avgOdds: -112, theoreticalROI: 15.7, confidence: 4, relatedGameId: "game-5",
  },
  {
    id: "t11", description: "Nashville is 4-6 in last 10, but 3-1 at home in last 4",
    teamId: "nsh", type: "situational", sampleSize: 4, hits: 3,
    hitRate: 75.0, avgOdds: -150, theoreticalROI: 8.3, confidence: 3, relatedGameId: "game-6",
  },
  {
    id: "t12", description: "Chicago has lost 7 of last 10 road games",
    teamId: "chi", type: "recent_form", sampleSize: 10, hits: 7,
    hitRate: 70.0, avgOdds: +155, theoreticalROI: 6.5, confidence: 3, relatedGameId: "game-6",
  },
  {
    id: "t13", description: "Toronto has covered puck line in 5 of last 7 as underdog",
    teamId: "tor", type: "situational", sampleSize: 7, hits: 5,
    hitRate: 71.4, avgOdds: +135, theoreticalROI: 24.1, confidence: 4, relatedGameId: "game-1",
  },
  {
    id: "t14", description: "Vegas Over has hit in 6 of last 8 road games",
    teamId: "vgk", type: "over_under", sampleSize: 8, hits: 6,
    hitRate: 75.0, avgOdds: -108, theoreticalROI: 13.9, confidence: 3, relatedGameId: "game-5",
  },
  {
    id: "t15", description: "Minnesota Under 5.5 has hit in 6 of last 9 road games",
    teamId: "min", type: "over_under", sampleSize: 9, hits: 6,
    hitRate: 66.7, avgOdds: -105, theoreticalROI: 9.8, confidence: 3, relatedGameId: "game-4",
  },
  {
    id: "t16", description: "Winnipeg has won 5 straight home games vs Edmonton",
    teamId: "wpg", type: "h2h", sampleSize: 5, hits: 5,
    hitRate: 100.0, avgOdds: -138, theoreticalROI: 27.5, confidence: 5, relatedGameId: "game-3",
  },
  {
    id: "t17", description: "Florida 1st period Over 1.5 has hit in 8 of last 11 home games",
    teamId: "fla", type: "situational", sampleSize: 11, hits: 8,
    hitRate: 72.7, avgOdds: +105, theoreticalROI: 21.3, confidence: 4, relatedGameId: "game-2",
  },
  {
    id: "t18", description: "Boston wins by 2+ goals in 6 of last 10 home games",
    teamId: "bos", type: "home_away", sampleSize: 10, hits: 6,
    hitRate: 60.0, avgOdds: +148, theoreticalROI: 17.6, confidence: 3, relatedGameId: "game-1",
  },
];

export function getTrendsForGame(gameId: string): Trend[] {
  return trends.filter((t) => t.relatedGameId === gameId);
}
