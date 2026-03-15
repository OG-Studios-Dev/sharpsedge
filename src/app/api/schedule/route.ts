import { NextResponse } from "next/server";
import { getUpcomingSchedule } from "@/lib/nhl-api";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schedule = await getUpcomingSchedule(3);
    return NextResponse.json(schedule);
  } catch {
    return NextResponse.json({ games: [], date: getDateKey() });
  }
}
