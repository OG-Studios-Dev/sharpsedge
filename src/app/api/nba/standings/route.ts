import { NextResponse } from "next/server";
import { getNBAStandings } from "@/lib/nba-api";

export async function GET() {
  try {
    const key = process.env.BALLDONTLIE_API_KEY;
    if (!key) {
      console.warn("BALLDONTLIE_API_KEY not set — returning empty NBA standings");
      return NextResponse.json([]);
    }
    const standings = await getNBAStandings();
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
