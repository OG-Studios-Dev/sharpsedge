import { NextResponse } from "next/server";
import { addWorkstream, captureWeeklyScorecard, readAdminTeamBoard, updateTeamMember, updateWorkstream } from "@/lib/admin-team-store";

export async function GET() {
  const data = await readAdminTeamBoard();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "add_workstream") {
      const item = await addWorkstream({
        title: String(body.title ?? "").trim(),
        lane: String(body.lane ?? "General").trim(),
        ownerId: String(body.ownerId ?? "").trim(),
        goal: String(body.goal ?? "").trim(),
        proofRequired: String(body.proofRequired ?? "").trim(),
        status: body.status,
        phase: body.phase,
        sprintId: body.sprintId ? String(body.sprintId) : null,
        assigneeIds: Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String) : [String(body.ownerId ?? "").trim()].filter(Boolean),
        dueDate: body.dueDate ? String(body.dueDate) : null,
        priority: body.priority === "p0" || body.priority === "p1" || body.priority === "p2" ? body.priority : "p1",
        notes: String(body.notes ?? "").trim(),
      });
      return NextResponse.json({ ok: true, item });
    }

    if (action === "capture_scorecard") {
      const data = await captureWeeklyScorecard(String(body.weekLabel ?? "").trim() || undefined);
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "update_member") {
      const data = await updateTeamMember(String(body.id), body.updates ?? {});
      return NextResponse.json({ ok: true, data });
    }

    if (action === "update_workstream") {
      const data = await updateWorkstream(String(body.id), body.updates ?? {});
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
