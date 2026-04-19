import { NextRequest, NextResponse } from "next/server";
import { addIncident, readAdminOpsData, updateCronSchedule, updateIncident } from "@/lib/admin-ops-store";
import { buildGoose2WarehouseAudit } from "@/lib/goose2/warehouse-audit";

export const dynamic = "force-dynamic";

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
    const audit = await buildGoose2WarehouseAudit();
    const notes = audit.notes.join(" | ");

    await Promise.all([
      syncCronHealth(cronPath, now, audit.ok),
      syncIncident(now, audit.ok, audit.summary, notes),
    ]);

    return NextResponse.json(audit, { status: audit.ok ? 200 : 500 });
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
