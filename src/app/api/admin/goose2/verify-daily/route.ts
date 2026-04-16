import { NextRequest, NextResponse } from "next/server";
import { addIncident, readAdminOpsData, updateCronSchedule, updateIncident } from "@/lib/admin-ops-store";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

export const dynamic = "force-dynamic";

type CountResponse = { total: number | null; rows: any[] | null };

function serviceHeaders(extra?: HeadersInit) {
  const key = getSupabaseServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "count=exact",
    ...extra,
  };
}

async function postgrest(path: string): Promise<CountResponse> {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1${path}`, {
    headers: serviceHeaders(),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Verification query failed ${response.status}: ${text.slice(0, 300)}`);
  }
  const rows = text ? JSON.parse(text) : null;
  const contentRange = response.headers.get("content-range");
  const total = contentRange ? Number(contentRange.split("/")[1] || 0) : null;
  return { total, rows };
}

function authorizeCron(request: NextRequest) {
  if (request.nextUrl.searchParams.get("cron") !== "true") return null;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured for cron requests" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null;
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function syncCronHealth(path: string, capturedAt: string, succeeded: boolean) {
  const ops = await readAdminOpsData();
  const cron = ops.cronSchedules.find((item) => item.path === path);
  if (!cron) return;
  await updateCronSchedule(cron.id, {
    lastRunAt: capturedAt,
    lastSuccessAt: succeeded ? capturedAt : cron.lastSuccessAt ?? null,
    lastFailureAt: succeeded ? cron.lastFailureAt ?? null : capturedAt,
    consecutiveFailures: succeeded ? 0 : (cron.consecutiveFailures ?? 0) + 1,
  });
}

async function syncIncident(capturedAt: string, ok: boolean, summary: string, notes: string) {
  const ops = await readAdminOpsData();
  const title = "Goose2 daily verification failed";
  const existing = ops.incidents.find((incident) => incident.title === title && incident.status !== "resolved");

  if (!ok) {
    if (existing) {
      await updateIncident(existing.id, {
        status: "investigating",
        severity: "sev2",
        summary,
        impact: "Daily learning-model ingestion verification found stale or missing stored data.",
        notes,
      });
      return;
    }
    await addIncident({
      title,
      severity: "sev2",
      status: "investigating",
      owner: "Goose2 pipeline",
      summary,
      impact: "Daily learning-model ingestion verification found stale or missing stored data.",
      resolvedAt: null,
      notes,
    });
    return;
  }

  if (existing) {
    await updateIncident(existing.id, {
      status: "resolved",
      resolvedAt: capturedAt,
      summary,
      impact: "Daily learning-model ingestion verification recovered.",
      notes,
    });
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const cronPath = "/api/admin/goose2/verify-daily?cron=true";
  const now = new Date().toISOString();

  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

    const [snapshots, candidates, results, stalePending] = await Promise.all([
      postgrest(`/market_snapshots?select=id,captured_at&captured_at=gte.${encodeURIComponent(last24h)}&order=captured_at.desc&limit=20`),
      postgrest(`/goose_market_candidates?select=candidate_id,capture_ts,sport&capture_ts=gte.${encodeURIComponent(last24h)}&order=capture_ts.desc&limit=5000`),
      postgrest(`/goose_market_results?select=candidate_id,settlement_ts,result,integrity_status&settlement_ts=gte.${encodeURIComponent(last36h)}&order=settlement_ts.desc&limit=5000`),
      postgrest(`/system_qualifiers?select=id,system_id,created_at,settlement_status&settlement_status=eq.pending&created_at=lt.${encodeURIComponent(last24h)}&limit=200`),
    ]);

    const snapshotCount = snapshots.rows?.length ?? 0;
    const candidateCount = candidates.rows?.length ?? 0;
    const resultCount = results.rows?.length ?? 0;
    const stalePendingCount = stalePending.rows?.length ?? 0;

    const ok = snapshotCount > 0 && candidateCount > 0 && stalePendingCount === 0;
    const summary = ok
      ? `Goose2 daily verification passed. snapshots=${snapshotCount}, candidates=${candidateCount}, recent_results=${resultCount}, stale_pending=${stalePendingCount}.`
      : `Goose2 daily verification failed. snapshots=${snapshotCount}, candidates=${candidateCount}, recent_results=${resultCount}, stale_pending=${stalePendingCount}.`;
    const notes = [
      `last24h snapshot rows: ${snapshotCount}`,
      `last24h candidate rows: ${candidateCount}`,
      `last36h result rows: ${resultCount}`,
      `pending qualifiers older than 24h: ${stalePendingCount}`,
    ].join(" | ");

    await Promise.all([
      syncCronHealth(cronPath, now, ok),
      syncIncident(now, ok, summary, notes),
    ]);

    return NextResponse.json({
      ok,
      checkedAt: now,
      summary,
      counts: {
        snapshotsLast24h: snapshotCount,
        candidatesLast24h: candidateCount,
        resultsLast36h: resultCount,
        stalePendingQualifiers: stalePendingCount,
      },
    }, { status: ok ? 200 : 500 });
  } catch (error) {
    await Promise.all([
      syncCronHealth(cronPath, now, false),
      syncIncident(now, false, "Goose2 daily verification crashed.", error instanceof Error ? error.message : "Unknown verification error"),
    ]);

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
    }, { status: 500 });
  }
}
