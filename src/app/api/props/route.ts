import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json(data.props);
  } catch {
    return NextResponse.json([]);
  }
}
