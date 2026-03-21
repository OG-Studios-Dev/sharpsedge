import { NextResponse } from "next/server";
import {
  addBug,
  addCronSchedule,
  readAdminOpsData,
  updateBug,
  updateCronSchedule,
} from "@/lib/admin-ops-store";

export async function GET() {
  const data = await readAdminOpsData();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "add_bug") {
      const bug = await addBug({
        title: String(body.title ?? "").trim(),
        summary: String(body.summary ?? "").trim(),
        area: String(body.area ?? "General").trim(),
        severity: body.severity,
        status: body.status,
        owner: String(body.owner ?? "Unassigned").trim(),
        source: String(body.source ?? "Manual").trim(),
        dueAt: body.dueAt ? String(body.dueAt) : null,
        notes: String(body.notes ?? "").trim(),
      });
      return NextResponse.json({ ok: true, bug });
    }

    if (action === "add_cron") {
      const cron = await addCronSchedule({
        name: String(body.name ?? "").trim(),
        schedule: String(body.schedule ?? "").trim(),
        purpose: String(body.purpose ?? "").trim(),
        owner: String(body.owner ?? "Unassigned").trim(),
        target: String(body.target ?? "").trim(),
        enabled: Boolean(body.enabled),
        notes: String(body.notes ?? "").trim(),
      });
      return NextResponse.json({ ok: true, cron });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "update_bug") {
      const data = await updateBug(String(body.id), body.updates ?? {});
      return NextResponse.json({ ok: true, data });
    }

    if (action === "update_cron") {
      const data = await updateCronSchedule(String(body.id), body.updates ?? {});
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}
