import { NextResponse } from "next/server";
import { getGolfPredictionData } from "@/lib/golf-live-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const predictions = await getGolfPredictionData();
    return NextResponse.json(predictions);
  } catch {
    return NextResponse.json({
      tournament: null,
      generatedAt: new Date().toISOString(),
      players: [],
      bestValuePicks: [],
      h2hMatchups: [],
    });
  }
}
