import { NextRequest, NextResponse } from "next/server";
import { createCurrentUserPick, listCurrentUserPicks } from "@/lib/user-picks-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 250);
    const picks = await listCurrentUserPicks(limit);
    return NextResponse.json({ picks });
  } catch (error) {
    return NextResponse.json(
      { picks: [], error: error instanceof Error ? error.message : "Failed to load user picks" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.pick_label || !body?.league || !body?.source_type) {
      return NextResponse.json({ error: "Missing required user pick fields" }, { status: 400 });
    }

    const pick = await createCurrentUserPick(body);
    return NextResponse.json({ ok: true, pick }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user pick" },
      { status: String(error).includes("Unauthorized") ? 401 : 500 },
    );
  }
}

export async function PATCH() {
  return NextResponse.json(
    { error: "User picks are locked after save. Status changes must come from verified grading, not client edits." },
    { status: 405 },
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "User picks cannot be deleted from the client once saved." },
    { status: 405 },
  );
}
