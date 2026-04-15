import { NextResponse } from "next/server";
import { listPickHistory, updatePickResultsInSupabase } from "@/lib/pick-history-store";
import { mapPickHistoryRecordToAIPick } from "@/lib/pick-history-integrity";

export const dynamic = "force-dynamic";

const MASTERS_2026_RESULTS: Record<string, number> = {
  "Rory McIlroy": 1,
  "Scottie Scheffler": 2,
  "Tyrrell Hatton": 3,
  "Russell Henley": 3,
  "Justin Rose": 3,
  "Cameron Young": 3,
  "Collin Morikawa": 7,
  "Sam Burns": 7,
  "Max Homa": 9,
  "Xander Schauffele": 9,
  "Jake Knapp": 11,
  "Jordan Spieth": 12,
  "Hideki Matsuyama": 12,
  "Brooks Koepka": 12,
  "Patrick Reed": 12,
  "Patrick Cantlay": 12,
  "Jason Day": 12,
  "Viktor Hovland": 18,
  "Maverick McNealy": 18,
  "Matt Fitzpatrick": 18,
  "Keegan Bradley": 21,
  "Ludvig Åberg": 21,
  "Wyndham Clark": 21,
  "Matt McCarty": 24,
  "Adam Scott": 24,
  "Sam Stevens": 24,
  "Chris Gotterup": 24,
  "Michael Brennan": 24,
  "Brian Campbell": 24,
  "Alex Noren": 30,
  "Harris English": 30,
  "Shane Lowry": 30,
  "Gary Woodland": 33,
  "Dustin Johnson": 33,
  "Brian Harman": 33,
  "Tommy Fleetwood": 33,
  "Ben Griffin": 33,
  "Jon Rahm": 38,
  "Ryan Gerard": 38,
  "Haotong Li": 38,
  "Justin Thomas": 41,
  "Sepp Straka": 41,
  "Jacob Bridgeman": 41,
  "Kristoffer Reitan": 41,
  "Nick Taylor": 41,
  "Sungjae Im": 46,
  "Si Woo Kim": 47,
  "Aaron Rai": 48,
  "Corey Conners": 49,
  "Marco Penge": 49,
  "Kurt Kitayama": 51,
  "Sergio Garcia": 52,
  "Rasmus Højgaard": 53,
  "Charl Schwartzel": 54,
  "Akshay Bhatia": 999,
  "Bryson DeChambeau": 999,
};

function settlePick(pick: ReturnType<typeof mapPickHistoryRecordToAIPick>) {
  const label = String(pick.pickLabel || "");
  const player = pick.playerName || "";
  const playerPlace = MASTERS_2026_RESULTS[player];
  if (!playerPlace) return { ...pick, result: "pending" as const };

  const lowerBetType = String(pick.betType || "").toLowerCase();
  const lowerLabel = label.toLowerCase();

  if (lowerLabel.includes("to win") || lowerBetType.includes("tournament winner") || lowerBetType.includes("outright")) {
    return { ...pick, result: playerPlace === 1 ? "win" as const : "loss" as const };
  }

  if (lowerLabel.includes(" over ") || lowerBetType.includes("tournament matchup")) {
    const opponentPlace = MASTERS_2026_RESULTS[pick.opponent || ""];
    if (!opponentPlace) return { ...pick, result: "pending" as const };
    return {
      ...pick,
      result: playerPlace < opponentPlace ? "win" as const : playerPlace > opponentPlace ? "loss" as const : "push" as const,
    };
  }

  return { ...pick, result: "pending" as const };
}

export async function POST() {
  try {
    const rows = await listPickHistory(1000);
    const targets = rows.filter((row) => row.date === "2026-04-09" && row.league === "PGA" && row.result === "pending");
    const picks = targets.map(mapPickHistoryRecordToAIPick);
    const resolved = picks.map(settlePick);
    const settled = resolved.filter((pick) => pick.result !== "pending");

    if (settled.length) {
      await updatePickResultsInSupabase(settled);
    }

    return NextResponse.json({
      ok: true,
      checked: picks.length,
      settled: settled.length,
      results: resolved.map((pick) => ({
        pickLabel: pick.pickLabel,
        result: pick.result,
        playerName: pick.playerName,
        opponent: pick.opponent,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
