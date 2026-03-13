import { NextResponse } from "next/server";
import { getNBAStandings } from "@/lib/nba-api";

export async function GET() {
  try {
    const standings = await getNBAStandings();
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
