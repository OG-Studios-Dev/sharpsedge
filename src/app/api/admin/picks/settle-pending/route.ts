/**
 * /api/admin/picks/settle-pending
 *
 * Server-side settlement cron for main pick_history records.
 *
 * Root cause context (2026-03-30): /api/picks/resolve is a client-side endpoint
 * triggered by usePicks.ts in the browser. pick_history records with result=pending
 * have no server-side settlement path — they only settle when a browser visits the
 * site and the hook fires. This creates multi-day settlement debt when traffic is low.
 *
 * This endpoint runs on a schedule, fetches all pending pick_history records from
 * the last LOOKBACK_DAYS days, resolves them via the same resolvePick() logic, and
 * writes any newly settled results back to Supabase.
 *
 * Cron: 0 7,14,20 * * *  (7 AM, 2 PM, 8 PM UTC daily)
 */

import { NextRequest, NextResponse } from "next/server";
import { listPickHistory } from "@/lib/pick-history-store";
import { mapPickHistoryRecordToAIPick } from "@/lib/pick-history-integrity";
import { resolvePick } from "@/lib/pick-resolver";
import { updatePickResultsInSupabase } from "@/lib/pick-history-store";

const LOOKBACK_DAYS = 3;

export async function GET(req: NextRequest) {
  const isCron = req.nextUrl.searchParams.get("cron") === "true";
  const isDev = process.env.NODE_ENV === "development";

  if (!isCron && !isDev) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  let allRecords;
  try {
    allRecords = await listPickHistory(500);
  } catch (err) {
    console.error("[settle-pending] failed to fetch pick_history", err);
    return NextResponse.json({ error: "db_fetch_failed" }, { status: 500 });
  }

  const pendingRecords = allRecords.filter(
    (r) => r.result === "pending" && r.date >= cutoffDate
  );

  if (!pendingRecords.length) {
    return NextResponse.json({
      settled: 0,
      checked: 0,
      message: "no pending picks in lookback window",
    });
  }

  const asPicks = pendingRecords.map(mapPickHistoryRecordToAIPick);

  const resolved = await Promise.all(asPicks.map(resolvePick));

  const newlySettled = resolved.filter((pick, i) => {
    const before = asPicks[i];
    return before.result === "pending" && pick.result !== "pending";
  });

  const summary = {
    checked: asPicks.length,
    settled: newlySettled.length,
    still_pending: asPicks.length - newlySettled.length,
    results: newlySettled.map((p) => ({
      pickLabel: p.pickLabel,
      date: p.date,
      league: p.league,
      result: p.result,
      gameId: p.gameId,
    })),
  };

  if (newlySettled.length) {
    try {
      await updatePickResultsInSupabase(newlySettled);
      console.info("[settle-pending] persisted", newlySettled.length, "newly settled picks");
    } catch (err) {
      console.error("[settle-pending] failed to persist results", err);
      return NextResponse.json({ error: "persist_failed", summary }, { status: 500 });
    }
  }

  console.info("[settle-pending]", summary);
  return NextResponse.json(summary);
}
