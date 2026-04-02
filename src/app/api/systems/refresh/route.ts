import { NextRequest, NextResponse } from "next/server";
import { readSystemsTrackingData, refreshTrackableSystems, refreshTrackedSystem } from "@/lib/systems-tracking-store";

export const dynamic = "force-dynamic";

function isTruthy(value: string | null) {
  return ["1", "true", "yes"].includes((value || "").toLowerCase());
}

function authorizeCron(request: NextRequest) {
  if (request.nextUrl.searchParams.get("cron") !== "true") return null;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null;

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function buildRefreshResponse(systemId?: string, date?: string) {
  if (systemId) {
    const system = await refreshTrackedSystem(systemId, { date });
    const persisted = await readSystemsTrackingData();
    const persistedSystem = persisted.systems.find((entry) => entry.id === systemId) ?? system;
    return NextResponse.json({
      ok: Boolean(persistedSystem),
      refreshed: Boolean(persistedSystem),
      system: persistedSystem,
      updatedAt: persisted.updatedAt || new Date().toISOString(),
      error: persistedSystem ? null : `No tracker registered for ${systemId}`,
    }, { status: persistedSystem ? 200 : 404 });
  }

  await refreshTrackableSystems({ date });
  const persisted = await readSystemsTrackingData();
  return NextResponse.json({
    ok: true,
    refreshed: true,
    count: persisted.systems.length,
    systems: persisted.systems,
    updatedAt: persisted.updatedAt || new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const refresh = isTruthy(request.nextUrl.searchParams.get("refresh") || request.nextUrl.searchParams.get("cron"));
    const systemId = request.nextUrl.searchParams.get("systemId") || undefined;
    const date = request.nextUrl.searchParams.get("date") || undefined;

    if (!refresh) {
      return NextResponse.json({
        ok: true,
        refreshed: false,
        message: "Add ?refresh=true or ?cron=true to trigger system refresh.",
      });
    }

    return await buildRefreshResponse(systemId, date);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh tracked systems",
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const systemId = typeof body?.systemId === "string" ? body.systemId : undefined;
    const date = typeof body?.date === "string" ? body.date : undefined;

    return await buildRefreshResponse(systemId, date);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh tracked systems",
    }, { status: 500 });
  }
}
