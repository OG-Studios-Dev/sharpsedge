import { NextRequest, NextResponse } from "next/server";
import { refreshTrackableSystems, refreshTrackedSystem } from "@/lib/systems-tracking-store";

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

    if (systemId) {
      const system = await refreshTrackedSystem(systemId, { date });
      return NextResponse.json({
        ok: Boolean(system),
        refreshed: Boolean(system),
        system,
        updatedAt: new Date().toISOString(),
        error: system ? null : `No tracker registered for ${systemId}`,
      }, { status: system ? 200 : 404 });
    }

    const systems = await refreshTrackableSystems({ date });
    return NextResponse.json({
      ok: true,
      refreshed: true,
      count: systems.length,
      systems,
      updatedAt: new Date().toISOString(),
    });
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

    if (systemId) {
      const system = await refreshTrackedSystem(systemId, { date });
      return NextResponse.json({
        ok: Boolean(system),
        refreshed: Boolean(system),
        system,
        updatedAt: new Date().toISOString(),
        error: system ? null : `No tracker registered for ${systemId}`,
      }, { status: system ? 200 : 404 });
    }

    const systems = await refreshTrackableSystems({ date });
    return NextResponse.json({
      ok: true,
      refreshed: true,
      count: systems.length,
      systems,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh tracked systems",
    }, { status: 500 });
  }
}
