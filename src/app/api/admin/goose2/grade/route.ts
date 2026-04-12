import { NextRequest, NextResponse } from "next/server";
import { persistGoose2Grades } from "@/lib/goose2/grading";
import { listGoose2Candidates, listGoose2Events } from "@/lib/goose2/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

function dateKeyUTC(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

function terminalResult(result?: string | null, integrity?: string | null) {
  const resultValue = String(result ?? "").toLowerCase();
  const integrityValue = String(integrity ?? "").toLowerCase();
  return ["win", "loss", "push", "void", "cancelled", "ungradeable"].includes(resultValue)
    || ["ok", "void", "cancelled", "postponed", "unresolvable", "manual_review"].includes(integrityValue);
}

async function runGoose2Grade(input: { date?: string; sport?: string; limit?: number; lookbackDays?: number }) {
  const sport = input.sport?.trim().toUpperCase() || undefined;
  const limit = Math.min(Math.max(Number(input.limit ?? 400), 1), 2000);
  const lookbackDays = Math.min(Math.max(Number(input.lookbackDays ?? (input.date ? 1 : 3)), 1), 7);
  const eventDates = input.date
    ? [input.date]
    : Array.from({ length: lookbackDays }, (_, index) => dateKeyUTC(-(index + 1)));

  const allResults = [];
  const perDate = [];

  for (const eventDate of eventDates) {
    const [events, candidates] = await Promise.all([
      listGoose2Events({ eventDate, sport, limit }),
      listGoose2Candidates({ eventDate, sport, limit: Math.min(limit * 20, 2000), includeResults: true }),
    ]);

    const eventsById = new Map(events.map((event) => [event.event_id, event]));
    const unresolvedCandidates = candidates.filter((candidate) => {
      if (!eventsById.has(candidate.event_id)) return false;
      const relation = Array.isArray(candidate.goose_market_results)
        ? candidate.goose_market_results[0]
        : candidate.goose_market_results;
      return !terminalResult(relation?.result, relation?.integrity_status);
    });

    const results = await persistGoose2Grades({ candidates: unresolvedCandidates, events });
    allResults.push(...results);
    perDate.push({
      date: eventDate,
      total_events: events.length,
      total_candidates: candidates.length,
      attempted_candidates: unresolvedCandidates.length,
      skipped_terminal_or_missing: candidates.length - unresolvedCandidates.length,
      graded_ok: results.filter((row) => row.integrity_status === "ok").length,
      pending: results.filter((row) => row.result === "pending").length,
      ungradeable: results.filter((row) => row.result === "ungradeable").length,
      manual_review: results.filter((row) => row.integrity_status === "manual_review").length,
      voided: results.filter((row) => row.result === "void").length,
    });
  }

  return {
    ok: true,
    date: input.date ?? null,
    dates: eventDates,
    sport: sport ?? "ALL",
    lookback_days: lookbackDays,
    counts: {
      total_events: perDate.reduce((sum, row) => sum + row.total_events, 0),
      total_candidates: perDate.reduce((sum, row) => sum + row.total_candidates, 0),
      attempted_candidates: perDate.reduce((sum, row) => sum + row.attempted_candidates, 0),
      skipped_terminal_or_missing: perDate.reduce((sum, row) => sum + row.skipped_terminal_or_missing, 0),
      graded_ok: allResults.filter((row) => row.integrity_status === "ok").length,
      pending: allResults.filter((row) => row.result === "pending").length,
      ungradeable: allResults.filter((row) => row.result === "ungradeable").length,
      manual_review: allResults.filter((row) => row.integrity_status === "manual_review").length,
      voided: allResults.filter((row) => row.result === "void").length,
    },
    per_date: perDate,
    sample: allResults.slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const result = await runGoose2Grade({
      date: url.searchParams.get("date") ?? undefined,
      sport: url.searchParams.get("sport") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      lookbackDays: url.searchParams.get("lookbackDays") ? Number(url.searchParams.get("lookbackDays")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { date?: string; sport?: string; limit?: number; lookbackDays?: number };
    const result = await runGoose2Grade(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
