import { NextRequest, NextResponse } from "next/server";
import { readSystemsTrackingData, refreshTrackableSystems, refreshTrackedSystem } from "@/lib/systems-tracking-store";
import { authorizeSystemsMutation, parseSystemsRefreshDate } from "@/lib/systems-refresh-auth";

export const dynamic = "force-dynamic";

function isTruthy(value: string | null) {
  return ["1", "true", "yes"].includes((value || "").toLowerCase());
}

function unauthorizedResponse() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function refreshErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to refresh tracked systems";
  const status = message.startsWith("date must be ") ? 400 : 500;
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function buildRefreshResponse(systemId?: string, date?: string) {
  if (systemId) {
    const system = await refreshTrackedSystem(systemId, { date });
    const persisted = await readSystemsTrackingData();
    const persistedSystem = system ?? persisted.systems.find((entry) => entry.id === systemId) ?? null;
    return NextResponse.json({
      ok: Boolean(persistedSystem),
      refreshed: Boolean(persistedSystem),
      system: persistedSystem,
      updatedAt: persisted.updatedAt || new Date().toISOString(),
      error: persistedSystem ? null : `No tracker registered for ${systemId}`,
    }, { status: persistedSystem ? 200 : 404 });
  }

  const refreshedSystems = await refreshTrackableSystems({ date });
  const refreshedById = new Map(refreshedSystems.map((system) => [system.id, system]));
  const persisted = await readSystemsTrackingData();
  const systems = persisted.systems.map((system) => refreshedById.get(system.id) ?? system);
  return NextResponse.json({
    ok: true,
    refreshed: true,
    count: systems.length,
    refreshedCount: refreshedSystems.length,
    systems,
    updatedAt: persisted.updatedAt || new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  try {
    const refresh = isTruthy(request.nextUrl.searchParams.get("refresh") || request.nextUrl.searchParams.get("cron"));
    const systemId = request.nextUrl.searchParams.get("systemId") || undefined;

    if (!refresh) {
      return NextResponse.json({
        ok: true,
        refreshed: false,
        message: "Add ?refresh=true or ?cron=true to trigger system refresh.",
      });
    }

    const authorized = authorizeSystemsMutation(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    );
    if (!authorized) return unauthorizedResponse();

    const date = parseSystemsRefreshDate(request.nextUrl.searchParams.get("date"));

    return await buildRefreshResponse(systemId, date);
  } catch (error) {
    return refreshErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authorized = authorizeSystemsMutation(
    request.headers.get("authorization"),
    process.env.CRON_SECRET,
  );
  if (!authorized) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const systemId = typeof body?.systemId === "string" ? body.systemId : undefined;
    const date = parseSystemsRefreshDate(typeof body?.date === "string" ? body.date : undefined);

    return await buildRefreshResponse(systemId, date);
  } catch (error) {
    return refreshErrorResponse(error);
  }
}
