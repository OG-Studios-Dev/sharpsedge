import { NextRequest, NextResponse } from "next/server";
import { getDateKey } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") || getDateKey();
  return NextResponse.json({
    picks: [],
    date,
    message: "Golf picks are disabled until the tournament model is promoted from leaderboard mode.",
  });
}
