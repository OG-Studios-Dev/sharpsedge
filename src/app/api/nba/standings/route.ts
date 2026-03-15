import { NextResponse } from "next/server";
import { getNBAStandings } from "@/lib/nba-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const standings = await getNBAStandings();
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
