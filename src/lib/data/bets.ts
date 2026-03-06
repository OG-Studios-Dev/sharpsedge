import { Bet } from "./types";

// Sample historical bets to seed the dashboard
export const sampleBets: Bet[] = [
  {
    id: "sb1", gameId: "past-1", homeTeam: "Boston Bruins", awayTeam: "Montreal Canadiens",
    betType: "moneyline", pick: "BOS ML", odds: -155, amount: 200,
    potentialPayout: 329.03, status: "won", placedAt: "2026-02-20T19:00:00Z", resolvedAt: "2026-02-20T22:00:00Z",
  },
  {
    id: "sb2", gameId: "past-2", homeTeam: "Colorado Avalanche", awayTeam: "Dallas Stars",
    betType: "over_under", pick: "Over 6.5", odds: -110, amount: 150,
    potentialPayout: 286.36, status: "won", placedAt: "2026-02-21T20:00:00Z", resolvedAt: "2026-02-21T23:00:00Z",
  },
  {
    id: "sb3", gameId: "past-3", homeTeam: "Florida Panthers", awayTeam: "Tampa Bay Lightning",
    betType: "moneyline", pick: "TBL ML", odds: +145, amount: 100,
    potentialPayout: 245.00, status: "lost", placedAt: "2026-02-22T19:30:00Z", resolvedAt: "2026-02-22T22:30:00Z",
  },
  {
    id: "sb4", gameId: "past-4", homeTeam: "Winnipeg Jets", awayTeam: "Vancouver Canucks",
    betType: "moneyline", pick: "WPG ML", odds: -160, amount: 250,
    potentialPayout: 406.25, status: "won", placedAt: "2026-02-23T20:00:00Z", resolvedAt: "2026-02-23T23:00:00Z",
  },
  {
    id: "sb5", gameId: "past-5", homeTeam: "Edmonton Oilers", awayTeam: "Vegas Golden Knights",
    betType: "puck_line", pick: "EDM -1.5", odds: +155, amount: 100,
    potentialPayout: 255.00, status: "lost", placedAt: "2026-02-24T21:00:00Z", resolvedAt: "2026-02-25T00:00:00Z",
  },
  {
    id: "sb6", gameId: "past-6", homeTeam: "Carolina Hurricanes", awayTeam: "New York Rangers",
    betType: "moneyline", pick: "CAR ML", odds: -135, amount: 175,
    potentialPayout: 304.63, status: "won", placedAt: "2026-02-25T19:00:00Z", resolvedAt: "2026-02-25T22:00:00Z",
  },
  {
    id: "sb7", gameId: "past-7", homeTeam: "Dallas Stars", awayTeam: "Nashville Predators",
    betType: "over_under", pick: "Under 5.5", odds: -105, amount: 125,
    potentialPayout: 244.05, status: "won", placedAt: "2026-02-26T20:30:00Z", resolvedAt: "2026-02-26T23:30:00Z",
  },
  {
    id: "sb8", gameId: "past-8", homeTeam: "Toronto Maple Leafs", awayTeam: "Boston Bruins",
    betType: "moneyline", pick: "TOR ML", odds: +110, amount: 200,
    potentialPayout: 420.00, status: "lost", placedAt: "2026-02-27T19:00:00Z", resolvedAt: "2026-02-27T22:00:00Z",
  },
  {
    id: "sb9", gameId: "past-9", homeTeam: "Colorado Avalanche", awayTeam: "Minnesota Wild",
    betType: "moneyline", pick: "COL ML", odds: -170, amount: 300,
    potentialPayout: 476.47, status: "won", placedAt: "2026-02-28T21:00:00Z", resolvedAt: "2026-02-28T00:00:00Z",
  },
  {
    id: "sb10", gameId: "past-10", homeTeam: "Vegas Golden Knights", awayTeam: "Edmonton Oilers",
    betType: "puck_line", pick: "VGK -1.5", odds: +160, amount: 75,
    potentialPayout: 195.00, status: "lost", placedAt: "2026-03-01T22:00:00Z", resolvedAt: "2026-03-02T01:00:00Z",
  },
  {
    id: "sb11", gameId: "past-11", homeTeam: "Florida Panthers", awayTeam: "Carolina Hurricanes",
    betType: "moneyline", pick: "FLA ML", odds: -140, amount: 200,
    potentialPayout: 342.86, status: "won", placedAt: "2026-03-01T19:30:00Z", resolvedAt: "2026-03-01T22:30:00Z",
  },
  {
    id: "sb12", gameId: "past-12", homeTeam: "Winnipeg Jets", awayTeam: "Chicago Blackhawks",
    betType: "puck_line", pick: "WPG -1.5", odds: +125, amount: 150,
    potentialPayout: 337.50, status: "won", placedAt: "2026-03-02T20:00:00Z", resolvedAt: "2026-03-02T23:00:00Z",
  },
  {
    id: "sb13", gameId: "past-13", homeTeam: "Boston Bruins", awayTeam: "Tampa Bay Lightning",
    betType: "over_under", pick: "Over 6.0", odds: -105, amount: 100,
    potentialPayout: 195.24, status: "lost", placedAt: "2026-03-03T19:00:00Z", resolvedAt: "2026-03-03T22:00:00Z",
  },
  {
    id: "sb14", gameId: "past-14", homeTeam: "Dallas Stars", awayTeam: "Colorado Avalanche",
    betType: "moneyline", pick: "DAL ML", odds: +105, amount: 175,
    potentialPayout: 358.75, status: "won", placedAt: "2026-03-04T20:30:00Z", resolvedAt: "2026-03-04T23:30:00Z",
  },
  {
    id: "sb15", gameId: "past-15", homeTeam: "New York Rangers", awayTeam: "Montreal Canadiens",
    betType: "moneyline", pick: "NYR ML", odds: -180, amount: 225,
    potentialPayout: 350.00, status: "won", placedAt: "2026-03-05T19:00:00Z", resolvedAt: "2026-03-05T22:00:00Z",
  },
];

// Calculate bankroll after all sample bets
export function calculateSampleBankroll(): number {
  let balance = 10000;
  for (const bet of sampleBets) {
    balance -= bet.amount;
    if (bet.status === "won") {
      balance += bet.potentialPayout;
    }
  }
  return Math.round(balance * 100) / 100;
}
