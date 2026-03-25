import { NextResponse } from "next/server";
import { getCurrentViewer } from "@/lib/auth";
import { createSandboxSlate, listSandboxSlates } from "@/lib/sandbox/store";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function GET() {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") return unauthorized();

  const slates = await listSandboxSlates();
  return NextResponse.json({ slates });
}

export async function POST(request: Request) {
  const viewer = await getCurrentViewer();
  if (!viewer || viewer.profile?.role !== "admin") return unauthorized();

  try {
    const body = await request.json();
    const bundle = await createSandboxSlate({
      sandboxKey: String(body?.sandboxKey ?? "").trim(),
      date: String(body?.date ?? "").trim(),
      league: String(body?.league ?? "").trim(),
      experimentTag: body?.experimentTag ? String(body.experimentTag) : null,
      reviewNotes: body?.reviewNotes ? String(body.reviewNotes) : null,
      picks: Array.isArray(body?.picks) ? body.picks : [],
    });

    return NextResponse.json({ ok: true, bundle });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 },
    );
  }
}
