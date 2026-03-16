import { NextResponse } from "next/server";
import { getNFLStandings } from "@/lib/nfl-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const standings = await getNFLStandings();
    return NextResponse.json(standings);
  } catch {
    return NextResponse.json([]);
  }
}
