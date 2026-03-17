import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const date = req.nextUrl.searchParams.get("date");
  
  const query = supabase
    .pickHistory
    .select("*")
    .order("created_at", { ascending: false });

  if (date) {
    query.eq("date", date);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[api/picks/history] error:", error);
    return NextResponse.json([], { status: 500 });
  }

  return NextResponse.json({ picks: data || [] });
}
