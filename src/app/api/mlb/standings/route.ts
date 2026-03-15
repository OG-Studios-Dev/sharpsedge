import { NextResponse } from "next/server";
import { getMLBStandings } from "@/lib/mlb-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const standings = await getMLBStandings();
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
