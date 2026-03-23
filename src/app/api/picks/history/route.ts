import { NextRequest, NextResponse } from "next/server";
import { listPickHistory, listPickSlates } from "@/lib/pick-history-store";
import { mapPickHistoryRecordToAIPick } from "@/lib/pick-history-integrity";

export const dynamic = "force-dynamic";

function asOptionalPositiveInt(value: string | null) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const limit = asOptionalPositiveInt(req.nextUrl.searchParams.get("limit")) ?? 500;
    const records = await listPickHistory(limit);
    const slates = await listPickSlates(limit, records);
    const filteredRecords = date ? records.filter((p) => p.date === date) : records;
    const filteredSlates = date ? slates.filter((slate) => slate.date === date) : slates;
    const picks = filteredRecords.map(mapPickHistoryRecordToAIPick);
    return NextResponse.json({ picks, slates: filteredSlates });
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
