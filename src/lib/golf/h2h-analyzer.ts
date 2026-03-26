/**
 * Masters / PGA H2H Matchup Analyzer
 * Scores each matchup based on course fit, recent form, Augusta history, and odds value.
 * Returns ranked picks with reasoning.
 */

import type { MatchupOdds, PlayerOdds } from "./bovada-odds-scraper";

// Augusta National course-fit profiles (manually curated, updated each year)
// Score 1-10: approach play fit, putting fit, Augusta experience
interface CourseProfile {
  approachFit: number; // 1-10
  puttingFit: number; // 1-10
  augustaExperience: number; // 1-10 (past wins/contention)
  notes: string;
}

const AUGUSTA_PROFILES: Record<string, CourseProfile> = {
  "Scottie Scheffler": {
    approachFit: 10,
    puttingFit: 9,
    augustaExperience: 9,
    notes: "2022 champion, #1 world, elite all-around Augusta fit",
  },
  "Jon Rahm": {
    approachFit: 10,
    puttingFit: 9,
    augustaExperience: 10,
    notes: "2023 defending champion, elite iron play, proven Augusta winner",
  },
  "Jordan Spieth": {
    approachFit: 8,
    puttingFit: 10,
    augustaExperience: 10,
    notes: "2015 winner, 2x runner-up, Augusta savant, creative putter",
  },
  "Hideki Matsuyama": {
    approachFit: 10,
    puttingFit: 8,
    augustaExperience: 9,
    notes: "2021 champion, best iron player in field for Augusta",
  },
  "Patrick Reed": {
    approachFit: 8,
    puttingFit: 9,
    augustaExperience: 9,
    notes: "2018 champion, aggressive short game, loves Augusta pressure",
  },
  "Rory McIlroy": {
    approachFit: 9,
    puttingFit: 8,
    augustaExperience: 7,
    notes: "Grand Slam hunting, elite ball-striker, multiple top-5s, mental variable",
  },
  "Ludvig Aberg": {
    approachFit: 9,
    puttingFit: 8,
    augustaExperience: 7,
    notes: "T2 in Masters debut 2024, young + fearless, elite iron play",
  },
  "Xander Schauffele": {
    approachFit: 9,
    puttingFit: 8,
    augustaExperience: 6,
    notes: "Back-to-back major champion 2024, good iron player, less Augusta-specific",
  },
  "Tommy Fleetwood": {
    approachFit: 8,
    puttingFit: 8,
    augustaExperience: 6,
    notes: "Consistent European pro, solid iron play, growing Augusta comfort",
  },
  "Matt Fitzpatrick": {
    approachFit: 9,
    puttingFit: 7,
    augustaExperience: 6,
    notes: "US Open winner, precision iron play, Augusta experience building",
  },
  "Justin Rose": {
    approachFit: 8,
    puttingFit: 8,
    augustaExperience: 9,
    notes: "2013 champion, multiple near-misses, true Augusta specialist",
  },
  "Brooks Koepka": {
    approachFit: 7,
    puttingFit: 8,
    augustaExperience: 6,
    notes: "5-time major champion, major mentality, thinner Augusta history",
  },
  "Bryson DeChambeau": {
    approachFit: 6,
    puttingFit: 7,
    augustaExperience: 5,
    notes: "Power suits par-5s but Augusta precision requirements don't favor him",
  },
  "Collin Morikawa": {
    approachFit: 9,
    puttingFit: 6,
    augustaExperience: 5,
    notes: "Elite ball-striker but Augusta creativity/putting not his best suit",
  },
  "Cameron Young": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 4,
    notes: "Long hitter, limited Augusta track record, boom/bust profile",
  },
  "Viktor Hovland": {
    approachFit: 8,
    puttingFit: 7,
    augustaExperience: 6,
    notes: "Elite ball-striker when on, 2024 was rough, form rebuilding",
  },
  "Akshay Bhatia": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 3,
    notes: "Young gun, fearless, raw talent real, limited major experience",
  },
  "Justin Thomas": {
    approachFit: 8,
    puttingFit: 8,
    augustaExperience: 6,
    notes: "2x major winner, solid Augusta history, good value at +5000",
  },
  "Adam Scott": {
    approachFit: 8,
    puttingFit: 8,
    augustaExperience: 8,
    notes: "2013 champion, Augusta veteran, age (44) is the question",
  },
  "Patrick Cantlay": {
    approachFit: 8,
    puttingFit: 8,
    augustaExperience: 5,
    notes: "Elite approach player, solid putter, Augusta experience growing",
  },
  "Tyrrell Hatton": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 5,
    notes: "LIV move, solid European pro, limited Augusta contention",
  },
  "Min Woo Lee": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 4,
    notes: "Exciting young talent, growing profile, limited Augusta history",
  },
  "Shane Lowry": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 5,
    notes: "Open champion, solid major pedigree, Augusta not his best major",
  },
  "Robert MacIntyre": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 4,
    notes: "Improving profile, Ryder Cup hero, longer shot",
  },
  "Russell Henley": {
    approachFit: 7,
    puttingFit: 8,
    augustaExperience: 5,
    notes: "Solid PGA Tour winner, good putter, Augusta experience decent",
  },
  "Sungjae Im": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 5,
    notes: "Consistent performer, multiple Augusta starts",
  },
  "Sam Burns": {
    approachFit: 7,
    puttingFit: 7,
    augustaExperience: 4,
    notes: "Multiple PGA Tour wins, solid ball-striker, Augusta experience limited",
  },
};

