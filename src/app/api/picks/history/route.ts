import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const picks = await supabase.pickHistory.list(500);
    const date = req.nextUrl.searchParams.get("date");
    const filtered = date ? picks.filter((p) => p.date === date) : picks;
    return NextResponse.json({ picks: filtered });
  } catch {
    return NextResponse.json({ picks: [] });
  }
}
