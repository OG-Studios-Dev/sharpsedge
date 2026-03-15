import { NextRequest, NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";
import { getDateKey } from "@/lib/date-utils";

export async function GET(req: NextRequest) {
  const daysParam = Number(req.nextUrl.searchParams.get("days") || "3");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(daysParam, 1), 7) : 3;

  try {
    const data = await getLiveDashboardData();
    return NextResponse.json({
      ...data.schedule,
      games: data.schedule.games.slice(0, days * 10),
      meta: data.meta,
    });
  } catch {
    return NextResponse.json({ games: [], date: getDateKey() });
  }
}
