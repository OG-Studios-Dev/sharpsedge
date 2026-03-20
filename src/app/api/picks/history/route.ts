import { NextRequest, NextResponse } from "next/server";
import { listPickHistory, listPickSlates } from "@/lib/pick-history-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const picks = await listPickHistory(500);
    const slates = await listPickSlates(500, picks);
    const date = req.nextUrl.searchParams.get("date");
    const filtered = date ? picks.filter((p) => p.date === date) : picks;
    const filteredSlates = date ? slates.filter((slate) => slate.date === date) : slates;
    return NextResponse.json({ picks: filtered, slates: filteredSlates });
  } catch (error) {
    return NextResponse.json(
      {
        picks: [],
        slates: [],
        error: error instanceof Error ? error.message : "Pick history is unavailable",
      },
      { status: 503 },
    );
  }
}
