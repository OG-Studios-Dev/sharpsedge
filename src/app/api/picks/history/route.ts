import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league");
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) ? limitParam : 1000;

  try {
    const supabase = createServerClient();
    const picks = await supabase.pickHistory.list(limit);
    const filtered = league && league !== "all"
      ? picks.filter((pick) => pick.league === league)
      : picks;

    return NextResponse.json({ picks: filtered });
  } catch (error) {
    return NextResponse.json(
      {
        picks: [],
        error: error instanceof Error ? error.message : "Failed to load pick history",
      },
      { status: 500 },
    );
  }
}
// rebuild 1773585967
