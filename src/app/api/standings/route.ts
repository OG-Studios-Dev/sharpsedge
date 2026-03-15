import { NextResponse } from "next/server";
import { getTeamStandings } from "@/lib/nhl-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getTeamStandings();
  return NextResponse.json(data);
}