function getProfile(player: string): CourseProfile {
  // Try exact match first
  if (AUGUSTA_PROFILES[player]) return AUGUSTA_PROFILES[player];
  // Try partial match
  const key = Object.keys(AUGUSTA_PROFILES).find(
    (k) =>
      k.toLowerCase().includes(player.toLowerCase().split(" ").pop() || "") ||
      player.toLowerCase().includes(k.toLowerCase().split(" ").pop() || "")
  );
  if (key) return AUGUSTA_PROFILES[key];
  // Default unknown player
  return {
    approachFit: 5,
    puttingFit: 5,
    augustaExperience: 4,
    notes: "Limited data — no strong Augusta profile on file",
  };
}

function courseScore(profile: CourseProfile): number {
  return (
    profile.approachFit * 0.4 +
    profile.puttingFit * 0.35 +
    profile.augustaExperience * 0.25
  );
}

// Convert American odds to implied probability
function impliedProb(americanOdds: number): number {
  if (americanOdds > 0) return 100 / (americanOdds + 100);
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

export interface H2HPick {
  player: string;
  opponent: string;
  playerOdds: number;
  opponentOdds: number;
  market: string;
  round?: string;
  courseEdge: number; // positive = player has edge
  valueEdge: number; // positive = player is undervalued
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

export function analyzeH2HMatchups(matchups: MatchupOdds[]): H2HPick[] {
  const picks: H2HPick[] = [];

  for (const m of matchups) {
    const p1Profile = getProfile(m.player1);
    const p2Profile = getProfile(m.player2);

    const p1Score = courseScore(p1Profile);
    const p2Score = courseScore(p2Profile);
    const courseEdge = p1Score - p2Score; // positive = p1 has course edge

    // Value edge: compare implied prob to course score ratio
    const p1ImpliedProb = impliedProb(m.player1Odds);
    const p2ImpliedProb = impliedProb(m.player2Odds);
    const totalProb = p1ImpliedProb + p2ImpliedProb;
    const p1FairProb = p1Score / (p1Score + p2Score);
    const p1ValueEdge = p1FairProb - p1ImpliedProb / totalProb; // positive = p1 undervalued

    // Pick the player with the stronger combined edge
    const pickPlayer1 = courseEdge + p1ValueEdge * 10 > 0;
    const player = pickPlayer1 ? m.player1 : m.player2;
    const opponent = pickPlayer1 ? m.player2 : m.player1;
    const playerOdds = pickPlayer1 ? m.player1Odds : m.player2Odds;
    const opponentOdds = pickPlayer1 ? m.player2Odds : m.player1Odds;
    const finalCourseEdge = pickPlayer1 ? courseEdge : -courseEdge;
    const finalValueEdge = pickPlayer1 ? p1ValueEdge : -p1ValueEdge;

    // Only include meaningful edges
    const totalEdge = finalCourseEdge + finalValueEdge * 5;
    if (totalEdge < 0.3) continue;

    const confidence: H2HPick["confidence"] =
      totalEdge > 1.5 ? "HIGH" : totalEdge > 0.8 ? "MEDIUM" : "LOW";

    const pickedProfile = pickPlayer1 ? p1Profile : p2Profile;
    const oppositeProfile = pickPlayer1 ? p2Profile : p1Profile;

    const reasoning =
      `${player} (${playerOdds > 0 ? "+" : ""}${playerOdds}) over ${opponent} (${opponentOdds > 0 ? "+" : ""}${opponentOdds}). ` +
      `Course score: ${(pickPlayer1 ? p1Score : p2Score).toFixed(1)} vs ${(pickPlayer1 ? p2Score : p1Score).toFixed(1)}. ` +
      `${pickedProfile.notes} | Fade: ${oppositeProfile.notes}`;

    picks.push({
      player,
      opponent,
      playerOdds,
      opponentOdds,
      market: m.market,
      round: m.round,
      courseEdge: finalCourseEdge,
      valueEdge: finalValueEdge,
      confidence,
      reasoning,
    });
  }

  // Sort by confidence then courseEdge
  return picks.sort((a, b) => {
    const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (confOrder[a.confidence] !== confOrder[b.confidence])
      return confOrder[a.confidence] - confOrder[b.confidence];
    return b.courseEdge - a.courseEdge;
  });
}

// Also analyze winner odds for value outright picks
export interface OutrightPick {
  player: string;
  odds: number;
  courseScore: number;
  impliedProb: number;
  valueTier: "STRONG" | "GOOD" | "FAIR";
  notes: string;
}

export function analyzeOutrightValue(winners: PlayerOdds[]): OutrightPick[] {
  if (!winners.length) return [];

  // Total implied prob (over-round)
  const totalImplied = winners.reduce((s, p) => s + impliedProb(p.odds), 0);

  const results: OutrightPick[] = [];

  for (const p of winners) {
    const profile = getProfile(p.player);
    const score = courseScore(profile);
    const imp = impliedProb(p.odds) / totalImplied; // normalized

    // Score-based fair market share (crude but directional)
    const allScores = winners.map((w) => courseScore(getProfile(w.player)));
    const totalScore = allScores.reduce((s, v) => s + v, 0);
    const fairShare = score / totalScore;

    const valueEdge = fairShare - imp;

    if (valueEdge < 0.005) continue; // Skip negative value

    const valueTier: OutrightPick["valueTier"] =
      valueEdge > 0.02 ? "STRONG" : valueEdge > 0.01 ? "GOOD" : "FAIR";

    results.push({
      player: p.player,
      odds: p.odds,
      courseScore: score,
      impliedProb: imp,
      valueTier,
      notes: profile.notes,
    });
  }

  return results.sort((a, b) => b.courseScore - a.courseScore).slice(0, 10);
}
