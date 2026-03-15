import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ picks: [], error: "Supabase not configured" });
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/pick_history?select=*&order=created_at.desc&limit=1000`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json({ picks: [], error: `Supabase ${response.status}: ${errText.slice(0, 200)}` });
    }

    const rows = await response.json();
    const picks = Array.isArray(rows) ? rows : [];
    const filtered = league && league !== "all"
      ? picks.filter((pick: any) => pick.league === league)
      : picks;

    return NextResponse.json({ picks: filtered });
  } catch (error) {
    return NextResponse.json({
      picks: [],
      error: error instanceof Error ? error.message : "Failed to load pick history",
    });
  }
}
