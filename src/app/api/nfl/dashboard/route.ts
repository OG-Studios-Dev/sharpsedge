import { NextResponse } from "next/server";
import { getNFLDashboardData } from "@/lib/nfl-live-data";
import { normalizeNFLWeekParam } from "@/lib/nfl-week";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const week = normalizeNFLWeekParam(new URL(request.url).searchParams.get("week"));
    const data = await getNFLDashboardData(week);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "NFL dashboard unavailable" }, { status: 503 });
  }
}
