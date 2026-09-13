import { NextRequest, NextResponse } from "next/server";
import { APP_TIME_ZONE, getDateKey } from "@/lib/date-utils";
import { getNFLLearningFirstPicks } from "@/lib/nfl-learning-first-picks";

export const dynamic = "force-dynamic";

function requestedDate(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("date");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : getDateKey(new Date(), APP_TIME_ZONE);
}

export async function GET(request: NextRequest) {
  const date = requestedDate(request);
  const allowUpcoming = request.nextUrl.searchParams.get("upcoming") !== "false";
  const result = await getNFLLearningFirstPicks(date, allowUpcoming);
  const status = result.picks.length
    ? "official_picks"
    : result.learningPicks.length
      ? "learning_only"
      : "no_picks";

  return NextResponse.json({
    date: result.slateDate,
    requestedDate: date,
    rawPickDate: result.rawPickDate,
    picks: result.picks,
    learningPicks: result.learningPicks,
    source: result.source,
    modelVersion: result.modelVersion,
    status,
    thresholds: result.thresholds,
    diagnostics: result.diagnostics,
    fallbackReason: result.fallbackReason,
    disclosure: result.learningPicks.length
      ? "Goose Learning picks are shadow-tracked and do not become official AI picks unless they clear the 70% hit-rate and 10% edge gates."
      : "No fresh NFL learning slate is available yet.",
    generatedAt: new Date().toISOString(),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
