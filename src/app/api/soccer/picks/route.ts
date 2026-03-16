import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league") === "SERIE_A" ? "Serie A" : "EPL";
  return NextResponse.json({
    picks: [],
    message: `${league} picks coming soon`,
  });
}
