import { NextResponse } from "next/server";
import { getUpcomingSchedule } from "@/lib/nhl-api";

export async function GET() {
  try {
    const schedule = await getUpcomingSchedule(3);
    return NextResponse.json(schedule);
  } catch {
    return NextResponse.json({ games: [], date: new Date().toISOString().slice(0, 10) });
  }
}
