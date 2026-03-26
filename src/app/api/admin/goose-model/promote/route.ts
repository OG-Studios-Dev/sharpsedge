/**
 * POST /api/admin/goose-model/promote
 * Flag a goose_model_pick for production consideration.
 * Body: { id: string; notes?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { promoteGoosePick } from "@/lib/goose-model/store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; notes?: string };
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await promoteGoosePick(body.id, body.notes);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (error) {
    console.error("[goose-model/promote] failed", error);
    return NextResponse.json({ error: "Promote failed" }, { status: 500 });
  }
}
