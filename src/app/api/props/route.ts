import { NextResponse } from "next/server";
import { getLiveDashboardData } from "@/lib/live-data";
import { rankProps } from "@/lib/edge-engine-v2";
import { buildPropsPayload } from "@/lib/props";

export async function GET() {
  try {
    const data = await getLiveDashboardData();
    return NextResponse.json(data.props);
  } catch {
    return NextResponse.json(rankProps(buildPropsPayload()));
  }
}
