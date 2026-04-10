import { NextRequest, NextResponse } from "next/server";
import { persistGoose2Grades } from "@/lib/goose2/grading";
import { listGoose2Candidates, listGoose2Events } from "@/lib/goose2/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

function defaultDate() {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - 1);
  return now.toISOString().slice(0, 10);
}

async function runGoose2Grade(input: { date?: string; sport?: string; limit?: number }) {
  const eventDate = input.date ?? defaultDate();
  const sport = input.sport?.trim().toUpperCase() || undefined;
  const limit = Math.min(Math.max(Number(input.limit ?? 400), 1), 2000);

  const [events, candidates] = await Promise.all([
    listGoose2Events({ eventDate, sport, limit }),
    listGoose2Candidates({ eventDate, sport, limit: Math.min(limit * 20, 2000) }),
  ]);

  const eventsById = new Map(events.map((event) => [event.event_id, event]));
  const filteredCandidates = candidates.filter((candidate) => eventsById.has(candidate.event_id));
  const gradeableCandidates = filteredCandidates.filter((candidate) => {
    const event = eventsById.get(candidate.event_id);
    if (!event) return false;
    if (event.sport !== "NHL") return true;
    const ids = [
      typeof event.metadata?.source_event_id === "string" ? event.metadata.source_event_id : null,
      typeof event.odds_api_event_id === "string" ? event.odds_api_event_id : null,
      typeof event.source_event_id === "string" ? event.source_event_id : null,
    ].filter(Boolean);
    return ids.some((value) => /^\d+$/.test(String(value).trim()));
  });
  const skippedCandidates = filteredCandidates.length - gradeableCandidates.length;
  const results = await persistGoose2Grades({ candidates: gradeableCandidates, events });

  const counts = {
    total_events: events.length,
    total_candidates: filteredCandidates.length,
    attempted_candidates: gradeableCandidates.length,
    skipped_ungradeable_upstream: skippedCandidates,
    graded_ok: results.filter((row) => row.integrity_status === "ok").length,
    pending: results.filter((row) => row.result === "pending").length,
    ungradeable: results.filter((row) => row.result === "ungradeable").length,
    manual_review: results.filter((row) => row.integrity_status === "manual_review").length,
    voided: results.filter((row) => row.result === "void").length,
  };

  return {
    ok: true,
    date: eventDate,
    sport: sport ?? "ALL",
    counts,
    sample: results.slice(0, 10),
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
    const body = await req.json().catch(() => ({})) as { date?: string; sport?: string; limit?: number };
    const result = await runGoose2Grade(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
