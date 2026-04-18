import { NextResponse } from "next/server";
import { getCurrentUserPickStats } from "@/lib/user-picks-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getCurrentUserPickStats();
    return NextResponse.json({ stats });
  } catch (error) {
    return NextResponse.json(
      { stats: null, error: error instanceof Error ? error.message : "Failed to load user pick stats" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}
