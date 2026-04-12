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
  const unresolvedCandidates = candidates.filter((candidate) => {
    if (!eventsById.has(candidate.event_id)) return false;
    const result = String(candidate.result ?? "").toLowerCase();
    const integrity = String(candidate.integrity_status ?? "").toLowerCase();
    return result !== "win"
      && result !== "loss"
      && result !== "push"
      && result !== "void"
      && result !== "cancelled"
      && result !== "ungradeable"
      && integrity !== "ok"
      && integrity !== "void"
      && integrity !== "cancelled"
      && integrity !== "postponed"
      && integrity !== "unresolvable"
      && integrity !== "manual_review";
  });
  const results = await persistGoose2Grades({ candidates: unresolvedCandidates, events });

  const counts = {
    total_events: events.length,
    total_candidates: candidates.length,
    attempted_candidates: unresolvedCandidates.length,
    skipped_ungradeable_upstream: candidates.length - unresolvedCandidates.length,
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
